// Sheathe in Steel (the ability) leaves its knight Sheathed in Steel (the state): the armour hardens, so a spell that
// would have caught him square lands more like one that caught him at the edge of its blast. It does this one way
// only: it turns down the spell's exposure (shared/src/spells.mjs), and whatever the exposure decides (a blast's damage,
// a burn's licks, a chill's bite) follows of itself, for every spell there is and any added later.
//
// The hardening is strongest the moment it is called and wears off evenly; each spell it turns aside, and each sword
// blow it takes, chips a little more off. It guards the body only: knockback, stagger and a guard's stamina are
// untouched. How long it lasts and how soon it can be called again are separate things. Current tuning.
//
// Shared by the server (authority) and the client (the armour's sheen, the HUD).

export const STEEL = Object.freeze({
  cooldownSec: 14,       // from one call to the next
  seconds: 7,            // from full strength to nothing, if nothing chips it
  exposureCut: 0.62,     // how much of a spell's exposure full strength turns aside
  spellChip: 0.3,        // strength lost per unit of exposure it turns aside
  swordChip: 0.1,        // strength lost to a clean sword blow (a glancing one, less)
});

/** The armour's strength at `nowSec` (0..1): what it had when last set, wearing off evenly since. */
export function steelStrength(steel, nowSec) {
  if (!steel || !Number.isFinite(steel.at) || !Number.isFinite(steel.base)) return 0;
  return Math.max(0, Math.min(1, steel.base - Math.max(0, nowSec - steel.at) / STEEL.seconds));
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
