// The gauntlet strike. With the spell still on its cooldown, the spell's key throws the magic hand's armoured fist
// instead, on command, every time it is asked for: a short, quick jab, light, with a small shove. It lands on the
// nearest foe within arm's reach as it goes home; with nobody there, it meets only air.
//
// It is an emergency, not a second weapon: no stun, no guard break (a guard facing it pays a little, and a spent one
// is simply lowered), no throw off the ground, and it shares the sword's one line of attack. It is never thrown
// through a committed sword strike or a live blade; thrown in a chain's recovery, it ends the chain rather than adding
// to it; and nothing attacks again before its own recovery is over, nor before the sword's next strike would have
// come had the button been held (shared/sim/combat.mjs). So weaving it between cuts never out-damages simply holding
// the sword.
//
// Current tuning (provisional). The server resolves it; the client asks the same questions to show it at once.

export const GAUNTLET = Object.freeze({
  reach: 1.75,         // metres between the two bodies' centres, across the ground: arm's length past both bodies
  arcHalfDeg: 42,      // how far off the facing a foe may stand
  startup: 0.14,       // from the press to the blow landing
  recovery: 0.36,      // after it lands, before any attack begins
  damage: 9,
  shove: 1.3,          // m/s along the blow (a sword's is 1.7)
  guardCost: 6,        // stamina a guard facing it pays
  steelChip: 0.05,     // Sheathed in Steel wears a little, as from any blow
  // how far a foe may have moved off by the time it lands and still be caught (the arm follows through)
  landSlack: 0.3,
});

const ARC_HALF = GAUNTLET.arcHalfDeg * Math.PI / 180;

/**
 * Where a foe at `to` ({ x, z }) stands for a fist thrown from `from` facing `yaw` (three.js: forward is (-sin,
 * -cos)): { distance, angle, direction } (angle off the facing in radians, direction the unit way to it).
 */
export function gauntletGeometry(from, yaw, to) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const distance = Math.hypot(dx, dz);
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const along = dx * fx + dz * fz;
  const across = dx * -fz + dz * fx;
  return {
    distance,
    angle: Math.atan2(-across, along),
    direction: distance > 1e-6 ? { x: dx / distance, z: dz / distance } : { x: fx, z: fz },
  };
}

/** Whether a foe placed so ({ distance, angle }) is within the fist's reach (`slack`: extra allowance). */
export function withinGauntlet({ distance, angle }, slack = 0) {
  return distance <= GAUNTLET.reach + slack && Math.abs(angle) <= ARC_HALF;
}

/**
 * The foe the fist would meet: the nearest of `foes` ([{ id, position }]) within reach of a knight at `from` facing
 * `yaw`, or null.
 */
export function gauntletTarget(from, yaw, foes) {
  let best = null;
  for (const foe of foes) {
    const g = gauntletGeometry(from, yaw, foe.position);
    if (!withinGauntlet(g)) continue;
    if (!best || g.distance < best.g.distance) best = { foe, g };
  }
  return best;
}
