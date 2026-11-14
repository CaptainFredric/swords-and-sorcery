// Builds the first-person motion sidecar: an animation-only GLB (the arm rig's nodes and clips, no meshes, no skin,
// no textures) that the client lays over the canonical spellblade-fp.glb by bone name. It carries the twelve
// first-person Sword Technique clips the animation plan asks for (FP_Technique_*), taken from Argon's candidate as
// authored. The canonical GLB is not touched.
//
//   node tools/assets/build-spellblade-fp-motion.mjs --candidate /path/to/argon/spellblade-fp.glb [--check]
//
// Why they can be taken as they are: his first-person rig is the canonical one (same 46 nodes, same parents, the
// same rest pose to the last digit); each clip begins and ends where its neighbour does, the chain begins and ends
// on the canonical Idle, no clip moves the root, and nothing comes nearer the eye than 0.66 m
// (server/tests/spellblade-motion-sidecar.test.mjs holds all of that). No stance to correct: the arms hang from the eye.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadGlb, localPose } from '../../scripts/lib/glbPose.mjs';

const args = process.argv.slice(2);
const option = (name, fallback = null) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const root = fileURLToPath(new URL('../../', import.meta.url));
const CANONICAL = `${root}client/assets/characters/spellblade/spellblade-fp.glb`;
const OUT_GLB = `${root}client/assets/characters/spellblade/spellblade-fp-motion.glb`;
const OUT_JSON = `${root}client/assets/characters/spellblade/spellblade-fp-motion.json`;
// Argon's candidate this was reviewed against (Castleward_Rigid_Riposte_And_Whirl_PR_Package.zip, 2026-11-11)
const CANDIDATE_SHA256 = '1b12af5551b449ff25c8b6f75c4d1a661f6edd271a18a97e31c5eb4d743be904';
const FPS = 60;
const CLIPS = ['Enter', 'Interception', 'Thrust', 'Recovery', 'Parried', 'Air'].map((c) => `FP_Technique_RigidRiposte_${c}`)
  .concat(['Enter', 'Revolution', 'GaleLift', 'Exit', 'Interrupted', 'AirRecovery'].map((c) => `FP_Technique_Whirl_${c}`));

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const candidatePath = option('--candidate');
if (!candidatePath) throw new Error('--candidate <Argon spellblade-fp.glb> is required');
if (sha256(candidatePath) !== CANDIDATE_SHA256) throw new Error(`candidate is not the reviewed file (sha256 ${sha256(candidatePath)})`);

const canon = loadGlb(CANONICAL);
const cand = loadGlb(candidatePath);
const nodes = canon.gltf.nodes;
// the same rig, by name, with the same rest pose: or nothing here is valid
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

// the joints and their ancestors: the whole rig, in the canonical order
const keep = new Set();
for (const j of joints) for (let n = j; n >= 0 && !keep.has(n); n = canon.parent[n]) keep.add(n);
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
const animations = [], summary = [];
for (const name of CLIPS) {
  const clip = cand.clips.get(name);
  if (!clip) throw new Error(`candidate has no clip ${name}`);
  const count = Math.ceil(clip.duration * FPS - 1e-6);
  const times = Array.from({ length: count + 1 }, (_, i) => Math.min(clip.duration, i / FPS));
  const poses = times.map((time) => localPose(cand, [{ clip: name, time, weight: 1 }]));
  const input = pushFloats(times, 'SCALAR', true);
  const samplers = [], channels = [];
  for (const j of joints) {
    const k = cand.byName.get(nodes[j].name);
    const rest = { t: nodes[j].translation ?? [0, 0, 0], r: nodes[j].rotation ?? [0, 0, 0, 1] };
    const rot = poses.map((pose) => [...pose[k].r]);
    for (let i = 1; i < rot.length; i += 1) if (rot[i].reduce((d, v, c) => d + v * rot[i - 1][c], 0) < 0) rot[i] = rot[i].map((v) => -v);
    if (rot.some((q) => Math.abs(Math.abs(q.reduce((d, v, c) => d + v * rest.r[c], 0)) - 1) > 1e-7)) {
      samplers.push({ input, interpolation: 'LINEAR', output: pushFloats(rot.flat(), 'VEC4') });
      channels.push({ sampler: samplers.length - 1, target: { node: remap.get(j), path: 'rotation' } });
    }
    const tr = poses.map((pose) => pose[k].t);
    if (tr.some((t) => t.some((v, c) => Math.abs(v - rest.t[c]) > 1e-5))) {
      samplers.push({ input, interpolation: 'LINEAR', output: pushFloats(tr.flat(), 'VEC3') });
      channels.push({ sampler: samplers.length - 1, target: { node: remap.get(j), path: 'translation' } });
    }
  }
  animations.push({ name, samplers, channels });
  summary.push({ name, durationSec: +clip.duration.toFixed(4), frames: times.length, source: `Argon ${name}, as authored` });
}
const sceneRoots = order.filter((n) => canon.parent[n] < 0).map((n) => remap.get(n));
const gltf = { asset: { version: '2.0', generator: 'castleward tools/assets/build-spellblade-fp-motion.mjs' }, scene: 0, scenes: [{ name: 'SpellbladeFirstPersonMotion', nodes: sceneRoots }],
  nodes: outNodes, animations, accessors, bufferViews, buffers: [{ byteLength }] };
let json = Buffer.from(JSON.stringify(gltf), 'utf8');
if (json.length % 4) json = Buffer.concat([json, Buffer.alloc(4 - (json.length % 4), 0x20)]);
const bin = Buffer.concat(chunks);
const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(json.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
const glb = Buffer.concat([header, jh, json, bh, bin]);
const glbSha = createHash('sha256').update(glb).digest('hex');
const meta = { version: 1, sha256: glbSha, bytes: glb.length, canonicalSha256: sha256(CANONICAL), candidateSha256: CANDIDATE_SHA256, fps: FPS, clips: summary };

if (args.includes('--check')) {
  const same = readFileSync(OUT_GLB).equals(glb);
  console.log(same ? 'first-person motion sidecar is up to date' : 'first-person motion sidecar is STALE');
  process.exit(same ? 0 : 1);
}
writeFileSync(OUT_GLB, glb);
writeFileSync(OUT_JSON, `${JSON.stringify(meta, null, 2)}\n`);
console.log(`wrote spellblade-fp-motion.glb ${glb.length} bytes sha256 ${glbSha}`);
for (const c of summary) console.log(`  ${c.name.padEnd(42)} ${c.durationSec.toFixed(3)} s  ${String(c.frames).padStart(2)} frames`);
