// Sheathe in Steel, a loadout ability carried in the spell's place (chosen in the Armory), leaves its knight
// Sheathed in Steel: the armour hardens, and every damaging blow lands more like a glancing one.
//   a sword blow: its contact quality turned down toward a glancing touch (a clean blow on fresh steel lands like a
//                 glancing one; as the steel wears, more and more of it gets through);
//   a spell:      its exposure turned down (shared/src/spells.mjs), so a square hit lands like one at the edge of its
//                 blast, and whatever the exposure decides (a blast's damage, a burn's licks, a chill's bite) follows;
//   anything else that hurts (a gauntlet): blunted by the same share a clean sword blow loses.
// The hardening is strongest the moment it is called and wears off evenly (never on or off); each blow it turns
// chips a little more off. It guards against the hurt only: knockback, stagger and a guard's stamina are untouched.
// Current tuning (provisional).
//
// Shared by the server (authority) and the client (the armour's sheen, the HUD's frame, the clang of a blow on it).

export const STEEL = Object.freeze({
  cooldownSec: 14,       // from one call to the next
  seconds: 7,            // from full strength to nothing, if nothing chips it
  qualityCut: 1,         // how much of a sword blow's cleanness full strength turns aside (all of it: a glancing blow)
  exposureCut: 0.62,     // how much of a spell's exposure full strength turns aside
  bluntCut: 1 / 3,       // how much of any other blow full strength turns aside (as a clean sword blow loses)
  spellChip: 0.3,        // strength lost per unit of exposure it turns aside
  swordChip: 0.1,        // strength lost to a clean sword blow (a glancing one, less)
});

/** The armour's strength at `nowSec` (0..1): what it had when last set, wearing off evenly since. */
export function steelStrength(steel, nowSec) {
  if (!steel || !Number.isFinite(steel.at) || !Number.isFinite(steel.base)) return 0;
  return Math.max(0, Math.min(1, steel.base - Math.max(0, nowSec - steel.at) / STEEL.seconds));
}

/** A sword blow's contact quality as the armour lets it through: { quality (felt), strength }. */
export function steelQuality(steel, quality, nowSec) {
  const strength = steelStrength(steel, nowSec);
  return { quality: quality * (1 - STEEL.qualityCut * strength), strength };
}

/** Any other blow's damage as the armour lets it through: { amount (felt), strength }. */
export function steelBlunt(steel, amount, nowSec) {
  const strength = steelStrength(steel, nowSec);
  return { amount: Math.round(amount * (1 - STEEL.bluntCut * strength)), strength };
}

/** A spell's exposure as the armour lets it through: { exposure (felt), turned (what it turned aside), strength }. */
export function steelExposure(steel, exposure, nowSec) {
  const strength = steelStrength(steel, nowSec);
  const felt = exposure * (1 - STEEL.exposureCut * strength);
  return { exposure: felt, turned: exposure - felt, strength };
}

/** The armour after losing `amount` of its strength at `nowSec` (null once nothing is left). */
export function chipSteel(steel, amount, nowSec) {
  const left = steelStrength(steel, nowSec) - Math.max(0, amount);
  return left > 1e-3 ? { at: nowSec, base: left, calledAt: steel.calledAt } : null;
}

/** Freshly called: full strength from now. */
export function callSteel(nowSec) {
  return { at: nowSec, base: 1, calledAt: nowSec };
}
