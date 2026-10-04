// The spells a Spellblade can carry into a fight, one at a time (chosen in the Armory). Each is gathered in the palm
// for a moment, then thrown; they differ in what they leave behind. The same slot can carry a ward instead (kind
// 'ward': Sheathe in Steel, shared/src/steel.mjs), called at once on the same key rather than thrown.
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
import { STEEL } from './steel.mjs';

export const SPELLS = Object.freeze({
  fireball: Object.freeze({
    id: 'fireball',
    label: 'Fireball',
    cooldownSec: 4,
    // the palm gathers the fire before it flies
    gatherSec: 0.3,
    speed: 24,
    windResist: 1,               // how hard a Gale finds it to bend in flight (galeDeflection)
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
    windResist: 1.2,             // a quicker, denser bolt: a little harder to blow aside
    directDamage: 15,
    edgeDamage: 11,
    radius: 1.6,
    // the cold, for a direct hit: this much of their speed taken at once, all of it back after this long; a body caught
    // further out is chilled less, and for less long (down to these shares at the very edge)
    chill: Object.freeze({ slow: 0.55, seconds: 3, edgeSlow: 0.4, edgeSeconds: 0.5 }),
  }),
  // A broad cone of wind, short to middling in reach, that moves bodies far more than it hurts them
  // (shared/src/gale.mjs). A readable breath is drawn in first, so it is no instant "get away from me". Its heart does
  // a little damage; its pressure reaches wider and further and only shoves (and bears on a guard). The shove is
  // hardest close to the hand and fades evenly out to the edge. Current, provisional tuning (the cooldown especially).
  gale: Object.freeze({
    id: 'gale',
    label: 'Gale Garner',
    short: 'Gale',               // where a label must be short (a HUD tile, a touch button)
    kind: 'cone',
    cooldownSec: 6,
    gatherSec: 0.5,
    cone: Object.freeze({
      reach: 6.5,                // the heart of the gust, out to here and this wide...
      halfAngleDeg: 30,
      pressureReach: 11,         // ...and its pressure, further and wider (a shove, no damage)
      pressureHalfAngleDeg: 48,
      bend: 0.8,                 // how the shove falls with distance: (1 - d / reach) ^ bend
      core: 0.35,                // the middle share of the cone's angle at full strength, easing out to its edge
      damage: 8,                 // at point blank in its heart
      push: 18,                  // m/s: the shove at point blank, as it first catches a body
      lift: 0.32,                // a share of it lifting the body off its feet
      guarded: 0.35,             // a raised guard facing it keeps this much of the shove (and of the wind)...
      guardCost: 14,             // ...and pays this much stamina for it at point blank
      // the gust blows this long, from the hand along the aim (following both), at full strength until its last
      // `fadeSec`, then dying away. The first time it reaches a body it shoves it (stings it, bears on its guard); for as
      // long as the body stays in it after, its wind carries it on: a windbox the size of the pressure's cone, the same
      // all through it (easing out over its last `windEdge` of reach and outside the middle `windCore` of its angle),
      // drawing a body along the gust toward `wind` m/s (`drag`: how quickly), never past it: more than a knight can
      // run against (shared/src/gale.mjs galeWindAt, galeCarry)
      lastsSec: 1.0,
      fadeSec: 0.3,
      wind: 14,
      drag: 12,
      windEdge: 0.25,
      windCore: 0.6,
      // a spell in flight through it is bent off its line, never taken over (whose it is stays whose it was): by up to
      // `heart` m/s where the heart catches it squarely and `pressure` m/s where its pressure does, less for a heavier
      // spell (its windResist); in all, no more than the strongest the gust met it with (galeDeflection)
      deflect: Object.freeze({ heart: 30, pressure: 12 }),
    }),
    // driven into the ground (or a wall), the gust throws its caster off it: at full strength up to `full` metres
    // from the eyes, fading out to `reach`; `maxUp`: the most upward speed a throw leaves (m/s)
    recoil: Object.freeze({ reach: 4.5, full: 2.4, push: 11.5, maxUp: 10.5 }),
  }),
  // Sheathe in Steel: not thrown but called, at once, on the spell's key (shared/src/steel.mjs)
  steel: Object.freeze({
    id: 'steel',
    label: 'Sheathe in Steel',
    short: 'Steel',              // where a label must be short (a HUD tile, a touch button)
    kind: 'ward',
    cooldownSec: STEEL.cooldownSec,
    gatherSec: 0,
  }),
});

// Spells no knight carries: thrown by something else, and from there a spell like any other (it flies, meets the
// world, bursts and is bent by a gust by the same rules). `size`: how big it is seen, beside a Fireball; `shove`: how
// hard its burst throws a body, as a share of a Fireball's. None of them leaves a burn.
export const CONJURED = Object.freeze({
  // a Blazing Vortex's fire (shared/src/ultimates.mjs), by its emphasis. On the blade: a weak ember
  ember: Object.freeze({
    id: 'ember', label: 'Ember', conjured: true, speed: 26, windResist: 0.8,
    directDamage: 4, edgeDamage: 2, radius: 1.2, shove: 0.3, size: 0.45,
  }),
  // balanced: a small Fireball, plainly less than one thrown from the palm
  vortexFire: Object.freeze({
    id: 'vortexFire', label: 'Vortex fire', conjured: true, speed: 27, windResist: 0.9,
    directDamage: 10, edgeDamage: 6, radius: 1.8, shove: 0.6, size: 0.68,
  }),
  // on the fire: a small, serious Fireball (a Fireball's blow at its heart, a tighter burst, no burn)
  vortexBlaze: Object.freeze({
    id: 'vortexBlaze', label: 'Vortex blaze', conjured: true, speed: 26, windResist: 1,
    directDamage: 18, edgeDamage: 10, radius: 2.2, shove: 0.85, size: 1.08,
  }),
});

export const DEFAULT_SPELL = 'fireball';

export function spellFor(id) {
  return SPELLS[id] ?? CONJURED[id] ?? SPELLS[DEFAULT_SPELL];
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
