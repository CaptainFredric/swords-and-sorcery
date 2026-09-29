// Secondary cloth motion for the Spellblade's front tabard and back banner.
// Pure spring math (no three.js) so it runs in node tests; SpellbladeClothRig applies it to bones.
//
// Angles are in radians, in the character's own frame:
//   swing > 0 moves a hanging tip backward (against the facing), swing < 0 forward;
//   side  > 0 moves the tip to the character's right.
// Each chain relaxes toward the animated pose (angle 0) and reacts to the anchor's motion:
// air drag trails the cloth behind the velocity, and like a pendulum of the given length it lags
// on acceleration (angular kick = acceleration / length).
//
// It also answers the body turning and tilting (the cloth is not bolted to it):
//   hang: when the body leans, the cloth keeps hanging toward the ground instead of leaning with it;
//   tiltLag: while the body tips, the cloth trails the motion for a moment (seconds of lag per rad/s);
//   turnLag: a spinning body leaves the cloth swinging out behind the turn; flare: and flung outward.
//
// What moves it is the knight's motion, not every twitch of the animation: the velocity is the body's own travel,
// and the lean, the turning and the acceleration are smoothed (CLOTH_SMOOTHING) so a run's stride-by-stride sway
// and a breath's rise and fall do not set it flapping. At a steady pace it trails a little and hangs still; it swings
// when he speeds up, stops or turns, overshoots once and settles.

export const CLOTH_CHAINS = Object.freeze({
  back: Object.freeze({
    bones: Object.freeze(['tabard_back_01', 'tabard_back_02']),
    share: Object.freeze([0.55, 0.65]),
    swingLimits: Object.freeze([-0.1, 0.75]),
    sideLimit: 0.32,
    drag: 0.032,
    length: 0.42,
    stiffness: 26,
    damping: 5,
    hang: 0.85,
    tiltLag: 0.14,
    turnLag: 0.11,
    flare: 0.05,
  }),
  front: Object.freeze({
    bones: Object.freeze(['tabard_front_01', 'tabard_front_02']),
    share: Object.freeze([0.55, 0.65]),
    // backward would push into the legs, so the front hangs forward freely but barely back
    swingLimits: Object.freeze([-0.6, 0.06]),
    sideLimit: 0.28,
    drag: 0.022,
    length: 0.38,
    stiffness: 32,
    damping: 6,
    hang: 0.7,
    tiltLag: 0.1,
    // in front of the body, a turn swings it the other way, and the flare throws it forward
    turnLag: -0.08,
    flare: -0.035,
  }),
});

// how quickly the cloth takes in the body's motion (time constants, seconds): slow enough to ignore a stride's sway
export const CLOTH_SMOOTHING = Object.freeze({ lean: 0.22, turn: 0.08, accel: 0.085 });

const MAX_SUBSTEP = 1 / 120;
const MAX_ACCEL = 60;
const TELEPORT_DISTANCE = 3;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function finite(value) {
  return Number.isFinite(value) ? value : 0;
}

export function createClothState() {
  const chains = {};
  for (const name of Object.keys(CLOTH_CHAINS)) chains[name] = { swing: 0, swingVel: 0, side: 0, sideVel: 0 };
  return { chains, velocity: null, accel: { forward: 0, right: 0 }, lean: null, leanRate: { forward: 0, right: 0 }, turn: 0, primed: false };
}

function springAxis(angle, velocity, target, drive, spec, limits, dt) {
  let a = angle;
  let v = velocity;
  let remaining = dt;
  while (remaining > 1e-6) {
    const h = Math.min(MAX_SUBSTEP, remaining);
    const accel = spec.stiffness * (target - a) - spec.damping * v + drive;
    v += accel * h;
    a += v * h;
    if (a < limits[0]) { a = limits[0]; if (v < 0) v = 0; }
    if (a > limits[1]) { a = limits[1]; if (v > 0) v = 0; }
    remaining -= h;
  }
  return [a, v];
}

/**
 * Advance the cloth springs.
 * @param {ReturnType<typeof createClothState>} state
 * @param {number} dt seconds since the previous step
 * @param {{forward:number,right:number}} velocity the body's travel in its own frame (m/s)
 * @param {{turn?:number, tilt?:{forward:number,right:number}}} body
 *   turn: how fast the body turns (rad/s, + to its right); tilt: how far it leans from upright (rad, + forward and
 *   + to its right). Both are smoothed here, and how fast the lean changes is read from the smoothed lean.
 */
