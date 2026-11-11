// All-Natural Disaster: what the blow leaves behind. Pure rules for its statuses and its ground field; the room
// (shared/sim/combat.mjs) is what applies them, on the server and in the local host alike.
//
// The grounded blow leaves one field where it landed. It is strongest as it lands and runs down evenly to nothing
// over four seconds; everything it does is scaled by what is left of it, so a knight can see it fading and know what
// stepping into it now would cost:
//   every field: Shaken recovers more slowly inside it, and HP lost inside it takes Guard stamina with it;
//   Full Frost:  it chills whoever stands in it, less and less;
//   Full Lightning: touching it passes on Shocking Conduct, by how much of the knight is in it;
//   Full Fire keeps its own burning ground (the room's burn zones), which licks less as it dies down.
//
// Statuses, each decaying over the same four seconds:
//   Shocking Conduct: a potential of up to 12 HP held by the knight who was struck. Their own next melee blow that
//     would really land is stopped before it does and the potential left is discharged into them instead.
//   Blustered: the knight's fighting facing (sword, guard) turns only so fast; the look itself is never slowed.
import { ONE_HIT_STATUS_SECONDS } from './oneHitInfusions.mjs';
import { ONE_HIT_FIRST_INFUSION_DAMAGE } from './oneHitOfWondersRules.mjs';

export const ONE_HIT_FIELD = Object.freeze({
  seconds: ONE_HIT_STATUS_SECONDS,   // a field of a blow with no infusions
  perElementSec: 0.3,      // and this much longer for every distinct element the blow carried (Half or Full: one)
  vertical: 1.25,          // feet within this of the field's ground are in it
  bodyRadius: 0.4,         // a knight's own breadth, for how much of them is inside
  frostDepth: 0.35,        // the slow at the heart of a fresh Frost field (the direct hit's own)
  frostLingerSec: 0.6,     // a chill picked up in the field lasts this long after the last contact
  conductStep: 0.15,       // a field passes on more Conduct only for this much deeper a contact than before
});

export const ONE_HIT_CONDUCT = Object.freeze({
  potential: ONE_HIT_FIRST_INFUSION_DAMAGE.lightning, // 12
  seconds: ONE_HIT_STATUS_SECONDS,
});

export const ONE_HIT_BLUSTER = Object.freeze({
  seconds: ONE_HIT_STATUS_SECONDS,
  turnRate: 2.4,           // rad/s at its worst (about 140 degrees a second); it loosens as the wind leaves them
  free: 0.05,              // below this much of it left, the facing is the look again
  knockback: 2.5,          // Half Gale's shove, as a share of the plain blow's (about a metre and three quarters, not 0.7)
});

// Steel takes nothing extra from a Guard (the Disaster's own 40 for a guarded blow is all a Guard pays).
export const ONE_HIT_STEEL = Object.freeze({
  // the radial fracture: arms all the way round, evenly (Half), more and further (Full)
  arms: Object.freeze({ 1: Object.freeze({ count: 8, reach: 6.2 }), 2: Object.freeze({ count: 12, reach: 7.6 }) }),
  fissureShaken: Object.freeze({ core: 0.8, trail: 0.5 }),
});

// Fire's first infusion is reach: a wider blow that also goes up, and a sword wave that catches a body's breadth
// further out on every side. (It is no burn: only Full Fire's ground burns.)
export const ONE_HIT_REACH = Object.freeze({
  radius: 3.4, up: 2.6, down: 2.6,                       // the ordinary grounded blow
  fire: Object.freeze({ radius: 4.6, up: 3.5 }),         // with Fire
  wave: 0.9, waveFire: 1.5,                              // how near the travelling wave's line a body's middle must be
  terminal: 2.2, terminalFire: 3.0,                      // where the wave ends: its landing gust, or Fire's explosion
});

// Frost's first infusion is time: the decisive contact stays open this much longer for a knight it has not yet met.
export const ONE_HIT_FROST_LINGER_SEC = 0.3;

