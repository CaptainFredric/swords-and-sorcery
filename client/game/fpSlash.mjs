// The first-person sword combo, drawn by where the hand goes and which way the blade points: a cut from high right
// across to low left, a backhand from high left across to low right, then the blade raised overhead and brought
// straight down through the middle (the two cuts and the chop cross). swordArmIK.mjs turns these into an arm.
// Pure: the strike and how far into it, in; the arm target and how strongly to hold it, out.
//
// View space: +x right, +y up, -z ahead (the camera looks down -z). Each strike follows the combo's phases
// (weaponPose.mjs): wind up over the first 22%, cut until 62%, recover after.

const key = (at, wrist, blade, edge, shoulder = [0, 0, 0]) => Object.freeze({ at, wrist, blade, edge, shoulder });

export const SLASHES = Object.freeze([
  // 1: from high on the right, across and down to the left (the blade turns across the view like a clock hand)
  Object.freeze([
    key(0.22, [0.34, -0.14, -0.56], [0.5, 0.85, -0.1], [-0.7, -0.7, 0], [0.03, 0.04, 0.03]),
    key(0.42, [0.16, -0.22, -0.6], [-0.25, 0.9, -0.35], [-1, -0.3, 0], [-0.05, 0.02, -0.04]),
    key(0.62, [0.06, -0.28, -0.6], [-0.9, -0.12, -0.4], [-0.2, -1, 0], [-0.1, 0, -0.07]),
  ]),
  // 2: back the other way, from high on the left down to the right
  Object.freeze([
    key(0.22, [0.04, -0.14, -0.52], [-0.6, 0.75, 0], [0.7, -0.7, 0], [-0.1, 0.04, -0.05]),
    key(0.42, [0.22, -0.2, -0.6], [0.2, 0.9, -0.35], [1, -0.3, 0], [-0.02, 0.02, -0.03]),
    key(0.62, [0.28, -0.3, -0.6], [0.9, -0.1, -0.45], [0.2, -1, 0], [0.04, 0, 0.02]),
  ]),
  // 3: raised high, then brought down through the middle to finish low and a little left (crossing the first two)
  Object.freeze([
    key(0.22, [0.26, -0.06, -0.58], [0.15, 0.9, 0.4], [-0.6, -0.8, 0], [-0.03, 0.12, -0.04]),
    key(0.4, [0.2, -0.14, -0.64], [0.02, 0.9, -0.4], [-0.5, -0.9, 0], [-0.05, 0.04, -0.05]),
    key(0.62, [0.14, -0.3, -0.6], [-0.35, -0.7, -0.62], [-0.3, -1, 0], [-0.06, -0.03, -0.08]),
  ]),
]);

// the magic arm drops and draws aside while the sword works, so the follow-through is not hidden behind it
export const OFF_HAND_CLEAR = Object.freeze([
  { bone: 'upper_arm.L', axis: [1, 0, 0], angle: -0.28 },
  { bone: 'upper_arm.L', axis: [0, 1, 0], angle: -0.18 },
]);

const smooth = (t) => t * t * (3 - 2 * t);
// the cut: gathers for a moment, whips through the middle, and is checked at the end (the keys only space it)
const cut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2);

function mixVec(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function mixKeys(a, b, t) {
  return {
    wrist: mixVec(a.wrist, b.wrist, t),
    blade: mixVec(a.blade, b.blade, t),
    edge: mixVec(a.edge, b.edge, t),
    shoulder: mixVec(a.shoulder, b.shoulder, t),
  };
}

/**
 * The sword arm `local` (0..1) of the way through combo strike `index` (0, 1, 2): { wrist, blade, edge, shoulder,
 * weight } — weight rises from the resting arm into the windup and falls back to it in the recovery.
 */
export function slashPose(index, local) {
  const keys = SLASHES[index];
  if (!keys || !Number.isFinite(local)) return null;
  const t = Math.max(0, Math.min(1, local));
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (t <= first.at) return { ...mixKeys(first, first, 0), weight: smooth(t / first.at) };
  if (t >= last.at) return { ...mixKeys(last, last, 0), weight: 1 - smooth((t - last.at) / (1 - last.at)) };
  const at = first.at + cut((t - first.at) / (last.at - first.at)) * (last.at - first.at);
  for (let i = 0; i < keys.length - 1; i += 1) {
    const a = keys[i];
    const b = keys[i + 1];
    if (at <= b.at) return { ...mixKeys(a, b, (at - a.at) / (b.at - a.at)), weight: 1 };
  }
  return { ...mixKeys(last, last, 0), weight: 1 };
}
