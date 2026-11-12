// Builds the Spellblade's motion sidecar: an animation-only GLB (the skeleton's nodes and clips, no meshes, no
// skin, no textures) that the client lays over the canonical spellblade.glb by bone name, and the blade tracks the
// server sweeps for the Sword Techniques, sampled from those same clips (so the blade that hits is the blade drawn).
// The canonical GLB is not touched.
//
//   node tools/assets/build-spellblade-motion.mjs --candidate /path/to/argon/spellblade.glb [--check]
//
// What goes in (see docs/verification/sword-techniques/README.md for the review behind each choice):
//   - Slash_1, revised: the canonical legs and raise, Argon's torso-driven cut and controlled finish (his candidate
//     clip, upper body only), and a recovery from that finish back to the canonical stance that crosses the front
//     level, above the knee (the canonical one swept the point along the floor);
//   - Technique_RigidRiposte_* and Technique_Whirl_*: Argon's clips, the pelvis raised by a constant per technique
//     so the canonical boots stand on the floor (as authored they sink 5 to 7 cm into it on the canonical model).
// Argon's geometry, his locomotion and his other revised clips are not taken.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadGlb, localPose, worldMatrices, apply } from '../../scripts/lib/glbPose.mjs';
import { skinnedHeights, skinnedMeshes } from '../../scripts/lib/glbSkin.mjs';

const args = process.argv.slice(2);
const option = (name, fallback = null) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const root = fileURLToPath(new URL('../../', import.meta.url));
const CANONICAL = `${root}client/assets/characters/spellblade/spellblade.glb`;
const OUT_GLB = `${root}client/assets/characters/spellblade/spellblade-motion.glb`;
const OUT_JSON = `${root}client/assets/characters/spellblade/spellblade-motion.json`;
const OUT_TRACKS = `${root}shared/src/swordTechniqueTracks.mjs`;
// Argon's candidate this was reviewed against (Castleward_Rigid_Riposte_And_Whirl_PR_Package.zip, 2026-11-11)
const CANDIDATE_SHA256 = '9dae42a815f4108afab4fdab95673293422283b677ea97f06ac0375ba50516a1';
const FPS = 30;

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const candidatePath = option('--candidate');
if (!candidatePath) throw new Error('--candidate <Argon spellblade.glb> is required');
if (sha256(candidatePath) !== CANDIDATE_SHA256) throw new Error(`candidate is not the reviewed file (sha256 ${sha256(candidatePath)})`);

const canon = loadGlb(CANONICAL);
const cand = loadGlb(candidatePath);
const nodes = canon.gltf.nodes;
// the same skeleton, by name, with the same rest pose: or nothing here is valid
const joints = canon.gltf.skins[0].joints;
for (const j of joints) {
  const name = nodes[j].name, k = cand.byName.get(name);
  if (k == null) throw new Error(`candidate has no bone ${name}`);
  const a = nodes[j], b = cand.gltf.nodes[k];
  const same = (x, y, d) => (x ?? d).every((v, i) => Math.abs(v - (y ?? d)[i]) < 1e-4);
  if (!same(a.translation, b.translation, [0, 0, 0]) || !same(a.rotation, b.rotation, [0, 0, 0, 1])) throw new Error(`rest pose differs at ${name}`);
  const pa = canon.parent[j] < 0 ? null : nodes[canon.parent[j]].name, pb = cand.parent[k] < 0 ? null : cand.gltf.nodes[cand.parent[k]].name;
  if (pa !== pb) throw new Error(`hierarchy differs at ${name}`);
}

// a clip's pose on the canonical node order, from either file
const poseOf = (model, clip, time) => {
  const pose = localPose(model, [{ clip, time, weight: 1 }]);
  return model === canon ? pose : nodes.map((node, i) => {
    const k = cand.byName.get(node.name);
    return k != null ? pose[k] : { t: node.translation ?? [0, 0, 0], r: node.rotation ?? [0, 0, 0, 1], s: node.scale ?? [1, 1, 1] };
  });
};
const LOWER = /^(root|pelvis|thigh|shin|foot|ankle|knee|tabard_root|tabard_front)/;
const isLower = (i) => LOWER.test(nodes[i].name);
const smooth = (t) => { const s = Math.max(0, Math.min(1, t)); return s * s * s * (s * (s * 6 - 15) + 10); };
const lerp = (a, b, w) => a.map((v, i) => v + (b[i] - v) * w);
function slerp(a, b, w) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const bb = d < 0 ? b.map((v) => -v) : b; d = Math.abs(d);
  if (d > 0.9995) { const q = lerp(a, bb, w), l = Math.hypot(...q); return q.map((v) => v / l); }
  const th = Math.acos(d), s = Math.sin(th);
  return a.map((v, i) => v * Math.sin((1 - w) * th) / s + bb[i] * Math.sin(w * th) / s);
}
const mixPose = (a, b, w, only = () => true) => a.map((x, i) => (only(i) ? { t: lerp(x.t, b[i].t, w), r: slerp(x.r, b[i].r, w), s: x.s } : x));

