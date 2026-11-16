// Retargets a generated BVH (NVIDIA Kimodo's SOMA skeleton) onto the Spellblade's 66-joint rig, retimed onto the
// game's frame data, and writes an animation-only GLB the client lays over spellblade.glb by bone name (the same form
// as the motion sidecar, tools/assets/build-spellblade-motion.mjs).
//
//   node tools/animation/retarget-bvh.mjs --bvh take.bvh --move forehand --from 15 --to 48 [--contact 29]
//        [--name Slash_1] [--travel 1] [--out artifacts/kimodo-spike/forehand.motion.glb]
//
// How: no rest-pose calibration (SOMA's zero pose is not an anatomical one). Each target bone is turned so that an
// anatomical frame built from joint positions in the source (its direction, and a second, anatomically named axis:
// the elbow or knee hinge, the knuckle line, the shoulders' line) matches the same frame built in the Spellblade's own
// rest. The fingers keep the Spellblade's grip (Idle f0) and the armour cops their Idle pose; the root stays still.
// The source's travel is kept on the pelvis and reported as root motion (the prototype moves the knight by it).
// Timing: the source's [from, contact, to] frames are mapped onto the move's [0, contact, duration] from
// shared/src/combatFrameData.mjs, so the clip's contact is the server's contact.

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBvh, bvhPose, quat } from '../../scripts/lib/bvh.mjs';
import { loadGlb, localPose, worldMatrices } from '../../scripts/lib/glbPose.mjs';
import { skinnedHeights, skinnedMeshes } from '../../scripts/lib/glbSkin.mjs';
import { CUTS } from '../../shared/src/combatFrameData.mjs';
import { MELEE_CONTACT } from '../../shared/src/combat.mjs';
import { bladeDirection } from '../../shared/src/blade.mjs';
import { solveArm, THIRD_PERSON_SWORD_ARM } from '../../client/game/swordArmIK.mjs';

const args = process.argv.slice(2);
const option = (name, fallback = null) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const repo = fileURLToPath(new URL('../../', import.meta.url));
const MODEL = option('--model', `${repo}client/assets/characters/spellblade/spellblade.glb`);
const bvh = readBvh(option('--bvh'));
const move = CUTS[option('--move', 'forehand')];
if (!move) throw new Error(`no cut ${option('--move')} in CUTS`);
const clipName = option('--name', move.clip);
const FPS = 30;

// --- vectors
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return scale(a, 1 / l); };
const mid = (a, b) => scale(add(a, b), 0.5);
/** An orthonormal frame from a primary direction and a second axis (made perpendicular to it). */
function frame(u, v) {
  const x = norm(u);
  const y = norm(sub(v, scale(x, dot(v, x))));
  return quat.fromBasis(x, y, cross(x, y));
}

// --- the source, in the Spellblade's world: SOMA faces +z with +x on its left; the Spellblade faces -z with +x on its
// right. A half turn about y, and centimetres to metres scaled to the Spellblade's pelvis height.
const S = (n) => { const k = bvh.byName.get(n); if (k == null) throw new Error(`BVH has no joint ${n}`); return k; };
const model = loadGlb(MODEL);
const T = (n) => { const k = model.byName.get(n); if (k == null) throw new Error(`model has no node ${n}`); return k; };
const rest = localPose(model, []);
const restWorld = worldMatrices(model, rest);
const posOf = (m) => [m[12], m[13], m[14]];
const rotOf = (m) => {
  const sx = Math.hypot(m[0], m[1], m[2]), sy = Math.hypot(m[4], m[5], m[6]), sz = Math.hypot(m[8], m[9], m[10]);
  return quat.fromBasis([m[0] / sx, m[1] / sx, m[2] / sx], [m[4] / sy, m[5] / sy, m[6] / sy], [m[8] / sz, m[9] / sz, m[10] / sz]);
};
const tp = (n) => posOf(restWorld[T(n)]);
const src0 = bvhPose(bvh, 0);
// (by the legs' length, which no pose changes: a take that starts crouched is not a smaller knight)
const legOf = (pos, a, b, c) => Math.hypot(...sub(pos[a], pos[b])) + Math.hypot(...sub(pos[b], pos[c]));
const k = legOf([tp('thigh.L'), tp('shin.L'), tp('foot.L')], 0, 1, 2)
  / (legOf(src0.pos, S('LeftLeg'), S('LeftShin'), S('LeftFoot')) / 100);
