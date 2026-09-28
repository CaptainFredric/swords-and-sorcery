// The spells a Spellblade can carry into a fight, one at a time (chosen in the Armory). Each is gathered in the palm
// for a moment, then thrown; they differ in what they leave behind.
//
//   Fireball: a wide blast, and whoever it catches near its heart keeps burning for a moment (in licks).
//   Frostfire: a quicker, tighter bolt that leaves its victim heavy with cold: slowest at once, thawing back to full
//   speed. The slow is a feeling rather than a rule to learn: strongest when it lands, visibly fading.
//
// Every spell bursts: a blast with a reach (radius), full force at its heart easing off slightly toward its edge,
// measured to the nearest part of a body (a burst at someone's feet is a burst on them). Anything fiery carries a
// `burn`, which catches only near the heart and fades to nothing at `reach` (a fraction of the radius): no dice, the
// closer the fire, the longer it clings.
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
    // full force at the heart of the blast, a little less at its edge
    directDamage: 18,
    edgeDamage: 13,
    radius: 2.6,
    // then it keeps burning: this much more, in licks, over this long (a direct hit is 18 + 10); only within `reach`
    // of the radius does it catch, fewer licks the further out
    burn: Object.freeze({ damage: 10, seconds: 2.5, licks: 5, reach: 0.6 }),
  }),
  frostfire: Object.freeze({
    id: 'frostfire',
    label: 'Frostfire',
    cooldownSec: 4.5,
    gatherSec: 0.3,
    speed: 30,
    directDamage: 15,
    edgeDamage: 11,
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

// a Spellblade's body, for blasts: an upright column this wide from the feet to the crown
const BODY = Object.freeze({ radius: 0.4, low: 0.1, high: 1.75 });

/** How far a blast's heart is from the nearest part of a body standing at `position` (0 when it is inside it). */
export function blastDistance(point, position) {
  const y = Math.max(position.y + BODY.low, Math.min(position.y + BODY.high, point.y));
  return Math.max(0, Math.hypot(point.x - position.x, point.y - y, point.z - position.z) - BODY.radius);
}

/** The blast's damage at a distance from its heart: full at the heart, easing off a little toward the edge. */
export function blastDamage(spell, distance) {
  if (distance > spell.radius) return 0;
  const t = Math.max(0, Math.min(1, distance / spell.radius));
  return Math.round(spell.directDamage + (spell.edgeDamage - spell.directDamage) * t * t);
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
 * The burn a blast leaves on a body `distance` from its heart: every lick the same, but fewer of them the further
 * out, none past the burn's reach. Returns null when nothing catches.
 */
export function burnFrom(spell, distance, attackerId, nowSec) {
  if (!spell.burn || !(distance >= 0)) return null;
  const reach = spell.radius * (spell.burn.reach ?? 1);
  const closeness = Math.max(0, 1 - distance / reach);
  const licks = Math.round(spell.burn.licks * closeness);
  if (licks < 1) return null;
  const perLick = spell.burn.damage / spell.burn.licks;
  const interval = spell.burn.seconds / spell.burn.licks;
  return { attackerId, perLick, licksLeft: licks, interval, nextAt: nowSec + interval, until: nowSec + interval * licks };
}