const meshes = skinnedMeshes(canon);
const soleOf = (pose) => { const h = skinnedHeights(canon, meshes, pose, ['Boot.L', 'Boot.R']); return Math.min(h['Boot.L'][0], h['Boot.R'][0]); };
const PELVIS = canon.byName.get('pelvis');
const raised = (pose, lift) => pose.map((x, i) => (i === PELVIS ? { ...x, t: [x.t[0], x.t[1] + lift, x.t[2]] } : x));

// --- Slash_1, revised
const S1 = { rampFrom: 5 / 30, rampTo: 9 / 30, far: 16 / 30, end: 23 / 30 };
function slash1(time) {
  const base = poseOf(canon, 'Slash_1', time);
  const upper = (i) => !isLower(i);
  if (time <= S1.far) {
    const w = smooth((time - S1.rampFrom) / (S1.rampTo - S1.rampFrom));
    return w <= 0 ? base : mixPose(base, poseOf(cand, 'Slash_1', time), w, upper);
  }
  // home from the finish: back across the front with the blade level (through where the canonical cut itself is level
  // on the left and then on the right of the front), and down into the stance. Eased as one movement; a straight
  // blend from the finish to the stance swung the point down through the floor.
  const finish = mixPose(poseOf(canon, 'Slash_1', S1.far), poseOf(cand, 'Slash_1', S1.far), 1, upper);
  const stops = [[0, finish], [0.34, poseOf(canon, 'Slash_1', 13 / 30)], [0.64, poseOf(canon, 'Slash_1', 12 / 30)], [1, poseOf(canon, 'Slash_1', S1.end)]];
  const u = smooth((time - S1.far) / (S1.end - S1.far));
  let k = 0;
  while (k < stops.length - 2 && u > stops[k + 1][0]) k += 1;
  const w = (u - stops[k][0]) / (stops[k + 1][0] - stops[k][0]);
  const from = stops[k][1], to = stops[k + 1][1];
  return base.map((x, i) => (upper(i) ? { t: lerp(from[i].t, to[i].t, w), r: slerp(from[i].r, to[i].r, w), s: x.s } : x));
}

// --- the techniques: Argon's clips, stood on the canonical floor
const TECHNIQUES = {
  riposte: ['Technique_RigidRiposte_Enter', 'Technique_RigidRiposte_Interception', 'Technique_RigidRiposte_Thrust', 'Technique_RigidRiposte_Recovery',
    'Technique_RigidRiposte_Parried', 'Technique_RigidRiposte_Air'],
  whirl: ['Technique_Whirl_Enter', 'Technique_Whirl_Revolution', 'Technique_Whirl_GaleLift', 'Technique_Whirl_Exit', 'Technique_Whirl_Interrupted',
    'Technique_Whirl_AirRecovery'],
};
// (the clips that stand on the ground decide each technique's lift; the airborne ones take the same)
const GROUNDED = new Set(['Technique_RigidRiposte_Enter', 'Technique_RigidRiposte_Interception', 'Technique_RigidRiposte_Thrust', 'Technique_RigidRiposte_Recovery',
  'Technique_Whirl_Enter', 'Technique_Whirl_Revolution', 'Technique_Whirl_Exit']);
const frameTimes = (duration) => { const n = Math.max(1, Math.ceil(duration * FPS - 1e-6)); return Array.from({ length: n + 1 }, (_, i) => Math.min(duration, i / FPS)); };
const lifts = {};
for (const [id, clips] of Object.entries(TECHNIQUES)) {
  let low = Infinity;
  for (const clip of clips) if (GROUNDED.has(clip)) for (const t of frameTimes(cand.clips.get(clip).duration)) low = Math.min(low, soleOf(poseOf(cand, clip, t)));
  lifts[id] = +Math.max(0, -low).toFixed(4);
}

