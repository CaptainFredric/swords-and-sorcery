import { surfaceHeightAt } from './collision.mjs';

// A rupture: what the ground does when a Sundering blade is driven into it (only then: a real blade meeting the real
// ground, never a knight merely looking down and swinging). From where the blade struck, a few fissures split the
// ground outward, fanned about the way the blow was going, and run along it at a pace you can see and step out of.
// Each runs only as far as the ground carries it: it stops at anything solid in its way, where the ground drops away
// or rises, and at its reach. It catches a knight standing on the ground it splits as its head passes them (a knight
// in the air clears it), once per rupture, for a little damage and a hard jolt to their balance. Current tuning
// (provisional).

export const RUPTURE = Object.freeze({
  count: 3,             // fissures, fanned about the blow's way
  spreadDeg: 24,        // between neighbours
  speed: 8.5,           // m/s along the ground
  reach: 6.5,           // metres, at most
  step: 0.25,           // the ground is followed this finely
  width: 0.55,          // how near the fissure's line a knight's feet must be (from their middle)
  rise: 0.35,           // the ground may rise or fall this much along it before it stops
  airborne: 0.45,       // feet this far over the ground clear it
  damage: 12,
  stagger: 24,
  jolt: 3.2,            // the upward jolt (m/s)
  lastsSec: 2.5,        // the split ground, seen, this long after it stops
});

// solid ground to split at (x, z), near `level`: the floor there, or null (nothing, or not near it)
function groundAt(world, x, z, level, rules) {
  const ground = surfaceHeightAt(x, z, level + rules.rise, world);
  return ground !== null && Math.abs(ground - level) <= rules.rise ? ground : null;
}

// anything solid standing on the ground at (x, z) (a wall, a pillar, a heap: the fissure runs into its foot and stops)
function blockedAt(world, x, z, level) {
  for (const solid of world?.solids ?? []) {
    const bottom = solid.center[1] - solid.size[1] / 2;
    const top = solid.center[1] + solid.size[1] / 2;
    if (bottom > level + 0.5 || top < level + 0.05) continue;
    if (Math.abs(x - solid.center[0]) <= solid.size[0] / 2 && Math.abs(z - solid.center[2]) <= solid.size[2] / 2) return true;
  }
  return false;
}

/**
 * The fissures a rupture at `origin` (where the blade struck: its ground level is origin.y) opens, fanned about
 * `forward` ({x, z}): [{ dir: {x, z}, length }], each as far as the ground carries it. Empty where the blade struck no
 * ground to split.
 */
export function planRupture(world, origin, forward, rules = RUPTURE) {
  const base = groundAt(world, origin.x, origin.z, origin.y, rules);
  if (base === null) return [];
  const heading = Math.atan2(forward.x, forward.z);
  const fissures = [];
  for (let i = 0; i < rules.count; i += 1) {
    const angle = heading + (i - (rules.count - 1) / 2) * rules.spreadDeg * (Math.PI / 180);
    const dir = { x: Math.sin(angle), z: Math.cos(angle) };
    let length = 0;
    let level = base;
    for (let d = rules.step; d <= rules.reach + 1e-9; d += rules.step) {
      const x = origin.x + dir.x * d;
      const z = origin.z + dir.z * d;
      const ground = groundAt(world, x, z, level, rules);
      if (ground === null || blockedAt(world, x, z, ground)) break;
      level = ground;
      length = d;
    }
    if (length > 0) fissures.push({ dir, length, level });
  }
  return fissures;
}

/**
 * Whether a body standing at `position` (feet) is caught by a fissure whose head ran from `fromDistance` to
 * `toDistance` along it (from `origin`): near its line within that stretch, and on the ground it splits.
 */
export function fissureCatches(origin, fissure, fromDistance, toDistance, position, rules = RUPTURE) {
  const dx = position.x - origin.x;
  const dz = position.z - origin.z;
  const along = dx * fissure.dir.x + dz * fissure.dir.z;
  if (along < fromDistance - rules.width || along > Math.min(toDistance, fissure.length) + rules.width) return false;
  const across = Math.abs(dx * fissure.dir.z - dz * fissure.dir.x);
  if (across > rules.width) return false;
  const low = Math.min(origin.y, fissure.level ?? origin.y);
  const high = Math.max(origin.y, fissure.level ?? origin.y);
  return position.y - high <= rules.airborne && position.y >= low - rules.rise;
}
