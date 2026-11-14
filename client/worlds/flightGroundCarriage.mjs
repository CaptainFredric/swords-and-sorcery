// The Fight-and-Flight apparatus on the ground: a heavy machine worn and walked by the Spellblade, not a stabilised
// pack. A presentation layer only: nothing here is read by movement, collision, hitboxes, flight or the aim.
//
// Two things carry the chassis (and with it the harness, the rider, the rotor and everything else hung from it):
//
//   the gait    The apparatus's own gait clips author the chassis through each stride: it drops onto each footfall
//               and rises between (10 cm at a walk, 14 at a sprint), leans into its pace, and twists and rolls a
//               degree or two with the legs. The legs hang from the chassis and were authored against that motion.
//               It was discarded (the chassis is kept for the authority in flight), so the machine glided level
//               over legs that strode under it. On the ground it is now played, on the stride phase the legs use.
//   its weight  A sprung lean on top: the mass lags when the machine gathers pace and pitches on when it brakes,
//               sways out of a turn, and settles with a damped rock when it stops.
//
// Both fade out as it leaves the ground (take-off, a hop, a dash run, a wreck), so everything airborne is as it was.

export const FLIGHT_CARRIAGE = Object.freeze({
  // how quickly the layer comes in on the ground and gives way to take-off (per second)
  weightIn: 7, weightOut: 9,
  // a change of gait (walk, sprint, stopping, standing) is eased across this long
  gaitBlendSec: 0.22,
  // the sprung lean: natural frequency (rad/s) and damping ratio: under-damped, so it rocks once or twice and settles
  frequency: 8.5, damping: 0.42,
  // radians of lean per m/s^2, and their limits
  pitchPerAccel: 0.011, pitchLimit: 0.1,
  rollPerAccel: 0.007, rollLimit: 0.085,
  // how the machine's measured acceleration is smoothed before it is leant on (per second)
  accelSmoothing: 12,
});

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const IDENTITY = Object.freeze([0, 0, 0, 1]);
function slerp(a, b, t) {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const sign = dot < 0 ? -1 : 1; dot = Math.abs(dot);
  let wa = 1 - t, wb = t;
  if (dot < 0.9995) { const angle = Math.acos(dot), s = Math.sin(angle); wa = Math.sin((1 - t) * angle) / s; wb = Math.sin(t * angle) / s; }
  const q = [0, 1, 2, 3].map((i) => a[i] * wa + b[i] * wb * sign);
  const n = Math.hypot(...q) || 1;
  return q.map((v) => v / n);
}
function multiply(a, b) {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
}
// a small lean about the machine's own side-to-side axis (x: positive pitches it forward) and fore-and-aft axis (z)
function lean(pitch, roll) {
  return multiply([Math.sin(pitch / 2), 0, 0, Math.cos(pitch / 2)], [0, 0, Math.sin(roll / 2), Math.cos(roll / 2)]);
}

/** Whether the machine is carried on its legs just now (and so whether this layer has any say). */
export function carriedOnTheGround(m) {
  return Boolean(m) && m.grounded !== false && m.mode !== 'DESTROYED' && !(m.health <= 0) && m.mode !== 'TAKEOFF' && m.mode !== 'LANDING'
    && !m.offensiveRun && !m.terminalDive && !m.crouched;
}

export class FlightGroundCarriage {
  constructor(tuning = FLIGHT_CARRIAGE) { this.tuning = tuning; this.reset(); }

  reset() {
    this.weight = 0;
    this.clip = null; this.shown = { y: 0, q: [...IDENTITY] }; this.from = null; this.blendAt = 0;
    this.velocity = null;
    this.accel = { forward: 0, lateral: 0 };
    this.pitch = 0; this.pitchRate = 0; this.roll = 0; this.rollRate = 0;
    this.offset = { y: 0, q: [...IDENTITY], weight: 0, pitch: 0, roll: 0 };
  }

