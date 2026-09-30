import * as THREE from 'three';
import { RUINED_KEEP } from '../../shared/worlds/ruinedKeep.mjs';
import { buildCastlewardTerrainSkirts } from './castlewardTerrain.mjs';
import { KIT_PALETTE as P, facetMesh, kitMaterials, seededRandom, shadeColor, valueNoise } from './kit/facetKit.mjs';
import { banner, brazier, createBatch, masonry, sconce, tree } from './kit/kitPieces.mjs';
import { floorTile, outerTerrain, scatterGroundDetail } from './kit/kitTerrain.mjs';
import { barrel, crate, sacks, weaponRack, woodpile } from './kit/kitProps.mjs';

// The Ruined Keep, drawn with the environment kit (as Castleward is): everything that stops a knight fills its
// authoritative box (shared/worlds/ruinedKeep.mjs), and everything else is plainly out of reach or flat on the ground.
// Evening after a siege: a low sun from the west through the Breach, smoke-grey haze, the valley far below.

export const RUINED_KEEP_LIGHTING = Object.freeze({
  background: 0x9c9088,
  fog: Object.freeze({ color: 0x958a82, density: 0.0135 }),
  // a warm fill still (the armour kit's colours are calibrated under a warm key), a little greyer than Castleward's
  hemisphere: Object.freeze({ skyColor: 0xded3c2, groundColor: 0x584b3e, intensity: 1.7 }),
  sun: Object.freeze({ color: 0xffc98f, intensity: 2.7, position: Object.freeze([-24, 15, -9]) }),
  sky: Object.freeze({ zenith: 0x5f7184, horizon: 0xe2b98e, below: 0x6f6760 }),
});

// the keep's own stone: greyer and colder than Castleward's sandstone (a fortress, and fire has been at it)
const STONE = Object.freeze({ light: 0xa29c8f, mid: 0x898376, dark: 0x625d55, deep: 0x3f3b36 });

// the crag the keep stands on, and the valley below
const CRAG = Object.freeze({ half: 14.2, shelf: 3.2, valley: -30 });
const SCORCH = Object.freeze([[-9.5, -6.5, 3.4], [0, -12.4, 3], [-8.4, 3, 2.6], [7.6, 5.6, 2.2]]);

function box(center, size) {
  return { center, size };
}

function bounds(solid) {
  const [cx, cy, cz] = solid.center;
  const [sx, sy, sz] = solid.size;
  return { x0: cx - sx / 2, x1: cx + sx / 2, y0: cy - sy / 2, y1: cy + sy / 2, z0: cz - sz / 2, z1: cz + sz / 2 };
}

