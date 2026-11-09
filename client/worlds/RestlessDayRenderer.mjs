import * as THREE from 'three';
import { RESTLESS_DAY_WORLD } from '../../shared/worlds/restlessDay.mjs';
import { getModePolicy, GAME_MODES } from '../../shared/src/modes.mjs';
import { BiByeLlistaRenderer } from './BiByeLlistaRenderer.mjs';
import { BiByeMotion } from './biByeMotion.mjs';
import { facetMesh, kitMaterials, seededRandom, shadeColor, KIT_PALETTE as K } from './kit/facetKit.mjs';
import { createBatch, masonry, palisade, cottage, banner } from './kit/kitPieces.mjs';
import { floorTile } from './kit/kitTerrain.mjs';
import { drawnFloors, flagstoneTexture, plankTexture } from './kit/surfaceTextures.mjs';
import { drawWorldProps, beam } from './kit/worldProps.mjs';
import { FlameSet } from './kit/flames.mjs';
import { BACKDROP_MOODS, backdropLighting, buildBackdrop } from './kit/backdrop.mjs';

// Restless Day as it is drawn: every solid in shared/worlds/restlessDay.mjs filled exactly by its own piece of the
// environment kit (coursed masonry for the curtains and towers, crenels on the parapets, timber for the camp and the
// siege works, plastered buildings under their roofs), the floors tiled, the castle set on its crag in a green march
// (kit/backdrop.mjs), and the day going down over it on the match's own clock. One batched mesh per material: the
// whole castle is a handful of draw calls.

const BACKDROP_RADIUS = 300;
// the day's sky at noon (the sundown palette below takes it to dusk as the match's daylight runs out)
export const RESTLESS_DAY_LIGHTING = backdropLighting({
  background: 0xb8d0df,
  fog: Object.freeze({ color: 0xb8d0df, density: 0.0019 }),
  hemisphere: Object.freeze({ skyColor: 0xeaf1e7, groundColor: 0x5d615d, intensity: 1.75 }),
  sun: Object.freeze({ color: 0xffd795, intensity: 2.25, position: [-55, 70, -25] }),
  sky: Object.freeze({ zenith: 0x6f9cc8, horizon: 0xe9e2cf, below: 0x4f5a48 }),
}, { radius: BACKDROP_RADIUS, density: 0.0019 });

// noon -> last light, by the fraction of the day spent (all lerps; nothing steps)
export const SUNDOWN = Object.freeze({
  sun: [0xffe2a8, 0xffa04a, 0xff5a24],
  sky: [0xffffff, 0xffd2a8, 0x9a6f86],     // a tint over the sky dome's own colours
  fog: [0xc6d3dc, 0xd9b58f, 0x5d4352],
  hemiSky: [0xeaf1e7, 0xf2d3b0, 0x8b5d6f],
  hemiGround: [0x5d615d, 0x5a4d44, 0x2c2430],
});

const PALETTE = Object.freeze({
  stone: 0x9e9788, stoneDark: 0x6e685c, stoneLight: 0xd6cdbc, timber: 0x6b4a33, timberDark: 0x3d2719,
  charred: 0x2a2420, iron: 0x3a3c40, ironRusted: 0x6b4a3a, brass: 0xc6a456, brassDark: 0x82632b,
  canvas: 0xd7c8a6, crimson: 0x8a2327, crimsonGold: 0xb23338, earth: 0x6e5a40, marble: 0xd8d0c2,
});

const createMat = (color, roughness = 0.72, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });

