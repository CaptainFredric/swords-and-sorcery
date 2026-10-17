// Vertical compensation for a grounded pose, measured from both actual boot soles.
// Each measurement belongs to the whole pose: the support foot can change during a stride.
export function soleContactOffset(before, after) {
  if (!before?.length || !after?.length || !before.every(Number.isFinite) || !after.every(Number.isFinite)) return 0;
  return Math.min(...before) - Math.min(...after);
}

// glTF splits the boot into material primitives; three.js strips punctuation in node names.
export function bootSide(name) {
  return /^Boot[._]?([LR])(?:_\d+)?$/.exec(name)?.[1] ?? null;
}


// Conservative bone-centre clearance for poses that put a body on the ground. These are not collision volumes;
// they are just enough to keep rigid armour around the sampled joints from visibly cutting through a flat floor.
export const BODY_GROUND_CLEARANCE = Object.freeze({
  pelvis: 0.14,
  chest: 0.18,
  head: 0.14,
  'thigh.L': 0.1,
  'thigh.R': 0.1,
  'shin.L': 0.08,
  'shin.R': 0.08,
  'foot.L': 0.06,
  'foot.R': 0.06,
  'upper_arm.L': 0.08,
  'upper_arm.R': 0.08,
  'forearm.L': 0.07,
  'forearm.R': 0.07,
  'hand.L': 0.06,
  'hand.R': 0.06,
});

/** Upward correction needed to keep every sampled grounded body point at or above its authored clearance. */
export function bodyGroundLift(samples, clearance = BODY_GROUND_CLEARANCE) {
  let lift = 0;
  for (const [name, minimum] of Object.entries(clearance ?? {})) {
    const y = samples?.[name];
    if (Number.isFinite(y) && Number.isFinite(minimum)) lift = Math.max(lift, minimum - y);
  }
  return Math.max(0, lift);
}
