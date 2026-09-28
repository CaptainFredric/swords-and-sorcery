// The first-person cast, as a gesture of the magic arm: the palm is drawn in close while the spell gathers (the
// server holds the spell for its gather time), then thrust out toward the crosshair as it flies, then back to rest.
// Pure: the elapsed time in, how far into the draw and the thrust the arm is.

export const CAST_GESTURE = Object.freeze({
  releaseSec: 0.12,
  recoverSec: 0.33,
  // local bone turns (radians) at a full draw and a full thrust, found by eye on the first-person rig
  draw: Object.freeze([
    { bone: 'upper_arm.L', axis: [0, 0, 1], angle: -0.3 },
    { bone: 'upper_arm.L', axis: [1, 0, 0], angle: -0.08 },
    { bone: 'forearm.L', axis: [1, 0, 0], angle: 0.75 },
    // the wrist cocks back, cupping the gathering spell
    { bone: 'hand.L', axis: [1, 0, 0], angle: -0.3 },
  ]),
  thrust: Object.freeze([
    { bone: 'upper_arm.L', axis: [0, 0, 1], angle: -0.18 },
    { bone: 'upper_arm.L', axis: [1, 0, 0], angle: 0.3 },
    { bone: 'forearm.L', axis: [1, 0, 0], angle: -0.2 },
  ]),
});

/**
 * Where the gesture is `elapsed` seconds after the cast began: draw 0..1 (eased in over the gather), thrust 0..1
 * (a snap out at the release, easing back over the recovery), done once it is over.
 */
export function castGesture(elapsed, gatherSec = 0.3) {
  if (!(elapsed >= 0)) return { draw: 0, thrust: 0, done: true };
  if (elapsed < gatherSec) {
    const t = elapsed / gatherSec;
    return { draw: 1 - (1 - t) * (1 - t), thrust: 0, done: false };
  }
  const released = elapsed - gatherSec;
  if (released < CAST_GESTURE.releaseSec) {
    const t = released / CAST_GESTURE.releaseSec;
    // the draw lets go as the arm snaps out (there is none to let go of when the spell had no gather)
    return { draw: gatherSec > 0 ? 1 - t : 0, thrust: Math.sin((t * Math.PI) / 2), done: false };
  }
  const recovering = released - CAST_GESTURE.releaseSec;
  if (recovering < CAST_GESTURE.recoverSec) {
    const t = recovering / CAST_GESTURE.recoverSec;
    return { draw: 0, thrust: (1 - t) * (1 - t), done: false };
  }
  return { draw: 0, thrust: 0, done: true };
}

/** The bone turns for a gesture state (added to the arm's pose as local rotations). */
export function castGestureRotations({ draw, thrust }) {
  const rotations = [];
  if (draw > 1e-4) for (const turn of CAST_GESTURE.draw) rotations.push({ ...turn, angle: turn.angle * draw, space: 'local' });
  if (thrust > 1e-4) for (const turn of CAST_GESTURE.thrust) rotations.push({ ...turn, angle: turn.angle * thrust, space: 'local' });
  return rotations;
}
