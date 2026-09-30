// Sheathe in Steel, a loadout ability carried in the spell's place (chosen in the Armory), leaves its knight
// Sheathed in Steel: the armour hardens, and every damaging blow lands more like a glancing one.
//   a sword blow: its contact quality turned down toward a glancing touch (while fully hardened, every blow lands as
//                 the most glancing one does; as the steel wears, more and more of the blow's cleanness gets through);
//   a spell:      its exposure turned down (shared/src/spells.mjs), so a square hit lands like one at the edge of its
//                 blast, and whatever the exposure decides (a blast's damage, a burn's licks, a chill's bite) follows;
//   anything else that hurts (a gauntlet): blunted by the same share a clean sword blow loses.
//
// It follows one clock, which blows never wind forward: fully hardened for a while from the call, then wearing off
// evenly to nothing. The first blow taken while it is fully hardened holds it so a little longer (so an attacker who
// waits for the last moment of it does not find it already crumbling); later blows change nothing. It guards against
// the hurt only: knockback, stagger and a guard's stamina are untouched. Current tuning (provisional).
//
// Shared by the server (authority) and the client (the armour's sheen, the HUD's frame, the clang of a blow on it).

import { GAME } from './combat.mjs';

export const STEEL = Object.freeze({
  cooldownSec: 18,       // from one call to the next
  fullSec: 5,            // fully hardened, from the call
  holdSec: 2,            // the first blow taken while fully hardened keeps it so at least this long after that blow
  fadeSec: 5,            // then it wears off evenly to nothing
  qualityCut: 1,         // how much of a sword blow's cleanness full strength turns aside (all of it: a glancing blow)
  exposureCut: 0.62,     // how much of a spell's exposure full strength turns aside
  // how much of any other blow full strength turns aside: as much as a clean sword blow loses
  bluntCut: 1 - GAME.swordGlance / GAME.swordDamage,
});

/** The armour's strength at `nowSec` (0..1): full until its hold ends, then wearing off evenly. */
export function steelStrength(steel, nowSec) {
  if (!steel || !Number.isFinite(steel.fullUntil)) return 0;
  if (nowSec <= steel.fullUntil) return 1;
  return Math.max(0, 1 - (nowSec - steel.fullUntil) / STEEL.fadeSec);
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

/**
 * The armour after a blow lands on it at `nowSec`: the first blow taken while it is fully hardened holds it so for at
 * least STEEL.holdSec more; any other blow changes nothing (only the first ever counts).
 */
export function steelTakes(steel, nowSec) {
  if (!steel || steel.struck) return steel;
  const fullUntil = nowSec <= steel.fullUntil ? Math.max(steel.fullUntil, nowSec + STEEL.holdSec) : steel.fullUntil;
  return { ...steel, fullUntil, struck: true };
}

/** Freshly called: fully hardened from now. */
export function callSteel(nowSec) {
  return { calledAt: nowSec, fullUntil: nowSec + STEEL.fullSec, struck: false };
}