const built = [];
built.push({ name: 'Slash_1', duration: S1.end, frames: frameTimes(S1.end).map((t) => ({ t, pose: slash1(t) })), source: 'canonical lower body and raise + Argon Slash_1 upper body (cut, finish) + derived recovery' });
for (const [id, clips] of Object.entries(TECHNIQUES)) for (const clip of clips) {
  const duration = cand.clips.get(clip)?.duration;
  if (!duration) throw new Error(`candidate has no clip ${clip}`);
  built.push({ name: clip, duration, frames: frameTimes(duration).map((t) => ({ t, pose: raised(poseOf(cand, clip, t), lifts[id]) })), source: `Argon ${clip}, pelvis +${lifts[id]} m` });
}

// --- write the GLB: the joints' nodes (and their ancestors), animations with one sampler input per clip
const keep = new Set();
for (const j of joints) for (let n = j; n >= 0; n = canon.parent[n]) keep.add(n);
const order = [...keep].sort((a, b) => a - b);
const remap = new Map(order.map((n, i) => [n, i]));
const outNodes = order.map((n) => {
  const src = nodes[n];
  const node = { name: src.name };
  for (const key of ['translation', 'rotation', 'scale']) if (src[key]) node[key] = src[key];
  const children = (src.children ?? []).filter((c) => keep.has(c)).map((c) => remap.get(c));
  if (children.length) node.children = children;
  return node;
});
const chunks = []; let byteLength = 0;
const accessors = [], bufferViews = [];
function pushFloats(values, type, minmax = false) {
  const data = Buffer.from(new Float32Array(values).buffer);
  bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: data.length });
  chunks.push(data); byteLength += data.length;
  const n = { SCALAR: 1, VEC3: 3, VEC4: 4 }[type];
  const accessor = { bufferView: bufferViews.length - 1, componentType: 5126, count: values.length / n, type };
  if (minmax) { accessor.min = [Math.min(...values)]; accessor.max = [Math.max(...values)]; }
  accessors.push(accessor);
  return accessors.length - 1;
}
const animations = [];
const summary = [];
for (const clip of built) {
  const input = pushFloats(clip.frames.map((f) => f.t), 'SCALAR', true);
  const samplers = [], channels = [];
  for (const j of joints) {
    const rest = { t: nodes[j].translation ?? [0, 0, 0], r: nodes[j].rotation ?? [0, 0, 0, 1] };
    const rot = clip.frames.map((f) => f.pose[j].r);
    // keep each rotation track in one hemisphere (a LINEAR sampler takes the short way only if neighbours agree)
    for (let i = 1; i < rot.length; i += 1) if (rot[i].reduce((d, v, c) => d + v * rot[i - 1][c], 0) < 0) rot[i] = rot[i].map((v) => -v);
    // (a bone a clip never moves from its rest has no track: the root, for one, which no clip here turns or carries)
    if (rot.some((q) => Math.abs(Math.abs(q.reduce((d, v, c) => d + v * rest.r[c], 0)) - 1) > 1e-7)) {
      samplers.push({ input, interpolation: 'LINEAR', output: pushFloats(rot.flat(), 'VEC4') });
      channels.push({ sampler: samplers.length - 1, target: { node: remap.get(j), path: 'rotation' } });
    }
    const tr = clip.frames.map((f) => f.pose[j].t);
    if (tr.some((t) => t.some((v, c) => Math.abs(v - rest.t[c]) > 1e-5))) {
      samplers.push({ input, interpolation: 'LINEAR', output: pushFloats(tr.flat(), 'VEC3') });
      channels.push({ sampler: samplers.length - 1, target: { node: remap.get(j), path: 'translation' } });
    }
  }
  animations.push({ name: clip.name, samplers, channels });
  const soles = clip.frames.map((f) => soleOf(f.pose));
  summary.push({ name: clip.name, durationSec: +clip.duration.toFixed(4), frames: clip.frames.length, source: clip.source,
    lowestSoleM: +Math.min(...soles).toFixed(3) });
}
const sceneRoot = remap.get(order.find((n) => canon.parent[n] < 0));
const gltf = { asset: { version: '2.0', generator: 'castleward tools/assets/build-spellblade-motion.mjs' }, scene: 0, scenes: [{ name: 'SpellbladeMotion', nodes: [sceneRoot] }],
  nodes: outNodes, animations, accessors, bufferViews, buffers: [{ byteLength }] };
