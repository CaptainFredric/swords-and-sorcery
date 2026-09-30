import { segmentAabbHit } from '../../shared/src/collision.mjs';

// First person, the sword kept out of the walls. The authoritative sweep lets a slash carry on past a wall it only
// grazes at its edge (shared/src/blade.mjs), and a knight stands wherever they like: in your own view the blade would
// sink deep into the stone. So each frame the view measures how far the blade (from the grip along its length) runs
// into anything solid, and draws the arms back toward you by that much (the point lifting a little, as a hand pulls a
// blade out of a wall's way), easing out again once the way is clear. Presentation only: nothing here changes what
// the blade meets.

export const BLADE_CLEARANCE = Object.freeze({
  reach: 1.0,          // the blade's length past the grip (m)
  margin: 0.03,        // kept this clear of a surface
  maxRetract: 0.4,     // the most the arms draw back (m)
  lift: 0.45,          // radians of lift per metre drawn back
  inRate: 24,          // how fast it draws back (m/s) and eases out again
  outRate: 6,
});

/** How much of a blade from `grip` to `tip` ({x, y, z}) lies past its first entry into a solid (m; 0 when clear). */
export function bladeInside(grip, tip, solids, margin = BLADE_CLEARANCE.margin) {
  const start = [grip.x, grip.y, grip.z];
  const end = [tip.x, tip.y, tip.z];
  const length = Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]);
  let first = 1;
  for (const solid of solids ?? []) {
    if (solid.blade === false) continue;
    const grown = { center: solid.center, size: [solid.size[0] + margin * 2, solid.size[1] + margin * 2, solid.size[2] + margin * 2] };
    const hit = segmentAabbHit(start, end, grown);
    if (hit && hit.t < first) first = hit.t;
  }
  return (1 - first) * length;
}

/**
 * The retraction to apply this frame (m), eased from `current` toward what the blade's intended pose needs. `grip` and
 * `axis`: where the blade is and which way it points (world) as posed, before any retraction; `reach`: its length.
 */
export function nextRetraction({ grip, axis, reach = BLADE_CLEARANCE.reach, current, solids, dt }, clearance = BLADE_CLEARANCE) {
  const tip = { x: grip.x + axis.x * reach, y: grip.y + axis.y * reach, z: grip.z + axis.z * reach };
  const want = Math.min(clearance.maxRetract, bladeInside(grip, tip, solids, clearance.margin));
  const rate = (want > current ? clearance.inRate : clearance.outRate) * Math.max(0, dt);
  return want > current ? Math.min(want, current + rate) : Math.max(want, current - rate);
}
