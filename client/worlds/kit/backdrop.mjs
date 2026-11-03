import * as THREE from 'three';
import { KIT_PALETTE as P, facetMesh, seededRandom, shadeColor, valueNoise } from './facetKit.mjs';
import { createBatch, tree } from './kitPieces.mjs';
import { outerTerrain } from './kitTerrain.mjs';

// The land a fortress stands in, for the arenas that stood in a void: the fortress on a plateau of rock, a valley of
// fields and woods below it rising to hills, a ring of far mountains, and a sky over it (its zenith, its horizon, what
// lies below), so that from anywhere on the walls the eye meets country, not black. Presentation only: none of it
// collides, and none of it is drawn where a knight could think it ground (the plateau's top is under the arena's own
// floors and walls; the valley is many metres down, past the abyss).

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };

export const BACKDROP_MOODS = Object.freeze({
  // a green march at dusk: fields and copses, a warm horizon
  dusk: Object.freeze({
    grass: [0x56693a, 0x6c7a40, 0x4a5a33], earth: 0x7a6247, rock: [0x6d655a, 0x5a544b], far: 0x6f7480,
    trees: Object.freeze(['oak', 'oak', 'pine']), treeCount: 150, rocks: 40, farms: true,
  }),
  // an iron country: slag and ash, bare stone, dark pines, the glow of other furnaces on the horizon
  forge: Object.freeze({
    grass: [0x4a4436, 0x3d3a32, 0x55503f], earth: 0x3b332c, rock: [0x4c4540, 0x3a3532], far: 0x5a4a44,
    trees: Object.freeze(['pine', 'pine', 'dead']), treeCount: 90, rocks: 70, farms: false, chimneys: true,
  }),
});

