// Restrained procedural motion for the first-person view, layered over the authored first-person clips:
// stride bob and arm pump driven by distance travelled, sprint build-up and run-off inertia, turn sway, landing
// and damage impulses, guard/parry recoil and eased field of view. Pure (no three.js), so it runs in node tests.
//
// Weapon offsets are in camera space (+x right, +y up, +z toward the viewer). Camera offsets are small and
// purely visual: aim always comes from the input yaw/pitch, never from these.

import { MOVEMENT, SPRINT } from '../../shared/src/movement.mjs';

export const FP_MOTION = Object.freeze({
  baseFov: 78,
  sprintFov: 6,        // extra degrees at full sprint speed
  dashFov: 10,
  // metres per footfall: the authored Run clip lands 2.9 steps/s at 7.5 m/s, Sprint 3.5 steps/s at 11 m/s
  runStep: 2.62,
  sprintStep: 3.12,
  // neutral hands sit a little lower and wider than the authored pose, keeping the sightline clear
  neutralDrop: 0.045,
  neutralSpread: 0.12,
});

// A damped spring toward a target. Impulses add velocity. Stable for any frame time (sub-stepped).
export class Spring {
  constructor(stiffness = 120, damping = 18) {
    this.stiffness = stiffness;
    this.damping = damping;
    this.value = 0;
    this.velocity = 0;
    this.target = 0;
  }

  impulse(amount) {
    this.velocity += amount;
  }

  step(dt) {
    let remaining = Math.max(0, Math.min(0.1, dt));
    while (remaining > 1e-6) {
      const h = Math.min(1 / 120, remaining);
      const accel = this.stiffness * (this.target - this.value) - this.damping * this.velocity;
      this.velocity += accel * h;
      this.value += this.velocity * h;
      remaining -= h;
    }
    return this.value;
  }
}

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

function wrapAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

const AXES = ['x', 'y', 'z', 'rx', 'ry', 'rz'];

function springSet(stiffness, damping) {
  return Object.fromEntries(AXES.map((axis) => [axis, new Spring(stiffness, damping)]));
}

export class FirstPersonMotion {
  constructor() {
    // lagging response to turning and acceleration (soft) and hard impacts (stiffer, settles fast)
    this.lag = springSet(90, 16);
    this.impact = springSet(260, 24);
    this.camera = { y: new Spring(200, 24), pitch: new Spring(170, 20), roll: new Spring(170, 20) };
    this.stride = 0;            // footfalls travelled
    this.sprint = 0;            // 0 run .. 1 full sprint, from real ground speed
    this.lastSpeed = 0;
    this.lastYaw = null;
    this.lastPitch = null;
    this.moving = 0;
    this.neutral = 1;           // how much of the relaxed neutral offset applies (fades out for actions)
    this.fov = FP_MOTION.baseFov;
  }

  /** Touch-down after a fall; impactSpeed is the downward speed at landing (m/s). */
  land(impactSpeed) {
    const strength = clamp((impactSpeed - 2) / 9, 0, 1);
    if (strength <= 0) return;
    // about 6 cm and 1.7 degrees of dip at the hardest landing, recovered in a quarter second
    this.camera.y.impulse(-1.7 * strength);
    this.camera.pitch.impulse(-0.7 * strength);
    this.impact.y.impulse(-1.5 * strength);
    this.impact.rx.impulse(-1.8 * strength);
  }

  /**
   * A blow that lands on me. push: horizontal direction from the attacker to me in view space
   * (x right, z toward the viewer, i.e. backward); amount: damage dealt.
   */
  damage(push, amount = 20) {
    const strength = clamp(amount / 34, 0.35, 1.2);
    const x = push?.x ?? 0;
    const z = push?.z ?? 1;
    // the head is knocked away from the blow; the arms are shoved with it
    this.camera.pitch.impulse(0.8 * z * strength);
    this.camera.roll.impulse(-1.0 * x * strength);
    this.impact.x.impulse(0.9 * x * strength);
    this.impact.z.impulse(1.2 * Math.max(0.3, z) * strength);
    this.impact.rz.impulse(-2.4 * x * strength);
  }

  /** A blow caught on my guard: the blade is driven back toward me and rings. */
  block(heavy = false) {
    const strength = heavy ? 1.6 : 1;
    this.impact.z.impulse(1.5 * strength);
    this.impact.y.impulse(0.45 * strength);
    this.impact.rx.impulse(3.0 * strength);
    this.impact.ry.impulse(-1.2 * strength);
    this.camera.pitch.impulse(0.25 * strength);
  }

  /** My parry lands: a sharp outward deflection that snaps back. */
  parry() {
    this.impact.ry.impulse(-3.5);
    this.impact.x.impulse(0.9);
    this.impact.rz.impulse(1.8);
    this.camera.roll.impulse(0.25);
  }

  /** My swing met someone's guard: a smaller rebound than a wall. */
  rebound() {
    this.impact.z.impulse(0.8);
    this.impact.rz.impulse(1.4);
    this.impact.rx.impulse(1.2);
  }

  /** A swing that hits a wall: jarred back and to the side. */
  clang() {
    this.impact.z.impulse(1.2);
    this.impact.x.impulse(0.9);
    this.impact.rz.impulse(3.5);
    this.camera.pitch.impulse(0.5);
  }

