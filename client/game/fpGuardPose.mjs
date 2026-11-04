// The first-person Guard (an ordinary, held Guard: not a strike's own guarded technique, which fpGuardedSlash.mjs
// stages). The sword hand stays low on the right; the blade is raised across the body, inward and down, its forward
// cutting length lying just above the magic hand, which is up in front on the left, open and ready. Clearly a guard,
// but below the crosshair and the torso of whoever stands in front: the view stays the player's.
//
// Targets for the arm solver (swordArmIK.mjs) in the first-person rig's root space (x right, y up, -z ahead), placed
// from measurements of the production rig through the game's own camera: at 4:3 the blade's point sits at about
// (-0.43, -0.01) on screen, clear above the magic hand at (-0.52, -0.59), the sword hand at (0.42, -0.61), and the
// blade crosses the middle of the view well below the crosshair (client/game/fpGuardPose.test.mjs keeps those rules). The hand's wrist is placed and the blade aimed; the elbow and shoulder follow, so the
// hand never holds the sword at an angle it could not.
const DEG = Math.PI / 180;
// a direction by its turn to the left of straight ahead and its rise, in degrees
function dir(yaw, pitch) {
  const c = Math.cos(pitch * DEG);
  return [-Math.sin(yaw * DEG) * c, Math.sin(pitch * DEG), -Math.cos(yaw * DEG) * c];
}

export const FP_GUARD = {
  // the sword arm: the wrist low and a little in from rest; the blade up to the left across the body and out ahead
  arm: { wrist: [0.27, -0.3, -0.6], blade: dir(48, 20), edge: [0.05, 0.62, -0.78] },
  // the magic arm: raised in front on the left, fingers up and a little in, the palm out toward the threat
  off: { wrist: [-0.34, -0.29, -0.6], aim: [0.25, 0.85, -0.45], roll: [0.18, -0.3, -0.94] },
  // held: a slow breath (seconds per breath) and how far it carries the hands (metres) and the blade (degrees)
  breath: { period: 3.4, rise: 0.006, tilt: 0.8 },
};

/** The guard's targets at `timeSec` (the breath under them); `tension` 0..1 adds a fraction of a brace to it. */
export function guardTargets(timeSec, tension = 1) {
  const b = Math.sin((2 * Math.PI * (Number.isFinite(timeSec) ? timeSec : 0)) / FP_GUARD.breath.period);
  const rise = FP_GUARD.breath.rise * b * tension;
  const { arm, off } = FP_GUARD;
  const tilt = FP_GUARD.breath.tilt * b * tension * DEG;
  const blade = [arm.blade[0], arm.blade[1] + tilt, arm.blade[2]];
  return {
    arm: { wrist: [arm.wrist[0], arm.wrist[1] + rise, arm.wrist[2]], blade, edge: arm.edge },
    off: { wrist: [off.wrist[0], off.wrist[1] + rise * 0.8, off.wrist[2]], aim: off.aim, roll: off.roll },
  };
}
