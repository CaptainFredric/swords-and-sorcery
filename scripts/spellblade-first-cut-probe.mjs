// Where the first cut's blade goes, frame by frame, in each source of Slash_1:
//   canonical  the 89-clip spellblade.glb's own Slash_1
//   sidecar    PR #457's spellblade-motion.glb Slash_1, whole
//   composed   what the client plays (spellbladeClipInventory.withMotionClips): canonical legs/pelvis + sidecar upper body
// Positions are in the model's frame as exported: the knight faces -Z, so +x is his RIGHT, -x his left, +y up.
//   node scripts/spellblade-first-cut-probe.mjs [--clip Slash_1] [--json out.json]
import { writeFileSync } from 'node:fs';
import { loadGlb, localPose, worldMatrices, apply } from './lib/glbPose.mjs';
import { readAccessor, skinnedMeshes } from './lib/glbSkin.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const CLIP = option('--clip', 'Slash_1');
const dir = new URL('../client/assets/characters/spellblade/', import.meta.url).pathname;
const canonical = loadGlb(`${dir}spellblade.glb`);
const motion = loadGlb(`${dir}spellblade-motion.glb`);
const lowerBody = (name) => /^(?:root|pelvis|thigh[.]|shin[.]|foot[.]|ankle[.]|knee[.]|tabard_|crest_)/.test(name);

function clipFrom(model, sourceModel, clipName, filter = () => true) {
  const clip = sourceModel.clips.get(clipName);
  if (!clip) return null;
  return clip.channels.map((ch) => ({ ...ch, name: sourceModel.gltf.nodes[ch.node].name }))
    .filter((ch) => filter(ch.name))
    .map((ch) => ({ ...ch, node: model.byName.get(ch.name) })).filter((ch) => ch.node != null);
}
function install(name, channels) {
  const duration = Math.max(...channels.map((c) => c.times[c.times.length - 1]));
  canonical.clips.set(name, { name, channels, duration });
}
const canonChannels = clipFrom(canonical, canonical, CLIP);
install('__canonical', canonChannels);
const side = clipFrom(canonical, motion, CLIP);
if (side) {
  install('__sidecar', side);
  const upper = side.filter((c) => !lowerBody(c.name));
  const upperKeys = new Set(upper.map((c) => `${c.name}/${c.path}`));
  // withMotionClips replaces by track name (bone.path), keeping canonical lower body
  const kept = canonChannels.filter((c) => lowerBody(c.name) || !upperKeys.has(`${c.name}/${c.path}`));
  install('__composed', [...kept, ...upper]);
}

const idx = (n) => canonical.byName.get(n);
const SOCKET = idx('socket_sword');
const HAND_R = idx('hand.R'), HAND_L = idx('hand.L'), PELVIS = idx('pelvis') ?? idx('hips');
// the blade along the socket's own axis: find which local axis the sword extends along from the sword mesh node, if any

function sample(name, t) {
  const pose = localPose(canonical, [{ clip: name, time: t, weight: 1 }]);
  const w = worldMatrices(canonical, pose);
  const s = w[SOCKET];
  const origin = apply(s, [0, 0, 0]);
  const axes = { x: apply(s, [1, 0, 0]), y: apply(s, [0, 1, 0]), z: apply(s, [0, 0, 1]) };
  return { origin, axes, tip: apply(s, TIP), handR: apply(w[HAND_R], [0, 0, 0]), handL: apply(w[HAND_L], [0, 0, 0]), pelvis: PELVIS != null ? apply(w[PELVIS], [0, 0, 0]) : null };
}
// the point of the skinned HeroSword in socket_sword's frame (its bind pose through the inverse bind matrix)
const TIP = (() => {
  const skin = canonical.gltf.skins[0];
  const ibm = readAccessor(canonical, skin.inverseBindMatrices).data;
  const k = skin.joints.indexOf(SOCKET);
  const M = Array.from(ibm.subarray(k * 16, k * 16 + 16));
  let best = null;
  for (const part of skinnedMeshes(canonical).get('HeroSword') ?? []) for (let v = 0; v < part.pos.count; v += 1) {
    const q = apply(M, [part.pos.data[v * 3], part.pos.data[v * 3 + 1], part.pos.data[v * 3 + 2]]);
    if (!best || q[2] < best[2]) best = q;
  }
  return best;
})();