  /**
   * One frame. `posture` is the grounded posture being played ({ clip, time }: flightAnimationState.mjs) and
   * `authored(clip, time)` the chassis that clip authors there ({ y, q }) or null for a clip with nothing to say.
   * Returns the chassis's offset from its rest: { y (metres), q (a rotation), weight }.
   */
  update(m, posture, dt, authored) {
    const T = this.tuning;
    dt = clamp(dt, 0, 0.1);
    if (this.id !== m?.id) { this.reset(); this.id = m?.id; }
    const onLegs = carriedOnTheGround(m);
    this.weight += ((onLegs ? 1 : 0) - this.weight) * (1 - Math.exp(-dt * (onLegs ? T.weightIn : T.weightOut)));
    if (this.weight < 1e-4 && !onLegs) this.weight = 0;

    // --- the gait: what the clip authors for the chassis, eased across a change of clip
    const target = (onLegs && posture && authored(posture.clip, posture.time)) || { y: 0, q: IDENTITY };
    const clip = onLegs ? posture?.clip ?? null : null;
    if (clip !== this.clip) { this.from = { y: this.shown.y, q: [...this.shown.q] }; this.blendAt = 0; this.clip = clip; }
    this.blendAt += dt;
    const k = this.from ? clamp(this.blendAt / T.gaitBlendSec, 0, 1) : 1;
    const ease = k * k * (3 - 2 * k);
    this.shown = this.from && k < 1 ? { y: this.from.y + (target.y - this.from.y) * ease, q: slerp(this.from.q, target.q, ease) } : { y: target.y, q: [...target.q] };
    if (k >= 1) this.from = null;

    // --- its weight: the machine's own acceleration, along and across its heading
    const velocity = { x: m?.velocity?.x ?? 0, z: m?.velocity?.z ?? 0 };
    const heading = Number.isFinite(m?.heading) ? m.heading : 0;
    let forward = 0, lateral = 0;
    if (this.velocity && dt > 1e-4) {
      // (yaw zero faces -z: movement.mjs)
      const ahead = { x: -Math.sin(heading), z: -Math.cos(heading) }, right = { x: Math.cos(heading), z: -Math.sin(heading) };
      const ax = (velocity.x - this.velocity.x) / dt, az = (velocity.z - this.velocity.z) / dt;
      forward = ax * ahead.x + az * ahead.z;
      // across: the turn itself is in there (the velocity swings round with the heading), and any slide sideways
      lateral = ax * right.x + az * right.z;
    }
    this.velocity = velocity;
    const smooth = 1 - Math.exp(-dt * T.accelSmoothing);
    // (a teleport or a snapshot hitch is not a shove: bounded)
    this.accel.forward += (clamp(forward, -30, 30) - this.accel.forward) * smooth;
    this.accel.lateral += (clamp(lateral, -30, 30) - this.accel.lateral) * smooth;
    // gathering pace the top lags (leans back); braking it pitches on; in a turn it sways outward
    const wantPitch = onLegs ? clamp(-this.accel.forward * T.pitchPerAccel, -T.pitchLimit, T.pitchLimit) : 0;
    // (turning left the mass is pulled left, so the top sways right: a positive roll about the machine's length)
    const wantRoll = onLegs ? clamp(-this.accel.lateral * T.rollPerAccel, -T.rollLimit, T.rollLimit) : 0;
    // a sprung mass (semi-implicit Euler, in steps short enough to stay stable at any frame rate)
    const w = T.frequency, c = 2 * T.damping * w;
    for (let left = dt; left > 1e-6; left -= 1 / 120) {
      const h = Math.min(left, 1 / 120);
      this.pitchRate += (w * w * (wantPitch - this.pitch) - c * this.pitchRate) * h; this.pitch += this.pitchRate * h;
      this.rollRate += (w * w * (wantRoll - this.roll) - c * this.rollRate) * h; this.roll += this.rollRate * h;
    }

    const q = multiply(slerp(IDENTITY, this.shown.q, this.weight), lean(this.pitch * this.weight, this.roll * this.weight));
    this.offset = { y: this.shown.y * this.weight, q, weight: this.weight, pitch: this.pitch * this.weight, roll: this.roll * this.weight };
    return this.offset;
  }
}