export class RuinedKeepRenderer {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'Ruined Keep';
    this.flames = [];
    this.torchLights = [];
    this.banners = [];
    this.lighting = RUINED_KEEP_LIGHTING;
    // this renderer draws its own cliffs under every floor
    this.ownsTerrainSkirts = true;
    scene.background = new THREE.Color(RUINED_KEEP_LIGHTING.background);
    scene.fog = new THREE.FogExp2(RUINED_KEEP_LIGHTING.fog.color, RUINED_KEEP_LIGHTING.fog.density);
    scene.add(this.group);
    this.#build();
  }

  #build() {
    this.materials = kitMaterials();
    const rand = seededRandom(2718);
    const batch = createBatch();
    const world = RUINED_KEEP;

    // each floor leaves out what an earlier one at the same height already covers (no shared, flickering planes)
    const drawn = world.floors.filter((floor) => floor.draw !== false);
    drawn.forEach((floor, index) => {
      const covers = drawn.slice(0, index).filter((other) => Math.abs(other.y - floor.y) < 1e-6).map((other) => ({
        minX: other.center[0] - other.size[0] / 2, maxX: other.center[0] + other.size[0] / 2,
        minZ: other.center[2] - other.size[2] / 2, maxZ: other.center[2] + other.size[2] / 2,
      }));
      floorTile(batch, floor, [], rand, covers, (x, z) => this.#groundShade(x, z, floor.y));
    });
    scatterGroundDetail(batch, { floors: world.floors, solids: world.solids, seed: 9191 });
    this.#debris(batch);
    for (const ramp of world.ramps) this.#stair(batch, rand, ramp);
    for (const solid of world.solids) this.#solid(batch, rand, solid);
    this.#exterior(batch, rand);
    this.#skirts(batch, rand);
    this.#landscape(batch, rand);
    this.#dressing(batch, rand);
    this.#props(batch, rand);
    this.#sky();

    const shadowless = new Set(['ground']);
    for (const [name, builder] of Object.entries(batch)) {
      if (!builder.triangleCount) continue;
      this.group.add(facetMesh(builder, this.materials[name], { castShadow: !shadowless.has(name), receiveShadow: true, name: `ruined-keep-${name}` }));
    }
  }

  // the paving darkens at the foot of the walls and heaps, and where the siege's fires burned (scorched, sooty)
  #groundShade(x, z, y) {
    let factor = 1;
    for (const solid of RUINED_KEEP.solids) {
      const bottom = solid.center[1] - solid.size[1] / 2;
      if (Math.abs(bottom - y) > 0.8) continue;
      const dx = Math.max(0, Math.abs(x - solid.center[0]) - solid.size[0] / 2);
      const dz = Math.max(0, Math.abs(z - solid.center[2]) - solid.size[2] / 2);
      const d = Math.hypot(dx, dz);
      if (d >= 1.2) continue;
      const t = d / 1.2;
      factor = Math.min(factor, 1 - 0.22 * (1 - t * t * (3 - 2 * t)));
    }
    for (const [sx, sz, r] of SCORCH) {
      const d = Math.hypot(x - sx, z - sz) / r;
      if (d < 1) factor *= 1 - 0.32 * (1 - d * d) * (0.7 + 0.3 * valueNoise(x * 0.9, z * 0.9, 61));
    }
    return factor;
  }

  // chips of stone and slate over the paving by the ruins: flat to the ground, never in anyone's way
  #debris(batch) {
    const rand = seededRandom(515);
    const near = [[-9, -6.5, 2.2], [0, -11, 2.4], [-7, 2.6, 1.8], [7.7, 5.5, 2.2], [2.7, 5.1, 2], [-0.7, -6.3, 2.2]];
    for (const [cx, cz, spread] of near) {
      for (let i = 0; i < 26; i += 1) {
        const x = cx + (rand() - 0.5) * 2 * spread;
        const z = cz + (rand() - 0.5) * 2 * spread;
        const inside = RUINED_KEEP.solids.some((s) => Math.abs(x - s.center[0]) < s.size[0] / 2 + 0.05 && Math.abs(z - s.center[2]) < s.size[2] / 2 + 0.05);
        const floor = RUINED_KEEP.floors.find((f) => f.draw !== false && Math.abs(x - f.center[0]) < f.size[0] / 2 - 0.2 && Math.abs(z - f.center[2]) < f.size[2] / 2 - 0.2);
        if (inside || !floor || floor.y > 0.1) continue;
        const r = 0.05 + rand() * 0.1;
        batch.ground.lump({ cx: x, cy: floor.y + r * 0.15, cz: z, rx: r, ry: r * 0.45, rz: r * (0.6 + rand() * 0.4), color: rand() < 0.25 ? P.slate : rand() < 0.5 ? P.stoneDark : P.stone, rand, shade: 0.22, squash: 0.3 });
      }
    }
  }

  // the Gallery stair: stone steps over its slope (each step's tread at the slope's height at its middle), with the
  // stair's cheek down to the ground on the open side
  #stair(batch, rand, ramp) {
    const rise = Math.abs(ramp.endY - ramp.startY);
    const count = Math.max(2, Math.round(rise / 0.2));
    const run = (ramp.maxZ - ramp.minZ) / count;
    const width = ramp.maxX - ramp.minX;
    const cx = (ramp.minX + ramp.maxX) / 2;
    for (let i = 0; i < count; i += 1) {
      // from the top (minZ, startY) down
      const z0 = ramp.minZ + i * run;
      const zMid = z0 + run / 2;
      const t = (zMid - ramp.minZ) / (ramp.maxZ - ramp.minZ);
      const top = ramp.startY + (ramp.endY - ramp.startY) * t;
      batch.stone.block({ cx, cy: 0, cz: zMid, sx: width, sy: Math.max(0.05, top), sz: run + 0.01, chamfer: 0.03, jitter: 0.008, color: i % 2 ? P.stone : shadeColor(P.stone, 1.05), rand, shade: 0.1 });
      // a worn nosing
      batch.stone.block({ cx, cy: top - 0.05, cz: z0 + 0.04, sx: width - 0.06, sy: 0.06, sz: 0.1, chamfer: 0.02, jitter: 0, color: P.stoneLight, rand });
    }
  }

  #solid(batch, rand, solid) {
    const kind = solid.kind ?? '';
    if (kind === 'footing') return;   // under the stair's steps
    if (kind === 'curtain') return this.#curtain(batch, rand, solid);
    if (kind === 'hall-wall') return this.#hallWall(batch, rand, solid);
    if (kind === 'ruin') return this.#ruin(batch, rand, solid);
    if (kind === 'rubble') return this.#rubble(batch, rand, solid);
    if (kind === 'lip') return masonry(batch, rand, solid, { style: 'rubble', coping: false, color: P.stoneDark });
    if (kind === 'undercroft') return this.#undercroft(batch, rand, solid);
    if (kind === 'stub') return this.#ruin(batch, rand, solid, 0.55);
    if (kind === 'pillar') return this.#pier(batch, rand, solid, false);
    if (kind === 'stump') return this.#pier(batch, rand, solid, true);
    if (kind === 'roof') return this.#roof(batch, rand, solid);
    if (kind === 'beam') return this.#beam(batch, rand, solid);
    if (kind === 'fallen-roof') return this.#fallenRoof(batch, rand, solid);
    if (kind === 'drums') return this.#drums(batch, rand, solid);
    if (kind === 'scaffold') return this.#scaffold(batch, rand, solid);
    if (kind === 'scaffold-pole') return;   // drawn with the scaffold
    if (kind === 'brazier') {
      const b = bounds(solid);
      return this.#flame(brazier(batch, rand, { x: solid.center[0], y: b.y0, z: solid.center[2] }), solid.id !== 'dais-brazier-east', 1.8);
    }
    if (solid.kind === 'prop') return;   // drawn with the props
    masonry(batch, rand, solid, { color: P.stone });
  }

  #curtain(batch, rand, solid) {
    masonry(batch, rand, solid, { merlons: true, color: STONE.mid });
  }

  // the hall's walls: ashlar to the roof line, with tall dark windows high on the inside face and a few merlons over
  #hallWall(batch, rand, solid) {
    masonry(batch, rand, solid, { merlons: true, merlonHeight: 0.7, color: STONE.mid });
    const b = bounds(solid);
    const alongX = solid.size[0] >= solid.size[2];
    // windows on the face toward the hall
    const face = alongX ? b.z0 - 0.015 : b.x1 + 0.015;
    const from = alongX ? b.x0 + 2 : b.z0 + 2;
    const to = alongX ? b.x1 - 2 : b.z1 - 1.5;
    for (let u = from; u <= to; u += 3.6) {
      const [x, z] = alongX ? [u, face] : [face, u];
      batch.wood.block({ cx: x, cy: 3.3, cz: z, sx: alongX ? 0.62 : 0.03, sy: 1.7, sz: alongX ? 0.03 : 0.62, chamfer: 0, jitter: 0, color: 0x17120f, rand });
      batch.stone.block({ cx: x, cy: 5.0, cz: z, sx: alongX ? 0.9 : 0.06, sy: 0.14, sz: alongX ? 0.06 : 0.9, chamfer: 0.02, jitter: 0, color: STONE.light, rand });
    }
  }

  // broken masonry: sound courses to part of its height, then a ragged, stepped top of loose blocks
  #ruin(batch, rand, solid, sound = 0.72) {
    const b = bounds(solid);
    const [cx, , cz] = solid.center;
    const [sx, sy, sz] = solid.size;
    masonry(batch, rand, box([cx, b.y0 + (sy * sound) / 2, cz], [sx, sy * sound, sz]), { coping: false, color: STONE.mid });
    const alongX = sx >= sz;
    const length = alongX ? sx : sz;
    const pieces = Math.max(1, Math.round(length / 0.7));
    for (let i = 0; i < pieces; i += 1) {
      const t = -length / 2 + (i + 0.5) * (length / pieces);
      const h = sy * (1 - sound) * (0.3 + 0.7 * valueNoise(i * 0.8, cx + cz, 3));
      const [x, z] = alongX ? [cx + t, cz] : [cx, cz + t];
      batch.stone.block({
        cx: x, cy: b.y0 + sy * sound, cz: z, sx: alongX ? length / pieces - 0.04 : sx - 0.04, sy: h, sz: alongX ? sz - 0.04 : length / pieces - 0.04,
        chamfer: 0.08, jitter: 0.05, color: rand() < 0.3 ? STONE.dark : STONE.mid, rand, shade: 0.18,
      });
    }
  }

  // a heap of fallen masonry filling its box: a rough core, jumbled blocks over it, a few loose stones
  #rubble(batch, rand, solid) {
    const b = bounds(solid);
    const [cx, , cz] = solid.center;
    const [sx, sy, sz] = solid.size;
    masonry(batch, rand, box([cx, b.y0 + sy * 0.3, cz], [sx, sy * 0.6, sz]), { style: 'rubble', coping: false, color: STONE.dark });
    const count = Math.max(3, Math.round((sx * sz) / 0.45));
    for (let i = 0; i < count; i += 1) {
      const w = 0.35 + rand() * 0.45;
      const d = 0.3 + rand() * 0.4;
      const x = b.x0 + w / 2 + rand() * Math.max(0.01, sx - w);
      const z = b.z0 + d / 2 + rand() * Math.max(0.01, sz - d);
      // higher toward the middle of the heap, the highest reaching its top
      const middle = 1 - Math.max(Math.abs(x - cx) / (sx / 2), Math.abs(z - cz) / (sz / 2));
      const h = Math.max(0.15, sy * (0.35 + 0.4 * middle) + (rand() - 0.5) * 0.15);
      const y = Math.min(b.y1 - h, b.y0 + sy * 0.5 * rand());
      batch.stone.block({ cx: x, cy: Math.max(b.y0, y), cz: z, sx: w, sy: Math.min(h, b.y1 - Math.max(b.y0, y)), sz: d, rotY: (rand() - 0.5) * 1.2, chamfer: 0.07, jitter: 0.06, color: rand() < 0.4 ? STONE.dark : STONE.mid, rand, shade: 0.22 });
    }
    // the top course reaches the box's top all over (it is stood on, and it is where a blade or a body stops)
    const cells = Math.max(1, Math.round(sx / 0.7)) * Math.max(1, Math.round(sz / 0.7));
    const nx = Math.max(1, Math.round(sx / 0.7));
    const nz = Math.max(1, Math.round(sz / 0.7));
    for (let k = 0; k < cells; k += 1) {
      const i = k % nx;
      const j = Math.floor(k / nx);
      const w = sx / nx;
      const d = sz / nz;
      const top = 0.12 + rand() * 0.14;
      batch.stone.block({ cx: b.x0 + (i + 0.5) * w, cy: b.y1 - top, cz: b.z0 + (j + 0.5) * d, sx: w - 0.02, sy: top, sz: d - 0.02, rotY: (rand() - 0.5) * 0.25, chamfer: 0.05, jitter: 0.03, color: rand() < 0.5 ? STONE.mid : STONE.light, rand, shade: 0.2 });
    }
  }

  // the Gallery's base: the curtain's thickness (its masonry stops just under the walk, which is the floor's own
  // surface), with arrow loops along the face toward the Ward and the hall and a pale course at the walk's edge
  #undercroft(batch, rand, solid) {
    const b = bounds(solid);
    const walk = RUINED_KEEP.floors.some((f) => Math.abs(f.y - b.y1) < 0.01 && Math.abs(f.center[0] - solid.center[0]) < 3);
    const top = walk ? b.y1 - 0.03 : b.y1;
    masonry(batch, rand, box([solid.center[0], (b.y0 + top) / 2, solid.center[2]], [solid.size[0], top - b.y0, solid.size[2]]), { coping: false, color: STONE.mid });
    if (solid.id === 'gallery-undercroft') {
      for (let z = b.z0 + 2.2; z < b.z1 - 1; z += 3.2) {
        batch.stone.block({ cx: b.x0 - 0.012, cy: 0.9, cz: z, sx: 0.03, sy: 1.1, sz: 0.14, chamfer: 0, jitter: 0, color: 0x1a1714, rand, shade: 0 });
        batch.stone.block({ cx: b.x0 - 0.02, cy: 0.78, cz: z, sx: 0.04, sy: 0.12, sz: 0.44, chamfer: 0.02, jitter: 0, color: STONE.light, rand, shade: 0.05 });
        batch.stone.block({ cx: b.x0 - 0.02, cy: 2.0, cz: z, sx: 0.04, sy: 0.12, sz: 0.44, chamfer: 0.02, jitter: 0, color: STONE.light, rand, shade: 0.05 });
      }
      batch.stone.block({ cx: b.x0 + 0.12, cy: top - 0.14, cz: solid.center[2], sx: 0.3, sy: 0.14, sz: solid.size[2], chamfer: 0.03, jitter: 0, color: STONE.light, rand, shade: 0.04 });
    }
  }

  // a square pier in courses, a plinth and a capital; broken off (a stump) with a ragged top
  #pier(batch, rand, solid, broken) {
    const b = bounds(solid);
    const [cx, , cz] = solid.center;
    const [sx, , sz] = solid.size;
    batch.stone.block({ cx, cy: b.y0, cz, sx, sy: 0.4, sz, chamfer: 0.06, jitter: 0.01, color: STONE.dark, rand });
    const top = broken ? b.y1 - 0.35 : b.y1 - 0.45;
    for (let y = b.y0 + 0.4; y < top - 1e-3; y += 0.6) {
      const h = Math.min(0.6, top - y);
      batch.stone.block({ cx, cy: y, cz, sx: sx - 0.1, sy: h - 0.02, sz: sz - 0.1, rotY: (rand() - 0.5) * 0.03, chamfer: 0.07, jitter: 0.01, color: STONE.mid, rand, shade: 0.1 });
    }
    if (broken) {
      for (let k = 0; k < 3; k += 1) {
        batch.stone.block({ cx: cx + (rand() - 0.5) * 0.35, cy: top, cz: cz + (rand() - 0.5) * 0.35, sx: 0.4, sy: 0.15 + rand() * 0.2, sz: 0.4, rotY: rand(), chamfer: 0.08, jitter: 0.06, color: P.stone, rand, shade: 0.2 });
      }
      return;
    }
    batch.stone.block({ cx, cy: top, cz, sx, sy: 0.45, sz, chamfer: 0.08, jitter: 0.01, color: STONE.light, rand });
  }

  // the roof still standing: rafters and tie beams seen from below, slates above, its southern edge torn
  #roof(batch, rand, solid) {
    const b = bounds(solid);
    const sx = b.x1 - b.x0;
    batch.wood.block({ cx: (b.x0 + b.x1) / 2, cy: b.y0, cz: (b.z0 + b.z1) / 2, sx, sy: 0.12, sz: b.z1 - b.z0, chamfer: 0, jitter: 0, color: P.timberDark, rand, bottom: true });
    for (let z = b.z0 + 0.5; z < b.z1; z += 1.35) {
      batch.wood.block({ cx: (b.x0 + b.x1) / 2, cy: b.y0 - 0.22, cz: z, sx, sy: 0.24, sz: 0.24, chamfer: 0.03, jitter: 0, color: P.timber, rand, bottom: true });
    }
    batch.stone.block({ cx: (b.x0 + b.x1) / 2, cy: b.y0 + 0.12, cz: (b.z0 + b.z1) / 2, sx, sy: b.y1 - b.y0 - 0.12, sz: b.z1 - b.z0, chamfer: 0.04, jitter: 0.01, color: P.slate, rand, shade: 0.12 });
    // the pitched slate roof over it (out of anyone's reach), its southern slope ending where the roof fell in
    batch.stone.roof({ cx: (b.x0 + b.x1) / 2, cy: b.y1, cz: (b.z0 + b.z1) / 2 + 0.3, sx: sx - 0.2, sz: b.z1 - b.z0 - 0.6, height: 2.3, overhang: 0.1, ridge: sx * 0.4, color: P.slate, rand });
    // torn edge: rafters left jutting past it over the open half
    for (let x = b.x0 + 0.6; x < b.x1; x += 1.1 + rand() * 0.6) {
      batch.wood.block({ cx: x, cy: b.y0 + 0.05, cz: b.z0 - 0.35 - rand() * 0.5, sx: 0.16, sy: 0.18, sz: 0.9 + rand() * 0.6, rotY: (rand() - 0.5) * 0.2, chamfer: 0.02, jitter: 0.01, color: P.timberDark, rand });
    }
  }

  // a fallen roof beam across the floor, broken in two where it struck, with slates smashed round it
  #beam(batch, rand, solid) {
    const b = bounds(solid);
    const length = solid.size[0];
    const cut = b.x0 + length * 0.58;
    for (const [x0, x1, turn] of [[b.x0, cut - 0.03, 0.04], [cut + 0.03, b.x1, -0.05]]) {
      batch.wood.block({ cx: (x0 + x1) / 2, cy: b.y0, cz: solid.center[2], sx: x1 - x0, sy: solid.size[1], sz: solid.size[2] - 0.06, rotY: turn, chamfer: 0.1, jitter: 0.03, color: shadeColor(P.timber, 0.9), rand, shade: 0.14 });
      batch.metal.block({ cx: x0 + 0.35, cy: b.y0 - 0.005, cz: solid.center[2], sx: 0.08, sy: solid.size[1] + 0.01, sz: solid.size[2] - 0.02, rotY: turn, chamfer: 0, jitter: 0, color: P.iron, rand });
    }
    // splintered ends at the break
    for (let k = 0; k < 4; k += 1) batch.wood.block({ cx: cut + (rand() - 0.5) * 0.1, cy: b.y0 + 0.1 + rand() * 0.35, cz: solid.center[2] + (rand() - 0.5) * 0.4, sx: 0.12, sy: 0.08, sz: 0.1, rotY: rand() * 3, chamfer: 0, jitter: 0.02, color: P.timberDark, rand });
    for (let k = 0; k < 5; k += 1) {
      batch.stone.block({ cx: b.x0 + rand() * (b.x1 - b.x0), cy: b.y1 - 0.05, cz: solid.center[2] + (rand() - 0.5) * 0.3, sx: 0.3, sy: 0.05, sz: 0.22, rotY: rand() * 3, chamfer: 0.01, jitter: 0.01, color: P.slate, rand });
    }
  }

  // the Crawl's ceiling: roof timbers and slates fallen across the aisle, resting on the rubble and the wall
  #fallenRoof(batch, rand, solid) {
    const b = bounds(solid);
    const cx = solid.center[0];
    const sx = b.x1 - b.x0;
    // underside: planks (what a knight crawling through sees over them)
    for (let z = b.z0 + 0.15; z < b.z1; z += 0.34) {
      batch.wood.block({ cx, cy: b.y0, cz: z, sx, sy: 0.12, sz: 0.3, rotY: (rand() - 0.5) * 0.04, chamfer: 0.02, jitter: 0.01, color: shadeColor(P.timberDark, 0.9 + rand() * 0.25), rand, bottom: true });
    }
    // two great rafters, and the slates and rubble heaped on them to the box's top
    for (const dx of [-sx * 0.3, sx * 0.3]) batch.wood.block({ cx: cx + dx, cy: b.y0 + 0.12, cz: solid.center[2], sx: 0.26, sy: 0.26, sz: b.z1 - b.z0, chamfer: 0.03, jitter: 0, color: P.timber, rand });
    masonry(batch, rand, box([cx, (b.y0 + 0.38 + b.y1) / 2, solid.center[2]], [sx, b.y1 - b.y0 - 0.38, b.z1 - b.z0]), { style: 'rubble', coping: false, color: STONE.dark });
    // a great beam across each mouth, the fall resting on it: the low way in reads from across the Ward
    for (const z of [b.z0 + 0.14, b.z1 - 0.14]) {
      batch.wood.block({ cx, cy: b.y0, cz: z, sx: sx + 0.02, sy: 0.3, sz: 0.28, chamfer: 0.05, jitter: 0.02, color: shadeColor(P.timber, 1.05), rand, shade: 0.1 });
      for (let k = 0; k < 5; k += 1) {
        batch.stone.block({ cx: b.x0 + 0.15 + rand() * (sx - 0.3), cy: b.y0 + 0.3, cz: z + (rand() - 0.5) * 0.2, sx: 0.28, sy: 0.12 + rand() * 0.2, sz: 0.24, rotY: rand() * 3, chamfer: 0.04, jitter: 0.04, color: rand() < 0.5 ? P.slate : STONE.mid, rand, shade: 0.2 });
      }
    }
  }

  // fallen column drums, each an upright segment of the old shaft
  #drums(batch, rand, solid) {
    const b = bounds(solid);
    const r = Math.min(solid.size[0], solid.size[2]) / 2;
    batch.stone.prism({ cx: solid.center[0], cy: b.y0, cz: solid.center[2], radiusBottom: r, radiusTop: r * 0.97, height: solid.size[1], sides: 10, color: P.stoneLight, rand, rotY: rand() });
    batch.stone.prism({ cx: solid.center[0], cy: b.y1 - 0.02, cz: solid.center[2], radiusBottom: r * 0.35, radiusTop: r * 0.3, height: 0.02, sides: 8, color: P.stone, rand });
  }

  // the siege scaffold: trestles of squared timber under a deck of planks
  #scaffold(batch, rand, solid) {
    const b = bounds(solid);
    const [sx, sy, sz] = solid.size;
    const deck = 0.14;
    for (let x = b.x0 + 0.2; x < b.x1; x += 0.32) {
      batch.wood.block({ cx: x, cy: b.y1 - deck, cz: solid.center[2], sx: 0.3, sy: deck, sz, rotY: 0, chamfer: 0.02, jitter: 0.01, color: shadeColor(P.timber, 0.9 + rand() * 0.3), rand });
    }
    for (const x of [b.x0 + 0.1, solid.center[0], b.x1 - 0.1]) {
      for (const z of [b.z0 + 0.1, b.z1 - 0.1]) {
        batch.wood.block({ cx: x, cy: b.y0, cz: z, sx: 0.18, sy: sy - deck, sz: 0.18, chamfer: 0.02, jitter: 0, color: P.timberDark, rand });
      }
      // cross braces
      batch.wood.block({ cx: x, cy: b.y0 + 0.35, cz: solid.center[2], sx: 0.12, sy: 0.12, sz: sz - 0.2, chamfer: 0.01, jitter: 0, color: P.timberDark, rand });
    }
    // the poles at its back (solid, in the world) and the rail between them
    for (const pole of RUINED_KEEP.solids.filter((s) => s.kind === 'scaffold-pole')) {
      const p = bounds(pole);
      batch.wood.block({ cx: pole.center[0], cy: p.y0, cz: pole.center[2], sx: pole.size[0], sy: pole.size[1], sz: pole.size[2], chamfer: 0.02, jitter: 0, color: P.timberDark, rand });
    }
    batch.wood.block({ cx: solid.center[0], cy: b.y1 + 0.95, cz: b.z1 - 0.1, sx: sx - 0.2, sy: 0.1, sz: 0.1, chamfer: 0.01, jitter: 0, color: P.timber, rand });
    batch.wood.block({ cx: solid.center[0], cy: b.y1 + 2.1, cz: b.z1 - 0.1, sx: sx + 0.1, sy: 0.14, sz: 0.14, chamfer: 0.01, jitter: 0, color: P.timberDark, rand });
    // stacked planks and a bundle of arrows' shafts filling under the deck
    for (let k = 0; k < 4; k += 1) {
      batch.wood.block({ cx: solid.center[0] + (rand() - 0.5) * 0.6, cy: b.y0 + k * 0.12, cz: solid.center[2] + (rand() - 0.5) * 0.3, sx: sx - 0.4, sy: 0.11, sz: 0.5, rotY: (rand() - 0.5) * 0.08, chamfer: 0.01, jitter: 0, color: shadeColor(P.timber, 1.1 + rand() * 0.2), rand });
    }
  }

  // what stands beyond the playable walls: corner towers, the old donjon behind the hall, the gatehouse's stumps
  #exterior(batch, rand) {
    // the donjon rises behind the hall, its top broken
    masonry(batch, rand, box([1.5, 5.5, 17.6], [11, 11, 7.2]), { coping: false, color: P.stone });
    this.#ruin(batch, rand, box([1.5, 13.5, 17.6], [11, 5, 7.2]), 0.4);
    for (const [x, y] of [[-2.2, 7.8], [2.2, 7.8], [5.2, 9.6], [-1, 10.5]]) {
      batch.wood.block({ cx: x, cy: y, cz: 13.98, sx: 0.5, sy: 1.2, sz: 0.04, chamfer: 0, jitter: 0, color: 0x1a1512, rand });
    }
    // corner towers: round, their crowns fallen
    for (const [x, z, h] of [[-10.9, -14.9, 7.4], [14.9, -14.9, 8.8], [14.9, 14.9, 9.6], [-10.9, 14.9, 8.2]]) {
      batch.stone.prism({ cx: x, cy: -2, cz: z, radiusBottom: 1.9, radiusTop: 1.7, height: h + 2, sides: 9, color: P.stone, rand, rotY: 0.3 });
      for (let k = 0; k < 9; k += 1) {
        const a = (k / 9) * Math.PI * 2 + 0.3;
        if (rand() < 0.35) continue;
        batch.stone.block({ cx: x + Math.cos(a) * 1.6, cy: h, cz: z + Math.sin(a) * 1.6, sx: 0.8, sy: 0.3 + rand() * 0.7, sz: 0.45, rotY: -a + Math.PI / 2, chamfer: 0.05, jitter: 0.05, color: P.stoneLight, rand, shade: 0.2 });
      }
    }
  }

  // cliffs under every floor, all the way down to the valley (seen sheer below the terrace's edge)
  #skirts(batch, rand) {
    for (const skirt of buildCastlewardTerrainSkirts(RUINED_KEEP)) {
      if (skirt.floorY > 0.5) continue;
      const [cx, , cz] = skirt.center;
      const [sx, , sz] = skirt.size;
      const top = skirt.topY;
      const bottom = CRAG.valley - 2;
      const x0 = cx - sx / 2; const x1 = cx + sx / 2; const z0 = cz - sz / 2; const z1 = cz + sz / 2;
      const bands = 4;
      for (let k = 0; k < bands; k += 1) {
        const ya = top - ((top - bottom) * k) / bands;
        const yb = top - ((top - bottom) * (k + 1)) / bands;
        const tone = shadeColor(k % 2 ? P.cliff : P.cliffDark, 0.9 + (rand() - 0.5) * 0.12);
        batch.ground.quad([x1, yb, z0], [x0, yb, z0], [x0, ya, z0], [x1, ya, z0], tone);
        batch.ground.quad([x0, yb, z1], [x1, yb, z1], [x1, ya, z1], [x0, ya, z1], tone);
        batch.ground.quad([x0, yb, z0], [x0, yb, z1], [x0, ya, z1], [x0, ya, z0], tone);
        batch.ground.quad([x1, yb, z1], [x1, yb, z0], [x1, ya, z0], [x1, ya, z1], tone);
      }
    }
  }

  // the land: a rocky shelf round the walls (except under the Breach, where the crag falls sheer), then the cliff
  // down to the valley, and hills rising far off
  heightAt(x, z) {
    const dx = Math.max(0, Math.abs(x - 0.5) - CRAG.half);
    const dz = Math.max(0, Math.abs(z) - CRAG.half);
    const d = Math.hypot(dx, dz);
    // under the Breach the crag is sheer: nothing to land on between the terrace and the valley
    const sheer = Math.max(0, 1 - Math.max(0, Math.abs(z + 6.5) - 5) / 4) * (x < -12.5 ? 1 : 0);
    if (d < CRAG.shelf && !sheer) return -0.35 + (valueNoise(x * 0.8, z * 0.8, 7) - 0.5) * 0.3;
    const fall = sheer ? 1 : Math.min(1, (d - CRAG.shelf) / 7);
    const cliff = -0.35 + (CRAG.valley + 0.35) * (1 - (1 - fall) ** 2.2);
    const far = Math.max(0, d - 40);
    const hills = far * 0.35 + valueNoise(x * 0.04, z * 0.04, 13) * 14 * Math.min(1, far / 30);
    return cliff + hills + (valueNoise(x * 0.3, z * 0.3, 5) - 0.5) * 1.4 * fall;
  }

  #landscape(batch, rand) {
    outerTerrain(batch, {
      minX: -110, maxX: 110, minZ: -110, maxZ: 110, cell: 2.5,
      heightAt: (x, z) => this.heightAt(x, z),
      exclude: (x, z) => Math.abs(x - 0.5) < 13.9 && Math.abs(z) < 13.9,
      colorAt: (x, y, z) => {
        if (y < -3 && y > CRAG.valley + 2) return shadeColor(y < -16 ? P.cliffDark : P.cliff, 0.85 + (rand() - 0.5) * 0.14);
        if (y > -3) return shadeColor(valueNoise(x * 0.5, z * 0.5, 3) > 0.55 ? P.grassDark : P.cliff, 0.85 + (rand() - 0.5) * 0.12);
        const n = valueNoise(x * 0.12, z * 0.12, 21);
        return shadeColor(n > 0.6 ? P.grassLight : n < 0.3 ? P.grassDark : P.grass, 0.78 + (rand() - 0.5) * 0.1);
      },
    });
    // the valley's woods, and the siege's wreck on the slope below the Breach
    const woods = seededRandom(77);
    for (let i = 0; i < 70; i += 1) {
      const angle = woods() * Math.PI * 2;
      const radius = 34 + woods() * 55;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      tree(batch, woods, { x, y: this.heightAt(x, z), z, scale: 1.4 + woods() * 0.9, kind: woods() < 0.6 ? 'pine' : 'oak' });
    }
    this.#trebuchet(batch, rand, -38, this.heightAt(-38, -18), -18);
  }

  // a wrecked trebuchet: its frame still standing, the arm broken and fallen
  #trebuchet(batch, rand, x, y, z) {
    for (const dz of [-1.1, 1.1]) {
      batch.wood.block({ cx: x, cy: y, cz: z + dz, sx: 5.5, sy: 0.35, sz: 0.35, chamfer: 0.03, jitter: 0, color: P.timberDark, rand });
      for (const dx of [-1.6, 1.6]) {
        batch.wood.block({ cx: x + dx * 0.55, cy: y + 0.3, cz: z + dz, sx: 0.3, sy: 4.2, sz: 0.3, rotY: 0, chamfer: 0.03, jitter: 0, color: P.timber, rand });
      }
    }
    batch.wood.block({ cx: x, cy: y + 4.3, cz: z, sx: 0.35, sy: 0.35, sz: 2.8, chamfer: 0.03, jitter: 0, color: P.timberDark, rand });
    batch.wood.block({ cx: x + 2.4, cy: y + 0.2, cz: z + 0.6, sx: 6.5, sy: 0.3, sz: 0.3, rotY: 0.35, chamfer: 0.03, jitter: 0, color: P.timber, rand });
    batch.stone.lump({ cx: x - 1.6, cy: y + 0.7, cz: z, rx: 0.9, ry: 0.8, rz: 0.9, color: P.stoneDark, rand, squash: 0.1 });
  }

  // banners, sconces and the trebuchet stone lodged in the toppled wall's rubble
  #dressing(batch, rand) {
    const banners = [
      { x: -2.3, y: 5.3, z: 13.3, facing: Math.PI, width: 1.1, height: 2.3 },
      { x: 2.3, y: 5.3, z: 13.3, facing: Math.PI, width: 1.1, height: 2.3 },
      { x: 8.3, y: 2.5, z: -11.2, facing: -Math.PI / 2, width: 0.9, height: 1.4 },
      { x: 10.2, y: 2.5, z: 5.9, facing: -Math.PI / 2, width: 0.9, height: 1.5 },
      { x: -3.5, y: 3.9, z: -13.3, facing: 0, width: 0.9, height: 1.6 },
    ];
    for (const spec of banners) {
      const mesh = banner(batch, rand, spec);
      this.group.add(mesh);
      this.banners.push(mesh);
    }
    const sconces = [
      { x: -9.2, y: 3.4, z: 9.5, facing: Math.PI / 2, light: true },
      { x: 10.2, y: 2.45, z: -0.4, facing: -Math.PI / 2, light: true },
      { x: -9.2, y: 3.4, z: -11.5, facing: Math.PI / 2, light: false },
      { x: 5, y: 3.6, z: -13.3, facing: 0, light: false },
    ];
    for (const spec of sconces) this.#flame(sconce(batch, rand, spec), spec.light);
    // a trebuchet stone half buried in the gatehouse's rubble
    batch.stone.lump({ cx: 1.2, cy: 0.75, cz: -12.6, rx: 0.4, ry: 0.36, rz: 0.4, color: P.stoneDeep, rand, squash: 0.08 });
  }

  #props(batch, rand) {
    for (const prop of RUINED_KEEP.props) {
      if (prop.kind === 'barrel') barrel(batch, rand, prop);
      else if (prop.kind === 'crate') crate(batch, rand, prop);
      else if (prop.kind === 'woodpile') woodpile(batch, rand, prop);
      else if (prop.kind === 'sacks') sacks(batch, rand, prop);
      else if (prop.kind === 'rack') weaponRack(batch, rand, prop);
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
      const point = new THREE.PointLight(0xffa24c, 3.2, 8, 2);
      point.position.set(position[0], position[1] + 0.2, position[2]);
      point.userData.phase = flame.userData.phase;
      this.group.add(point);
      this.torchLights.push(point);
    }
  }

  #sky() {
    const geometry = new THREE.SphereGeometry(140, 24, 12);
    const colors = [];
    const { zenith, horizon, below } = RUINED_KEEP_LIGHTING.sky;
    const cz = new THREE.Color(zenith);
    const ch = new THREE.Color(horizon);
    const cb = new THREE.Color(below);
    const position = geometry.getAttribute('position');
    for (let i = 0; i < position.count; i += 1) {
      const t = position.getY(i) / 140;
      // the west (where the sun is going down) warmer at the horizon
      const west = Math.max(0, -position.getX(i) / 140);
      const color = t >= 0 ? ch.clone().lerp(cz, Math.pow(t, 0.55 + west * 0.3)) : ch.clone().lerp(cb, Math.min(1, -t * 3));
      colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const sky = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.name = 'ruined-keep-sky';
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
    // a banner stirs out from its wall and settles back (never into the stone)
    for (const cloth of this.banners) cloth.rotation.x = -0.05 * (0.5 + 0.5 * Math.sin(timeSec * 1.2 + cloth.userData.phase));
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
