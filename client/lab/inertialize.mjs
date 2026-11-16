// Inertialization: how a body goes from one clip to the next without a cross-fade. A cross-fade averages the two
// poses for a tenth of a second or more, so a blow starts late and mushy. Instead the new clip takes over at once and
// the difference between what was showing and what the new clip shows (and how fast it was moving) is carried as an
// offset that dies away on a critically damped spring: responsive and smooth at once.
// (After D. Holden's "dead blending" and spring-damper decay, and D. Bollo's inertialization, GDC 2018.)
//
// Pure: quaternions are [x, y, z, w], positions [x, y, z]; a track is one bone's rotation or one bone's position.

const LN2 = Math.LN2;

export const quatMul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
export const quatInv = (q) => [-q[0], -q[1], -q[2], q[3]];

/** The rotation vector (axis times angle) of a quaternion, the shorter way round. */
export function quatLog(q) {
  const s = q[3] < 0 ? -1 : 1;
  const x = q[0] * s, y = q[1] * s, z = q[2] * s, w = Math.min(1, q[3] * s);
  const len = Math.hypot(x, y, z);
  if (len < 1e-9) return [2 * x, 2 * y, 2 * z];
  const angle = 2 * Math.atan2(len, w);
  return [x / len * angle, y / len * angle, z / len * angle];
}
/** The quaternion of a rotation vector. */
export function quatExp(v) {
  const angle = Math.hypot(v[0], v[1], v[2]);
  if (angle < 1e-9) return [v[0] / 2, v[1] / 2, v[2] / 2, 1];
  const s = Math.sin(angle / 2) / angle;
  return [v[0] * s, v[1] * s, v[2] * s, Math.cos(angle / 2)];
}

/** One step of a critically damped spring decaying an offset `x` with velocity `v` toward zero (Holden's exact form). */
export function decay(x, v, halflife, dt) {
  const y = (4 * LN2) / (halflife + 1e-5) / 2;
  const eydt = Math.exp(-y * dt);
  const nx = new Array(x.length), nv = new Array(x.length);
  for (let i = 0; i < x.length; i += 1) {
    const j1 = v[i] + x[i] * y;
    nx[i] = eydt * (x[i] + j1 * dt);
    nv[i] = eydt * (v[i] - j1 * y * dt);
  }
  return [nx, nv];
}

/**
 * Tracks of offsets for a set of bones. Each frame: sample the source (the clips) into the bones, then call `apply`;
 * on the frame a transition happens, call `transition` first (it reads what was shown last frame and what the source
 * shows now). Modes: 'inertialize' (the default), 'snap' (no smoothing at all), 'crossfade' is the caller's.
 */
export class Inertializer {
  constructor(count, { halflife = 0.09 } = {}) {
    this.halflife = halflife;
    this.rot = Array.from({ length: count }, () => ({ x: [0, 0, 0], v: [0, 0, 0], last: null, prev: null }));
    this.pos = new Map();
  }

  /** A clip change: what was shown last frame, against what the new source shows now, becomes the offset to decay. */
  transition(sourceRot, sourcePos = new Map(), dt = 1 / 60) {
    this.rot.forEach((track, i) => {
      if (!track.last) return;
      // the shown pose last frame, carried on by its own velocity for this frame, against the new source
      const vel = track.prev ? quatLog(quatMul(track.last, quatInv(track.prev))).map((c) => c / dt) : [0, 0, 0];
      const predicted = quatMul(quatExp(vel.map((c) => c * dt)), track.last);
      track.x = quatLog(quatMul(predicted, quatInv(sourceRot[i])));
      track.v = vel;
    });
    for (const [key, p] of sourcePos) {
      const track = this.pos.get(key);
      if (!track?.last) continue;
      const vel = track.prev ? track.last.map((c, k) => (c - track.prev[k]) / dt) : [0, 0, 0];
      track.x = track.last.map((c, k) => c + vel[k] * dt - p[k]);
      track.v = vel;
    }
  }

  /** The shown pose this frame: the source with each offset decayed one step and laid over it (in place). */
  apply(sourceRot, sourcePos = new Map(), dt = 1 / 60) {
    const out = sourceRot.map((q, i) => {
      const track = this.rot[i];
      [track.x, track.v] = decay(track.x, track.v, this.halflife, dt);
      const shown = quatMul(quatExp(track.x), q);
      track.prev = track.last;
      track.last = shown;
      return shown;
    });
    const outPos = new Map();
    for (const [key, p] of sourcePos) {
      let track = this.pos.get(key);
      if (!track) { track = { x: [0, 0, 0], v: [0, 0, 0], last: null, prev: null }; this.pos.set(key, track); }
      [track.x, track.v] = decay(track.x, track.v, this.halflife, dt);
      const shown = p.map((c, k) => c + track.x[k]);
      track.prev = track.last;
      track.last = shown;
      outPos.set(key, shown);
    }
    return { rot: out, pos: outPos };
  }

  /** Forget everything (a respawn: no offset carried across it). */
  reset() {
    for (const track of this.rot) Object.assign(track, { x: [0, 0, 0], v: [0, 0, 0], last: null, prev: null });
    this.pos.clear();
  }
}