const toWorld = (p) => [-p[0] / 100 * k, p[1] / 100 * k, -p[2] / 100 * k];

// --- the anatomical frames: each bone's direction and its second axis, from named joint positions
// (a hinge's axis is the bend's normal; straight, it is taken from the frame before)
const FOOT_FWD_REST = [0, 0, -1];
function frames(P, prev) {
  const f = {};
  const lateral = norm(sub(P.thighL, P.thighR));            // the hips' line, right to left
  const shoulders = norm(sub(P.armL, P.armR));
  f.pelvis = frame(sub(P.chest, P.pelvis), lateral);
  f.spine = frame(sub(P.chest, P.pelvis), mid(lateral, shoulders));
  f.chest = frame(sub(P.neck, P.chest), shoulders);
  f.neck = frame(sub(P.head, P.neck), shoulders);
  f.head = frame(sub(P.headTop, P.head), shoulders);
  for (const s of ['R', 'L']) {
    const up = sub(P.neck, P.chest);
    f[`clavicle${s}`] = frame(sub(P[`arm${s}`], P[`clav${s}`]), up);
    const upper = norm(sub(P[`fore${s}`], P[`arm${s}`])), lower = norm(sub(P[`wrist${s}`], P[`fore${s}`]));
    const bend = cross(upper, lower);
    const elbowAxis = Math.hypot(...bend) > 0.25 ? norm(bend) : (prev?.[`elbowAxis${s}`] ?? P[`elbowAxisRest${s}`]);
    f[`elbowAxis${s}`] = elbowAxis;
    f[`upper${s}`] = frame(upper, elbowAxis);
    const knuckles = sub(P[`little${s}`], P[`index${s}`]);
    f[`fore${s}`] = frame(lower, knuckles);
    f[`hand${s}`] = frame(sub(P[`knuckle${s}`], P[`wrist${s}`]), knuckles);
    const footFwd = norm([P[`toe${s}`][0] - P[`foot${s}`][0], 0, P[`toe${s}`][2] - P[`foot${s}`][2]]);
    f[`thigh${s}`] = frame(sub(P[`shin${s}`], P[`thigh${s}`]), cross(sub(P[`shin${s}`], P[`thigh${s}`]), footFwd));
    f[`shin${s}`] = frame(sub(P[`foot${s}`], P[`shin${s}`]), cross(sub(P[`foot${s}`], P[`shin${s}`]), footFwd));
    f[`foot${s}`] = frame(sub(P[`toe${s}`], P[`foot${s}`]), lateral);
  }
  return f;
}

