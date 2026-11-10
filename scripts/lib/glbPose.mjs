// A minimal glTF (GLB) pose sampler for Node: the node hierarchy, its rest transforms and LINEAR/STEP animation
// channels, evaluated to world matrices without three.js or a browser. Used by the sword audits to measure the shipped
// clips exactly as they are exported (frame seams, where the sword is at a strike's contact), not as we hope they are.

import { readFileSync } from 'node:fs';

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function accessorData(gltf, bin, index) {
  const accessor = gltf.accessors[index];
  const view = gltf.bufferViews[accessor.bufferView];
  const n = COMPONENTS[accessor.type];
  if (accessor.componentType !== 5126) throw new Error(`accessor ${index}: only float data is read`);
  const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = view.byteStride ?? n * 4;
  const out = new Float32Array(accessor.count * n);
  for (let i = 0; i < accessor.count; i += 1) {
    for (let c = 0; c < n; c += 1) out[i * n + c] = bin.readFloatLE(offset + i * stride + c * 4);
  }
  return { data: out, n, count: accessor.count };
}

const quatNormalize = (q) => { const l = Math.hypot(...q) || 1; return q.map((v) => v / l); };
function slerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const bb = d < 0 ? b.map((v) => -v) : b;
  d = Math.abs(d);
  if (d > 0.9995) return quatNormalize(a.map((v, i) => v + (bb[i] - v) * t));
  const th = Math.acos(d), s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
  return a.map((v, i) => v * wa + bb[i] * wb);
}

/** 4x4 column-major from translation, rotation (quaternion xyzw) and scale. */
export function compose(t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]) {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}

export function multiply(a, b) {
  const out = new Array(16);
  for (let c = 0; c < 4; c += 1) for (let r = 0; r < 4; r += 1) {
    out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return out;
}

export const apply = (m, p) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];

export function loadGlb(path) {
  const buffer = readFileSync(path);
  const jsonLength = buffer.readUInt32LE(12);
  const gltf = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'));
  const binStart = 20 + jsonLength + 8;
  const bin = buffer.subarray(binStart);
  const parent = new Array(gltf.nodes.length).fill(-1);
  gltf.nodes.forEach((node, i) => (node.children ?? []).forEach((c) => { parent[c] = i; }));
  const byName = new Map(gltf.nodes.map((n, i) => [n.name, i]));
  const clips = new Map();
  for (const animation of gltf.animations ?? []) {
    const channels = animation.channels.map((channel) => {
      const sampler = animation.samplers[channel.sampler];
      return {
        node: channel.target.node, path: channel.target.path, interpolation: sampler.interpolation ?? 'LINEAR',
        times: accessorData(gltf, bin, sampler.input).data, values: accessorData(gltf, bin, sampler.output),
      };
    });
    const duration = Math.max(...channels.map((c) => c.times[c.times.length - 1]));
    clips.set(animation.name, { name: animation.name, channels, duration });
  }
  return { gltf, bin, parent, byName, clips, accessor: (i) => accessorData(gltf, bin, i) };
}

function sampleChannel(channel, time) {
  const { times, values, interpolation } = channel;
  const n = values.n;
  const read = (i) => Array.from(values.data.subarray(i * n, i * n + n));
  if (time <= times[0]) return read(0);
  const last = times.length - 1;
  if (time >= times[last]) return read(last);
  let i = 0;
  while (i < last - 1 && time > times[i + 1]) i += 1;
  if (interpolation === 'STEP') return read(i);
  const t = (time - times[i]) / (times[i + 1] - times[i]);
  const a = read(i), b = read(i + 1);
  return channel.path === 'rotation' ? slerp(a, b, t) : a.map((v, c) => v + (b[c] - v) * t);
}

/**
 * Local TRS of every node for a set of weighted clips at their own times (layers: [{ clip, time, weight }]). Rotation
 * blends by normalized weighted sum in a common hemisphere, as three.js's mixer accumulates them.
 */
export function localPose(model, layers) {
  const { gltf } = model;
  const rest = gltf.nodes.map((n) => ({ t: n.translation ?? [0, 0, 0], r: n.rotation ?? [0, 0, 0, 1], s: n.scale ?? [1, 1, 1] }));
  const total = layers.reduce((s, l) => s + l.weight, 0);
  if (!(total > 0)) return rest;
  const acc = gltf.nodes.map(() => ({ t: null, r: null, s: null }));
  for (const { clip, time, weight } of layers) {
    const c = model.clips.get(clip);
    if (!c || weight <= 0) continue;
    const w = weight / total;
    for (const channel of c.channels) {
      const key = channel.path === 'translation' ? 't' : channel.path === 'rotation' ? 'r' : channel.path === 'scale' ? 's' : null;
      if (!key) continue;
      const v = sampleChannel(channel, time);
      const slot = acc[channel.node];
      if (!slot[key]) slot[key] = { sum: v.map(() => 0), w: 0, ref: v };
      const vv = key === 'r' && v.reduce((d, x, i) => d + x * slot[key].ref[i], 0) < 0 ? v.map((x) => -x) : v;
      slot[key].sum = slot[key].sum.map((s, i) => s + vv[i] * w);
      slot[key].w += w;
    }
  }
  return rest.map((r, i) => {
    const slot = acc[i];
    const fill = (key, base) => {
      if (!slot[key]) return base;
      // missing weight goes toward the rest, as three.js mixes it
      const missing = 1 - slot[key].w;
      const v = slot[key].sum.map((s, c) => s + base[c] * missing);
      return key === 'r' ? quatNormalize(v) : v;
    };
    return { t: fill('t', r.t), r: fill('r', r.r), s: fill('s', r.s) };
  });
}

/** World matrices of every node for a local pose. */
export function worldMatrices(model, pose) {
  const out = new Array(pose.length);
  const visit = (i) => {
    if (out[i]) return out[i];
    const local = compose(pose[i].t, pose[i].r, pose[i].s);
    out[i] = model.parent[i] < 0 ? local : multiply(visit(model.parent[i]), local);
    return out[i];
  };
  for (let i = 0; i < pose.length; i += 1) visit(i);
  return out;
}