  /**
   * @param {{dt:number, speed:number, grounded:boolean, yaw:number, pitch:number, state:string, dashing?:boolean}} frame
   *   state: the first-person pose state ('idle', 'attack', 'guard', 'cast', 'dash')
   * @returns {{weapon:{x,y,z,rx,ry,rz}, camera:{y,pitch,roll}, fov:number, pump:number, neutral:number}}
   */
  step({ dt, speed: rawSpeed = 0, grounded = true, yaw = 0, pitch = 0, state = 'idle', dashing = false }) {
    const h = Math.max(0, Math.min(0.1, Number.isFinite(dt) ? dt : 0));
    // a dash moves far faster than any gait; it has its own pose, so gait motion reads it as a sprint
    const speed = Math.max(0, Math.min(SPRINT.speed, Number.isFinite(rawSpeed) ? rawSpeed : 0));
    const ground = grounded ? speed : 0;
    const sprintTarget = clamp((speed - MOVEMENT.runSpeed) / (SPRINT.speed - MOVEMENT.runSpeed), 0, 1);
    this.sprint += (sprintTarget - this.sprint) * (1 - Math.exp(-h * 10));
    const movingTarget = clamp(ground / MOVEMENT.runSpeed, 0, 1);
    this.moving += (movingTarget - this.moving) * (1 - Math.exp(-h * 12));

    // footfalls from distance covered, so the rhythm matches the legs exactly
    const stepLength = FP_MOTION.runStep + (FP_MOTION.sprintStep - FP_MOTION.runStep) * this.sprint;
    if (!dashing) this.stride += (ground * h) / stepLength;
    const phase = this.stride * Math.PI;           // one full sine per two footfalls
    const dip = (1 - Math.cos(2 * phase)) / 2;     // 0 at each footfall's push-off, 1 at contact

    // acceleration (m/s^2): building a sprint drags the arms back; running it off swings them forward
    const accel = h > 0 ? (speed - this.lastSpeed) / h : 0;
    this.lastSpeed = speed;
    this.lag.z.target = clamp(accel * 0.006, -0.05, 0.05);
    this.lag.rx.target = clamp(-accel * 0.01, -0.08, 0.08);

    // turning: the arms trail the view a little and bank into the turn
    const yawRate = this.lastYaw === null || h <= 0 ? 0 : wrapAngle(yaw - this.lastYaw) / h;
    const pitchRate = this.lastPitch === null || h <= 0 ? 0 : (pitch - this.lastPitch) / h;
    this.lastYaw = yaw;
    this.lastPitch = pitch;
    this.lag.ry.target = clamp(yawRate * 0.018, -0.1, 0.1);
    this.lag.rz.target = clamp(yawRate * 0.012, -0.07, 0.07);
    this.lag.x.target = clamp(-yawRate * 0.004, -0.025, 0.025);
    this.lag.y.target = clamp(-pitchRate * 0.004, -0.02, 0.02);

    for (const axis of AXES) { this.lag[axis].step(h); this.impact[axis].step(h); }
    this.camera.y.step(h);
    this.camera.pitch.step(h);
    this.camera.roll.step(h);

    // the relaxed neutral pose fades out while an action owns the arms
    const neutralTarget = state === 'idle' ? 1 : 0;
    this.neutral += (neutralTarget - this.neutral) * (1 - Math.exp(-h * (neutralTarget ? 6 : 16)));

    const m = this.moving;
    const s = this.sprint;
    const free = this.neutral;
    // stride: a dip on every footfall and a side-to-side sway once per stride; stronger in the sprint
    const bobY = -(0.010 + 0.014 * s) * dip * m;
    const swayX = (0.006 + 0.006 * s) * Math.sin(phase) * m;
    // sprint carriage: hands held in and a touch low, blade laid back, arms pumping with the stride
    const pump = Math.sin(phase) * s * m * free;
    const weapon = {
      x: swayX + this.lag.x.value + this.impact.x.value - 0.02 * s * free,
      y: bobY + this.lag.y.value + this.impact.y.value - FP_MOTION.neutralDrop * free - 0.025 * s * free,
      z: this.lag.z.value + this.impact.z.value + 0.03 * s * free,
      rx: this.lag.rx.value + this.impact.rx.value - 0.05 * s * free - dip * 0.02 * m,
      ry: this.lag.ry.value + this.impact.ry.value + 0.08 * s * free,
      rz: this.lag.rz.value + this.impact.rz.value + swayX * 1.6,
    };
    // the camera moves far less than the arms: a small footfall dip, a slight lean into the sprint
    const camera = {
      y: this.camera.y.value - (0.006 + 0.008 * s) * dip * m,
      pitch: this.camera.pitch.value - 0.02 * s * m,
      roll: this.camera.roll.value + 0.003 * Math.sin(phase) * m,
    };

    const targetFov = FP_MOTION.baseFov + FP_MOTION.sprintFov * s * m + (dashing ? FP_MOTION.dashFov : 0);
    this.fov += (targetFov - this.fov) * (1 - Math.exp(-h * (dashing ? 14 : 5)));

    return { weapon, camera, fov: this.fov, pump, neutral: free };
  }
}
