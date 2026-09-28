import { KIT_PALETTE as P, shadeColor, valueNoise } from './facetKit.mjs';
import { subtractRects } from './rects.mjs';

// Ground for the environment kit: playable floors stay perfectly flat at their authoritative height (only their
// colour varies), while the land beyond the boundaries is faceted, hilly and clearly out of reach.

function distanceToSegment(x, z, [ax, az], [bx, bz]) {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

/** Distance from (x, z) to the nearest worn path (polylines of [x, z] points). */
export function pathDistance(x, z, paths) {
  let best = Infinity;
  for (const path of paths) {
    for (let i = 0; i < path.length - 1; i += 1) best = Math.min(best, distanceToSegment(x, z, path[i], path[i + 1]));
  }
  return best;
}

/** Ground colour for a playable floor at (x, z): grass with blotches, earth where feet wear paths, paving on stone. */
export function floorColor(material, x, z, paths, rand) {
  if (material === 'stone') {
    // paving: square setts with a light/dark rhythm and worn centres
    const cell = (Math.floor(x / 0.9) * 7 + Math.floor(z / 0.9) * 13) % 5;
    return shadeColor(P.paving, 0.86 + cell * 0.045 + (rand() - 0.5) * 0.06);
  }
  const worn = Math.max(0, 1 - pathDistance(x, z, paths) / 1.6);
  const blotch = valueNoise(x * 0.35, z * 0.35, 11);
  if (material === 'earth' || worn > 0.55) {
    const base = worn > 0.8 ? P.earthDark : P.earth;
    return shadeColor(base, 0.88 + blotch * 0.2 + (rand() - 0.5) * 0.06);
  }
  const grass = blotch > 0.62 ? P.grassLight : blotch < 0.3 ? P.grassDark : P.grass;
  const earthy = worn * 0.6;
  const color = shadeColor(grass, 0.92 + (rand() - 0.5) * 0.1);
  return color.lerp(shadeColor(P.earth, 1), earthy);
}

/**
 * Flat, coloured top surface of a floor, in cells of about one metre, plus its visible slab edges. `covers`: parts
 * already drawn by other floors at the same height (the floors overlap a little so routes run straight across);
 * they are left out here, so two surfaces never share a plane and flicker against each other.
 */
export function floorTile(batch, floor, paths, rand, covers = []) {
  const [cx, , cz] = floor.center;
  const [sx, sy, sz] = floor.size;
  const y = floor.y;
  const nx = Math.max(1, Math.round(sx / 1.0));
  const nz = Math.max(1, Math.round(sz / 1.0));
  const x0 = cx - sx / 2;
  const z0 = cz - sz / 2;
  const builder = batch.ground;
  // paving keeps crisp per-cell setts; grass and earth blend smoothly between grid corners
  const soft = floor.material !== 'stone';
  const corner = [];
  for (let i = 0; i <= nx; i += 1) {
    corner.push([]);
    for (let j = 0; j <= nz; j += 1) corner[i].push(floorColor(floor.material, x0 + (i / nx) * sx, z0 + (j / nz) * sz, paths, rand));
  }
  for (let i = 0; i < nx; i += 1) {
    for (let j = 0; j < nz; j += 1) {
      const xa = x0 + (i / nx) * sx;
      const xb = x0 + ((i + 1) / nx) * sx;
      const za = z0 + (j / nz) * sz;
      const zb = z0 + ((j + 1) / nz) * sz;
      const pieces = covers.length ? subtractRects({ xa, xb, za, zb }, covers) : null;
      if (pieces && !(pieces.length === 1 && pieces[0].xa === xa && pieces[0].xb === xb && pieces[0].za === za && pieces[0].zb === zb)) {
        // a cell cut by another floor: draw only what is left, coloured at its own corners
        for (const piece of pieces) {
          const at = (x, z) => floorColor(floor.material, x, z, paths, rand);
          const [a, b, c, d] = [at(piece.xa, piece.za), at(piece.xa, piece.zb), at(piece.xb, piece.zb), at(piece.xb, piece.za)];
          builder.triBlend([piece.xa, y, piece.za], [piece.xa, y, piece.zb], [piece.xb, y, piece.zb], a, b, c);
          builder.triBlend([piece.xa, y, piece.za], [piece.xb, y, piece.zb], [piece.xb, y, piece.za], a, c, d);
        }
        continue;
      }
      if (soft) {
        builder.triBlend([xa, y, za], [xa, y, zb], [xb, y, zb], corner[i][j], corner[i][j + 1], corner[i + 1][j + 1]);
        builder.triBlend([xa, y, za], [xb, y, zb], [xb, y, za], corner[i][j], corner[i + 1][j + 1], corner[i + 1][j]);
      } else {
        const color = floorColor(floor.material, (xa + xb) / 2, (za + zb) / 2, paths, rand);
        builder.quad([xa, y, za], [xa, y, zb], [xb, y, zb], [xb, y, za], color);
      }
    }
  }
  // slab edges (seen where a floor meets a drop)
  const edge = shadeColor(floor.material === 'stone' ? P.stoneDark : P.earthDark, 0.9);
  const b = y - sy;
  const [xa, xb, za, zb] = [x0, x0 + sx, z0, z0 + sz];
  builder.quad([xb, b, za], [xa, b, za], [xa, y, za], [xb, y, za], edge);
  builder.quad([xa, b, zb], [xb, b, zb], [xb, y, zb], [xa, y, zb], edge);
  builder.quad([xa, b, za], [xa, b, zb], [xa, y, zb], [xa, y, za], edge);
  builder.quad([xb, b, zb], [xb, b, za], [xb, y, za], [xb, y, zb], edge);
}

/**
 * The land around the arena. heightAt(x, z) gives the surface; cells whose centre lies inside `exclude(x, z)`
 * (the playable footprint) are skipped so nothing pokes through a floor.
 */
export function outerTerrain(batch, { minX, maxX, minZ, maxZ, cell = 2, heightAt, colorAt, exclude }) {
  const builder = batch.ground;
  for (let x = minX; x < maxX; x += cell) {
    for (let z = minZ; z < maxZ; z += cell) {
      const mx = x + cell / 2;
      const mz = z + cell / 2;
      if (exclude(mx, mz)) continue;
      const a = [x, heightAt(x, z), z];
      const b = [x, heightAt(x, z + cell), z + cell];
      const c = [x + cell, heightAt(x + cell, z + cell), z + cell];
      const d = [x + cell, heightAt(x + cell, z), z];
      builder.tri(a, b, c, colorAt(mx, (a[1] + b[1] + c[1]) / 3, mz));
      builder.tri(a, c, d, colorAt(mx, (a[1] + c[1] + d[1]) / 3, mz));
    }
  }
}
