// Is the first-person hand still joined to its forearm in every frame of every clip? Skins the arm meshes of
// spellblade-fp.glb (with the motion sidecar laid over) and measures the wrist: whether any
// triangle edge joins forearm-led to hand-led vertices, and the nearest approach of the two sides through each clip.
//   node scripts/fp-wrist-seam.mjs
import { apply, loadGlb, localPose, multiply, overlayMotion, worldMatrices } from './lib/glbPose.mjs';
import { readAccessor } from './lib/glbSkin.mjs';

const dir = new URL('../client/assets/characters/spellblade/', import.meta.url).pathname;
const model = overlayMotion(loadGlb(`${dir}spellblade-fp.glb`), `${dir}spellblade-fp-motion.glb`);
const { gltf } = model, skin = gltf.skins[0];
const ibm = readAccessor(model, skin.inverseBindMatrices).data;
const jointName = skin.joints.map((n) => gltf.nodes[n].name);
const side = (name, s) => !name.endsWith(`.${s}`) ? null : /^(hand|finger|thumb)/.test(name) ? 'H' : /^(forearm|elbow)/.test(name) ? 'F' : null;

function arm(s) {
  const prim = gltf.meshes.find((m) => m.name === `Arm.${s}`).primitives[0];
  const pos = readAccessor(model, prim.attributes.POSITION), joints = readAccessor(model, prim.attributes.JOINTS_0), weights = readAccessor(model, prim.attributes.WEIGHTS_0);
  const index = readAccessor(model, prim.indices).data;
  const cls = [], blended = [];
  for (let v = 0; v < pos.count; v += 1) {
    let best = 0, h = 0, f = 0;
    for (let c = 0; c < 4; c += 1) {
      const w = weights.data[v * 4 + c], k = side(jointName[joints.data[v * 4 + c]], s);
      if (k === 'H') h += w; if (k === 'F') f += w;
      if (w > weights.data[v * 4 + best]) best = c;
    }
    cls.push(side(jointName[joints.data[v * 4 + best]], s)); blended.push(h > .02 && f > .02);
  }
  // weld by position: the export splits vertices at normals/UV seams
  const key = (v) => [0, 1, 2].map((c) => Math.round(pos.data[v * 3 + c] * 1e5)).join(',');
  const edges = new Map();
  for (let t = 0; t < index.length; t += 3) for (let e = 0; e < 3; e += 1) {
    const a = index[t + e], b = index[t + (e + 1) % 3];
    if (cls[a] && cls[b] && cls[a] !== cls[b]) edges.set([key(a), key(b)].sort().join('|'), [a, b]);
  }
  return { s, pos, joints, weights, cls, edges: [...edges.values()], blended: blended.filter(Boolean).length };
}
function skinned(a, pose) {
  const world = worldMatrices(model, pose);
  const palette = skin.joints.map((node, k) => multiply(world[node], Array.from(ibm.subarray(k * 16, k * 16 + 16))));
  const out = new Float64Array(a.pos.count * 3);
  for (let v = 0; v < a.pos.count; v += 1) {
    const p = [a.pos.data[v * 3], a.pos.data[v * 3 + 1], a.pos.data[v * 3 + 2]];
    for (let c = 0; c < 4; c += 1) { const w = a.weights.data[v * 4 + c]; if (!w) continue; const q = apply(palette[a.joints.data[v * 4 + c]], p); for (let i = 0; i < 3; i += 1) out[v * 3 + i] += q[i] * w; }
  }
  return out;
}
const dist = (p, a, b) => Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]);
const rest = localPose(model, []);
const duration = (clip) => Math.max(...clip.channels.map((c) => c.times[c.times.length - 1] ?? 0));

for (const s of ['R', 'L']) {
  const a = arm(s), bind = skinned(a, rest);
  const h = a.cls.flatMap((c, v) => c === 'H' ? [v] : []), f = a.cls.flatMap((c, v) => c === 'F' ? [v] : []);
  // the two shells' nearest approach (vertex to vertex), at bind and through each clip
  const near = (p) => { let best = Infinity; for (const v of h) for (const u of f) { const d = dist(p, v, u); if (d < best) best = d; } return best; };
  const gap0 = near(bind);
  console.log(`\nArm.${s}: ${h.length} hand-led and ${f.length} forearm-led vertices, ${a.edges.length} welded edges cross the wrist, ${a.blended} vertices weighted to both sides; nearest approach at bind ${(gap0 * 1000).toFixed(1)} mm`);
  const rows = [];
  for (const [name, clip] of model.clips) {
    const end = duration(clip); let lo = Infinity, hi = 0, at = 0;
    for (let t = 0; t <= end + 1e-6; t += 1 / 30) {
      const d = near(skinned(a, localPose(model, [{ clip: name, time: Math.min(t, end), weight: 1 }])));
      lo = Math.min(lo, d); if (d > hi) { hi = d; at = t; }
    }
    rows.push({ clip: name, 'nearest mm (min)': +(lo * 1000).toFixed(1), 'nearest mm (max)': +(hi * 1000).toFixed(1), 'at s': +at.toFixed(2) });
  }
  console.table(rows);
}
