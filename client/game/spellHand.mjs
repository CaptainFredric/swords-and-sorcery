// The spell hand's fingers: the gauntlet's finger_<index|middle|ring|little>_<1|2|3>.L and thumb_<1|2|3>.L bones
// (tools/blender/characters/spellblade/rodin/hands.py). At rest they keep the modelled cup; `open` (0..1) spreads them
// flat to throw a spell, `fist` (0..1) closes them: a clench, a sprint or dash, the magic hand on the sword's lower
// grip. Each lame curls about its own x axis, and a positive turn closes the hand. A model without the bones simply
// ignores the turns.
export const SPELL_HAND = Object.freeze({
  // radians at each joint, knuckle first (the cup is 0.22, 0.3 and 0.24 at rest: open lays the fingers nearly flat)
  open: Object.freeze({ finger: [-0.24, -0.28, -0.2], thumb: [-0.2, -0.26, -0.18] }),
  fist: Object.freeze({ finger: [1.2, 1.3, 0.95], thumb: [0.45, 0.65, 0.55] }),
  fingers: Object.freeze(['index', 'middle', 'ring', 'little']),
  // how fast the hand follows what it is asked (per second, as an exponential approach)
  rate: 14,
});

const clamp01 = (v) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));

/** Local rotations for a hand `open` and `fist` (each 0..1; a fist wins where both are asked). */
export function spellHandTurns({ open = 0, fist = 0 } = {}) {
  const closed = clamp01(fist);
  const spread = clamp01(open) * (1 - closed);
  if (closed + spread < 1e-3) return [];
  const turns = [];
  const joint = (bone, kind, k) => turns.push({
    bone, axis: [1, 0, 0], space: 'local', angle: SPELL_HAND.open[kind][k] * spread + SPELL_HAND.fist[kind][k] * closed,
  });
  for (const finger of SPELL_HAND.fingers) for (let k = 0; k < 3; k += 1) joint(`finger_${finger}_${k + 1}.L`, 'finger', k);
  for (let k = 0; k < 3; k += 1) joint(`thumb_${k + 1}.L`, 'thumb', k);
  return turns;
}

/** One step of a hand easing toward where it is asked to be: { open, fist } from { open, fist }. */
export function easeSpellHand(current, target, dt) {
  const k = 1 - Math.exp(-SPELL_HAND.rate * Math.max(0, Number.isFinite(dt) ? dt : 0));
  const at = current ?? { open: 0, fist: 0 };
  return {
    open: at.open + (clamp01(target.open) - at.open) * k,
    fist: at.fist + (clamp01(target.fist) - at.fist) * k,
  };
}
