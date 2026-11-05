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

// Each elbow's, knee's and ankle's cop (the model's elbow, knee and ankle bones, tools/blender/characters/spellblade/
// rodin/rigid.py and segments.py): its limb's rest on its parent, turned half as far as the limb, carrying the couter or
// poleyn plate between the plates either side and the padding under the cuts between them, and at the ankle the boot's
// strapped cuff between the sabaton and the greave. (A model without them has none: each is looked up by name.)
export const COP_SHARE = 0.5;
export const COPS = Object.freeze([
  ['elbowL', 'forearmL'], ['elbowR', 'forearmR'], ['kneeL', 'shinL'], ['kneeR', 'shinR'], ['ankleL', 'footL'], ['ankleR', 'footR'],
].map(Object.freeze));
