// The Spellblade's secondary motion: the weight of a man in plate, under whatever the clips and solvers make of him.
//
// - Momentum: braking hard, the upper body carries on a little and settles back (a small overshoot, never a bounce);
//   pushing off, it leans a touch into the push.
// - Turning at speed, the trunk banks into the turn, as a runner's does.
// - The helmet keeps the eyes steady (it takes back most of the trunk's pitch and bank) and leads a turn by a moment.
// - Riding (a machine's seat or harness holds him): half of all of it.
//
// It reads only where the knight's body is and which way it faces (no input, no camera): every observer computes the
// same motion from the same snapshots. Small by design (a few degrees), on the spine, chest, neck and head: the hips
// and feet stay where the clip and the contact solvers put them. Nothing here ever moves a first-person view.
const DEG = Math.PI / 180;

export const SECONDARY = Object.freeze({
  // the trunk's pitch per m/s² of braking, and of pushing off (radians), and its limit
  brake: 0.02, push: 0.007, pitchMax: 7 * DEG,
  // banking into a turn: the share of a free body's bank (atan(a / g)), and its limit
  bank: 0.35, rollMax: 6 * DEG,
  // the helmet keeps the eyes steady: the share of the trunk's pitch and bank it takes back
  steady: 0.65,
  // and leads a turn: by this many seconds of the turn's rate, up to a limit
  lead: 0.1, leadMax: 9 * DEG,
  // the spring the trunk settles on: natural frequency (Hz) and damping ratio (under 1: one small overshoot)
  hz: 2.2, damping: 0.62,
  // smoothing of the measured velocity and acceleration (seconds), and the most acceleration believed (m/s²): more is
  // a teleport, a respawn or a snapshot jump, not a body's motion
  velocitySmooth: 0.06, accelSmooth: 0.12, accelMax: 30,
  // riding: the share of all of it
  riding: 0.5,
});

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class SecondaryMotion {
  constructor() {
    this.reset();
  }

  reset() {
    this.last = null;                       // { x, z, yaw }
    this.velocity = { x: 0, z: 0 };
    this.accel = { x: 0, z: 0 };
    this.yawRate = 0;
    this.pitch = { x: 0, v: 0 };
    this.roll = { x: 0, v: 0 };
  }

  /**
   * One frame. at: { x, z } where the body is (world metres); yaw: which way it faces; riding: in a machine;
   * still: hold no motion (dead, spun by a Vortex, carried by a reaction that owns the trunk). Returns root-space turns.
   */
  update(dt, { at, yaw, riding = false, still = false }) {
    if (!(dt > 0) || dt > 0.25 || !at || !Number.isFinite(at.x) || !Number.isFinite(at.z) || !Number.isFinite(yaw)) {
      this.last = at && Number.isFinite(at.x) && Number.isFinite(at.z) && Number.isFinite(yaw) ? { x: at.x, z: at.z, yaw } : null;
      return this.#turns(riding);
    }
    if (still) {
      this.reset();
      this.last = { x: at.x, z: at.z, yaw };
      return [];
    }
    if (!this.last) {
      this.last = { x: at.x, z: at.z, yaw };
      return this.#turns(riding);
    }
    // the body's velocity and acceleration, smoothed
    const kv = 1 - Math.exp(-dt / SECONDARY.velocitySmooth);
    const ka = 1 - Math.exp(-dt / SECONDARY.accelSmooth);
    const vx = (at.x - this.last.x) / dt;
    const vz = (at.z - this.last.z) / dt;
    const before = { ...this.velocity };
    this.velocity.x += (vx - this.velocity.x) * kv;
    this.velocity.z += (vz - this.velocity.z) * kv;
    const ax = clamp((this.velocity.x - before.x) / dt, -SECONDARY.accelMax, SECONDARY.accelMax);
    const az = clamp((this.velocity.z - before.z) / dt, -SECONDARY.accelMax, SECONDARY.accelMax);
    this.accel.x += (ax - this.accel.x) * ka;
    this.accel.z += (az - this.accel.z) * ka;
    this.yawRate += (wrap(yaw - this.last.yaw) / dt - this.yawRate) * ka;
    this.last = { x: at.x, z: at.z, yaw };

    // in the knight's own frame: ahead is (-sin yaw, -cos yaw)
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const ahead = this.velocity.x * fx + this.velocity.z * fz;
    const accelAhead = this.accel.x * fx + this.accel.z * fz;
    // (positive pitch leans back: braking leans forward, a push-off a little forward)
    const pitchWant = -clamp(SECONDARY.brake * Math.max(0, -accelAhead) + SECONDARY.push * Math.max(0, accelAhead), 0, SECONDARY.pitchMax);
    // (positive roll leans left; a positive yaw rate turns left: lean into it)
    const lateral = ahead * this.yawRate;
    const rollWant = clamp(Math.atan(lateral / 9.81) * SECONDARY.bank, -SECONDARY.rollMax, SECONDARY.rollMax);
    this.#spring(this.pitch, pitchWant, dt);
    this.#spring(this.roll, rollWant, dt);
    return this.#turns(riding);
  }

  #spring(s, target, dt) {
    const w = 2 * Math.PI * SECONDARY.hz;
    const steps = Math.max(1, Math.ceil(dt * 240));
    const h = dt / steps;
    for (let i = 0; i < steps; i += 1) {
      s.v += (w * w * (target - s.x) - 2 * SECONDARY.damping * w * s.v) * h;
      s.x += s.v * h;
    }
  }

  #turns(riding) {
    const share = riding ? SECONDARY.riding : 1;
    const pitch = this.pitch.x * share;
    const roll = this.roll.x * share;
    const lead = clamp(this.yawRate * SECONDARY.lead, -SECONDARY.leadMax, SECONDARY.leadMax) * share;
    const turns = [];
    if (Math.abs(pitch) > 1e-4) {
      turns.push({ bone: 'spine', axis: [1, 0, 0], angle: pitch * 0.4 }, { bone: 'chest', axis: [1, 0, 0], angle: pitch * 0.6 });
      turns.push({ bone: 'head', axis: [1, 0, 0], angle: -pitch * SECONDARY.steady });
    }
    if (Math.abs(roll) > 1e-4) {
      turns.push({ bone: 'spine', axis: [0, 0, 1], angle: roll * 0.45 }, { bone: 'chest', axis: [0, 0, 1], angle: roll * 0.55 });
      turns.push({ bone: 'head', axis: [0, 0, 1], angle: -roll * SECONDARY.steady });
    }
    if (Math.abs(lead) > 1e-4) turns.push({ bone: 'head', axis: [0, 1, 0], angle: lead });
    return turns;
  }
}
