import * as THREE from 'three';
import { CASTLEWARD } from '../../shared/worlds/castleward.mjs';
import { buildCastlewardDecorPlan, insideCastlewardFootprint } from './castlewardDecor.mjs';
import { buildCastlewardTerrainSkirts } from './castlewardTerrain.mjs';
import { FacetBuilder, KIT_PALETTE as P, facetMesh, kitMaterials, seededRandom, shadeColor, valueNoise } from './kit/facetKit.mjs';
import { banner, brazier, cottage, createBatch, hedgerow, masonry, palisade, runeStone, sconce, tree } from './kit/kitPieces.mjs';
import { floorTile, outerTerrain, scatterGroundDetail } from './kit/kitTerrain.mjs';
import { archeryTarget, barrel, crate, flowers, lanternPost, pavilion, pennant, sacks, strawBales, weaponRack, woodpile } from './kit/kitProps.mjs';
import { everywhere } from '../game/viewLayers.mjs';

// Late afternoon over Castleward: a warm low sun, a neutral sky fill and a honey haze. The game runtime applies the
// hemisphere and sun from here (the other worlds keep the default moonlit presentation).
export const CASTLEWARD_LIGHTING = Object.freeze({
  background: 0xd6c3a0,
  fog: Object.freeze({ color: 0xcdb898, density: 0.0115 }),
  // a warm fill: the armour kit's colours are calibrated under a warm key, and a cool sky turns steel violet
  hemisphere: Object.freeze({ skyColor: 0xe8dcc2, groundColor: 0x6d5c46, intensity: 1.8 }),
  sun: Object.freeze({ color: 0xffd6a0, intensity: 2.9, position: Object.freeze([-22, 19, -13]) }),
  sky: Object.freeze({ zenith: 0x7d96ab, horizon: 0xeed4aa, below: 0xa39b86 }),
});

const RAVINE = Object.freeze({ north: -24.3, south: -37.8, depth: -16 });

function box(center, size) {
  return { center, size };
}

