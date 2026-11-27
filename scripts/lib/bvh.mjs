// A small BVH reader for Node: the joint hierarchy, offsets and channels, and per-frame forward kinematics to world
// positions and rotations (quaternions, xyzw). Rotation channels apply in the order listed (BVH's convention: the
// local rotation is the product of the listed axis rotations, left to right).

import { readFileSync } from 'node:fs';

export const quat = {
  mul: (a, b) => [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ],
  inv: (q) => [-q[0], -q[1], -q[2], q[3]],
  axisAngle: (axis, angle) => { const s = Math.sin(angle / 2); return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)]; },
  rotate: (q, v) => {
    const [x, y, z, w] = q;
    const ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
    return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
  },
  normalize: (q) => { const l = Math.hypot(...q) || 1; return q.map((v) => v / l); },
  /** The rotation (a quaternion) whose matrix has these orthonormal columns. */
  fromBasis: (x, y, z) => {
    const m00 = x[0], m10 = x[1], m20 = x[2], m01 = y[0], m11 = y[1], m21 = y[2], m02 = z[0], m12 = z[1], m22 = z[2];
    const tr = m00 + m11 + m22;
    let q;
    if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s]; }
    else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]; }
    else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s]; }
    else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s]; }
    return quat.normalize(q);
  },
  angle: (a, b) => { const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]); return 2 * Math.acos(Math.min(1, d)); },
};

const AXES = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };

export function readBvh(path) {
  const text = readFileSync(path, 'utf8');
  const [head, motion] = text.split(/\nMOTION\s*\n/);
  const tokens = head.split(/\s+/).filter(Boolean);
  const joints = [];
  const stack = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t === 'ROOT' || t === 'JOINT') {
      joints.push({ name: tokens[i + 1], parent: stack.length ? stack[stack.length - 1] : -1, offset: [0, 0, 0], channels: [] });
      i += 2;
    } else if (t === 'End') { // an end site: skipped (its offset is not a joint)
      let depth = 0; i += 2;
      do { if (tokens[i] === '{') depth += 1; if (tokens[i] === '}') depth -= 1; i += 1; } while (depth > 0);
    } else if (t === '{') { stack.push(joints.length - 1); i += 1; }
    else if (t === '}') { stack.pop(); i += 1; }
    else if (t === 'OFFSET') { joints[joints.length - 1].offset = tokens.slice(i + 1, i + 4).map(Number); i += 4; }
    else if (t === 'CHANNELS') { const n = Number(tokens[i + 1]); joints[joints.length - 1].channels = tokens.slice(i + 2, i + 2 + n); i += 2 + n; }
    else i += 1;
  }
  const lines = motion.trim().split('\n');
  const frameCount = Number(lines[0].split(':')[1]);
  const frameTime = Number(lines[1].split(':')[1]);
  const frames = lines.slice(2, 2 + frameCount).map((l) => l.trim().split(/\s+/).map(Number));
  const byName = new Map(joints.map((j, k) => [j.name, k]));
  return { joints, frames, frameTime, fps: Math.round(1 / frameTime), byName };
}

/** World positions and rotations of every joint at frame `f` (or for raw channel values `values`). */
export function bvhPose(bvh, f, values = bvh.frames[f]) {
  const pos = [], rot = [];
  let c = 0;
  bvh.joints.forEach((j, k) => {
    let t = j.offset.slice();
    let q = [0, 0, 0, 1];
    for (const ch of j.channels) {
      const v = values[c]; c += 1;
      if (ch.endsWith('position')) t[{ X: 0, Y: 1, Z: 2 }[ch[0]]] = v;
      else q = quat.mul(q, quat.axisAngle(AXES[ch[0]], v * Math.PI / 180));
    }
    if (j.parent < 0) { pos[k] = t; rot[k] = q; }
    else {
      const pr = rot[j.parent], pp = pos[j.parent];
      const o = quat.rotate(pr, t);
      pos[k] = [pp[0] + o[0], pp[1] + o[1], pp[2] + o[2]];
      rot[k] = quat.normalize(quat.mul(pr, q));
    }
  });
  return { pos, rot };
}

/** The rest pose: every rotation channel at zero (positions as the offsets give them). */
export function bvhRest(bvh) {
  return bvhPose(bvh, -1, new Array(bvh.frames[0].length).fill(0));
}