// the Spellblade's own joints by anatomy (its sword hand pivots on the grip, so its wrist is where the forearm
// meets the knuckles' line: its rest wrist is straight, so the forearm's direction carries on to the knuckles)
function targetPoints() {
  const P = {
    pelvis: tp('pelvis'), chest: tp('chest'), neck: tp('neck'), head: tp('head'), headTop: tp('crest_01'),
  };
  for (const [s, side] of [['R', '.R'], ['L', '.L']]) {
    P[`clav${s}`] = tp(`clavicle${side}`); P[`arm${s}`] = tp(`upper_arm${side}`); P[`fore${s}`] = tp(`forearm${side}`);
    P[`index${s}`] = tp(`finger_index_1${side}`); P[`little${s}`] = tp(`finger_little_1${side}`);
    P[`knuckle${s}`] = mid(P[`index${s}`], P[`little${s}`]);
    // the wrist: the point on the forearm's line nearest the knuckles, a hand's length (9 cm) short of them
    const dir = norm(sub(tp(`hand${side}`), P[`fore${s}`]));
    P[`wrist${s}`] = sub(P[`knuckle${s}`], scale(dir, 0.09));
    P[`thigh${s}`] = tp(`thigh${side}`); P[`shin${s}`] = tp(`shin${side}`); P[`foot${s}`] = tp(`foot${side}`);
    P[`toe${s}`] = add(P[`foot${s}`], scale(FOOT_FWD_REST, 0.15));
  }
  P.thighR = tp('thigh.R'); P.thighL = tp('thigh.L'); P.armR = tp('upper_arm.R'); P.armL = tp('upper_arm.L');
  // the elbow's hinge in rest: the bend normal of the sword arm's grip (Idle f0), carried back into the rest
  const idle = worldMatrices(model, localPose(model, [{ clip: 'Idle', time: 0, weight: 1 }]));
  for (const [s, side] of [['R', '.R'], ['L', '.L']]) {
    const a = posOf(idle[T(`upper_arm${side}`)]), e = posOf(idle[T(`forearm${side}`)]), h = posOf(idle[T(`hand${side}`)]);
    const n = norm(cross(norm(sub(e, a)), norm(sub(h, e))));
    const upperIdle = rotOf(idle[T(`upper_arm${side}`)]), upperRest = rotOf(restWorld[T(`upper_arm${side}`)]);
    P[`elbowAxisRest${s}`] = quat.rotate(upperRest, quat.rotate(quat.inv(upperIdle), n));
  }
  return P;
}
function sourcePoints(pose) {
  const p = (n) => toWorld(pose.pos[S(n)]);
  const P = { pelvis: p('Hips'), chest: p('Chest'), neck: p('Neck1'), head: p('Head'), headTop: p('HeadEnd') };
  for (const [s, side] of [['R', 'Right'], ['L', 'Left']]) {
    P[`clav${s}`] = p(`${side}Shoulder`); P[`arm${s}`] = p(`${side}Arm`); P[`fore${s}`] = p(`${side}ForeArm`); P[`wrist${s}`] = p(`${side}Hand`);
    P[`index${s}`] = p(`${side}HandIndex1`); P[`little${s}`] = p(`${side}HandPinky1`); P[`knuckle${s}`] = mid(P[`index${s}`], P[`little${s}`]);
    P[`thigh${s}`] = p(`${side}Leg`); P[`shin${s}`] = p(`${side}Shin`); P[`foot${s}`] = p(`${side}Foot`); P[`toe${s}`] = p(`${side}ToeBase`);
  }
  return P;
}

const TP = targetPoints();
const restFrames = frames({ ...TP, elbowAxisRestR: TP.elbowAxisRestR, elbowAxisRestL: TP.elbowAxisRestL }, null);
// which frame turns which bone
const BONES = { pelvis: 'pelvis', spine: 'spine', chest: 'chest', neck: 'neck', head: 'head' };
for (const [s, side] of [['R', '.R'], ['L', '.L']]) Object.assign(BONES, {
  [`clavicle${s}`]: `clavicle${side}`, [`upper${s}`]: `upper_arm${side}`, [`fore${s}`]: `forearm${side}`, [`hand${s}`]: `hand${side}`,
  [`thigh${s}`]: `thigh${side}`, [`shin${s}`]: `shin${side}`, [`foot${s}`]: `foot${side}`,
});
const DRIVEN = new Set(Object.values(BONES).map(T));

// --- timing: the source's from/contact/to onto the move's 0/contact/duration
const from = Number(option('--from')), to = Number(option('--to'));
let contact = option('--contact') == null ? null : Number(option('--contact'));
if (contact == null) { // the sword hand's fastest frame between from and to
  let best = -1;
  for (let f = from + 1; f <= to; f += 1) {
    const a = bvhPose(bvh, f - 1).pos[S('RightHand')], b = bvhPose(bvh, f).pos[S('RightHand')];
    const v = Math.hypot(...sub(a, b));
    if (v > best) { best = v; contact = f; }
  }
}
const D = move.clipEnd, C = move.clipContact;
const sourceFrameAt = (t) => (t <= C ? from + (contact - from) * (t / C) : contact + (to - contact) * ((t - C) / (D - C)));

