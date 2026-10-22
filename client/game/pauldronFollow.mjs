// The supplied Spellblade's pauldrons ride bones of their own, each sharing its upper arm's rest and parent and turned
// part of the way with it (its build bakes the same into every clip): each plate moves whole, partly with the shoulder
// and partly with the arm. The animator sets them every frame as well, so they follow whatever else turns the arm (a
// flourish's reach, a reaction, a fall). An arm turned far from its rest (raised into a high guard, swung up overhead)
// takes its plate further, up to PAULDRON_RAISED_FOLLOW: at PAULDRON_FOLLOW the plate stayed on the shoulder while the
// arm left it, and tore the shoulder open between them.
export const PAULDRON_FOLLOW = 0.6;
export const PAULDRON_RAISED_FOLLOW = 0.95;
export const PAULDRON_RAISE = Object.freeze([55, 110]);   // (deg the arm turns from its rest: easing from one to the other)

/** How far a pauldron turns with its arm, for an arm turned `turn` degrees from its rest. */
export function pauldronFollow(turn) {
  const t = Math.max(0, Math.min(1, (turn - PAULDRON_RAISE[0]) / (PAULDRON_RAISE[1] - PAULDRON_RAISE[0])));
  return PAULDRON_FOLLOW + (PAULDRON_RAISED_FOLLOW - PAULDRON_FOLLOW) * t * t * (3 - 2 * t);
}
