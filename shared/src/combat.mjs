export const GAME = Object.freeze({
  maxHealth: 100,
  // four clean hits fell a full-health Spellblade (a spell can stand in for one)
  swordDamage: 28,
  swordRange: 2.75,
  // the guard's capacity and what a blow costs it are per kind of knight: GUARD_PROFILES below
  parryWindowMs: 180,
  parryStaggerMs: 450,
  guardBreakStaggerMs: 700,
  dashCooldownSec: 5,
});

// Current Spellblade chain timing (tuning, not doctrine): seconds from the chain's start to each strike's contact.
// The server's strike resolution and the first-person presentation both derive from these values.
export const SWORD_STRIKE_TIMES = Object.freeze([0.4, 1.1, 1.8]);

// How the chain is driven: a press starts one with its first strike committed; each later strike is committed at its
// `start` only if the button is still held then, or was pressed again during the strike before it. Letting go
// mid-swing lets that swing finish and commits no more; the chain ends where the next strike would have begun. After
// the last strike's contact, a held (or pressed again) button starts another chain `restart` seconds later. Server
// (shared/sim/combat.mjs) and first-person arms (client WeaponView) run the same rule, for mouse, touch and bots alike.
export const SWORD_CHAIN = Object.freeze({
  starts: Object.freeze([0, 0.72, 1.44]),
  restart: 0.28,
});

/**
 * What a chain does next, `elapsed` seconds in: { kind: 'land', strike } (a committed strike lands), { kind: 'commit',
 * strike } (the next strike's swing would begin: it is committed if wanted, or the chain ends), or null when nothing is
 * due. chain: { committed, landed } (how many strikes so far).
 */
export function nextChainStep({ committed, landed }, elapsed) {
  const contact = landed < committed ? SWORD_STRIKE_TIMES[landed] : Infinity;
  const begin = committed < SWORD_STRIKE_TIMES.length ? SWORD_CHAIN.starts[committed] : Infinity;
  const at = Math.min(contact, begin);
  if (!Number.isFinite(at) || elapsed + 1e-9 < at) return null;
  return contact <= begin ? { kind: 'land', strike: landed, at } : { kind: 'commit', strike: committed, at };
}

// Guard stamina, as data. Each kind of knight carries a guard of some capacity, and every sword blow it absorbs costs
// a share of it: a normal blow takes a little over a fifth of a full Spellblade's bar (the fifth breaks it). A future
// class with a heavier or lighter guard, or one that pays more or less per blow, is a new row here, not new guard logic.
export const GUARD_PROFILES = Object.freeze({
  spellblade: Object.freeze({ capacity: 100, blockShare: 0.22 }),
});

/** The guard profile for a kind of knight (the Spellblade's when there is no such kind). */
export function guardProfile(kind) {
  return GUARD_PROFILES[kind] ?? GUARD_PROFILES.spellblade;
}

/** What one absorbed sword blow costs a guard of this profile. */
export function guardBlockCost(profile = GUARD_PROFILES.spellblade) {
  return Math.round(profile.capacity * profile.blockShare * 100) / 100;
}

export function getSwordStrikeIndex(elapsedSec) {
  let result = -1;
  for (let i = 0; i < SWORD_STRIKE_TIMES.length; i += 1) {
    if (elapsedSec + 1e-9 >= SWORD_STRIKE_TIMES[i]) result = i;
  }
  return result;
}

export function resolveSwordVsGuard({ guarding, guardAgeMs, stamina, profile = GUARD_PROFILES.spellblade }) {
  if (!guarding) return { kind: 'hit', staminaAfter: stamina };
  if (guardAgeMs <= GAME.parryWindowMs) return { kind: 'parry', staminaAfter: stamina };
  const staminaAfter = Math.max(0, stamina - guardBlockCost(profile));
  return { kind: staminaAfter <= 1e-9 ? 'guardBreak' : 'block', staminaAfter };
}

export function isCooldownReady(nowSec, readyAtSec) {
  return nowSec >= readyAtSec;
}
