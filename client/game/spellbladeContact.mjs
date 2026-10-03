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