export class CastlewardRenderer {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'Castleward';
    this.decor = buildCastlewardDecorPlan(1337);
    this.flames = [];
    this.torchLights = [];
    this.banners = [];
    this.runes = [];
    this.lighting = CASTLEWARD_LIGHTING;
    // this renderer draws its own cliffs under every floor (see #skirts)
    this.ownsTerrainSkirts = true;
    scene.background = new THREE.Color(CASTLEWARD_LIGHTING.background);
    scene.fog = new THREE.FogExp2(CASTLEWARD_LIGHTING.fog.color, CASTLEWARD_LIGHTING.fog.density);
    scene.add(this.group);
    this.#build();
  }

  #build() {
    this.materials = kitMaterials();
    const rand = seededRandom(1337);
    const batch = createBatch();
    this.solidsById = new Map(CASTLEWARD.solids.map((solid) => [solid.id, solid]));

    // each floor leaves out what an earlier one at the same height already covers (no shared, flickering planes)
    CASTLEWARD.floors.forEach((floor, index) => {
      const covers = CASTLEWARD.floors.slice(0, index).filter((other) => Math.abs(other.y - floor.y) < 1e-6).map((other) => ({
        minX: other.center[0] - other.size[0] / 2, maxX: other.center[0] + other.size[0] / 2,
        minZ: other.center[2] - other.size[2] / 2, maxZ: other.center[2] + other.size[2] / 2,
      }));
      floorTile(batch, floor, this.decor.paths, rand, covers, (x, z) => this.#groundShade(x, z, floor.y));
    });
    // tufts, pebbles and a few flowers over the grass and earth (their own seeded stream: the rest of the build is
    // unchanged by them)
    scatterGroundDetail(batch, { floors: CASTLEWARD.floors, paths: this.decor.paths, solids: CASTLEWARD.solids, seed: 4242 });
    for (const ramp of CASTLEWARD.ramps) this.#ramp(batch, rand, ramp);
    for (const solid of CASTLEWARD.solids) this.#solid(batch, rand, solid);
    this.#castle(batch, rand);
    this.#bridge(batch, rand);
    this.#skirts(batch, rand);
    this.#landscape(batch, rand);
    this.#scenery(batch, rand);
    this.#fire(batch, rand);
    this.#props(batch, rand);
    for (const spec of this.decor.banners) {
      const mesh = banner(batch, rand, spec);
      this.group.add(mesh);
      this.banners.push(mesh);
    }
    this.#sky();

    const shadowless = new Set(['ground']);
    for (const [name, builder] of Object.entries(batch)) {
      if (!builder.triangleCount) continue;
      this.group.add(facetMesh(builder, this.materials[name], { castShadow: !shadowless.has(name), receiveShadow: true, name: `castleward-${name}` }));
    }
  }

  // the ground at the foot of a wall, a house or a hedge is darker (the lee of it: shade, damp, trodden dirt), fading
  // out over a metre or so
  #groundShade(x, z, y) {
    let factor = 1;
    for (const solid of CASTLEWARD.solids) {
      const bottom = solid.center[1] - solid.size[1] / 2;
      if (Math.abs(bottom - y) > 0.8) continue;
      const dx = Math.max(0, Math.abs(x - solid.center[0]) - solid.size[0] / 2);
      const dz = Math.max(0, Math.abs(z - solid.center[2]) - solid.size[2] / 2);
      const d = Math.hypot(dx, dz);
      if (d >= 1.2) continue;
      const t = d / 1.2;
      factor = Math.min(factor, 1 - 0.2 * (1 - t * t * (3 - 2 * t)));
    }
    return factor;
  }

  // a paved slope with masonry cheeks down to the ground on both sides
  #ramp(batch, rand, ramp) {
    const alongZ = ramp.axis === 'z';
    const [a0, a1] = alongZ ? [ramp.minZ, ramp.maxZ] : [ramp.minX, ramp.maxX];
    const [c0, c1] = alongZ ? [ramp.minX, ramp.maxX] : [ramp.minZ, ramp.maxZ];
    const heightAt = (a) => ramp.startY + (ramp.endY - ramp.startY) * ((a - a0) / (a1 - a0));
    const point = (a, c, y) => (alongZ ? [c, y, a] : [a, y, c]);
    const rows = Math.max(2, Math.round((a1 - a0) / 0.7));
    const cols = Math.max(2, Math.round((c1 - c0) / 0.9));
    for (let i = 0; i < rows; i += 1) {
      const aa = a0 + ((a1 - a0) * i) / rows;
      const ab = a0 + ((a1 - a0) * (i + 1)) / rows;
      for (let j = 0; j < cols; j += 1) {
        const ca = c0 + ((c1 - c0) * j) / cols;
        const cb = c0 + ((c1 - c0) * (j + 1)) / cols;
        const tone = shadeColor(P.paving, 0.84 + ((i * 3 + j * 7) % 5) * 0.045 + (rand() - 0.5) * 0.05);
        const quad = [point(aa, ca, heightAt(aa)), point(ab, ca, heightAt(ab)), point(ab, cb, heightAt(ab)), point(aa, cb, heightAt(aa))];
        if (alongZ) batch.ground.quad(quad[0], quad[1], quad[2], quad[3], tone);
        else batch.ground.quad(quad[0], quad[3], quad[2], quad[1], tone);
      }
    }
    // cheeks: stone faces from the ground (or the lower floor) up to the slope, each side
    const low = Math.min(ramp.startY, ramp.endY) - 0.3;
    for (const [c, sign] of [[c0, -1], [c1, 1]]) {
      const steps = rows;
      for (let i = 0; i < steps; i += 1) {
        const aa = a0 + ((a1 - a0) * i) / steps;
        const ab = a0 + ((a1 - a0) * (i + 1)) / steps;
        const tone = shadeColor(P.stone, 0.88 + (rand() - 0.5) * 0.12);
        const q = [point(aa, c, low), point(ab, c, low), point(ab, c, heightAt(ab)), point(aa, c, heightAt(aa))];
        // outward-facing on each side
        if ((sign > 0) === alongZ) batch.stone.quad(q[1], q[0], q[3], q[2], tone);
        else batch.stone.quad(q[0], q[1], q[2], q[3], tone);
      }
    }
  }

  #solid(batch, rand, solid) {
    const kind = solid.kind ?? '';
    const id = solid.id;
    if (kind === 'footing') return;                           // hidden inside the ramp
    if (kind === 'brazier') return;                           // drawn with the fire
    if (kind === 'rune-stone') {
      const spec = this.decor.runeStones.find((item) => item.id === id);
      const [x, y, z] = solid.center;
      const rune = runeStone(batch, rand, this.materials.rune, { x, y: y - solid.size[1] / 2, z, facing: spec?.facing ?? 0, height: solid.size[1] });
      this.group.add(rune);
      this.runes.push(rune);
      return;
    }
    if (kind === 'palisade') return palisade(batch, rand, solid);
    if (kind === 'hedge' || solid.material === 'hedge') return hedgerow(batch, rand, solid);
    if (kind === 'field-wall' || kind === 'bank') return masonry(batch, rand, solid, { style: 'drystone', color: P.stone });
    if (kind === 'parapet') return masonry(batch, rand, solid, { style: 'drystone', color: P.stoneLight });
    if (kind === 'lip') {
      masonry(batch, rand, solid, { style: 'rubble', coping: false, color: solid.hazard ? P.stoneDark : P.stoneLight });
      return;
    }
    if (kind === 'balustrade') return masonry(batch, rand, solid, { merlons: true, merlonHeight: 0.4, color: P.stoneLight });
    if (kind === 'bales') return strawBales(batch, rand, solid);
    // the pavilion's door looks out over the Tourney Field
    if (kind === 'pavilion') return pavilion(batch, rand, solid, { door: Math.atan2(14.5 - solid.center[0], -15.2 - solid.center[2]) });
    if (kind === 'gatepost') {
      masonry(batch, rand, solid, { coping: false, color: P.stoneLight });
      const [x, y, z] = solid.center;
      batch.stone.block({ cx: x, cy: y + solid.size[1] / 2, cz: z, sx: solid.size[0] + 0.14, sy: 0.16, sz: solid.size[2] + 0.14, chamfer: 0.04, jitter: 0, color: P.stoneLight, rand });
      batch.stone.prism({ cx: x, cy: y + solid.size[1] / 2 + 0.16, cz: z, radiusBottom: 0.24, radiusTop: 0.05, height: 0.3, sides: 4, color: P.stone, rand, rotY: Math.PI / 4 });
      return;
    }
    if (kind === 'curtain') return masonry(batch, rand, solid, { merlons: solid.size[1] > 3, color: P.stone });
    if (id.startsWith('bailey-') && id.endsWith('-wall')) return masonry(batch, rand, solid, { merlons: true, color: P.stone });
    if (id.startsWith('castle-gate-')) return this.#gateTower(batch, rand, solid, 6.6);
    if (id.startsWith('south-gate-')) return this.#gateTower(batch, rand, solid, 5.4);
    if (id.startsWith('west-house-')) {
      const roof = id === 'west-house-south' ? 'slate' : 'thatch';
      return cottage(batch, rand, solid, { roof, door: id === 'west-house-south' ? '+z' : '-z' });
    }
    if (id === 'market-well') return this.#well(batch, rand, solid);
    if (id === 'market-stall-base') return this.#stall(batch, rand, solid);
    if (id.startsWith('chapel-')) return this.#ruin(batch, rand, solid);
    masonry(batch, rand, solid, { style: 'drystone' });
  }

  // gate towers fill their solid, then rise past it with arrow slits and a crenellated crown
  #gateTower(batch, rand, solid, topY) {
    masonry(batch, rand, solid, { coping: false, color: P.stone });
    const [cx, cy, cz] = solid.center;
    const [sx, sy, sz] = solid.size;
    const top = cy + sy / 2;
    masonry(batch, rand, box([cx, (top + topY) / 2, cz], [sx + 0.1, topY - top, sz + 0.1]), { merlons: true, color: P.stoneLight });
    batch.stone.block({ cx, cy: top - 0.05, cz, sx: sx + 0.3, sy: 0.18, sz: sz + 0.3, chamfer: 0.05, jitter: 0, color: P.stoneLight, rand });
    for (const dz of [-1, 1]) {
      batch.wood.block({ cx, cy: top + 0.5, cz: cz + dz * (sz / 2 + 0.06), sx: 0.14, sy: 0.9, sz: 0.04, chamfer: 0, jitter: 0, color: 0x1f1a16, rand });
    }
  }

  #well(batch, rand, solid) {
    const [cx, cy, cz] = solid.center;
    const bottom = cy - solid.size[1] / 2;
    batch.stone.prism({ cx, cy: bottom, cz, radiusBottom: 0.9, radiusTop: 0.86, height: 0.95, sides: 9, color: P.stone, rand });
    batch.ground.prism({ cx, cy: bottom + 0.8, cz, radiusBottom: 0.7, radiusTop: 0.7, height: 0.02, sides: 9, color: 0x2c3a3c, rand });
    for (const dx of [-0.78, 0.78]) batch.wood.block({ cx: cx + dx, cy: bottom + 0.9, cz, sx: 0.12, sy: 1.5, sz: 0.12, chamfer: 0.02, jitter: 0, color: P.timberDark, rand });
    batch.wood.block({ cx, cy: bottom + 2.2, cz, sx: 1.8, sy: 0.1, sz: 0.1, chamfer: 0.01, jitter: 0, color: P.timber, rand });
    batch.stone.roof({ cx, cy: bottom + 2.3, cz, sx: 1.5, sz: 1.3, height: 0.8, overhang: 0.2, ridge: 0.4, color: P.slate, rand });
  }

  #stall(batch, rand, solid) {
    const [cx, cy, cz] = solid.center;
    const [sx, sy, sz] = solid.size;
    const bottom = cy - sy / 2;
    batch.wood.block({ cx, cy: bottom, cz, sx, sy: sy - 0.08, sz, chamfer: 0.03, jitter: 0, color: P.timber, rand });
    batch.wood.block({ cx, cy: bottom + sy - 0.1, cz, sx: sx + 0.1, sy: 0.1, sz: sz + 0.1, chamfer: 0.02, jitter: 0, color: P.timberDark, rand });
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      batch.wood.block({ cx: cx + dx * (sx / 2 - 0.06), cy: bottom, cz: cz + dz * (sz / 2 - 0.06), sx: 0.1, sy: 2.25, sz: 0.1, chamfer: 0.01, jitter: 0, color: P.timberDark, rand });
    }
    // striped awning, sloping toward the green
    const stripes = 6;
    for (let i = 0; i < stripes; i += 1) {
      const x0 = cx - (sx + 0.4) / 2 + ((sx + 0.4) * i) / stripes;
      const x1 = x0 + (sx + 0.4) / stripes;
      const color = i % 2 ? P.cream : P.crimson;
      const back = [cz + sz / 2 + 0.2, bottom + 2.35];
      const front = [cz - sz / 2 - 0.35, bottom + 1.95];
      batch.cloth.quad([x0, back[1], back[0]], [x1, back[1], back[0]], [x1, front[1], front[0]], [x0, front[1], front[0]], color);
    }
    // wares: a few crates and a basket of apples under the counter
    batch.wood.block({ cx: cx + sx / 2 + 0.35, cy: bottom, cz: cz + 0.4, sx: 0.55, sy: 0.5, sz: 0.55, rotY: 0.3, chamfer: 0.02, jitter: 0, color: P.timber, rand });
    batch.foliage.lump({ cx: cx - 0.5, cy: bottom + sy + 0.12, cz, rx: 0.32, ry: 0.14, rz: 0.24, color: 0x9a3b2a, rand, squash: 0.3 });
  }

  // chapel ruins: weathered ashlar with a broken, stepped top
  #ruin(batch, rand, solid) {
    const [cx, cy, cz] = solid.center;
    const [sx, sy, sz] = solid.size;
    const bottom = cy - sy / 2;
    masonry(batch, rand, box([cx, bottom + sy * 0.4, cz], [sx, sy * 0.8, sz]), { coping: false, color: P.stoneLight });
    const alongX = sx >= sz;
    const length = alongX ? sx : sz;
    const pieces = Math.max(1, Math.round(length / 0.9));
    for (let i = 0; i < pieces; i += 1) {
      const t = -length / 2 + (i + 0.5) * (length / pieces);
      const h = sy * 0.2 * (0.35 + 0.65 * valueNoise(i * 0.7, cx, 3));
      const [x, z] = alongX ? [cx + t, cz] : [cx, cz + t];
      batch.stone.block({ cx: x, cy: bottom + sy * 0.8, cz: z, sx: alongX ? length / pieces - 0.03 : sx, sy: h, sz: alongX ? sz : length / pieces - 0.03, chamfer: 0.08, jitter: 0.05, color: P.stoneLight, rand, shade: 0.18 });
    }
  }

  // the castle beyond the playable walls: bailey plinth, corner towers, the keep and the gate arch
  #castle(batch, rand) {
    // the Bailey stands on a masonry plinth
    masonry(batch, rand, box([-9.15, 1.0, 22.0], [0.52, 3.0, 8.5]), { coping: false, color: P.stoneDark });
    masonry(batch, rand, box([9.15, 1.0, 22.0], [0.52, 3.0, 8.5]), { coping: false, color: P.stoneDark });
    masonry(batch, rand, box([0, 1.0, 26.25], [18.8, 3.0, 0.52]), { coping: false, color: P.stoneDark });
    // gate arch over the ramp with a raised portcullis
    masonry(batch, rand, box([0, 5.1, 15.8], [8.4, 1.0, 1.4]), { merlons: true, color: P.stoneLight });
    for (let i = -3; i <= 3; i += 1) {
      batch.metal.prism({ cx: i * 0.55, cy: 4.3, cz: 15.8, radiusBottom: 0.035, radiusTop: 0.05, height: 0.3, sides: 4, color: P.iron, rand });
    }
    batch.metal.block({ cx: 0, cy: 4.52, cz: 15.8, sx: 4.0, sy: 0.08, sz: 0.1, chamfer: 0, jitter: 0, color: P.iron, rand });
    // corner towers
    for (const [x, z, h] of [[-10.2, 26.9, 9.5], [10.2, 26.9, 9.5], [-10.2, 17.3, 7.8], [10.2, 17.3, 7.8]]) {
      batch.stone.prism({ cx: x, cy: -0.4, cz: z, radiusBottom: 1.2, radiusTop: 1.05, height: h, sides: 8, color: P.stone, rand, rotY: 0.2 });
      for (let k = 0; k < 8; k += 1) {
        const a = (k / 8) * Math.PI * 2 + 0.2;
        batch.stone.block({ cx: x + Math.cos(a) * 1.02, cy: h - 0.4, cz: z + Math.sin(a) * 1.02, sx: 0.5, sy: 0.55, sz: 0.34, rotY: -a + Math.PI / 2, chamfer: 0.04, jitter: 0.01, color: P.stoneLight, rand });
      }
      batch.stone.prism({ cx: x, cy: h - 0.35, cz: z, radiusBottom: 1.25, radiusTop: 0, height: 2.8, sides: 8, color: P.slate, rand, rotY: 0.2 });
    }
    // the keep rises behind the Bailey
    masonry(batch, rand, box([0, 6.5, 31.5], [11, 13, 8]), { merlons: true, merlonHeight: 0.8, color: P.stone });
    masonry(batch, rand, box([2.2, 15.0, 32.2], [5, 4, 4.5]), { merlons: true, color: P.stoneLight });
    batch.stone.prism({ cx: -3.4, cy: 12.5, cz: 29.4, radiusBottom: 1.2, radiusTop: 1.0, height: 6.5, sides: 8, color: P.stone, rand });
    batch.stone.prism({ cx: -3.4, cy: 18.9, cz: 29.4, radiusBottom: 1.35, radiusTop: 0, height: 3.6, sides: 8, color: P.slate, rand });
    batch.stone.roof({ cx: 2.2, cy: 17.0, cz: 32.2, sx: 5.2, sz: 4.7, height: 3.2, overhang: 0.25, ridge: 1.2, color: P.slate, rand });
    for (const [x, y] of [[-3.5, 7.5], [3.5, 7.5], [-3.5, 10.5], [3.5, 10.5], [0, 4.5]]) {
      batch.wood.block({ cx: x, cy: y, cz: 27.45, sx: 0.5, sy: 1.1, sz: 0.05, chamfer: 0, jitter: 0, color: 0x221c17, rand });
    }
  }

  // the Broken Bridge: a deck over the ravine that ends in torn masonry; its far half hangs from the other bank
  #bridge(batch, rand) {
    const deck = (z0, z1) => {
      masonry(batch, rand, box([0, -0.55, (z0 + z1) / 2], [6, 0.5, Math.abs(z1 - z0)]), { coping: false, color: P.stoneDark });
    };
    deck(-24, -28);
    deck(-37.8, -33.6);
    for (const z of [-25.8, -35.8]) masonry(batch, rand, box([0, (RAVINE.depth - 0.8) / 2, z], [2.4, -RAVINE.depth - 0.8, 1.6]), { coping: false, color: P.stoneDark });
    // torn ends: jagged stones hanging off each broken edge
    for (const [z, dir] of [[-28.1, -1], [-33.5, 1]]) {
      for (let i = 0; i < 7; i += 1) {
        const x = -2.6 + i * 0.87;
        batch.stone.block({ cx: x, cy: -0.9 - rand() * 0.6, cz: z + dir * rand() * 0.35, sx: 0.7, sy: 0.4 + rand() * 0.7, sz: 0.5, rotY: rand() - 0.5, chamfer: 0.1, jitter: 0.1, color: P.stoneDark, rand, shade: 0.2 });
      }
    }
  }

  // rock cliffs under every floor, reaching down toward the abyss (seen at the ravine and under the bridge)
  #skirts(batch, rand) {
    for (const skirt of buildCastlewardTerrainSkirts(CASTLEWARD)) {
      // raised castle floors stand on their own masonry
      if (skirt.floorY > 0.5) continue;
      const [cx, cy, cz] = skirt.center;
      const [sx, sy, sz] = skirt.size;
      const top = cy + sy / 2;
      const bottom = cy - sy / 2;
      const x0 = cx - sx / 2; const x1 = cx + sx / 2; const z0 = cz - sz / 2; const z1 = cz + sz / 2;
      const bands = 4;
      for (let b = 0; b < bands; b += 1) {
        const ya = top - ((top - bottom) * b) / bands;
        const yb = top - ((top - bottom) * (b + 1)) / bands;
        const tone = shadeColor(b % 2 ? P.cliff : P.cliffDark, 0.9 + (rand() - 0.5) * 0.12);
        batch.ground.quad([x1, yb, z0], [x0, yb, z0], [x0, ya, z0], [x1, ya, z0], tone);
        batch.ground.quad([x0, yb, z1], [x1, yb, z1], [x1, ya, z1], [x0, ya, z1], tone);
        batch.ground.quad([x0, yb, z0], [x0, yb, z1], [x0, ya, z1], [x0, ya, z0], tone);
        batch.ground.quad([x1, yb, z1], [x1, yb, z0], [x1, ya, z0], [x1, ya, z1], tone);
      }
    }
  }

  // height of the land outside the walls: level near them, rolling hills farther out, the ravine to the south
  heightAt(x, z) {
    const ravineEdge = Math.min(RAVINE.north - z, z - RAVINE.south);
    if (ravineEdge > 0) {
      const t = Math.min(1, ravineEdge / 1.4);
      return RAVINE.depth * t + (valueNoise(x * 0.4, z * 0.4, 5) - 0.5) * 1.2 * t;
    }
    let d = Infinity;
    for (const floor of CASTLEWARD.floors) {
      if (floor.id === 'broken-bridge') continue;
      const dx = Math.max(0, Math.abs(x - floor.center[0]) - floor.size[0] / 2);
      const dz = Math.max(0, Math.abs(z - floor.center[2]) - floor.size[2] / 2);
      d = Math.min(d, Math.hypot(dx, dz));
    }
    if (d < 2) return -0.06;
    const rise = Math.min(1, (d - 2) / 30);
    const hills = valueNoise(x * 0.045, z * 0.045, 9) * 9 + valueNoise(x * 0.12, z * 0.12, 4) * 2.2;
    return -0.06 + rise * rise * hills + (d - 2) * 0.03;
  }

  #landscape(batch, rand) {
    outerTerrain(batch, {
      minX: -95, maxX: 95, minZ: -95, maxZ: 95, cell: 2.5,
      heightAt: (x, z) => this.heightAt(x, z),
      exclude: (x, z) => insideCastlewardFootprint(x, z, -0.7, { skip: ['broken-bridge'] }),
      colorAt: (x, y, z) => {
        if (y < -1.5) return shadeColor(y < -9 ? P.cliffDark : P.cliff, 0.85 + (rand() - 0.5) * 0.14);
        const n = valueNoise(x * 0.3, z * 0.3, 21);
        const base = y > 5 ? P.grassDark : n > 0.6 ? P.grassLight : n < 0.28 ? P.grassDark : P.grass;
        return shadeColor(base, 0.9 + (rand() - 0.5) * 0.1);
      },
    });
  }

  #scenery(batch, rand) {
    for (const item of [...this.decor.trees, ...this.decor.forest]) {
      tree(batch, rand, { x: item.x, y: this.heightAt(item.x, item.z), z: item.z, scale: item.scale, kind: item.kind });
    }
    for (const house of this.decor.houses) {
      const y = this.heightAt(house.x, house.z);
      cottage(batch, rand, box([house.x, y + house.sy / 2 - 0.1, house.z], [house.sx, house.sy, house.sz]), { roof: house.roof, door: '+z' });
    }
  }

  #fire(batch, rand) {
    const addFlame = (position, light, scale = 1) => this.#flame(position, light, scale);
    for (const torch of this.decor.torches) addFlame(sconce(batch, rand, torch), torch.light);
    for (const spec of this.decor.braziers) {
      const solid = this.solidsById.get(spec.id);
      if (!solid) continue;
      const [x, y, z] = solid.center;
      addFlame(brazier(batch, rand, { x, y: y - solid.size[1] / 2, z }), spec.light, 1.8);
    }
  }

  // a flame with its glow (and, for a few, a real light: they are dear on phones)
  #flame(position, light, scale = 1) {
    this.flameGeometry ??= new THREE.OctahedronGeometry(0.13, 0);
    this.glowGeometry ??= new THREE.SphereGeometry(0.4, 12, 8);
    const flame = new THREE.Mesh(this.flameGeometry, this.materials.flame);
    flame.position.set(...position);
    flame.scale.setScalar(scale);
    flame.userData.baseY = position[1];
    flame.userData.scale = scale;
    flame.userData.phase = this.flames.length * 1.27;
    this.group.add(flame);
    this.flames.push(flame);
    const glow = new THREE.Mesh(this.glowGeometry, this.materials.glow);
    glow.position.set(...position);
    glow.scale.setScalar(scale);
    this.group.add(glow);
    if (light) {
      const point = everywhere(new THREE.PointLight(0xffa24c, 3.2, 7.5, 2));
      point.position.set(position[0], position[1] + 0.2, position[2]);
      point.userData.phase = flame.userData.phase;
      this.group.add(point);
      this.torchLights.push(point);
    }
  }

  // the lived-in things (the world's props, shared/worlds/castleward.mjs): each against a wall, a post or a hedge
  #props(batch, rand) {
    for (const prop of CASTLEWARD.props) {
      if (prop.kind === 'barrel') barrel(batch, rand, prop);
      else if (prop.kind === 'crate') crate(batch, rand, prop);
      else if (prop.kind === 'woodpile') woodpile(batch, rand, prop);
      else if (prop.kind === 'sacks') sacks(batch, rand, prop);
      else if (prop.kind === 'flowers') flowers(batch, rand, prop);
      else if (prop.kind === 'target') archeryTarget(batch, rand, prop);
      else if (prop.kind === 'rack') weaponRack(batch, rand, prop);
      else if (prop.kind === 'lantern') this.#flame(lanternPost(batch, rand, prop), false, 0.55);
      else if (prop.kind === 'pennant') {
        // raised from the top of the gatepost it stands on
        const post = CASTLEWARD.solids.find((solid) => Math.abs(solid.center[0] - prop.x) < 0.1 && Math.abs(solid.center[2] - prop.z) < 0.1);
        const base = post ? post.center[1] + post.size[1] / 2 + 0.3 : 0;
        pennant(batch, rand, { x: prop.x, y: base, z: prop.z, height: prop.height - base, facing: Math.PI / 2 });
      }
    }
  }

  #sky() {
    // inside the camera's far plane from anywhere in the arena
    const geometry = new THREE.SphereGeometry(140, 24, 12);
    const colors = [];
    const { zenith, horizon, below } = CASTLEWARD_LIGHTING.sky;
    const cz = new THREE.Color(zenith);
    const ch = new THREE.Color(horizon);
    const cb = new THREE.Color(below);
    const position = geometry.getAttribute('position');
    for (let i = 0; i < position.count; i += 1) {
      const t = position.getY(i) / 140;
      const color = t >= 0 ? ch.clone().lerp(cz, Math.pow(t, 0.6)) : ch.clone().lerp(cb, Math.min(1, -t * 3));
      colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const sky = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.name = 'castleward-sky';
    sky.renderOrder = -1;
    this.sky = sky;
    this.group.add(sky);
  }

  update(timeSec, camera = null) {
    for (const flame of this.flames) {
      const pulse = 0.9 + Math.sin(timeSec * 8.3 + flame.userData.phase) * 0.07 + Math.sin(timeSec * 13.1 + flame.userData.phase * 2) * 0.04;
      const s = flame.userData.scale;
      flame.scale.set(pulse * s, (1.15 + (pulse - 1) * 1.6) * s, pulse * s);
      flame.position.y = flame.userData.baseY + Math.sin(timeSec * 6 + flame.userData.phase) * 0.02;
    }
    for (const light of this.torchLights) {
      light.intensity = 3.0 + Math.sin(timeSec * 9.1 + light.userData.phase) * 0.25 + Math.sin(timeSec * 15.7 + light.userData.phase) * 0.15;
    }
    // a banner stirs about its rod, its hem lifting out from the wall and settling back (never swinging into the stone)
    for (const cloth of this.banners) cloth.rotation.x = -0.05 * (0.5 + 0.5 * Math.sin(timeSec * 1.2 + cloth.userData.phase));
    for (const rune of this.runes) rune.material.emissiveIntensity = 0.75 + Math.sin(timeSec * 1.4) * 0.2;
    if (camera && this.sky) this.sky.position.copy(camera.position);
  }

  dispose() {
    this.scene.remove(this.group);
    const materials = new Set();
    this.group.traverse((object) => {
      object.geometry?.dispose?.();
      const list = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of list) if (material) materials.add(material);
    });
    // (the heraldry texture is shared between visits and stays cached)
    for (const material of materials) material.dispose();
  }
}