// Fire and Gale together: the shove is by where the struck knight stood in the blast. From its heart they are thrown
// the whole way; at its edge only this share of it, so that what is thrown tends to come down inside the fire.
export const ONE_HIT_FIRE_GALE = Object.freeze({ edgeShare: 0.1 });

/** How many distinct elements a blow carries (a Half or a Full stage is one). */
export function distinctElements(tiers = {}) {
  return ['fire', 'frost', 'gale', 'lightning', 'steel'].filter((element) => Number(tiers[element] ?? 0) >= 1).length;
}

/** How long every persistent field of a blow with these stages lasts: four seconds, and 0.3 more for each element. */
export function fieldSeconds(tiers = {}, rules = ONE_HIT_FIELD) {
  return rules.seconds + rules.perElementSec * distinctElements(tiers);
}

/** The grounded blow's reach for these stages: { radius, up, down } about where it landed. */
export function groundReach(tiers = {}, rules = ONE_HIT_REACH) {
  return (tiers.fire ?? 0) >= 1 ? { radius: rules.fire.radius, up: rules.fire.up, down: rules.down } : { radius: rules.radius, up: rules.up, down: rules.down };
}

/** Fire + Gale: the share of the shove a knight struck `distance` from the heart of a blast of `radius` is given. */
export function fireGaleShove(distance, radius, rules = ONE_HIT_FIRE_GALE) {
  const out = clamp01(distance / Math.max(radius, 1e-6));
  return rules.edgeShare + (1 - rules.edgeShare) * (1 - out);
}

const clamp01 = (value) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

/** What is left of a field at `nowSec` (1 as it lands, 0 once it has run down). */
export function fieldStrength(field, nowSec) {
  if (!field) return 0;
  const life = (field.until ?? field.bornAt + ONE_HIT_FIELD.seconds) - field.bornAt;
  return life > 0 ? clamp01(1 - (nowSec - field.bornAt) / life) : 0;
}

/**
 * How much of a knight standing at `position` (feet) is in the field (0: clear of it; 1: wholly inside): their own
 * breadth against its rim, on its ground.
 */
export function fieldContact(field, position, rules = ONE_HIT_FIELD) {
  if (!field || !position) return 0;
  if (Math.abs(position.y - field.position.y) > rules.vertical) return 0;
  const distance = Math.hypot(position.x - field.position.x, position.z - field.position.z);
  return clamp01((field.radius + rules.bodyRadius - distance) / (2 * rules.bodyRadius));
}

/** Shaken's clock inside a field: it recovers at only (1 - strength) of its pace, so its start is carried forward. */
export function shakenHeldBack(shaken, strength, dt) {
  if (!shaken || !(strength > 0) || !(dt > 0)) return shaken;
  return { ...shaken, at: shaken.at + dt * clamp01(strength) };
}

/** The Guard stamina HP lost inside a field takes with it: the damage, by what is left of the field. */
export function fieldGuardLoss(damageTaken, strength) {
  return Math.max(0, damageTaken) * clamp01(strength);
}

/** Full Fire's burning ground: what one lick does as the fire dies down (never less than a single point). */
export function burnZoneLick(strength, full = 3) {
  return Math.max(1, Math.round(full * clamp01(strength)));
}

/** The slow a Frost field gives a knight in it now: the direct hit's, by what is left of the field and of them in it. */
export function fieldFrostDepth(strength, contact, rules = ONE_HIT_FIELD) {
  return rules.frostDepth * clamp01(strength) * clamp01(contact);
}

/**
 * The frost slow after a new one is offered: a deeper one replaces a shallower or spent one; a shallower one never
 * shortens or weakens what is already there.
 */
export function mergeFrostSlow(existing, offered, nowSec) {
  if (!offered || !(offered.depth > 0)) return existing ?? null;
  const live = existing && nowSec < existing.until ? existing : null;
  if (!live) return offered;
  const depth = live.depth ?? ONE_HIT_FIELD.frostDepth;
  if (offered.depth > depth + 1e-9) return { until: Math.max(live.until, offered.until), depth: offered.depth };
  // the same chill kept up by standing in it: it lasts on, no deeper
  if (Math.abs(offered.depth - depth) <= 1e-9) return { ...live, until: Math.max(live.until, offered.until) };
  return live;
}