// a source pose at a fractional frame: world positions blended between its neighbours
function sourceAt(f) {
  const a = Math.floor(f), b = Math.min(bvh.frames.length - 1, a + 1), w = f - a;
  const A = bvhPose(bvh, a), B = bvhPose(bvh, b);
  return { pos: A.pos.map((p, i) => p.map((v, c) => v + (B.pos[i][c] - v) * w)) };
}

// --- the sword arm, driven by the server's blade. The generated body knows no sword: through the cut, the arm is
// solved (client/game/swordArmIK.mjs, the same solver the game's arms use) so the blade shown lies along the blade the
// server sweeps (shared/src/blade.mjs bladeDirection), its grip on that blade's line from the eye. Before the live
// window the blade rises from where the arc begins into a raise over the shoulder; after it, it carries on into a
// follow-through. The edge leads (it lies along the way the blade moves).
function bladePath(kind, dt) {
  const frame = { forward: { x: 0, y: 0, z: -1 }, right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 } };
  const v = (o) => [o.x, o.y, o.z];
  const { early, late } = MELEE_CONTACT.window;
  const arc = (d) => v(bladeDirection(kind, d, frame));
  const [raised, finished] = BLADE_ENDS[kind];
  const smooth = (x) => { const s = Math.max(0, Math.min(1, x)); return s * s * (3 - 2 * s); };
  if (dt < -early) return slerpDir(arc(-early), norm(raised), smooth((-early - dt) / 0.22));
  if (dt > late) return slerpDir(arc(late), norm(finished), smooth((dt - late) / 0.25));
  return arc(dt);
}
// where each cut's blade is held before its arc and left after it (root space: x right, y up, -z ahead)
const BLADE_ENDS = {
  0: [[0.45, 0.85, 0.25], [-0.75, -0.45, -0.45]],   // the forehand: up over the right shoulder; low on the left
  1: [[-0.7, -0.35, -0.3], [0.6, 0.7, -0.2]],       // the backhand: low on the left; high on the right
  2: [[0.1, 0.75, 0.65], [0.05, -0.75, -0.65]],     // the chop: up and back over the head; down in front
};
function slerpDir(a, b, w) {
  const d = Math.max(-1, Math.min(1, dot(a, b)));
  const th = Math.acos(d);
  if (th < 1e-5) return a;
  const s = Math.sin(th);
  return norm(add(scale(a, Math.sin((1 - w) * th) / s), scale(b, Math.sin(w * th) / s)));
}
const EYE = [0, 1.35, 0];
const GRIP = 0.5;
let lastEdge = null;
// the bone api swordArmIK.mjs works through, over a local pose (root space is the world here: the root stands still)
function boneApi(local) {
  return {
    world: () => worldMatrices(model, local),
    position(bone) { return posOf(this.world()[T(bone)]); },
    direction(bone, axis) { return norm(quat.rotate(rotOf(this.world()[T(bone)]), axis)); },
    rotate(bone, axis, angle) {
      const W = this.world(), j = T(bone);
      const pr = parent[j] < 0 ? [0, 0, 0, 1] : rotOf(W[parent[j]]);
      const turned = quat.mul(quat.axisAngle(norm(axis), angle), rotOf(W[j]));
      local[j].r = quat.normalize(quat.mul(quat.inv(pr), turned));
    },
    shift(bone, offset) { const j = T(bone); local[j].t = add(local[j].t, offset); },
  };
}

