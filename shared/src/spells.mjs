// The spells a Spellblade can carry into a fight, one at a time (chosen in the Armory). Each is gathered in the palm
// for a moment, then thrown; they differ in what they leave behind.
//
//   Fireball: a wide blast, and whoever it catches near its heart keeps burning for a moment (in licks).
//   Frostfire: a quicker, tighter bolt that leaves its victim heavy with cold: slowest at once, thawing back to full
//   speed. The slow is a feeling rather than a rule to learn: strongest when it lands, visibly fading.
//
// Every spell bursts: a blast with a reach (radius), measured to the nearest part of a body (a burst at someone's feet
// is a burst on them). How directly it caught that body is its exposure (spellExposure): 1 at the heart, falling to 0
// at the edge. Everything a blast leaves follows from the exposure: its damage (full at the heart, easing off a little
// toward the edge), a fire's burn (it catches only near the heart, more licks the closer), a frost's chill (colder and
// longer the closer). No dice. Anything that hardens a body against spells (Sheathed in Steel, shared/src/steel.mjs)
// turns the exposure down, and all of those follow of themselves.
//
// Shared by the server (authority) and the client (prediction of your own chilled movement, the HUD, the effects).

import { POSTURES } from './body.mjs';

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
    // the cold, for a direct hit: this much of their speed taken at once, all of it back after this long; a body caught
    // further out is chilled less, and for less long (down to these shares at the very edge)
    chill: Object.freeze({ slow: 0.55, seconds: 3, edgeSlow: 0.4, edgeSeconds: 0.5 }),
  }),
  // A short, forceful cone of wind that moves bodies far more than it hurts them (shared/src/gale.mjs). A readable
  // breath is drawn in first, so it is no instant "get away from me". Its heart does a little damage and shoves
  // hardest; its pressure reaches wider and further and only shoves; both fade evenly with distance and angle.
  // Current, provisional tuning (the cooldown especially).
  gale: Object.freeze({
    id: 'gale',
    label: 'Gale Garner',
    kind: 'cone',
    cooldownSec: 7,
    gatherSec: 0.5,
    cone: Object.freeze({
      reach: 5.2,                // the heart of the gust, out to here and this wide...
      halfAngleDeg: 28,
      pressureReach: 8.5,        // ...and its pressure, further and wider (a shove, no damage)
      pressureHalfAngleDeg: 46,
      damage: 8,                 // at point blank in its heart
      push: 12.5,                // m/s: the shove at point blank
      lift: 0.28,                // a share of it lifting the body off its feet
      guarded: 0.35,             // a raised guard facing it keeps this much of the shove...
      guardCost: 12,             // ...and pays this much stamina for it at point blank
    }),
    // aimed into the ground (or a wall) close by, the gust throws its caster back off it
    recoil: Object.freeze({ reach: 3.2, push: 9.5, maxUp: 8 }),
  }),
});

export const DEFAULT_SPELL = 'fireball';

export function spellFor(id) {
  return SPELLS[id] ?? SPELLS[DEFAULT_SPELL];
}

export function isSpell(id) {
  return Object.hasOwn(SPELLS, id);
}

// a Spellblade's body, for blasts: an upright column this wide from the feet to the crown (body.mjs: lower when
// crouched)
const BODY = Object.freeze({ radius: 0.4, low: 0.1 });

/**
 * How far a blast's heart is from the nearest part of a body at `position` (0 when it is inside it). crown: how high
 * the body reaches (a standing one's by default).
 */
export function blastDistance(point, position, crown = POSTURES.standing.crown) {
  const y = Math.max(position.y + BODY.low, Math.min(position.y + crown, point.y));
  return Math.max(0, Math.hypot(point.x - position.x, point.y - y, point.z - position.z) - BODY.radius);
}

/** How directly a blast caught a body `distance` from its heart: 1 at the heart, 0 at (and past) its edge. */
export function spellExposure(spell, distance) {
  if (!(distance >= 0) || distance > spell.radius) return 0;
  return 1 - distance / spell.radius;
}

/** The blast's damage at an exposure: full at the heart, easing off a little toward the edge (0 only outside it). */
export function blastDamage(spell, exposure) {
  if (!(exposure > 0)) return 0;
  const t = 1 - Math.min(1, exposure);
  return Math.round(spell.directDamage + (spell.edgeDamage - spell.directDamage) * t * t);
}

/** The chill a frost leaves at an exposure: colder and longer the more directly it caught (null for no frost). */
export function chillFrom(spell, exposure, nowSec) {
  if (!spell.chill || !(exposure > 0)) return null;
  const e = Math.min(1, exposure);
  const slow = spell.chill.slow * ((spell.chill.edgeSlow ?? 1) + (1 - (spell.chill.edgeSlow ?? 1)) * e);
  const seconds = spell.chill.seconds * ((spell.chill.edgeSeconds ?? 1) + (1 - (spell.chill.edgeSeconds ?? 1)) * e);
  return { slow, startedAt: nowSec, until: nowSec + seconds };
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
 * The burn a blast leaves at an exposure: every lick the same, but fewer of them the less directly it caught, none
 * past the burn's reach (a share of the blast's). Returns null when nothing catches.
 */
export function burnFrom(spell, exposure, attackerId, nowSec) {
  if (!spell.burn || !(exposure > 0)) return null;
  const reach = spell.burn.reach ?? 1;
  const closeness = Math.max(0, 1 - (1 - Math.min(1, exposure)) / reach);
  const licks = Math.round(spell.burn.licks * closeness);
  if (licks < 1) return null;
  const perLick = spell.burn.damage / spell.burn.licks;
  const interval = spell.burn.seconds / spell.burn.licks;
  return { attackerId, perLick, licksLeft: licks, interval, nextAt: nowSec + interval, until: nowSec + interval * licks };
}