/** How fast a knight moves under a frost slow (1: unhindered). */
export function frostSlowScale(slow, nowSec) {
  if (!slow || nowSec >= slow.until) return 1;
  return 1 - (slow.depth ?? ONE_HIT_FIELD.frostDepth);
}

/** Shocking Conduct's potential left at `nowSec`. */
export function conductRemaining(status, nowSec, rules = ONE_HIT_CONDUCT) {
  if (!status) return 0;
  return Math.max(0, status.initial * clamp01(1 - (nowSec - status.at) / rules.seconds));
}

/** A direct Lightning-infused hit: the whole potential, from now. */
export function directConduct(sourceId, nowSec, rules = ONE_HIT_CONDUCT) {
  return { at: nowSec, initial: rules.potential, sourceId };
}

/**
 * The status after another is offered: only a stronger one (by what is left of each now) takes its place.
 */
export function mergeConduct(existing, offered, nowSec) {
  if (!offered || !(offered.initial > 0)) return existing ?? null;
  return conductRemaining(offered, nowSec) > conductRemaining(existing, nowSec) + 1e-9 ? offered : existing ?? null;
}

/**
 * A Full Lightning field touching a knight: the Conduct it would pass on (or null). By what is left of the field and
 * how much of the knight is in it. `field.conducted` remembers the deepest contact it has already paid each knight
 * for, so standing in it, or leaving and coming back, never tops the status up; only a clearly deeper contact than
 * before is worth more.
 */
export function fieldConduct(field, targetId, contact, nowSec, rules = ONE_HIT_FIELD) {
  const strength = fieldStrength(field, nowSec);
  const share = clamp01(contact);
  if (!(strength > 0) || !(share > 0)) return null;
  field.conducted ??= {};
  const paid = field.conducted[targetId];
  if (paid !== undefined && share < paid + rules.conductStep) return null;
  field.conducted[targetId] = share;
  return { at: nowSec, initial: ONE_HIT_CONDUCT.potential * strength * share, sourceId: field.ownerId, fieldId: field.id };
}

/** How much of Blustered is left (1 as it lands, 0 when the wind has left them). */
export function blusterSeverity(status, nowSec, rules = ONE_HIT_BLUSTER) {
  if (!status) return 0;
  return clamp01(status.severity ?? 1) * clamp01(1 - (nowSec - status.at) / rules.seconds);
}

/**
 * A Blustered knight's fighting facing this tick: it turns toward where they look by at most the status's turn rate
 * (slowest when fresh, freeing up as it fades). The look itself (`wanted`, the camera's own yaw) is not touched.
 */
export function blusteredFacing(current, wanted, status, dt, nowSec, rules = ONE_HIT_BLUSTER) {
  if (!Number.isFinite(wanted)) return current;
  const severity = blusterSeverity(status, nowSec, rules);
  if (severity <= rules.free || !Number.isFinite(current)) return wanted;
  let delta = (wanted - current) % (2 * Math.PI);
  if (delta > Math.PI) delta -= 2 * Math.PI;
  if (delta < -Math.PI) delta += 2 * Math.PI;
  const most = (rules.turnRate / severity) * Math.max(0, dt);
  if (Math.abs(delta) <= most) return wanted;
  return current + Math.sign(delta) * most;
}

/** The radial fracture's arms for a Steel tier: evenly all the way round (rupture.mjs's rule shape). */
export function steelFractureRules(base, tier, rules = ONE_HIT_STEEL) {
  const shape = rules.arms[tier >= 2 ? 2 : 1];
  const arms = Array.from({ length: shape.count }, (_, i) => Object.freeze({ angle: (360 / shape.count) * i, reach: shape.reach }));
  return { ...base, arms, count: shape.count, reach: shape.reach };
}
