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
 * Hit-stop for the attacker's first-person swing: a short freeze sells the contact. The combo finisher holds
 * longer, a killing blow longest. Never long enough to desync the swing from the server's strike timing.
 */
export function hitstopSeconds({ strike = 0, kill = false } = {}) {
  if (kill) return 0.11;
  return strike >= 2 ? 0.075 : 0.05;
}

/** How strongly the attacker's view and arms kick on contact (0..1). */
export function hitKick({ strike = 0, kill = false } = {}) {
  if (kill) return 1;
  return strike >= 2 ? 0.8 : 0.5;
}
