import { KIT_PALETTE as P, seededRandom, shadeColor, valueNoise } from './facetKit.mjs';
import { subtractRects } from './rects.mjs';

// Ground for the environment kit: playable floors stay perfectly flat at their authoritative height (only their
// colour varies), while the land beyond the boundaries is faceted, hilly and clearly out of reach.
//
// The colour is layered so a field never reads as one flat sheet: the land's broad lie (drier, sunnier stretches and
// lusher, darker ones, tens of metres across), patches a few metres across, clover-sized mottling, worn paths, darker
// ground at the foot of walls and houses (floorTile's `shade`), and a slight difference from facet to facet. On top,
// sparse low-poly detail (scatterGroundDetail): tufts of grass, pebbles, a few flowers. None of it collides.

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

// the land's broad lie at (x, z), -1 (lush, low, darker) to 1 (dry, sunny, paler): features some twenty metres across
export function groundLie(x, z) {
  return (valueNoise(x * 0.07 + 3.1, z * 0.07 - 1.7, 29) - 0.5) * 2.6;
}

const DRY_GRASS = shadeColor(0x8f9150, 1);
const LUSH_GRASS = shadeColor(0x3c5a2c, 1);
const RED_EARTH = shadeColor(0x8f5f40, 1);

/** Ground colour for a playable floor at (x, z): grass with blotches, earth where feet wear paths, paving on stone. */
export function floorColor(material, x, z, paths, rand) {
  const lie = Math.max(-1, Math.min(1, groundLie(x, z)));
  if (material === 'stone') {
    // paving: square setts with a light/dark rhythm and worn centres (a little paler where the land is dry)
    const cell = (Math.floor(x / 0.9) * 7 + Math.floor(z / 0.9) * 13) % 5;
    return shadeColor(P.paving, (0.86 + cell * 0.045 + (rand() - 0.5) * 0.06) * (1 + lie * 0.035));
  }
  const toPath = pathDistance(x, z, paths);
  const worn = Math.max(0, 1 - toPath / 1.6);
  const blotch = valueNoise(x * 0.35, z * 0.35, 11);
  // clover-sized mottling, finer than the blotches
  const mottle = (valueNoise(x * 1.1, z * 1.1, 41) - 0.5) * 0.1;
  if (material === 'earth' || worn > 0.55) {
    const base = worn > 0.8 ? P.earthDark : P.earth;
    // cart tracks: two darker ruts either side of a path's line, on the earth
    const rut = material === 'earth' ? Math.exp(-(((toPath - 0.75) / 0.2) ** 2)) * 0.12 : 0;
    const color = shadeColor(base, (0.88 + blotch * 0.2 + mottle + (rand() - 0.5) * 0.06 - rut) * (1 + lie * 0.07));
    return lie < 0 ? color : color.lerp(RED_EARTH, lie * 0.22);
  }
  // grass: dark, mid and light, blended by the blotches rather than cut into bands
  const light = Math.max(0, Math.min(1, (blotch - 0.45) / 0.3));
  const dark = Math.max(0, Math.min(1, (0.42 - blotch) / 0.25));
  const color = shadeColor(P.grass, 1).lerp(shadeColor(P.grassLight, 1), light).lerp(shadeColor(P.grassDark, 1), dark);
  color.multiplyScalar(0.92 + (rand() - 0.5) * 0.1 + mottle);
  // the land's lie: drier and paler on the rises of it, lusher and darker in its hollows
  if (lie > 0) color.lerp(DRY_GRASS, lie * 0.42);
  else color.lerp(LUSH_GRASS, -lie * 0.32);
  return color.lerp(shadeColor(P.earth, 1), worn * 0.6);
}

// a stable 0..1 hash of a lattice point (the same everywhere, every build)
function hash01(i, j, seed) {
  return valueNoise(Math.round(i), Math.round(j), seed);
}

/**
 * Flat, coloured top surface of a floor, in cells of about one metre, plus its visible slab edges. `covers`: parts
 * already drawn by other floors at the same height (the floors overlap a little so routes run straight across);
 * they are left out here, so two surfaces never share a plane and flicker against each other. `shade(x, z)`: an
 * extra factor for the ground's colour there (darker at the foot of walls and houses; 1 elsewhere).
 */
