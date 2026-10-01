export const GAME = Object.freeze({
  maxHealth: 100,
  // a sword blow lands for between these: the cleanest for the most, a genuinely glancing one for the least (four
  // clean hits fell a full-health Spellblade; a spell can stand in for one)
  swordDamage: 30,
  swordGlance: 19,
  // a sword blow struck at the elevated level (DAMAGE_LEVELS): above the ordinary curve altogether (Sunder All That
  // Rusts strikes at it; three such blows fell a full-health Spellblade, which no three ordinary ones can)
  swordElevated: 34,
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

// Sword contact. A strike is live for a short stretch around its contact, its blade sweeping through the strike's arc
// in the attacker's view (the first two strikes across, the third straight down; shared/src/blade.mjs has the blade
// itself). The first knight the blade passes through takes the blow, unless something solid stops the blade first.
// How cleanly it lands is one thing: how far off the attacker's aim the knight was as the blade met them (blade.mjs,
// AIM_QUALITY): 1 dead centre, 0 clipped by the edge of the swing; a legal hit always lands (swordDamageFor: between
// GAME.swordGlance and GAME.swordDamage). No moment of the swing is sweeter than another.
// How hard two knights meet (their closing speed) is separate: it adds to the physical impact (knockback, pressure
// on a guard, the stagger of a broken one), never to the damage. Current tuning; the server resolves it
// (shared/sim/combat.mjs) and the first-person sweep is timed from the same window.
export const MELEE_CONTACT = Object.freeze({
  // the blade's whole swing around its contact (seconds before, after): how it moves (blade.mjs bladeDirection)
  window: Object.freeze({ early: 0.09, late: 0.11 }),
  // of that, only the driven part can land. A knight is met until `follow` seconds past the contact (the blade about
  // thirty degrees beyond the aim); the world stops the blade only up to the contact (`worldFollow` past it: one step
  // of the sweep). After that the sword is only swinging through, leaning away to the side: it lands on nothing and
  // rings off nothing. (A Sundering slam is driven all the way down: its whole swing is live.)
  follow: 0.045,
  worldFollow: 0.012,
  // which way each strike's blade crosses the arc: +1 from its right to its left, -1 left to right, 0 top to bottom
  sweep: Object.freeze([1, -1, 0]),
  // closing speed (m/s) that counts as a full-tilt collision, and what it adds at full tilt
  closingFull: 8,
  impactKnockback: 0.6,
  impactGuard: 0.3,
  impactBreakStagger: 0.3,
});

/** How hard two bodies met: 0 (standing, or parting) to 1 (a full-tilt collision), from their closing speed. */
export function closingImpact(closingSpeed, contact = MELEE_CONTACT) {
  return Math.max(0, Math.min(1, (Number(closingSpeed) || 0) / contact.closingFull));
}

/** The damage a sword hit of this quality does: a glancing one the least, the cleanest the most. */
export function swordDamageFor(quality) {
  const q = Math.max(0, Math.min(1, Number.isFinite(quality) ? quality : 1));
  return Math.round(GAME.swordGlance + (GAME.swordDamage - GAME.swordGlance) * q);
}

// The level a blow is struck at, apart from how cleanly it was caught: `normal` follows the contact-quality curve
// (swordDamageFor); `elevated` stands above that curve altogether (GAME.swordElevated), whatever the contact. Nothing
// random decides it: something grants it (today, only Sunder All That Rusts).
export const DAMAGE_LEVELS = Object.freeze({ normal: 'normal', elevated: 'elevated' });

/** A sword blow's damage: by its contact quality at the normal level; the elevated level's own. */
export function swordDamage({ quality, level = DAMAGE_LEVELS.normal }) {
  return level === DAMAGE_LEVELS.elevated ? GAME.swordElevated : swordDamageFor(quality);
}

// A blow's physical force, apart from its damage: how cleanly it caught (quality, 0..1) and how hard the two were
// closing (impact, closingImpact: 0..1). The shove, the weight on a guard and the stagger all come from it.
export const MAX_FORCE = Object.freeze({ quality: 1, impact: 1 });

/** How forceful a sword blow was, 0..1: a glancing touch at a standstill a fifth, a clean blow at full tilt all of it. */
export function swordForce({ quality = 1, impact = 0 } = {}) {
  const q = Math.max(0, Math.min(1, quality));
  const i = Math.max(0, Math.min(1, impact));
  return 0.2 + 0.4 * q + 0.4 * i;
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

/**
 * A sword blow on a guard. pressure: how hard it bears on the guard (1 a clean blow at a standstill; a glancing blow
 * less, a full-tilt collision more): it scales what the block costs. impacts: how many blows' worth it lands as (one;
 * a Sundering blow two): the guard pays for each, and it is still one blow.
 */
export function resolveSwordVsGuard({ guarding, guardAgeMs, stamina, profile = GUARD_PROFILES.spellblade, pressure = 1, impacts = 1 }) {
  if (!guarding) return { kind: 'hit', staminaAfter: stamina };
  if (guardAgeMs <= GAME.parryWindowMs) return { kind: 'parry', staminaAfter: stamina };
  const staminaAfter = Math.max(0, stamina - guardBlockCost(profile) * Math.max(0, pressure) * Math.max(1, impacts));
  return { kind: staminaAfter <= 1e-9 ? 'guardBreak' : 'block', staminaAfter };
}

export function isCooldownReady(nowSec, readyAtSec) {
  return nowSec >= readyAtSec;
}