const fps = 30;
const out = {};
for (const name of ['__canonical', '__sidecar', '__composed']) {
  const clip = canonical.clips.get(name);
  if (!clip) continue;
  const rows = [];
  for (let f = 0; f <= Math.round(clip.duration * fps); f += 1) {
    const t = Math.min(clip.duration, f / fps);
    const s = sample(name, t);
    const tip = s.tip;
    const gap = Math.hypot(...s.handR.map((v, i) => v - s.handL[i]));
    rows.push({ f, t: +t.toFixed(3), tip: tip.map((v) => +v.toFixed(3)), grip: s.origin.map((v) => +v.toFixed(3)), handGap: +gap.toFixed(3), pelvis: s.pelvis?.map((v) => +v.toFixed(3)) });
  }
  out[name.slice(2)] = { duration: +clip.duration.toFixed(4), rows };
}
for (const [name, { duration, rows }] of Object.entries(out)) {
  const maxLeft = rows.reduce((m, r) => (r.tip[0] < m.tip[0] ? r : m));
  console.log(`\n${CLIP} ${name}  ${duration}s  farthest-left tip x=${maxLeft.tip[0]} at f${maxLeft.f} (${maxLeft.t}s)`);
  for (const r of rows) console.log(`f${String(r.f).padStart(2)} t=${r.t.toFixed(3)} tip ${r.tip.map((v) => v.toFixed(2).padStart(6)).join(' ')}  grip ${r.grip.map((v) => v.toFixed(2).padStart(6)).join(' ')}  hands ${r.handGap.toFixed(2)}`);
}
const json = option('--json');
if (json) writeFileSync(json, JSON.stringify(out, null, 1));

// --- the follow-through taken apart, joint by joint (--joints): who turns the blade to the left?
// yaw: horizontal heading in degrees, 0 = the knight's forward (-Z), +90 = his left (-X), 180 = behind him.
if (args.includes('--joints')) {
  const yaw = (v) => (Math.atan2(-v[0], -v[2]) * 180) / Math.PI;
  const sub = (a, b) => a.map((x, i) => x - b[i]);
  const angle = (a, b) => { const d = a.reduce((s, x, i) => s + x * b[i], 0) / (Math.hypot(...a) * Math.hypot(...b)); return (Math.acos(Math.max(-1, Math.min(1, d))) * 180) / Math.PI; };
  const ids = Object.fromEntries(['pelvis', 'chest', 'upper_arm.L', 'upper_arm.R', 'forearm.R', 'hand.R', 'hand.L'].map((n) => [n, idx(n)]));
  for (const name of ['__composed']) {
    const clip = canonical.clips.get(name);
    console.log(`\n${CLIP} ${name.slice(2)}: yaw of pelvis (thigh line), shoulders, forearm.R, blade; wrist = forearm/blade angle`);
    for (let f = 0; f <= Math.round(clip.duration * 30); f += 1) {
      const t = Math.min(clip.duration, f / 30);
      const w = worldMatrices(canonical, localPose(canonical, [{ clip: name, time: t, weight: 1 }]));
      const at = (n) => apply(w[ids[n]], [0, 0, 0]);
      const perpYaw = (l, r) => { const d = sub(at(l), at(r)); return yaw([-d[2], 0, d[0]]); }; // forward ⟂ to the L–R line
      const hipL = apply(w[idx('thigh.L')], [0, 0, 0]), hipR = apply(w[idx('thigh.R')], [0, 0, 0]);
      const dh = sub(hipL, hipR);
      const forearm = sub(at('hand.R'), at('forearm.R'));
      const s = w[SOCKET]; const grip = apply(s, [0, 0, 0]); const blade = sub(apply(s, TIP), grip);
      const elevation = (v) => (Math.atan2(v[1], Math.hypot(v[0], v[2])) * 180) / Math.PI;
      console.log(`f${String(f).padStart(2)} t=${t.toFixed(3)}  pelvis ${yaw([-dh[2], 0, dh[0]]).toFixed(0).padStart(4)}  shoulders ${perpYaw('upper_arm.L', 'upper_arm.R').toFixed(0).padStart(4)}  forearm ${yaw(forearm).toFixed(0).padStart(5)}  blade ${yaw(blade).toFixed(0).padStart(5)} (elev ${elevation(blade).toFixed(0).padStart(4)})  wrist ${angle(forearm, blade).toFixed(0).padStart(4)}`);
    }
  }
}