// --- foot locking: each leg solved so its ankle follows the source's foot exactly (less the travel, which the
// simulation adds back), offset once by where the two rigs' feet differ on the first frame. The source's feet are
// pinned to the millimetre where they are planted; turning bones alone does not keep that on a rig whose hips sit
// elsewhere. The foot keeps the turn the retarget gave it.
const footOffset = {};
function lockFeet(local, P, travel) {
  const api = boneApi(local);
  for (const [s, side] of [['R', '.R'], ['L', '.L']]) {
    const foot = T(`foot${side}`);
    const W = api.world();
    const footTurn = rotOf(W[foot]);
    const now = posOf(W[foot]);
    const src = sub(P[`foot${s}`], [travel[0], 0, travel[2]]);
    if (!footOffset[s]) footOffset[s] = sub(now, src);
    const hip = api.position(`thigh${side}`), knee = api.position(`shin${side}`);
    const pole = sub(knee, mid(hip, now));
    solveArm(api, { shoulder: `thigh${side}`, elbow: `shin${side}`, wrist: `foot${side}`, grip: `foot${side}`, pole }, { wrist: add(src, footOffset[s]) }, 1);
    const pr = rotOf(api.world()[parent[foot]]);
    local[foot].r = quat.normalize(quat.mul(quat.inv(pr), footTurn));
  }
}

function bladeArm(local, dt) {
  const api = boneApi(local);
  const kind = move.kind;
  const dir = bladePath(kind, dt);
  const ahead = bladePath(kind, dt + 0.02), behind = bladePath(kind, dt - 0.02);
  let edge = sub(ahead, behind);
  edge = Math.hypot(...edge) > 0.02 ? norm(edge) : (lastEdge ?? [-1, 0, 0]);
  lastEdge = edge;
  solveArm(api, THIRD_PERSON_SWORD_ARM, { wrist: add(EYE, scale(dir, GRIP)), aim: dir, roll: edge }, 1);
}

// --- each output frame: driven bones' world rotations, then back to locals down the hierarchy
const idleLocal = localPose(model, [{ clip: 'Idle', time: 0, weight: 1 }]);
const times = Array.from({ length: Math.ceil(D * FPS - 1e-6) + 1 }, (_, i) => Math.min(D, i / FPS));
const parent = model.parent;
const out = [];
let prev = null;
const originPelvis = toWorld(sourceAt(from).pos[S('Hips')]);
const restPelvis = tp('pelvis');
for (const t of times) {
  const P = sourcePoints(sourceAt(sourceFrameAt(t)));
  P.elbowAxisRestR = TP.elbowAxisRestR; P.elbowAxisRestL = TP.elbowAxisRestL;
  const F = frames(P, prev);
  prev = F;
  const world = new Map();
  for (const [key, bone] of Object.entries(BONES)) {
    const j = T(bone);
    // turn from the rest frame to the source's frame, applied to the bone's rest orientation
    const delta = quat.mul(F[key], quat.inv(restFrames[key]));
    world.set(j, quat.normalize(quat.mul(delta, rotOf(restWorld[j]))));
  }
  // locals: driven bones from their world rotations; the rest keep Idle f0's locals (fingers' grip, cops, tabard)
  const local = idleLocal.map((x) => ({ t: x.t.slice(), r: x.r.slice(), s: x.s.slice() }));
  const worldRot = new Array(local.length);
  const resolve = (i) => {
    if (worldRot[i]) return worldRot[i];
    const pr = parent[i] < 0 ? [0, 0, 0, 1] : resolve(parent[i]);
    if (world.has(i)) local[i].r = quat.normalize(quat.mul(quat.inv(pr), world.get(i)));
    worldRot[i] = quat.normalize(quat.mul(pr, local[i].r));
    return worldRot[i];
  };
  for (let i = 0; i < local.length; i += 1) resolve(i);
  // the clip stands in place: the source's travel comes off the pelvis and is written out as root motion (the
  // simulation moves the knight by exactly it, so a planted foot stays planted in the world); its height stays
  const hips = P.pelvis;
  const pelvis = T('pelvis');
  const travel = sub(hips, originPelvis);
  // (the pelvis's parent, the root, stands at the origin unturned in every clip: its local is its world)
  local[pelvis].t = [restPelvis[0], hips[1], restPelvis[2]];
  local.forEach((x, i) => { if (!DRIVEN.has(i) && i !== pelvis && idleLocal[i]) x.t = idleLocal[i].t; });
  if (!args.includes('--no-foot-lock')) lockFeet(local, P, travel);
  if (!args.includes('--no-blade')) bladeArm(local, t - C);
  out.push({ t, pose: local, travel: [travel[0], travel[2]] });
}

