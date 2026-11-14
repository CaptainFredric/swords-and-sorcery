// Presentation only. Follow nearby walkable surfaces while avoiding floors on
// a different storey or long triangles hanging across a ledge.
import { surfaceHeightAt } from '../../shared/src/collision.mjs';

export function effectGround(world, origin, x, z) {
  if (!world) return origin.y;
  const rise = Math.min(3, .35 + .65 * Math.hypot(x - origin.x, z - origin.z));
  const y = surfaceHeightAt(x, z, origin.y + rise - .65, world);
  return y !== null && y >= origin.y - rise ? y : null;
}

// Geometry lies in the local XZ plane. Keep index counts stable so that
// growing fissures and frost plates can still animate with draw ranges.
export function drapeGround(geometry, world, origin, { local = true, scale = 1, source, lines = false } = {}) {
  if (!world) return geometry;
  const position = geometry.attributes.position;
  const points = source ?? position.array.slice();
  const index = geometry.userData.groundIndex ??=
    geometry.index?.array.slice() ?? Uint32Array.from({ length: position.count }, (_, i) => i);
  const heights = geometry.userData.groundHeights ??= new Float32Array(position.count);
  for (let i = 0; i < position.count; i++) {
    const x = points[i * 3], y = points[i * 3 + 1], z = points[i * 3 + 2];
    const floor = effectGround(world, origin, local ? origin.x + x * scale : x, local ? origin.z + z * scale : z);
    heights[i] = floor ?? NaN;
    position.setXYZ(i, x, floor === null ? y : y + (floor - origin.y) / scale, z);
  }
  if (!geometry.index) geometry.setIndex(Array.from(index));
  const output = geometry.index.array;
  const stride = lines ? 2 : 3;
  for (let i = 0; i < index.length; i += stride) {
    let low = Infinity, high = -Infinity;
    for (let j = 0; j < stride; j++) {
      const height = heights[index[i + j]];
      low = Math.min(low, height);
      high = Math.max(high, height);
    }
    for (let j = 0; j < stride; j++) output[i + j] = high - low <= .8 ? index[i + j] : index[i];
  }
  geometry.index.needsUpdate = true;
  position.needsUpdate = true;
  geometry.computeBoundingSphere();
  return geometry;
}
