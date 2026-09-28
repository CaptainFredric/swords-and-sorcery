// The spells a Spellblade can carry into a fight, one at a time (chosen in the Armory). Each is gathered in the palm
// for a moment, then thrown; they differ in what they leave behind.
//
//   Fireball: a wide blast, and whoever it catches keeps burning for a moment (the damage arrives in licks).
//   Frostfire: a quicker, tighter bolt that leaves its victim heavy with cold: slowest at once, thawing back to full
//   speed. The slow is a feeling rather than a rule to learn: strongest when it lands, visibly fading.
//
// Shared by the server (authority) and the client (prediction of your own chilled movement, the HUD, the effects).

export const SPELLS = Object.freeze({
  fireball: Object.freeze({
    id: 'fireball',
    label: 'Fireball',
    cooldownSec: 4,
    // the palm gathers the fire before it flies
    gatherSec: 0.3,
    speed: 24,
    // full force at the heart of the blast, less at its edge
    directDamage: 18,
    edgeDamage: 8,
    radius: 2.6,
    // then it keeps burning: this much more, in licks, over this long (a direct hit is 18 + 10)
    burn: Object.freeze({ damage: 10, seconds: 2.5, licks: 5 }),
  }),
  frostfire: Object.freeze({
    id: 'frostfire',
    label: 'Frostfire',
    cooldownSec: 4.5,
    gatherSec: 0.3,
    speed: 30,
    directDamage: 15,
    edgeDamage: 6,
    radius: 1.6,
    // the cold: this much of their speed taken at once, all of it back after this long
    chill: Object.freeze({ slow: 0.55, seconds: 3 }),
  }),
});

export const DEFAULT_SPELL = 'fireball';

export function spellFor(id) {
  return SPELLS[id] ?? SPELLS[DEFAULT_SPELL];
}

export function isSpell(id) {
  return Object.hasOwn(SPELLS, id);
}

/** The blast's damage at a distance from its heart (the direct victim takes directDamage). */
export function blastDamage(spell, distance) {
  if (distance > spell.radius) return 0;
  const t = Math.max(0, Math.min(1, distance / spell.radius));
  return Math.round(spell.directDamage + (spell.edgeDamage - spell.directDamage) * t);
}

/** How fast a chilled Spellblade can move now (1 = unhindered): the cold is worst when it lands, then thaws. */
export function chillScale(chill, nowSec) {
  if (!chill || !(nowSec < chill.until) || !(chill.until > chill.startedAt)) return 1;
  const left = (chill.until - nowSec) / (chill.until - chill.startedAt);
  return 1 - chill.slow * Math.max(0, Math.min(1, left));
}

/** A new chill takes over only if it leaves the body colder than the one it already carries. */
export function strongerChill(current, next, nowSec) {
  return chillScale(next, nowSec) < chillScale(current, nowSec) ? next : current;
}

/**
 * The burn a blast leaves: its total scales with how hard the blast hit (a glancing edge burns less), delivered in
 * equal licks. Returns null when there is nothing to burn.
 */
export function burnFrom(spell, blastAmount, attackerId, nowSec) {
  if (!spell.burn || !(blastAmount > 0)) return null;
  const total = spell.burn.damage * Math.min(1, blastAmount / spell.directDamage);
  const perLick = Math.max(1, Math.round(total / spell.burn.licks));
  const interval = spell.burn.seconds / spell.burn.licks;
  return { attackerId, perLick, licksLeft: spell.burn.licks, interval, nextAt: nowSec + interval, until: nowSec + spell.burn.seconds };
}