/** The sky: a dome shaded from what lies below, through the horizon, to the zenith (no fog, drawn behind all). */
export function skyDome({ zenith, horizon, below }, radius) {
  const geometry = new THREE.SphereGeometry(radius, 32, 16);
  const colors = [];
  const [cz, ch, cb] = [new THREE.Color(zenith), new THREE.Color(horizon), new THREE.Color(below)];
  const c = new THREE.Color();
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const h = position.getY(i) / radius;
    if (h >= 0) c.copy(ch).lerp(cz, Math.pow(Math.min(1, h * 1.6), 0.7));
    else c.copy(ch).lerp(cb, Math.min(1, -h * 4));
    colors.push(c.r, c.g, c.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'backdrop-sky';
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}

/** A dead tree: a bare trunk forking into a few angled limbs. */
function deadTree(batch, rand, { x, y, z, scale = 1 }) {
  const color = shadeColor(0x4a3c30, 0.8 + rand() * 0.3);
  batch.wood.prism({ cx: x, cy: y - 0.1, cz: z, radiusBottom: 0.24 * scale, radiusTop: 0.12 * scale, height: 3.2 * scale, sides: 5, color, rand, rotY: rand() * 3 });
  for (let i = 0; i < 3; i += 1) {
    const a = rand() * Math.PI * 2;
    const h = (1.6 + rand() * 1.2) * scale;
    batch.wood.prism({ cx: x + Math.cos(a) * 0.5 * scale, cy: y + h, cz: z + Math.sin(a) * 0.5 * scale, radiusBottom: 0.08 * scale, radiusTop: 0.03 * scale, height: 1.5 * scale, sides: 4, color, rand, rotY: a });
  }
}

/**
 * Build the land round a fortress. footprint: [minX, maxX, minZ, maxZ] of everything playable (its walls included);
 * floorY: the arena's ground level. Returns the meshes added (for disposal) and the sky.
 */
export function buildBackdrop(group, {
  footprint, floorY = 0, sky, mood = BACKDROP_MOODS.dusk, seed = 1, radius = 330, depth = 18, materials,
}) {
  const rand = seededRandom(seed);
  const batch = createBatch();
  const [minX, maxX, minZ, maxZ] = footprint;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const top = floorY - 0.32;
  const valleyY = floorY - depth;
  // how far (x, z) lies outside the footprint (0 within it)
  const outside = (x, z) => Math.hypot(Math.max(0, minX - x, x - maxX), Math.max(0, minZ - z, z - maxZ));
  const skirt = 10; // the cliff's foot spreads this far out
  const heightAt = (x, z) => {
    const d = outside(x, z);
    const roll = (valueNoise(x * 0.025, z * 0.025, seed) - 0.5) * 7 + (valueNoise(x * 0.08, z * 0.08, seed + 3) - 0.5) * 2;
    const hills = smooth((d - 60) / 170) * (26 + valueNoise(x * 0.012, z * 0.012, seed + 7) * 34);
    return valleyY + roll * smooth((d - skirt) / 25) + hills;
  };
  const [grassA, grassB, grassC] = mood.grass;
  const colorAt = (x, y, z) => {
    const n = valueNoise(x * 0.04, z * 0.04, seed + 11);
    // fields: long strips in patches (a farmed march), else the land's own patchwork
    const field = mood.farms ? Math.floor(valueNoise(x * 0.012, z * 0.02, seed + 13) * 6) : -1;
    let color = n < 0.33 ? grassA : n < 0.66 ? grassB : grassC;
    if (field === 2) color = shadeColor(0xa08c55, 0.9 + valueNoise(x * 0.3, 0, seed) * 0.15);
    else if (field === 4) color = shadeColor(mood.earth, 1.05);
    const rise = (y - valleyY) / 40;
    if (rise > 0.6) color = shadeColor(mood.rock[0], 0.95 + n * 0.15);
    return shadeColor(color, 0.92 + valueNoise(x * 0.5, z * 0.5, seed + 17) * 0.16);
  };

  // the plateau: rock walls from just under the arena's edge down to the valley, splayed and broken
  const corners = [[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ]];
  for (let side = 0; side < 4; side += 1) {
    const [ax, az] = corners[side];
    const [bx, bz] = corners[(side + 1) % 4];
    const length = Math.hypot(bx - ax, bz - az);
    const segments = Math.max(2, Math.round(length / 3));
    const out = [(bz - az) / length, -(bx - ax) / length]; // outward, for a counter-clockwise ring seen from above
    const ring = [];
    for (let i = 0; i <= segments; i += 1) {
      const t = i / segments;
      const [x, z] = [lerp(ax, bx, t), lerp(az, bz, t)];
      const spread = skirt * (0.55 + rand() * 0.45);
      const mid = 0.4 + rand() * 0.25;
      const shelf = spread * (0.25 + rand() * 0.2);
      ring.push([
        [x, top, z],
        [x + out[0] * shelf, lerp(top, valleyY, mid), z + out[1] * shelf],
        [x + out[0] * spread, heightAt(x + out[0] * spread, z + out[1] * spread) - 0.5, z + out[1] * spread],
      ]);
    }
    for (let i = 0; i < segments; i += 1) {
      for (let k = 0; k < 2; k += 1) {
        const tone = shadeColor(mood.rock[k], 0.85 + rand() * 0.3);
        batch.stone.quad(ring[i][k], ring[i + 1][k], ring[i + 1][k + 1], ring[i][k + 1], tone);
      }
    }
  }
  // the plateau's hollow under the arena, floored with rock at the valley's level: a pit in the arena (past its abyss)
  // looks down onto rock far below, not into the sky's underside
  batch.stone.quad([minX, valleyY, minZ], [minX, valleyY, maxZ], [maxX, valleyY, maxZ], [maxX, valleyY, minZ], shadeColor(mood.rock[1], 0.7));
  // the valley and its hills, round the plateau
  outerTerrain(batch, {
    minX: cx - radius, maxX: cx + radius, minZ: cz - radius, maxZ: cz + radius, cell: 7,
    heightAt, colorAt: (x, y, z) => colorAt(x, y, z),
    exclude: (x, z) => outside(x, z) < skirt * 0.6 || Math.hypot(x - cx, z - cz) > radius,
  });
  // woods and copses: trees in clumps out in the valley
  const kinds = mood.trees;
  for (let n = 0; n < mood.treeCount; n += 1) {
    const a = rand() * Math.PI * 2;
    const r = lerp(Math.max(maxX - minX, maxZ - minZ) * 0.5 + 25, radius * 0.75, Math.pow(rand(), 0.8));
    const clump = 1 + Math.floor(rand() * 4);
    for (let k = 0; k < clump; k += 1) {
      const x = cx + Math.cos(a) * r + (rand() - 0.5) * 9;
      const z = cz + Math.sin(a) * r + (rand() - 0.5) * 9;
      if (outside(x, z) < skirt + 6) continue;
      const kind = kinds[Math.floor(rand() * kinds.length)];
      const scale = 1.6 + rand() * 1.4;
      if (kind === 'dead') deadTree(batch, rand, { x, y: heightAt(x, z), z, scale });
      else tree(batch, rand, { x, y: heightAt(x, z), z, scale, kind });
    }
  }
  // boulders strewn below the cliffs and over the hills
  for (let n = 0; n < mood.rocks; n += 1) {
    const a = rand() * Math.PI * 2;
    const r = lerp(Math.max(maxX - minX, maxZ - minZ) * 0.5 + 12, radius * 0.6, rand());
    const [x, z] = [cx + Math.cos(a) * r, cz + Math.sin(a) * r];
    if (outside(x, z) < skirt) continue;
    const s = 0.8 + rand() * 2.6;
    batch.stone.lump({ cx: x, cy: heightAt(x, z) + s * 0.35, cz: z, rx: s, ry: s * 0.7, rz: s * (0.8 + rand() * 0.4), color: shadeColor(mood.rock[n % 2], 0.85 + rand() * 0.3), rand, squash: 0.2 });
  }
  // the far mountains: a ring of broad faceted peaks, paled by distance
  for (let n = 0; n < 16; n += 1) {
    const a = (n / 16) * Math.PI * 2 + rand() * 0.3;
    const r = radius * (0.92 + rand() * 0.2);
    const [x, z] = [cx + Math.cos(a) * r, cz + Math.sin(a) * r];
    const h = 60 + rand() * 70;
    batch.stone.prism({ cx: x, cy: heightAt(x, z) - 6, cz: z, radiusBottom: 45 + rand() * 40, radiusTop: 2 + rand() * 6, height: h, sides: 5 + Math.floor(rand() * 3), color: shadeColor(mood.far, 0.85 + rand() * 0.25), rand, rotY: rand() * 3 });
  }
  // other forges on the horizon: chimneys with a glow at their tops (the forge country only)
  const glows = [];
  if (mood.chimneys) {
    for (let n = 0; n < 7; n += 1) {
      const a = rand() * Math.PI * 2;
      const r = radius * (0.45 + rand() * 0.3);
      const [x, z] = [cx + Math.cos(a) * r, cz + Math.sin(a) * r];
      const y = heightAt(x, z);
      const h = 18 + rand() * 16;
      batch.stone.prism({ cx: x, cy: y, cz: z, radiusBottom: 2.6, radiusTop: 1.7, height: h, sides: 6, color: shadeColor(0x3a3230, 0.9 + rand() * 0.2), rand });
      batch.stone.block({ cx: x + 4, cy: y, cz: z + 1, sx: 9, sy: 6, sz: 7, chamfer: 0.1, jitter: 0.1, color: shadeColor(0x3d3532, 1), rand });
      glows.push([x, y + h + 0.6, z]);
    }
  }

  const added = [];
  const own = materials;
  for (const [name, builder] of Object.entries(batch)) {
    if (!builder.triangleCount) continue;
    const mesh = facetMesh(builder, own[name], { castShadow: false, receiveShadow: name === 'stone', name: `backdrop-${name}` });
    group.add(mesh);
    added.push(mesh);
  }
  const dome = skyDome(sky, radius * 1.35);
  group.add(dome);
  added.push(dome);
  return { meshes: added, sky: dome, glows, heightAt };
}

/** The view distance and fog an arena with a backdrop wants: far enough to see its hills, the fog its horizon's. */
export function backdropLighting(lighting, { radius = 330, density = 0.0026 } = {}) {
  // (the haze is the horizon's colour drawn halfway to the zenith's and greyed: the horizon's own, at full strength,
  // washed the whole arena orange)
  const haze = new THREE.Color(lighting.sky?.horizon ?? lighting.fog.color)
    .lerp(new THREE.Color(lighting.sky?.zenith ?? lighting.fog.color), 0.45);
  const grey = (haze.r + haze.g + haze.b) / 3;
  haze.lerp(new THREE.Color(grey, grey, grey), 0.35);
  return Object.freeze({
    ...lighting,
    cameraFar: radius * 1.6,
    background: haze.getHex(),
    fog: Object.freeze({ color: haze.getHex(), density }),
  });
}

export { P as BACKDROP_PALETTE };
