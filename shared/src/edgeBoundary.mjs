/** Shared by authoritative simulation and client-side prediction. */
export function edgeInside(point, center, radius, clearance = 0) {
  return Math.hypot(point.x - center.x, point.z - center.z) <= radius - clearance + 1e-6;
}

/** Projection onto a convex battle disk. Endpoints AND their connecting sweep
 * remain inside; sideways motion is preserved even against the boundary.
 */
export function edgeLimitPoint(point, center, radius, clearance = 0) {
  const limit = Math.max(0, radius - clearance);
  const dx = point.x - center.x, dz = point.z - center.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= limit || distance < 1e-9) return { ...point };
  return { ...point, x: center.x + dx * limit / distance, z: center.z + dz * limit / distance };
}
