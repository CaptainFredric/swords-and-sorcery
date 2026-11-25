// The knight's forearm has no twist bone: a hand's roll about the forearm (pronation, supination) lands on the wrist,
// and the skin there takes it. The supplied clips roll the sword hand 53 degrees from the bind pose in Idle, 70 in the
// Guard and 96 in the heavy cut, and a cast rolls the spell hand 118; Spells & Chivalry's guard twists the forearm 112
// against the elbow the other way. The skin was weighted in the bind pose, so at those joints it wrings like a cloth:
// the bracer narrowed and drawn out, the wrist and the elbow collapsed into shards. A real arm rolls along the forearm,
// the radius crossing the ulna.
//
// So after the pose, the arm's whole roll from the elbow to the hand (the forearm's own about its line, and the hand's
// about the same line, each from its bind turn) is shared evenly between the two joints: the forearm takes what moves
// the hand's half onto it, and the hand is turned back by exactly as much. Where the hand, the grip and the sword are
// does not change. The elbow's cop then follows the forearm, its twist included (#followPauldrons). Shared evenly, a
// second pass in the same frame finds the joints even and changes nothing. The first-person arms do their own in their
// solver (swordArmIK alignForearmTwist).
//
// Plain quaternions ([x, y, z, w]) so it is tested without three.js.

// the hand's share of the arm's roll (the elbow keeps the rest)
export const WRIST_SHARE = 0.5;
export const WRIST_TWIST_ARMS = Object.freeze([
  Object.freeze({ forearm: 'forearmR', hand: 'handR' }),
  Object.freeze({ forearm: 'forearmL', hand: 'handL' }),
]);

const mul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const inv = (q) => [-q[0], -q[1], -q[2], q[3]];
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

// a turn's roll about the unit axis `a` (the twist of its swing-twist split), signed
function rollAbout(q, a) {
  return wrap(2 * Math.atan2(q[0] * a[0] + q[1] * a[1] + q[2] * a[2], q[3]));
}

/**
 * How far (rad) a hand turned `local` from its bind turn `rest` has rolled about the forearm; `axis`: the forearm's
 * line in the forearm's own frame (the hand's offset from it). Measured in the forearm's frame (hand * rest^-1).
 */
export function wristRoll(local, rest, axis) {
  return rollAbout(mul(local, inv(rest)), norm(axis));
}

/** How far (rad) a forearm turned `local` from its bind turn `rest` has rolled about its own line (rest^-1 * forearm). */
export function forearmRoll(local, rest, axis) {
  return rollAbout(mul(inv(rest), local), norm(axis));
}

/** A turn of `angle` about the unit `axis`. */
export function axisTurn(axis, angle) {
  const a = norm(axis), s = Math.sin(angle / 2);
  return [a[0] * s, a[1] * s, a[2] * s, Math.cos(angle / 2)];
}

/**
 * The forearm's and the hand's local turns with the arm's roll shared: the hand keeps `share` of the whole (the
 * forearm's roll and the hand's together), the forearm takes the rest. forearm' = forearm * T, hand' = T^-1 * hand, so
 * forearm' * hand' = forearm * hand (the hand, the grip and the sword stay exactly where they were).
 */
export function spreadWristRoll({ forearm, hand, forearmRest, handRest, axis }, share = WRIST_SHARE) {
  const ofHand = wristRoll(hand, handRest, axis);
  const whole = forearmRoll(forearm, forearmRest, axis) + ofHand;
  const roll = ofHand - whole * share;
  if (Math.abs(roll) < 1e-5) return { forearm, hand, roll: 0 };
  const turn = axisTurn(axis, roll);
  return { forearm: mul(forearm, turn), hand: mul(inv(turn), hand), roll };
}