let json = Buffer.from(JSON.stringify(gltf), 'utf8');
if (json.length % 4) json = Buffer.concat([json, Buffer.alloc(4 - (json.length % 4), 0x20)]);
const bin = Buffer.concat(chunks);
const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(json.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
const glb = Buffer.concat([header, jh, json, bh, bin]);

// --- the blade the server sweeps: the sword's base (the guard) and point through each technique clip, at 60 Hz, in
// the knight's own space (+x right, +y up, -z ahead)
const HAND = canon.byName.get('hand.R');
const TIP = [0.131, 1.3383, -0.1661];
const BASE = TIP.map((v) => v * (0.16 / Math.hypot(...TIP)));
const HEAD = canon.byName.get('head');
const round = (v) => +v.toFixed(4);
function bladeTrack(clip) {
  const b = built.find((c) => c.name === clip);
  const at = (time) => {
    const f = Math.min(b.frames.length - 2, Math.floor(time * FPS + 1e-9));
    const a = b.frames[f], c = b.frames[f + 1];
    const w = Math.max(0, Math.min(1, (time - a.t) / Math.max(1e-9, c.t - a.t)));
    return worldMatrices(canon, mixPose(a.pose, c.pose, w));
  };
  const n = Math.ceil(b.duration * 60 - 1e-6);
  return Array.from({ length: n + 1 }, (_, i) => {
    const time = Math.min(b.duration, i / 60), world = at(time);
    return { time: round(time), base: apply(world[HAND], BASE).map(round), tip: apply(world[HAND], TIP).map(round) };
  });
}
const trackClips = [...TECHNIQUES.riposte, ...TECHNIQUES.whirl];
const tracks = Object.fromEntries(trackClips.map((clip) => [clip, bladeTrack(clip)]));
const fmt = (track) => track.map((f) => `    [${f.time}, ${f.base.join(', ')}, ${f.tip.join(', ')}],`).join('\n');
const glbSha = createHash('sha256').update(glb).digest('hex');
const tracksSource = `// GENERATED by tools/assets/build-spellblade-motion.mjs: do not edit. The sword's guard and point through each Sword
// Technique clip of client/assets/characters/spellblade/spellblade-motion.glb (sha256 ${glbSha.slice(0, 16)}...),
// sampled at 60 Hz in the knight's own space (+x right, +y up, -z ahead; metres; seconds into the clip). The server
// sweeps these (shared/sim/swordTechnique.mjs); the client plays the clips they were sampled from.
// Each row: [time, baseX, baseY, baseZ, tipX, tipY, tipZ].
const rows = {
${trackClips.map((clip) => `  ${clip}: [\n${fmt(tracks[clip])}\n  ],`).join('\n')}
};

const frame = ([time, bx, by, bz, tx, ty, tz]) => Object.freeze({ time, base: Object.freeze({ x: bx, y: by, z: bz }), tip: Object.freeze({ x: tx, y: ty, z: tz }) });
export const SWORD_TECHNIQUE_TRACKS = Object.freeze(Object.fromEntries(Object.entries(rows).map(([clip, track]) => [clip, Object.freeze(track.map(frame))])));
export const SWORD_TECHNIQUE_TRACK_SOURCE = Object.freeze({ motionSha256: '${glbSha}', candidateSha256: '${CANDIDATE_SHA256}' });
`;
const meta = { version: 1, sha256: glbSha, bytes: glb.length, canonicalSha256: sha256(CANONICAL), candidateSha256: CANDIDATE_SHA256, fps: FPS,
  pelvisLiftM: lifts, clips: summary };

if (args.includes('--check')) {
  const same = readFileSync(OUT_GLB).equals(glb) && readFileSync(OUT_TRACKS, 'utf8') === tracksSource;
  console.log(same ? 'motion sidecar is up to date' : 'motion sidecar is STALE');
  process.exit(same ? 0 : 1);
}
writeFileSync(OUT_GLB, glb);
writeFileSync(OUT_JSON, `${JSON.stringify(meta, null, 2)}\n`);
writeFileSync(OUT_TRACKS, tracksSource);
console.log(`wrote spellblade-motion.glb ${glb.length} bytes sha256 ${glbSha}`);
for (const c of summary) console.log(`  ${c.name.padEnd(38)} ${c.durationSec.toFixed(3)} s  ${String(c.frames).padStart(2)} frames  lowest sole ${c.lowestSoleM.toFixed(3)} m`);
console.log('pelvis lift (m):', lifts);
