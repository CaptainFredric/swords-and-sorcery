// Secondary cloth motion for the Spellblade's front tabard and back banner.
// Pure spring math (no three.js) so it runs in node tests; SpellbladeClothRig applies it to bones.
//
// Angles are in radians, in the character's own frame:
//   swing > 0 moves a hanging tip backward (against the facing), swing < 0 forward;
//   side  > 0 moves the tip to the character's right.
// Each chain relaxes toward the animated pose (angle 0) and reacts to the anchor's motion:
// air drag trails the cloth behind the velocity, and like a pendulum of the given length it lags
// on acceleration (angular kick = acceleration / length).

export const CLOTH_CHAINS = Object.freeze({
  back: Object.freeze({
    bones: Object.freeze(['tabard_back_01', 'tabard_back_02']),
    share: Object.freeze([0.55, 0.65]),
    swingLimits: Object.freeze([-0.1, 0.75]),
    sideLimit: 0.32,
    drag: 0.055,
    length: 0.55,
    stiffness: 34,
    damping: 6.5,
  }),
  front: Object.freeze({
    bones: Object.freeze(['tabard_front_01', 'tabard_front_02']),
    share: Object.freeze([0.55, 0.65]),
    // backward would push into the legs, so the front hangs forward freely but barely back
    swingLimits: Object.freeze([-0.6, 0.06]),
    sideLimit: 0.28,
    drag: 0.04,
    length: 0.45,
    stiffness: 40,
    damping: 7.5,
  }),
});

const MAX_SUBSTEP = 1 / 120;
const MAX_ACCEL = 60;
const TELEPORT_DISTANCE = 3;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function createClothState() {
  const chains = {};
  for (const name of Object.keys(CLOTH_CHAINS)) chains[name] = { swing: 0, swingVel: 0, side: 0, sideVel: 0 };
  return { chains, velocity: null, accel: { forward: 0, right: 0 }, primed: false };
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
 * @param {{forward:number,right:number}} velocity anchor velocity in the character frame (m/s)
 */
export function stepCloth(state, dt, velocity) {
  if (!(dt > 0) || !velocity || !Number.isFinite(velocity.forward) || !Number.isFinite(velocity.right)) return state;
  const step = Math.min(dt, 0.1);
  if (!state.primed || !state.velocity) {
    state.velocity = { forward: velocity.forward, right: velocity.right };
    state.primed = true;
    return state;
  }
  // smoothed acceleration: network interpolation is not perfectly smooth
  const blend = 1 - Math.exp(-step * 25);
  const rawForward = clamp((velocity.forward - state.velocity.forward) / step, -MAX_ACCEL, MAX_ACCEL);
  const rawRight = clamp((velocity.right - state.velocity.right) / step, -MAX_ACCEL, MAX_ACCEL);
  state.accel.forward += (rawForward - state.accel.forward) * blend;
  state.accel.right += (rawRight - state.accel.right) * blend;
  state.velocity = { forward: velocity.forward, right: velocity.right };

  for (const [name, spec] of Object.entries(CLOTH_CHAINS)) {
    const chain = state.chains[name];
    const swingTarget = clamp(spec.drag * velocity.forward, spec.swingLimits[0], spec.swingLimits[1]);
    const sideTarget = clamp(-spec.drag * velocity.right, -spec.sideLimit, spec.sideLimit);
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