export function floorTile(batch, floor, paths, rand, covers = [], shade = null) {
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
  const colorAt = (x, z) => {
    const color = floorColor(floor.material, x, z, paths, rand);
    return shade ? color.multiplyScalar(shade(x, z)) : color;
  };
  const corner = [];
  for (let i = 0; i <= nx; i += 1) {
    corner.push([]);
    for (let j = 0; j <= nz; j += 1) corner[i].push(colorAt(x0 + (i / nx) * sx, z0 + (j / nz) * sz));
  }
  // each facet a shade lighter or darker than its neighbours: faceted ground, not a smooth sheet
  const facet = (color, i, j, k) => color.clone().multiplyScalar(1 + (hash01(i * 2 + k + floor.center[0] * 3, j + floor.center[2] * 3, 53) - 0.5) * 0.12);
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
          const at = colorAt;
          const [a, b, c, d] = [at(piece.xa, piece.za), at(piece.xa, piece.zb), at(piece.xb, piece.zb), at(piece.xb, piece.za)];
          builder.triBlend([piece.xa, y, piece.za], [piece.xa, y, piece.zb], [piece.xb, y, piece.zb], a, b, c);
          builder.triBlend([piece.xa, y, piece.za], [piece.xb, y, piece.zb], [piece.xb, y, piece.za], a, c, d);
        }
        continue;
      }
      if (soft) {
        builder.triBlend([xa, y, za], [xa, y, zb], [xb, y, zb], facet(corner[i][j], i, j, 0), facet(corner[i][j + 1], i, j, 0), facet(corner[i + 1][j + 1], i, j, 0));
        builder.triBlend([xa, y, za], [xb, y, zb], [xb, y, za], facet(corner[i][j], i, j, 1), facet(corner[i + 1][j + 1], i, j, 1), facet(corner[i + 1][j], i, j, 1));
      } else {
        const color = colorAt((xa + xb) / 2, (za + zb) / 2);
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

// --- sparse ground detail -------------------------------------------------------------------------------------------

export const GROUND_DETAIL = Object.freeze({
  tufts: 0.55,         // per square metre of grass
  flowers: 0.035,      // clusters per square metre of grass
  pebbles: 0.16,       // per square metre of earth (and a few on grass)
  clearOfPaths: 0.9,   // metres: tufts and flowers keep off the worn paths
  clearOfSolids: 0.35, // metres: nothing tucked under a wall or a house
  clearOfEdges: 0.4,   // metres: nothing hanging over a floor's edge
});

const FLOWER_COLORS = Object.freeze([0xe8dfc0, 0xd9c24f, 0xa98bb8, 0xb8483a, 0xe0d7a8]);

/**
 * Tufts of grass, pebbles and a few flowers over the grass and earth floors: sparse, low-poly, on the ground builder
 * (no shadows, no extra draw calls) and deterministic (their own seeded stream: every player sees the same field).
 * solids: boxes { center, size } that nothing is scattered under. Returns how many of each were placed.
 */
export function scatterGroundDetail(batch, { floors, paths = [], solids = [], seed = 7, density = GROUND_DETAIL } = {}) {
  const rand = seededRandom(seed);
  const builder = batch.ground;
  const placed = { tufts: 0, flowers: 0, pebbles: 0 };
  const clearOf = (x, z, margin) => !solids.some((solid) => Math.abs(x - solid.center[0]) < solid.size[0] / 2 + margin
    && Math.abs(z - solid.center[2]) < solid.size[2] / 2 + margin && solid.center[1] - solid.size[1] / 2 < 1.5);
  for (const floor of floors) {
    if (floor.material !== 'grass' && floor.material !== 'earth') continue;
    const [cx, , cz] = floor.center;
    const [sx, , sz] = floor.size;
    const edge = density.clearOfEdges;
    const area = (sx - 2 * edge) * (sz - 2 * edge);
    const pick = () => [cx - sx / 2 + edge + rand() * (sx - 2 * edge), cz - sz / 2 + edge + rand() * (sz - 2 * edge)];
    const grass = floor.material === 'grass';
    // tufts, thicker in the land's lush hollows
    for (let n = Math.round(area * (grass ? density.tufts : density.tufts * 0.25)); n > 0; n -= 1) {
      const [x, z] = pick();
      const lie = groundLie(x, z);
      if (rand() > 0.75 - lie * 0.3) continue;
      if (pathDistance(x, z, paths) < density.clearOfPaths || !clearOf(x, z, density.clearOfSolids)) continue;
      tuft(builder, rand, x, floor.y, z, lie);
      placed.tufts += 1;
    }
    if (grass) {
      for (let n = Math.round(area * density.flowers); n > 0; n -= 1) {
        const [x, z] = pick();
        if (pathDistance(x, z, paths) < density.clearOfPaths || !clearOf(x, z, density.clearOfSolids)) continue;
        flowers(builder, rand, x, floor.y, z);
        placed.flowers += 1;
      }
    }
    // pebbles: mostly on the earth, a few in the grass, more toward the paths' edges
    for (let n = Math.round(area * (grass ? density.pebbles * 0.2 : density.pebbles)); n > 0; n -= 1) {
      const [x, z] = pick();
      if (!clearOf(x, z, density.clearOfSolids)) continue;
      const r = 0.045 + rand() * 0.08;
      builder.lump({
        cx: x, cy: floor.y + r * 0.2, cz: z, rx: r, ry: r * 0.55, rz: r * (0.7 + rand() * 0.3),
        color: rand() < 0.5 ? P.stone : P.stoneDark, rand, shade: 0.2, squash: 0.25,
      });
      placed.pebbles += 1;
    }
  }
  return placed;
}

// a blade: a thin triangle from the ground, leaning out, seen from either side
function blade(builder, [x, y, z], angle, lean, height, width, base, tip) {
  const dx = Math.cos(angle);
  const dz = Math.sin(angle);
  const a = [x - dz * width, y, z + dx * width];
  const b = [x + dz * width, y, z - dx * width];
  const top = [x + dx * lean * height, y + height, z + dz * lean * height];
  builder.triBlend(a, b, top, base, base, tip);
  builder.triBlend(b, a, top, base, base, tip);
}

// a tuft of grass: a few blades from one spot, taller and greener in the lush ground
function tuft(builder, rand, x, y, z, lie) {
  const blades = 3 + Math.floor(rand() * 3);
  const tall = 0.2 + rand() * 0.18 - lie * 0.05;
  const green = lie > 0.3 && rand() < 0.5 ? DRY_GRASS : rand() < 0.5 ? shadeColor(P.grass, 1) : shadeColor(P.grassLight, 1);
  const turn = rand() * Math.PI * 2;
  for (let k = 0; k < blades; k += 1) {
    const angle = turn + (k / blades) * Math.PI * 2 + (rand() - 0.5) * 0.8;
    const at = [x + Math.cos(angle) * 0.03, y, z + Math.sin(angle) * 0.03];
    blade(builder, at, angle, 0.25 + rand() * 0.35, tall * (0.7 + rand() * 0.45), 0.022 + rand() * 0.018,
      green.clone().multiplyScalar(0.72), green.clone().multiplyScalar(1.08 + rand() * 0.12));
  }
}

// a few small blooms on short stems
function flowers(builder, rand, x, y, z) {
  const color = FLOWER_COLORS[Math.floor(rand() * FLOWER_COLORS.length)];
  const count = 2 + Math.floor(rand() * 3);
  for (let k = 0; k < count; k += 1) {
    const px = x + (rand() - 0.5) * 0.3;
    const pz = z + (rand() - 0.5) * 0.3;
    const stem = 0.07 + rand() * 0.08;
    blade(builder, [px, y, pz], rand() * Math.PI * 2, 0.15, stem, 0.008, shadeColor(P.grassDark, 1), shadeColor(P.grass, 1));
    builder.prism({ cx: px, cy: y + stem, cz: pz, radiusBottom: 0.012, radiusTop: 0.03, height: 0.022, sides: 5, color, rand, shade: 0.15 });
  }
}