function box(parent, dimensions, where, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...dimensions), mat);
  m.position.set(...where);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function pipe(parent, from, to, radius, mat, segments = 8) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const v = new THREE.Vector3().subVectors(b, a);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, v.length(), segments), mat);
  mesh.position.copy(a.add(b).multiplyScalar(0.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

const boundsOf = (s) => ({
  x0: s.center[0] - s.size[0] / 2, x1: s.center[0] + s.size[0] / 2,
  y0: s.center[1] - s.size[1] / 2, y1: s.center[1] + s.size[1] / 2,
  z0: s.center[2] - s.size[2] / 2, z1: s.center[2] + s.size[2] / 2,
});
// a solid as drawn: its own box, or (for a raised floor's base, which stops a step under the floor) up to `drawTo`
const drawnBox = (s) => {
  if (!Number.isFinite(s.drawTo)) return s;
  const b = boundsOf(s);
  return { ...s, center: [s.center[0], (b.y0 + s.drawTo) / 2, s.center[2]], size: [s.size[0], s.drawTo - b.y0, s.size[2]] };
};

/** Each flight of steps as solid treads down to the ground (what fills under it is the stair's own footings). */
function flight(batch, rand, ramp, color) {
  const axisX = ramp.axis === 'x';
  const length = axisX ? ramp.maxX - ramp.minX : ramp.maxZ - ramp.minZ;
  const rise = Math.abs(ramp.endY - ramp.startY);
  const count = Math.max(2, Math.round(rise / 0.22));
  const width = axisX ? ramp.maxZ - ramp.minZ : ramp.maxX - ramp.minX;
  for (let i = 0; i < count; i += 1) {
    const t0 = i / count, t1 = (i + 1) / count;
    // each tread's top is the slope's height at its upper edge, so a body's feet (on the slope) are never inside one
    const yAt = (t) => ramp.startY + (ramp.endY - ramp.startY) * t;
    const top = Math.min(yAt(t0), yAt(t1)) + (Math.abs(yAt(t1) - yAt(t0))) * 0.5;
    if (top <= 0.01) continue;
    const mid = (t0 + t1) / 2;
    const along = (axisX ? ramp.minX : ramp.minZ) + mid * length;
    const cx = axisX ? along : (ramp.minX + ramp.maxX) / 2;
    const cz = axisX ? (ramp.minZ + ramp.maxZ) / 2 : along;
    batch.stone.block({
      cx, cy: 0, cz, sx: axisX ? length / count + 0.01 : width, sy: top, sz: axisX ? width : length / count + 0.01,
      chamfer: 0.03, jitter: 0.004, color: shadeColor(color, 0.94 + rand() * 0.1), rand, shade: 0.05,
    });
  }
}

export class RestlessDayRenderer {
  constructor(scene) {
    this.scene = scene;
    this.lighting = RESTLESS_DAY_LIGHTING;
    this.group = new THREE.Group();
    this.group.name = 'Restless Day — the two curtains and the Court of the Renowner';
    this.materials = {
      stone: createMat(PALETTE.stone, 0.78, 0.05),
      stoneLight: createMat(PALETTE.stoneLight, 0.7, 0.08),
      timber: createMat(PALETTE.timber, 0.75, 0.02),
      iron: createMat(PALETTE.iron, 0.42, 0.75),
      ironRusted: createMat(PALETTE.ironRusted, 0.65, 0.55),
      brass: createMat(PALETTE.brass, 0.35, 0.72),
      brassDark: createMat(PALETTE.brassDark, 0.45, 0.65),
      crimson: createMat(PALETTE.crimson, 0.65, 0.05),
      crimsonGold: createMat(PALETTE.crimsonGold, 0.55, 0.1),
    };
    this.kit = kitMaterials();
    this.structureMeshes = new Map();
    this.ladders = new Map();
    this.lastMode = null;
    this.lastLadderKey = '';
    this.coinVisuals = new Map();
    this.biByeLlista = null;
    this.biByeMotion = new BiByeMotion();
    this.biByeRoomCode = null;
    this.biByePresentationOptions = null;
    this.matchSeconds = getModePolicy(GAME_MODES.RESTLESS_DAY).matchSeconds;
    this.sundownColors = Object.fromEntries(Object.entries(SUNDOWN).map(([k, stops]) => [k, stops.map((c) => new THREE.Color(c))]));
    this.#cacheLights();
    this.#build();
    scene.add(this.group);
  }

  #cacheLights() {
    this.sunLight = null;
    this.hemiLight = null;
    this.scene.traverse((obj) => {
      if (obj.isDirectionalLight && !this.sunLight) this.sunLight = obj;
      if (obj.isHemisphereLight && !this.hemiLight) this.hemiLight = obj;
    });
    this.original = {
      sun: this.sunLight?.color.clone(),
      hemiSky: this.hemiLight?.color.clone(),
      hemiGround: this.hemiLight?.groundColor.clone(),
    };
  }

  #build() {
    const W = RESTLESS_DAY_WORLD;
    const rand = seededRandom(2407);
    const batch = createBatch();

    // --- ground: the field's turf (trodden to earth along the siege kit's lanes), the castle's flagstones, the dais
    const lanes = [[[-2, -88], [-2, -30]], [[15, -88], [15, -40]], [[-10, -70], [-6, -32]], [[10, -70], [6, -32]],
      [[0, -100], [0, -88]], [[-16, -90], [16, -90]]];
    for (const f of W.floors) if (f.id === 'field') floorTile(batch, { ...f, material: 'grass' }, lanes, rand);
    this.kit.paving = new THREE.MeshStandardMaterial({ map: flagstoneTexture(0x8d8576, 61), roughness: 0.9, metalness: 0.03 });
    this.kit.marble = new THREE.MeshStandardMaterial({ map: flagstoneTexture(0xcfc6b6, 67), roughness: 0.55, metalness: 0.05 });
    this.kit.planks = new THREE.MeshStandardMaterial({ map: plankTexture(0x7a5740, 13), roughness: 0.85, metalness: 0.02 });
    const paved = W.floors.filter((f) => f.material === 'paving' || f.material === 'stone');
    this.group.add(drawnFloors(paved, this.kit.paving, { name: 'restless-paving' }));
    this.group.add(drawnFloors(W.floors.filter((f) => f.material === 'marble'), this.kit.marble, { name: 'restless-dais' }));
    this.group.add(drawnFloors(W.floors.filter((f) => f.material === 'timber'), this.kit.planks, { name: 'restless-dock', metres: 4 }));
    for (const r of W.ramps) flight(batch, rand, r, r.id.startsWith('renowner') ? PALETTE.marble : r.id.includes('dock') ? PALETTE.timber : K.stone);

    // --- what stands
    const flames = [];
    for (const s of W.solids) this.#drawSolid(batch, rand, s, flames);
    const props = drawWorldProps(batch, rand, W.props);
    flames.push(...props.flames);
    this.#dressing(batch, rand, flames);

    for (const [name, builder] of Object.entries(batch)) {
      if (!builder.triangleCount) continue;
      this.group.add(facetMesh(builder, this.kit[name], { castShadow: name !== 'ground', receiveShadow: true, name: `restless-${name}` }));
    }
    this.fire = new FlameSet(this.group, { flames, glows: props.glows });
    this.backdrop = buildBackdrop(this.group, {
      footprint: [-29.5, 29.5, -107.5, 84], floorY: 0, sky: RESTLESS_DAY_LIGHTING.sky, mood: BACKDROP_MOODS.dusk,
      seed: 47, radius: BACKDROP_RADIUS, depth: 22, materials: this.kit,
    });
    this.#buildMonument();
  }

  #drawSolid(batch, rand, s, flames) {
    const b = boundsOf(s);
    const kind = s.kind ?? '';
    if (s.id === 'renowner-body') return;                       // the monument is its own animated group
    if (s.id === 'outer-gate' || s.id === 'inner-gate') {       // destructible: its own mesh, hidden when broken
      const gate = new THREE.Group();
      gate.name = `${s.id} (reinforced timber)`;
      const planks = Math.round(s.size[0] / 0.5);
      for (let i = 0; i < planks; i += 1) {
        const x = b.x0 + (i + 0.5) * s.size[0] / planks;
        box(gate, [s.size[0] / planks - 0.03, s.size[1], s.size[2] * 0.5], [x, s.center[1], s.center[2]], i % 2 ? this.materials.timber : this.materials.ironRusted);
      }
      for (const y of [1.1, s.size[1] * 0.5, s.size[1] - 1]) box(gate, [s.size[0], 0.22, s.size[2] * 0.62], [s.center[0], y, s.center[2]], this.materials.iron);
      this.group.add(gate);
      this.structureMeshes.set(s.id, gate);
      return;
    }
    if (kind === 'prop' || kind === 'stair-footing') return;    // props draw themselves; footings are under the treads
    const d = drawnBox(s);
    switch (kind) {
      case 'curtain':
        // the long side curtains a knight only ever sees from inside: big courses, no chamfers (a fraction of the
        // triangles of fine ashlar over a hundred metres), the same stone
        if (/^castle-flank|^boundary-rear/.test(s.id)) { this.#plainWall(batch, rand, s); break; }
        // falls through
      case 'tower': case 'gate-tower': case 'facade':
        masonry(batch, rand, d, { merlons: kind === 'tower' || kind === 'gate-tower' || kind === 'facade', merlonHeight: 0.8 });
        if (kind === 'tower') {
          // arrow slits down the towers' faces
          for (let y = 2.2; y < s.size[1] - 1; y += 2.6) {
            for (const [x, z] of [[s.center[0], b.z0 - 0.02], [s.center[0], b.z1 + 0.02]]) batch.metal.block({ cx: x, cy: y, cz: z, sx: 0.16, sy: 0.9, sz: 0.06, chamfer: 0, jitter: 0, color: 0x1c1a18, rand });
          }
        }
        break;
      case 'gate-lintel':
        masonry(batch, rand, d, { coping: true });
        break;
      case 'parapet': masonry(batch, rand, d, { coping: true }); break;
      case 'merlon':
        batch.stone.block({ cx: s.center[0], cy: b.y0, cz: s.center[2], sx: s.size[0], sy: s.size[1], sz: s.size[2], chamfer: 0.05, jitter: 0.01, color: shadeColor(K.stoneLight, 0.95 + rand() * 0.08), rand });
        break;
      case 'landing-post': case 'landing-beam': case 'crane': case 'crane-jib':
        batch.wood.block({ cx: s.center[0], cy: b.y0, cz: s.center[2], sx: s.size[0], sy: s.size[1], sz: s.size[2], chamfer: 0.02, jitter: 0.01, color: shadeColor(K.timberDark, 0.9 + rand() * 0.2), rand });
        if (kind === 'landing-beam') {
          // the landing's mark seen from the field: a red cloth down the wall's outer face under the gap in the
          // parapet (a ladder goes up where the cloth is), flat on the stone, out of everyone's way
          const wall = RESTLESS_DAY_WORLD.walls.find((w) => Math.abs(w.height + 2.8 - b.y0) < 0.01);
          const face = wall.z - wall.thickness / 2 - 0.03;
          batch.cloth.block({ cx: s.center[0], cy: wall.height - 2.6, cz: face, sx: s.size[0] - 1.6, sy: 2.4, sz: 0.04, chamfer: 0, jitter: 0, color: PALETTE.crimson, rand });
          batch.metal.block({ cx: s.center[0], cy: wall.height - 0.32, cz: face - 0.02, sx: s.size[0] - 1.3, sy: 0.08, sz: 0.06, chamfer: 0, jitter: 0, color: PALETTE.brass, rand });
        }
        if (kind === 'crane-jib') beam(batch.metal, [b.x0 + 0.3, b.y0, s.center[2]], [b.x0 + 0.3, b.y0 - 2.4, s.center[2]], 0.025, K.iron);
        break;
      case 'palisade': case 'barricade': case 'mantlet':
        palisade(batch, rand, d);
        break;
      case 'gabions':
        // wicker baskets of earth, shoulder to shoulder
        for (let x = b.x0 + 0.5; x < b.x1 - 0.2; x += 0.98) {
          batch.wood.prism({ cx: x, cy: b.y0, cz: s.center[2], radiusBottom: 0.49, radiusTop: 0.47, height: s.size[1] - 0.06, sides: 8, color: shadeColor(0x7b6142, 0.85 + rand() * 0.25), rand });
          batch.ground.prism({ cx: x, cy: b.y1 - 0.08, cz: s.center[2], radiusBottom: 0.44, radiusTop: 0.3, height: 0.08, sides: 8, color: PALETTE.earth, rand });
        }
        break;
      case 'post':
        batch.wood.block({ cx: s.center[0], cy: b.y0, cz: s.center[2], sx: s.size[0], sy: s.size[1], sz: s.size[2], chamfer: 0.02, jitter: 0, color: K.timberDark, rand });
        break;
      case 'post-roof':
        batch.stone.roof({ cx: s.center[0], cy: b.y0, cz: s.center[2], sx: s.size[0], sz: s.size[2], height: s.size[1], overhang: 0, ridge: s.size[0] * 0.25, color: K.slate, rand });
        break;
      case 'stall':
        batch.wood.block({ cx: s.center[0], cy: b.y0, cz: s.center[2], sx: s.size[0], sy: s.size[1], sz: s.size[2], chamfer: 0.03, jitter: 0.01, color: K.timber, rand });
        break;
      case 'awning':
        batch.cloth.block({ cx: s.center[0], cy: b.y0, cz: s.center[2], sx: s.size[0], sy: s.size[1], sz: s.size[2], chamfer: 0, jitter: 0, color: PALETTE.crimson, rand });
        break;
      case 'spoil':
        // a sap's spoil bank: heaped earth with gabions along its crest
        batch.ground.block({ cx: s.center[0], cy: b.y0, cz: s.center[2], sx: s.size[0], sy: s.size[1] * 0.75, sz: s.size[2], chamfer: 0.3, jitter: 0.06, color: PALETTE.earth, rand, shade: 0.2 });
        for (let x = b.x0 + 0.5; x < b.x1 - 0.3; x += 1.0) batch.wood.prism({ cx: x, cy: b.y0 + s.size[1] * 0.55, cz: s.center[2], radiusBottom: 0.42, radiusTop: 0.44, height: s.size[1] * 0.45, sides: 7, color: shadeColor(0x7b6142, 0.9 + rand() * 0.2), rand });
        break;
      case 'wreck': this.#siegeTowerWreck(batch, rand, s); break;
      case 'trebuchet': this.#trebuchetWreck(batch, rand, s); break;
      case 'building':
        cottage(batch, rand, d, { roof: s.roof === 'thatch' ? 'thatch' : 'slate', door: s.door === '+x' || s.door === '-x' ? '-z' : s.door });
        break;
      case 'roof': break;                                       // drawn by its building
      case 'dock':
        batch.wood.block({ cx: d.center[0], cy: boundsOf(d).y0, cz: d.center[2], sx: d.size[0], sy: d.size[1] - 0.02, sz: d.size[2], chamfer: 0.03, jitter: 0, color: K.timber, rand });
        for (let x = b.x0 + 0.4; x < b.x1; x += 2) batch.wood.block({ cx: x, cy: 0, cz: b.z0 - 0.05, sx: 0.22, sy: 1.3, sz: 0.12, chamfer: 0.01, jitter: 0, color: K.timberDark, rand });
        break;
      case 'cut-stone': case 'cross': case 'cistern': case 'landing-base': case 'dais-base':
        if (kind === 'cistern') {
          batch.stone.prism({ cx: s.center[0], cy: b.y0, cz: s.center[2], radiusBottom: s.size[0] / 2, radiusTop: s.size[0] / 2 - 0.05, height: s.size[1], sides: 10, color: K.stone, rand });
          batch.metal.prism({ cx: s.center[0], cy: b.y1 - 0.08, cz: s.center[2], radiusBottom: s.size[0] / 2 - 0.25, radiusTop: s.size[0] / 2 - 0.25, height: 0.06, sides: 10, color: 0x2e4450, rand });
        } else if (kind === 'cross') {
          batch.stone.block({ cx: s.center[0], cy: b.y0, cz: s.center[2], sx: s.size[0], sy: 0.6, sz: s.size[2], chamfer: 0.05, jitter: 0.01, color: K.stoneDark, rand });
          batch.stone.block({ cx: s.center[0], cy: b.y0 + 0.6, cz: s.center[2], sx: 0.5, sy: s.size[1] - 0.6, sz: 0.5, chamfer: 0.04, jitter: 0.01, color: K.stone, rand });
          batch.stone.block({ cx: s.center[0], cy: b.y1 - 0.9, cz: s.center[2], sx: s.size[0], sy: 0.34, sz: 0.4, chamfer: 0.04, jitter: 0.01, color: K.stoneLight, rand });
        } else {
          masonry(batch, rand, d, { style: kind === 'cut-stone' ? 'ashlar' : 'ashlar', coping: kind !== 'dais-base' });
        }
        break;
      case 'effigy': this.#effigy(batch, rand, s); break;
      case 'column': this.#column(batch, rand, s); break;
      case 'shot': {
        batch.wood.block({ cx: s.center[0], cy: b.y0, cz: s.center[2], sx: s.size[0], sy: 0.5, sz: s.size[2], chamfer: 0.03, jitter: 0.01, color: K.timber, rand });
        for (let i = 0; i < 6; i += 1) batch.stone.lump({ cx: b.x0 + 0.45 + (i % 3) * 0.65, cy: 0.8, cz: b.z0 + 0.7 + Math.floor(i / 3) * 1.0, rx: 0.32, ry: 0.32, rz: 0.32, color: K.stoneDark, rand, squash: 0.06 });
        break;
      }
      default:
        if (s.id === 'renowner-podium') {
          batch.metal.block({ cx: s.center[0], cy: b.y0, cz: s.center[2], sx: s.size[0], sy: s.size[1], sz: s.size[2], chamfer: 0.06, jitter: 0, color: PALETTE.brassDark, rand, shade: 0.05 });
          batch.metal.block({ cx: s.center[0], cy: b.y1 - 0.12, cz: s.center[2], sx: s.size[0] + 0.12, sy: 0.12, sz: s.size[2] + 0.12, chamfer: 0.03, jitter: 0, color: PALETTE.brass, rand });
        } else if (s.material === 'timber') palisade(batch, rand, d);
        else masonry(batch, rand, d);
    }
  }

  #plainWall(batch, rand, s) {
    const b = boundsOf(s);
    const alongX = s.size[0] >= s.size[2];
    const length = alongX ? s.size[0] : s.size[2];
    const rows = Math.max(1, Math.round(s.size[1] / 1.0));
    const h = s.size[1] / rows;
    for (let r = 0; r < rows; r += 1) {
      let u = alongX ? b.x0 : b.z0;
      const end = u + length;
      u -= (r % 2) * 1.2;
      while (u < end - 1e-3) {
        const a = Math.max(u, alongX ? b.x0 : b.z0), c = Math.min(u + 2.2 + rand() * 0.6, end);
        const mid = (a + c) / 2;
        batch.stone.block({
          cx: alongX ? mid : s.center[0], cy: b.y0 + r * h, cz: alongX ? s.center[2] : mid,
          sx: alongX ? c - a - 0.03 : s.size[0], sy: h - 0.03, sz: alongX ? s.size[2] : c - a - 0.03,
          chamfer: 0, jitter: 0, color: shadeColor(K.stone, 0.9 + rand() * 0.14), rand, shade: 0.04,
        });
        u = c;
      }
    }
    batch.stone.block({ cx: s.center[0], cy: b.y1, cz: s.center[2], sx: s.size[0] + 0.06, sy: 0.12, sz: s.size[2] + 0.06, chamfer: 0, jitter: 0, color: K.stoneLight, rand });
  }

  #siegeTowerWreck(batch, rand, s) {
    const b = boundsOf(s);
    // a burnt-out siege tower, fallen to its first storey: charred planking and the stumps of its frame
    batch.wood.block({ cx: s.center[0], cy: b.y0, cz: s.center[2], sx: s.size[0] - 0.2, sy: s.size[1] * 0.55, sz: s.size[2] - 0.2, chamfer: 0.05, jitter: 0.04, color: PALETTE.charred, rand, shade: 0.25 });
    for (const [x, z] of [[b.x0 + 0.2, b.z0 + 0.2], [b.x1 - 0.2, b.z0 + 0.2], [b.x0 + 0.2, b.z1 - 0.2], [b.x1 - 0.2, b.z1 - 0.2]]) {
      batch.wood.block({ cx: x, cy: b.y0, cz: z, sx: 0.4, sy: s.size[1] * (0.7 + rand() * 0.3), sz: 0.4, chamfer: 0.04, jitter: 0.06, color: shadeColor(PALETTE.charred, 1.2), rand });
    }
    beam(batch.wood, [b.x0 + 0.2, b.y1 - 0.4, b.z0 + 0.2], [b.x1 - 0.2, b.y0 + s.size[1] * 0.6, b.z1 - 0.2], 0.16, shadeColor(PALETTE.charred, 1.3));
    beam(batch.wood, [b.x1 - 0.2, b.y1 - 0.6, b.z0 + 0.2], [b.x0 + 0.3, b.y0 + s.size[1] * 0.58, b.z0 + 0.2], 0.14, shadeColor(PALETTE.charred, 1.1));
    for (let i = 0; i < 3; i += 1) batch.metal.prism({ cx: b.x0 - 0.0 + rand() * s.size[0], cy: 0, cz: b.z0 + rand() * s.size[2], radiusBottom: 0.7, radiusTop: 0.65, height: 0.18, sides: 10, color: K.iron, rand });
  }

  #trebuchetWreck(batch, rand, s) {
    const b = boundsOf(s);
    // its base frame on its side, the counterweight box dropped, the throwing arm snapped along the ground
    batch.wood.block({ cx: s.center[0], cy: b.y0, cz: s.center[2], sx: s.size[0] - 0.3, sy: 0.6, sz: s.size[2] - 0.3, chamfer: 0.04, jitter: 0.02, color: K.timber, rand });
    for (const z of [b.z0 + 0.35, b.z1 - 0.35]) {
      beam(batch.wood, [b.x0 + 0.5, 0.6, z], [s.center[0], s.size[1] - 0.1, z], 0.13, K.timberDark);
      beam(batch.wood, [b.x1 - 0.5, 0.6, z], [s.center[0], s.size[1] - 0.1, z], 0.13, K.timberDark);
    }
    batch.wood.block({ cx: b.x1 - 1.0, cy: 0.6, cz: s.center[2], sx: 1.4, sy: 1.1, sz: 1.4, chamfer: 0.04, jitter: 0.03, color: K.timberDark, rand });
    beam(batch.wood, [b.x0 + 0.3, 0.75, s.center[2] - 0.4], [s.center[0] + 0.8, 1.3, s.center[2] + 0.3], 0.16, K.timber);
  }

  #effigy(batch, rand, s) {
    const b = boundsOf(s);
    // a former champion in stone on a plinth, leaning on a sword: the court's own honour roll
    batch.stone.block({ cx: s.center[0], cy: b.y0, cz: s.center[2], sx: s.size[0], sy: 1.0, sz: s.size[2], chamfer: 0.05, jitter: 0.005, color: K.stoneDark, rand });
    batch.stone.block({ cx: s.center[0], cy: b.y0 + 1.0, cz: s.center[2], sx: 0.62, sy: 1.25, sz: 0.48, chamfer: 0.1, jitter: 0.01, color: K.stoneLight, rand });
    batch.stone.block({ cx: s.center[0], cy: b.y0 + 2.25, cz: s.center[2], sx: 0.92, sy: 0.6, sz: 0.56, chamfer: 0.12, jitter: 0.01, color: K.stoneLight, rand });
    batch.stone.block({ cx: s.center[0], cy: b.y0 + 2.85, cz: s.center[2], sx: 0.36, sy: 0.5, sz: 0.38, chamfer: 0.08, jitter: 0.01, color: K.stoneLight, rand });
    batch.stone.block({ cx: s.center[0], cy: b.y0 + 1.0, cz: s.center[2] - 0.34, sx: 0.12, sy: 1.6, sz: 0.06, chamfer: 0.02, jitter: 0, color: K.stone, rand });
    batch.stone.block({ cx: s.center[0], cy: b.y0 + 2.45, cz: s.center[2] - 0.34, sx: 0.5, sy: 0.09, sz: 0.09, chamfer: 0.01, jitter: 0, color: K.stone, rand });
  }

  #column(batch, rand, s) {
    const b = boundsOf(s);
    const r = Math.min(s.size[0], s.size[2]) / 2;
    batch.stone.block({ cx: s.center[0], cy: b.y0, cz: s.center[2], sx: s.size[0], sy: 0.5, sz: s.size[2], chamfer: 0.05, jitter: 0, color: K.stoneDark, rand });
    batch.stone.prism({ cx: s.center[0], cy: b.y0 + 0.5, cz: s.center[2], radiusBottom: r * 0.82, radiusTop: r * 0.74, height: s.size[1] - 1.0, sides: 12, color: K.stoneLight, rand });
    batch.metal.block({ cx: s.center[0], cy: b.y1 - 0.5, cz: s.center[2], sx: s.size[0], sy: 0.5, sz: s.size[2], chamfer: 0.06, jitter: 0, color: PALETTE.brass, rand, shade: 0.04 });
  }

  /** What dresses the castle without standing in anyone's way: banners on walls and towers, sconces, worn tracks. */
  #dressing(batch, rand, flames) {
    const W = RESTLESS_DAY_WORLD;
    // (every banner shares one cloth: one material, one heraldry texture)
    const hang = (at) => {
      const mesh = banner(batch, rand, at);
      if (!this.bannerMaterial) this.bannerMaterial = mesh.material;
      else { mesh.material.map?.dispose?.(); mesh.material.dispose(); mesh.material = this.bannerMaterial; }
      this.group.add(mesh);
    };
    // the defenders' banners hang down the curtains' outer faces between the landings, and from the towers
    for (const x of [-22, -13.4, 13.4, 22]) {
      hang({ x, y: 5.4, z: -25.15, width: 1.3, height: 3.0, facing: Math.PI });
      hang({ x, y: 6.4, z: 20.7, width: 1.3, height: 3.4, facing: Math.PI });
    }
    for (const x of [-25.8, 25.8]) {
      hang({ x, y: 8.6, z: -28.45, width: 1.6, height: 4, facing: Math.PI });
      hang({ x, y: 9.6, z: 17.55, width: 1.6, height: 4.4, facing: Math.PI });
    }
    // the throne hall: tall banners and a great door on its facade
    for (const x of [-12, -6, 6, 12]) hang({ x, y: 7.6, z: 78.38, width: 1.6, height: 5.2, facing: Math.PI });
    batch.wood.block({ cx: 0, cy: 0, cz: 78.36, sx: 4.2, sy: 5.6, sz: 0.1, chamfer: 0.02, jitter: 0, color: K.timberDark, rand });
    batch.metal.block({ cx: 0, cy: 5.6, cz: 78.34, sx: 4.6, sy: 0.4, sz: 0.12, chamfer: 0.02, jitter: 0, color: PALETTE.brass, rand });
    // braziers on the wall-walks' landings light the stairs' heads
    for (const f of W.floors.filter((x) => x.id.endsWith('-landing'))) flames.push({ position: [f.center[0], f.y + 1.05, f.center[2]], scale: 1.2 });
    // the ladders' trestles in the muster
    for (const l of W.restlessDay.ladders) {
      for (const dz of [-1.6, 1.6]) {
        batch.wood.block({ cx: l.x, cy: 0, cz: l.z + dz, sx: 2.8, sy: 0.32, sz: 0.4, chamfer: 0.02, jitter: 0.01, color: K.timberDark, rand });
        for (const dx of [-1.1, 1.1]) batch.wood.block({ cx: l.x + dx, cy: 0, cz: l.z + dz, sx: 0.18, sy: 0.55, sz: 0.18, chamfer: 0.01, jitter: 0, color: K.timber, rand });
      }
    }
    // the processional avenue's brass inlays up to the dais
    for (let z = 26; z <= 46; z += 4) batch.metal.block({ cx: 0, cy: 0.005, cz: z, sx: 1.6, sy: 0.02, sz: 0.4, chamfer: 0, jitter: 0, color: PALETTE.brass, rand, shade: 0.02 });
  }

  #buildMonument() {
    const parent = new THREE.Group();
    parent.name = 'The Rightful Renowner — Colossus of Bureaucracy';
    const r = RESTLESS_DAY_WORLD.restlessDay.renowner;
    parent.position.set(r.x, r.y, r.z);
    this.group.add(parent);
    this.monument = parent;
    const m = this.materials;
    // fills the effigy's hit volume (renowner-body: 3.1 x 5.1 x 2.8 from y 1.45)
    box(parent, [2.45, 2.4, 1.75], [0, 2.35, 0], m.iron);
    box(parent, [2.75, 0.4, 2.1], [0, 3.64, 0], m.brass);
    box(parent, [2.35, 0.3, 1.8], [0, 1.35, 0], m.brassDark);
    box(parent, [1.75, 1.35, 1.6], [0, 4.05, 0], m.iron);
    box(parent, [1.85, 0.25, 1.75], [0, 4.65, 0], m.brass);
    box(parent, [0.25, 0.75, 1.2], [0, 5.15, -0.1], m.crimsonGold);
    const visor = box(parent, [1.6, 0.18, 0.14], [0, 4.12, 0.83], m.ironRusted);
    visor.name = 'Renowner iron visor';
    for (const side of [-1, 1]) {
      box(parent, [0.75, 1.85, 0.85], [side * 1.45, 2.55, 0], m.iron);
      box(parent, [0.85, 0.35, 0.95], [side * 1.45, 2.85, 0], m.brass);
    }
    for (const side of [-1, 1]) box(parent, [0.7, 1.3, 0.9], [side * 0.55, 0.7, 0], m.iron);
    const sword = new THREE.Group();
    sword.name = 'Renowner articulated sword';
    sword.position.set(0.3, 2.9, 0.92);
    parent.add(sword);
    this.sword = sword;
    pipe(sword, [0, 0, 0], [0, 0, 1.9], 0.14, m.brass);
    box(sword, [1.85, 0.16, 0.22], [0, 0, 1.9], m.brass);
    box(sword, [0.33, 0.22, 5.0], [0, 0, 4.1], m.iron);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.72, 4), m.iron);
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 6.93;
    tip.castShadow = true;
    sword.add(tip);
    box(parent, [1.2, 1.4, 0.8], [0, 2.2, -0.9], m.brassDark);
    pipe(parent, [0, 1.5, -0.8], [0, 1.2, 0.8], 0.18, m.brass);
  }

  #replaceLadders(list) {
    const key = JSON.stringify(list.map(l => [l.id, l.state, l.wall, l.position.x, l.position.y, l.position.z, l.health, l.heading]));
    if (key === this.lastLadderKey) return;
    this.lastLadderKey = key;
    for (const g of this.ladders.values()) {
      this.group.remove(g);
      g.traverse(obj => obj.geometry?.dispose?.());
    }
    this.ladders.clear();
    for (const l of list) {
      if (l.state === 'broken') continue;
      const grp = new THREE.Group();
      grp.name = 'Metal siege ladder ' + l.id;
      const deployed = l.state === 'deployed', w = deployed ? RESTLESS_DAY_WORLD.walls[l.wall] : null;
      const z0 = deployed ? w.approachZ : 0, z1 = deployed ? w.z - (l.wall === 0 ? 1.8 : 1.9) - z0 : 7.4;
      const y1 = deployed ? w.height : 0.3;
      const end0 = [0, 0.15, deployed ? z0 - l.position.z : 0];
      const end1 = [0, y1, deployed ? z1 : 7.4];
      for (const x of [-1.23, 1.23]) pipe(grp, [x, end0[1], end0[2]], [x, end1[1], end1[2]], 0.12, this.materials.iron);
      for (let i = 1; i < 12; i++) {
        const t = i / 12, y = end0[1] + (end1[1] - end0[1]) * t, z = end0[2] + (end1[2] - end0[2]) * t;
        pipe(grp, [-1.25, y, z], [1.25, y, z], 0.095, this.materials.brass);
      }
      grp.position.set(l.position.x, l.position.y, l.position.z);
      if (!deployed) {
        grp.rotation.x = l.state === 'carrying' ? -1.2 : Math.PI / 2;
        grp.rotation.y = l.state === 'carrying' ? (l.heading ?? 0) : 0;
      }
      this.group.add(grp);
      this.ladders.set(l.id, grp);
    }
  }

  setRestlessDayState(state, snapshot = null) {
    this.lastMode = state;
    this.lastServerTime = snapshot?.serverTime ?? 0;
    this.latestSnapshot = snapshot;
    if (Number.isFinite(snapshot?.matchSeconds) && snapshot.matchSeconds > 0) this.matchSeconds = snapshot.matchSeconds;
    for (const [id, m] of this.structureMeshes) m.visible = (snapshot?.structures?.entities?.[id]?.health ?? 1) > 0;
    this.#replaceLadders(state?.ladders ?? []);
    const active = new Set();
    for (const coin of state?.renowner?.coinProjectiles ?? []) {
      active.add(coin.id);
      let mesh = this.coinVisuals.get(coin.id);
      if (!mesh) {
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.08, 12), this.materials.brass);
        mesh.rotation.x = Math.PI / 2;
        mesh.castShadow = true;
        this.group.add(mesh);
        this.coinVisuals.set(coin.id, mesh);
      }
      mesh.position.set(coin.position.x, coin.position.y, coin.position.z);
    }
    for (const [id, mesh] of this.coinVisuals) {
      if (active.has(id)) continue;
      mesh.geometry.dispose();
      this.group.remove(mesh);
      this.coinVisuals.delete(id);
    }
    if (this.monument) {
      this.monument.visible = (state?.renowner?.health ?? 1) > 0;
      this.monument.rotation.y = state?.renowner?.yaw ?? Math.PI;
    }
  }

  setBiByeState(snapshot, serverNow = snapshot?.serverTime, options = {}) {
    if (snapshot?.bibyeBallista && !this.biByeLlista) this.biByeLlista = new BiByeLlistaRenderer(this.scene);
    if (this.biByeRoomCode !== snapshot?.roomCode) {
      this.biByeRoomCode = snapshot?.roomCode;
      this.biByeMotion = new BiByeMotion();
    }
    if ((snapshot?.bibyeRevision ?? 0) < this.biByeMotion.revision) return;
    this.biByePresentationOptions = options;
    this.biByeMotion.push(snapshot?.bibyeBallista ?? null, snapshot?.bibyeProjectiles ?? [], snapshot?.serverTime ?? serverNow, snapshot?.bibyeRevision ?? 0);
    this.biByeServerTime = serverNow;
  }

  /** How much of the day is spent (0 at the start, 1 at sundown), from the authoritative deadline only. */
  daySpent(now) {
    const deadline = this.lastMode?.deadline;
    const total = Math.max(1, this.matchSeconds);
    const remaining = Number.isFinite(deadline) ? Math.max(0, deadline - now)
      : Number.isFinite(this.lastMode?.daylightRemaining) ? this.lastMode.daylightRemaining : total;
    return Math.min(1, Math.max(0, 1 - remaining / total));
  }

  #sundown(now) {
    // (the runtime turns the sun itself down the sky on the same clock; this is the light's and the air's colour)
    const t = this.daySpent(now);
    // the light stays a working day's for the first half, then warms, then reddens: two segments, eased
    const k = Math.max(0, (t - 0.35) / 0.65);
    const pick = (stops, out) => {
      const u = Math.min(1, k * 2), v = Math.max(0, k * 2 - 1);
      return out.copy(stops[0]).lerp(stops[1], u * u * (3 - 2 * u)).lerp(stops[2], v * v * (3 - 2 * v));
    };
    const c = this.sundownColors;
    if (this.sunLight) pick(c.sun, this.sunLight.color);
    if (this.hemiLight) { pick(c.hemiSky, this.hemiLight.color); pick(c.hemiGround, this.hemiLight.groundColor); }
    if (this.scene.fog?.color) {
      pick(c.fog, this.scene.fog.color);
      this.scene.fog.density = RESTLESS_DAY_LIGHTING.fog.density * (1 + k * 0.7);
    }
    if (this.scene.background?.isColor && this.scene.fog?.color) this.scene.background.copy(this.scene.fog.color);
    if (this.backdrop?.sky?.material?.color) pick(c.sky, this.backdrop.sky.material.color);
  }

  update(now) {
    const view = this.biByeMotion.sample(this.biByeServerTime ?? now, this.biByePresentationOptions?.local, this.biByePresentationOptions?.frozen);
    this.biByeLlista?.update(view.clock, view.ballista, view.projectiles);
    for (const coin of this.coinVisuals.values()) coin.rotation.y += 0.1;
    const attack = this.lastMode?.renowner?.attack;
    if (attack) {
      const swing = Math.max(0, Math.min(1, (now - attack.contactAt + 0.16) / 0.4));
      this.sword.rotation.x = attack.type === 'downstroke' ? -Math.sin(swing * Math.PI) * 1.25 : 0;
      this.sword.rotation.y = attack.type === 'sweep' ? (swing - 0.5) * 2.3 : 0;
    } else {
      this.sword.rotation.x = 0;
      this.sword.rotation.y = 0;
    }
    this.fire?.update(now);
    this.#sundown(now);
  }

  dispose() {
    this.biByeLlista?.dispose();
    if (this.sunLight && this.original.sun) this.sunLight.color.copy(this.original.sun);
    if (this.hemiLight && this.original.hemiSky) { this.hemiLight.color.copy(this.original.hemiSky); this.hemiLight.groundColor.copy(this.original.hemiGround); }
    this.fire?.dispose();
    this.scene.remove(this.group);
    this.group.traverse((x) => { x.geometry?.dispose?.(); });
    for (const mat of Object.values(this.materials)) mat.dispose?.();
    for (const mat of Object.values(this.kit)) { mat.map?.dispose?.(); mat.dispose?.(); }
    this.bannerMaterial?.map?.dispose?.();
    this.bannerMaterial?.dispose?.();
    this.backdrop?.sky?.material?.dispose?.();
  }
}