// --- stood on the floor: the pelvis raised (or lowered) by one constant so the lower boot's sole is on the floor in
// the first frame (the source's hips sit lower than the Spellblade's)
const meshes = skinnedMeshes(model);
const soles = (pose) => { const h = skinnedHeights(model, meshes, pose, ['Boot.L', 'Boot.R']); return Math.min(h['Boot.L'][0], h['Boot.R'][0]); };
const lift = -soles(out[0].pose);
for (const f of out) f.pose[T('pelvis')].t[1] += lift;
const lowestSole = Math.min(...out.map((f) => soles(f.pose)));

// --- write the animation-only GLB (the sidecar's form)
const nodes = model.gltf.nodes;
const joints = model.gltf.skins[0].joints;
const keep = new Set();
for (const j of joints) for (let n = j; n >= 0; n = parent[n]) keep.add(n);
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
const input = pushFloats(out.map((f) => f.t), 'SCALAR', true);
const samplers = [], channels = [];
for (const j of joints) {
  if (nodes[j].name === 'root') continue;
  const rot = out.map((f) => f.pose[j].r.slice());
  for (let i = 1; i < rot.length; i += 1) if (dot4(rot[i], rot[i - 1]) < 0) rot[i] = rot[i].map((v) => -v);
  samplers.push({ input, interpolation: 'LINEAR', output: pushFloats(rot.flat(), 'VEC4') });
  channels.push({ sampler: samplers.length - 1, target: { node: remap.get(j), path: 'rotation' } });
  if (j === T('pelvis')) {
    samplers.push({ input, interpolation: 'LINEAR', output: pushFloats(out.flatMap((f) => f.pose[j].t), 'VEC3') });
    channels.push({ sampler: samplers.length - 1, target: { node: remap.get(j), path: 'translation' } });
  }
}
function dot4(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]; }
const sceneRoot = remap.get(order.find((n) => parent[n] < 0));
const gltf = { asset: { version: '2.0', generator: 'castleward tools/animation/retarget-bvh.mjs' }, scene: 0, scenes: [{ name: 'SpellbladeMotion', nodes: [sceneRoot] }],
  nodes: outNodes, animations: [{ name: clipName, samplers, channels }], accessors, bufferViews, buffers: [{ byteLength }] };
let json = Buffer.from(JSON.stringify(gltf), 'utf8');
if (json.length % 4) json = Buffer.concat([json, Buffer.alloc(4 - (json.length % 4), 0x20)]);
const bin = Buffer.concat(chunks);
const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(json.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
const glb = Buffer.concat([header, jh, json, bh, bin]);

const outPath = option('--out', `${repo}artifacts/kimodo-spike/${option('--move', 'forehand')}.motion.glb`);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, glb);
const travel = out.map((f) => f.travel);
const meta = {
  source: option('--bvh'), move: option('--move', 'forehand'), clip: clipName, sourceFrames: { from, contact, to }, sourceFps: bvh.fps,
  markers: { clipContact: C, linkEntry: move.linkEntry, clipEnd: D }, frames: out.length, pelvisLiftM: +lift.toFixed(4), lowestSoleM: +lowestSole.toFixed(4), scale: +k.toFixed(4), sha256: createHash('sha256').update(glb).digest('hex'),
  // the knight's travel over the clip, in his own space (x right, z ahead negative), metres: what the prototype's
  // root motion moves him by
  rootMotion: travel.map(([x, z], i) => ({ t: +out[i].t.toFixed(4), x: +x.toFixed(4), z: +z.toFixed(4) })),
};
writeFileSync(outPath.replace(/\.glb$/, '.json'), `${JSON.stringify(meta, null, 2)}\n`);
console.log(`wrote ${outPath} (${glb.length} bytes, ${out.length} frames, contact source f${contact} -> ${C}s, scale ${k.toFixed(3)}, travel ${Math.hypot(...travel.at(-1)).toFixed(2)} m)`);