export function stepCloth(state, dt, velocity, { turn = 0, tilt = null } = {}) {
  if (!(dt > 0) || !velocity || !Number.isFinite(velocity.forward) || !Number.isFinite(velocity.right)) return state;
  const step = Math.min(dt, 0.1);
  const follow = (tau) => 1 - Math.exp(-step / tau);
  const leanNow = { forward: finite(tilt?.forward), right: finite(tilt?.right) };
  if (!state.primed || !state.velocity) {
    state.velocity = { forward: velocity.forward, right: velocity.right };
    state.lean = leanNow;
    state.primed = true;
    return state;
  }
  // smoothed acceleration: the body's travel is not perfectly smooth (network interpolation, a stride's surge)
  const blend = follow(CLOTH_SMOOTHING.accel);
  const rawForward = clamp((velocity.forward - state.velocity.forward) / step, -MAX_ACCEL, MAX_ACCEL);
  const rawRight = clamp((velocity.right - state.velocity.right) / step, -MAX_ACCEL, MAX_ACCEL);
  state.accel.forward += (rawForward - state.accel.forward) * blend;
  state.accel.right += (rawRight - state.accel.right) * blend;
  state.velocity = { forward: velocity.forward, right: velocity.right };

  // the lean and the turning, smoothed: a stride's sway and a breath do not reach the cloth, a lean into a sprint does
  const before = state.lean ?? leanNow;
  const lean = {
    forward: before.forward + (leanNow.forward - before.forward) * follow(CLOTH_SMOOTHING.lean),
    right: before.right + (leanNow.right - before.right) * follow(CLOTH_SMOOTHING.lean),
  };
  state.lean = lean;
  const tipping = {
    forward: clamp((lean.forward - before.forward) / step, -8, 8),
    right: clamp((lean.right - before.right) / step, -8, 8),
  };
  state.turn += ((Number.isFinite(turn) ? clamp(turn, -12, 12) : 0) - state.turn) * follow(CLOTH_SMOOTHING.turn);
  const spin = state.turn;
  for (const [name, spec] of Object.entries(CLOTH_CHAINS)) {
    const chain = state.chains[name];
    // leaning forward (or tipping forward) leaves the hanging cloth forward of where the body carries it: swing < 0
    const swing = spec.drag * velocity.forward
      - (spec.hang ?? 0) * lean.forward
      + (spec.tiltLag ?? 0) * tipping.forward
      + (spec.flare ?? 0) * spin * spin;
    const side = -spec.drag * velocity.right
      + (spec.hang ?? 0) * lean.right
      - (spec.tiltLag ?? 0) * tipping.right
      + (spec.turnLag ?? 0) * spin;
    const swingTarget = clamp(swing, spec.swingLimits[0], spec.swingLimits[1]);
    const sideTarget = clamp(side, -spec.sideLimit, spec.sideLimit);
    [chain.swing, chain.swingVel] = springAxis(
      chain.swing, chain.swingVel, swingTarget, state.accel.forward / spec.length, spec, spec.swingLimits, step,
    );
    [chain.side, chain.sideVel] = springAxis(
      chain.side, chain.sideVel, sideTarget, -state.accel.right / spec.length, spec, [-spec.sideLimit, spec.sideLimit], step,
    );
  }
  return state;
}

/** Forget motion history (spawn, teleport, respawn) so the cloth does not whip. */
export function resetCloth(state) {
  const fresh = createClothState();
  state.chains = fresh.chains;
  state.velocity = null;
  state.accel = fresh.accel;
  state.lean = null;
  state.leanRate = fresh.leanRate;
  state.turn = 0;
  state.primed = false;
  return state;
}

export function isTeleport(previous, next) {
  if (!previous || !next) return false;
  const dx = next.x - previous.x;
  const dy = next.y - previous.y;
  const dz = next.z - previous.z;
  return dx * dx + dy * dy + dz * dz > TELEPORT_DISTANCE * TELEPORT_DISTANCE;
}
