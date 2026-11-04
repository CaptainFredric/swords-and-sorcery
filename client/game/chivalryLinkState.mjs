// Mounted, terminal and recovery animation plans intentionally have no
// concurrent hand actions. Count only real flags without assuming an object.
export function chivalryActionOverlap(concurrent) {
  return Number(Boolean(concurrent?.attack)) +
    Number(Boolean(concurrent?.guard)) +
    Number(Boolean(concurrent?.cast)) +
    Number(Boolean(concurrent?.dash));
}
