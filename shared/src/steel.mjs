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

export const STEEL_DAMAGE_RANGES = Object.freeze({
  sword: Object.freeze({ min: GAME.swordGlance, max: GAME.swordDamage }), // 19 - 30
  gauntlet: Object.freeze({ min: 6, max: 9 }),                            // 6 - 9
  ram: Object.freeze({ min: 6, max: 12 }),                                // 6 - 12
  fireball: Object.freeze({ min: 13, max: 18 }),                          // 13 - 18
  frostfire: Object.freeze({ min: 11, max: 16 }),                         // 11 - 16
  gale: Object.freeze({ min: 1, max: 8 }),                                // 1 - 8
  burn: Object.freeze({ min: 1, max: 2 }),                                // 1 - 2 per lick
  vortex: Object.freeze({ min: 20, max: 30 }),                            // 20 - 30
  rupture: Object.freeze({ min: 5, max: 12 }),                            // 5 - 12
  'bibye-conditioning': Object.freeze({ min: 12, max: 18 }),              // 12 - 18
  'bibye-siege': Object.freeze({ min: 55, max: 85 }),                     // 55 - 85
  'bibye-shockwave': Object.freeze({ min: 10, max: 35 }),                 // 10 - 35
});

export const STEEL = Object.freeze({
  cooldownSec: 18,       // from one call to the next
  fullSec: 5,            // fully hardened, from the call
  holdSec: 2,            // the first blow taken while fully hardened keeps it so at least this long after that blow
  fadeSec: 5,            // then it wears off evenly to nothing
  qualityCut: 1,         // how much of a sword blow's cleanness full strength turns aside (all of it: a glancing blow)
  edgeExposure: 0.001,   // a real blast contact still lands at the edge; zero exposure stays zero
  // how much of any other blow full strength turns aside: as much as a clean sword blow loses
  bluntCut: 1 - GAME.swordGlance / GAME.swordDamage,
});

/** The armour's strength at `nowSec` (0..1): full until its hold ends, then wearing off evenly. */
export function steelStrength(steel, nowSec) {
  if (!steel || !Number.isFinite(steel.fullUntil)) return 0;
  if (nowSec <= steel.fullUntil) return 1;
  return Math.max(0, 1 - (nowSec - steel.fullUntil) / STEEL.fadeSec);
}

/**
 * Universal Sheathe in Steel mitigation logic.
 * Reduces the health damage of a valid damaging contact to the MINIMUM of that source's
 * legitimate damage range, proportional to the armour's remaining strength as it fades.
 */
export function steelMitigate(steel, rawDamage, source, nowSec, explicitMin = null) {
  if (!steel || !(rawDamage > 0)) {
    return { amount: rawDamage, turned: 0, strength: 0 };
  }
  const strength = steelStrength(steel, nowSec);
  if (strength <= 0.005) {
    return { amount: rawDamage, turned: 0, strength: 0 };
  }
  const range = STEEL_DAMAGE_RANGES[source];
  let min = explicitMin;
  let max = range ? range.max : rawDamage;
  if (min === null || min === undefined) {
    min = range ? range.min : Math.round(rawDamage * (GAME.swordGlance / GAME.swordDamage));
  }
  min = Math.min(rawDamage, min);
  const maxReduction = Math.max(0, (max - min) * strength);
  const reduction = Math.min(Math.max(0, (rawDamage - min) * strength), maxReduction);
  const felt = Math.max(0, Math.round(rawDamage - reduction));
  const turned = Math.max(0, rawDamage - felt);
  return { amount: felt, turned, strength };
}

/** A sword blow's contact quality as the armour lets it through: { quality (felt), strength }. */
export function steelQuality(steel, quality, nowSec) {
  const strength = steelStrength(steel, nowSec);
  return { quality: quality * (1 - STEEL.qualityCut * strength), strength };
}

/** Any other blow's damage as the armour lets it through: { amount (felt), strength, turned }. */
export function steelBlunt(steel, amount, nowSec, source = null) {
  const mit = steelMitigate(steel, amount, source, nowSec);
  return { amount: mit.amount, turned: mit.turned, strength: mit.strength };
}

/** A spell's exposure as the armour lets it through: { exposure (felt), turned (what it turned aside), strength }. */
export function steelExposure(steel, exposure, nowSec) {
  const strength = steelStrength(steel, nowSec);
  const minimum = Math.min(Math.max(0, exposure), STEEL.edgeExposure);
  const felt = minimum * strength + exposure * (1 - strength);
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
