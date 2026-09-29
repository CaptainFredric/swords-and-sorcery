// How a landed blow should feel: where its burst appears, how long the attacker's swing freezes, how hard the view
// kicks. Pure, so it can be tested; GameRuntime plays the result.

const CHEST = 1.2;

/** Where a blow lands: the victim's chest, pulled a little toward the attacker so the burst sits on the armour. */
export function impactPoint(victim, attacker) {
  if (!victim) return null;
  const dx = (attacker?.x ?? victim.x) - victim.x;
  const dz = (attacker?.z ?? victim.z) - victim.z;
  const length = Math.hypot(dx, dz);
  const pull = length > 1e-6 ? 0.32 / length : 0;
  return { x: victim.x + dx * pull, y: victim.y + CHEST, z: victim.z + dz * pull };
}

/** The blow's direction on the ground plane, attacker to victim (straight ahead of the victim if unknown). */
export function blowDirection(victim, attacker) {
  const dx = (victim?.x ?? 0) - (attacker?.x ?? 0);
  const dz = (victim?.z ?? 0) - (attacker?.z ?? 0);
  const length = Math.hypot(dx, dz);
  return length > 1e-6 ? { x: dx / length, z: dz / length } : { x: 0, z: 1 };
}

/**
 * Hit-stop for the attacker's first-person swing: a short freeze sells the contact. The heavy third strike holds
 * longer, a killing blow longest; a glancing blow (quality below 1) barely catches. Never long enough to desync the
 * swing from the server's strike timing.
 */
export function hitstopSeconds({ strike = 0, kill = false, quality = 1 } = {}) {
  if (kill) return 0.11;
  return (strike >= 2 ? 0.075 : 0.05) * (0.35 + 0.65 * clamp01(quality));
}

/** How strongly the attacker's view and arms kick on contact (0..1): less when the blade only glanced. */
export function hitKick({ strike = 0, kill = false, quality = 1 } = {}) {
  if (kill) return 1;
  return (strike >= 2 ? 0.8 : 0.5) * (0.5 + 0.5 * clamp01(quality));
}

/** Whether a blow reads as glancing (a scrape across the armour rather than a clean cut): the low end of the range. */
export function glancing(quality) {
  return Number.isFinite(quality) && quality < 0.4;
}

// a blow on Sheathed in Steel: one full clang, then only small ticks for any more within its ring (a burn's licks and
// other lingering hurts make no clang at all)
export const STEEL_HIT = Object.freeze({ ringSec: 0.25, least: 0.02 });

/**
 * How a damage word landing on hardened plate is shown: null (no plate, or a lingering hurt such as a burn's lick),
 * or { strength (0..1, how hard the plate still is), full (a full clang; false: a small tick) }. `lastClangAt`: when
 * this body's plate last clanged (seconds, the same clock as `now`).
 */
export function steelHitFeel(event, { lastClangAt = -Infinity, now = 0 } = {}) {
  const strength = Number(event?.steel) || 0;
  if (strength < STEEL_HIT.least || !(event.amount > 0) || event.source === 'burn') return null;
  return { strength: Math.min(1, strength), full: now - lastClangAt >= STEEL_HIT.ringSec };
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 1));
}
