import * as THREE from 'three';
import { RenownerModel } from './RenownerModel.mjs';
import { RESTLESS_RENOWNER_SCALE } from '../../shared/worlds/renownerGeometry.mjs';
import { RESTLESS_DAY_WORLD } from '../../shared/worlds/restlessDay.mjs';
import { BiByeLlistaRenderer } from './BiByeLlistaRenderer.mjs';
import { BiByeMotion } from './biByeMotion.mjs';
import { FacetBuilder, facetMesh } from './kit/facetKit.mjs';
import { createBatch } from './kit/kitPieces.mjs';

export const RESTLESS_DAY_LIGHTING = Object.freeze({
  cameraFar: 310,
  background: 0xb8d0df,
  fog: Object.freeze({ color: 0xb8d0df, density: 0.0017 }),
  hemisphere: Object.freeze({ skyColor: 0xeaf1e7, groundColor: 0x5d615d, intensity: 1.75 }),
  sun: Object.freeze({ color: 0xffd795, intensity: 2.25, position: [-55, 70, -25] }),
});

const PALETTE = Object.freeze({
  stone: 0x9e9788,
  stoneDark: 0x6e685c,
  stoneLight: 0xd6cdbc,
  mortar: 0x4f493f,
  timber: 0x5c3e2b,
  timberDark: 0x3d2719,
  timberLight: 0x7d5a3f,
  iron: 0x3a4047,
  ironRusted: 0x4a362b,
  brass: 0xc49a4a,
  brassDark: 0x82632b,
  canvas: 0xccbba0,
  canvasDark: 0x9e8e74,
  crimson: 0x8a2327,
  crimsonGold: 0xb23338,
  earth: 0x443525,
  turf: 0x586044,
  flame: 0xff8c2b,
});

const createMat = (color, roughness = 0.72, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

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

function rampMesh(parent, ramp, mat) {
  const x0 = ramp.minX, x1 = ramp.maxX, z0 = ramp.minZ, z1 = ramp.maxZ;
  const y0 = ramp.startY + 0.025, y1 = ramp.endY + 0.025;
  const p = ramp.axis === 'z'
    ? [[x0, y0, z0], [x1, y0, z0], [x0, y1, z1], [x1, y1, z1]]
    : [[x0, y0, z0], [x0, y0, z1], [x1, y1, z0], [x1, y1, z1]];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([p[0], p[2], p[1], p[1], p[2], p[3]].flat(), 3));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, mat);
  mesh.material.side = THREE.DoubleSide;
  mesh.receiveShadow = true;
  parent.add(mesh);
}

function addBatchBlock(builder, dimensions, center, color, { chamfer = 0.04, jitter = 0.0, rotY = 0, bottom = true } = {}) {
  const [sx, sy, sz] = dimensions;
  const [cx, cy, cz] = center;
  builder.block({
    cx,
    cy: cy - sy / 2,
    cz,
    sx,
    sy,
    sz,
    rotY,
    chamfer,
    jitter,
    color,
    bottom,
    rand: () => 0.5,
    shade: 0,
  });
}

function addBatchCylinder(builder, { cx, cy, cz, rTop, rBot, height, segments = 10, color, rotX = 0, rotZ = 0 }) {
  const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
  const cosZ = Math.cos(rotZ), sinZ = Math.sin(rotZ);

  function transform(x, y, z) {
    const dy = y, dz = z;
    const y_ = dy * cosX - dz * sinX;
    const z_ = dy * sinX + dz * cosX;
    const dx = x;
    const x_ = dx * cosZ - y_ * sinZ;
    const fy = dx * sinZ + y_ * cosZ;
    return [cx + x_, cy + fy, cz + z_];
  }

  const y0 = -height / 2;
  const y1 = height / 2;

  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const x0Top = Math.cos(a0) * rTop, z0Top = Math.sin(a0) * rTop;
    const x1Top = Math.cos(a1) * rTop, z1Top = Math.sin(a1) * rTop;
    const x0Bot = Math.cos(a0) * rBot, z0Bot = Math.sin(a0) * rBot;
    const x1Bot = Math.cos(a1) * rBot, z1Bot = Math.sin(a1) * rBot;

    const p0Top = transform(x0Top, y1, z0Top);
    const p1Top = transform(x1Top, y1, z1Top);
    const p0Bot = transform(x0Bot, y0, z0Bot);
    const p1Bot = transform(x1Bot, y0, z1Bot);

    builder.quad(p0Bot, p1Bot, p1Top, p0Top, color);
    const pTopCenter = transform(0, y1, 0);
    builder.tri(pTopCenter, p1Top, p0Top, color);
    const pBotCenter = transform(0, y0, 0);
    builder.tri(pBotCenter, p0Bot, p1Bot, color);
  }
}

function addBatchPipe(builder, from, to, radius, color, segments = 8) {
  const [x0, y0, z0] = from, [x1, y1, z1] = to;
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  const len = Math.hypot(dx, dy, dz) || 0.001;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
  const rotZ = Math.atan2(dx, dy);
  const rotX = -Math.atan2(dz, Math.hypot(dx, dy));
  addBatchCylinder(builder, { cx, cy, cz, rTop: radius, rBot: radius, height: len, segments, color, rotX, rotZ });
}

export class RestlessDayRenderer {
  constructor(scene) {
    this.scene = scene;
    this.lighting = RESTLESS_DAY_LIGHTING;
    this.group = new THREE.Group();
    this.group.name = 'Restless Day — The Two Fortified Curtains';

    this.materials = {
      stone: createMat(PALETTE.stone, 0.78, 0.05),
      stoneDark: createMat(PALETTE.stoneDark, 0.82, 0.05),
      stoneLight: createMat(PALETTE.stoneLight, 0.70, 0.08),
      mortar: createMat(PALETTE.mortar, 0.90, 0.0),
      timber: createMat(PALETTE.timber, 0.75, 0.02),
      timberDark: createMat(PALETTE.timberDark, 0.85, 0.0),
      timberLight: createMat(PALETTE.timberLight, 0.70, 0.0),
      iron: createMat(PALETTE.iron, 0.42, 0.75),
      ironRusted: createMat(PALETTE.ironRusted, 0.65, 0.55),
      brass: createMat(PALETTE.brass, 0.35, 0.72),
      brassDark: createMat(PALETTE.brassDark, 0.45, 0.65),
      canvas: createMat(PALETTE.canvas, 0.80, 0.0),
      canvasDark: createMat(PALETTE.canvasDark, 0.85, 0.0),
      crimson: createMat(PALETTE.crimson, 0.65, 0.05),
      crimsonGold: createMat(PALETTE.crimsonGold, 0.55, 0.1),
      earth: createMat(PALETTE.earth, 0.92, 0.0),
      turf: createMat(PALETTE.turf, 0.88, 0.0),
      flame: new THREE.MeshBasicMaterial({ color: PALETTE.flame }),
    };

    this.batchMaterials = {
      stone: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.78, metalness: 0.05 }),
      ground: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.88, metalness: 0.0 }),
      wood: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.75, metalness: 0.02 }),
      metal: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.42, metalness: 0.75 }),
      cloth: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.80, metalness: 0.0 }),
    };

    this.structureMeshes = new Map();
    this.flameMeshes = [];
    this.torchLights = [];

    // Cache light references
    this.sunLight = null;
    this.hemiLight = null;
    this.originalSunColor = null;
    this.originalSunIntensity = undefined;
    this.originalSunPos = null;
    this.originalHemiColor = null;
    this.originalHemiIntensity = undefined;
    this.originalBackground = null;
    this.originalFogColor = null;
    this.originalFogDensity = undefined;
    this.#cacheLights();

    // Procedural facet batching
    const batch = createBatch();
    this.#buildFloors(batch);
    this.#buildSolidsAndCurtains(batch);
    this.#buildRamps();
    this.#buildMusteringGround(batch);
    this.#buildExposedApproach(batch);
    this.#buildInnerCourt(batch);
    this.#buildFinalCourtAndColonnade(batch);
    this.#buildMonument();

    // Generate unified meshes per material channel to minimize draw calls
    for (const [name, builder] of Object.entries(batch)) {
      if (!builder.triangleCount) continue;
      const mat = this.batchMaterials[name] ?? this.materials.stone;
      const m = facetMesh(builder, mat, {
        castShadow: name !== 'ground',
        receiveShadow: true,
        name: `restless-facet-${name}`,
      });
      this.group.add(m);
    }

    this.ladders = new Map();
    this.lastMode = null;
    this.lastLadderKey = '';
    this.coinVisuals = new Map();
    this.biByeLlista = null;
    this.biByeMotion = new BiByeMotion();
    this.biByeRoomCode = null;
    this.biByePresentationOptions = null;

    scene.add(this.group);
  }

  #cacheLights() {
    if (!this.scene) return;
    this.scene.traverse((obj) => {
      if (obj.isDirectionalLight && !this.sunLight) this.sunLight = obj;
      if (obj.isHemisphereLight && !this.hemiLight) this.hemiLight = obj;
    });
    if (this.sunLight) {
      this.originalSunColor = this.sunLight.color.clone();
      this.originalSunIntensity = this.sunLight.intensity;
      this.originalSunPos = this.sunLight.position.clone();
    }
    if (this.hemiLight) {
      this.originalHemiColor = this.hemiLight.color.clone();
      this.originalHemiIntensity = this.hemiLight.intensity;
    }
    if (this.scene.background?.isColor) {
      this.originalBackground = this.scene.background.clone();
    }
    if (this.scene.fog?.color) {
      this.originalFogColor = this.scene.fog.color.clone();
      this.originalFogDensity = this.scene.fog.density;
    }
  }

  #buildFloors(batch) {
    for (const floor of RESTLESS_DAY_WORLD.floors) {
      const color = floor.material === 'timber' ? PALETTE.timber
        : floor.id === 'field' ? PALETTE.turf
        : floor.id === 'final-court' ? PALETTE.stoneLight
        : PALETTE.stone;
      const channel = floor.material === 'timber' ? batch.wood
        : (floor.id === 'field' ? batch.ground : batch.stone);
      addBatchBlock(channel, floor.size, floor.center, color, { chamfer: 0.02 });
    }
    // Churned soil tracks for siege machinery
    addBatchBlock(batch.ground, [4.4, 0.02, 34], [-4, 0.01, -73], PALETTE.earth, { chamfer: 0 });
    addBatchBlock(batch.ground, [4.2, 0.02, 34], [15, 0.01, -73], PALETTE.earth, { chamfer: 0 });
  }

  #buildSolidsAndCurtains(batch) {
    for (const solid of RESTLESS_DAY_WORLD.solids) {
      if (solid.id === 'renowner-body') continue;
      if (solid.id === 'outer-gate' || solid.id === 'inner-gate') {
        // Gates are destructible structures, keep as separate meshes
        const mat = this.materials[solid.material] ?? this.materials.timber;
        const m = box(this.group, solid.size, solid.center, mat);
        this.structureMeshes.set(solid.id, m);

        // Architectural gate arch framing batched into stone
        const h = solid.size[1], z = solid.center[2], w = solid.size[0];
        addBatchBlock(batch.stone, [w + 1.2, 0.7, solid.size[2] + 0.4], [0, h + 0.35, z], PALETTE.stoneDark);
        addBatchBlock(batch.stone, [0.8, h, solid.size[2] + 0.3], [-w / 2 - 0.4, h / 2, z], PALETTE.stoneDark);
        addBatchBlock(batch.stone, [0.8, h, solid.size[2] + 0.3], [w / 2 + 0.4, h / 2, z], PALETTE.stoneDark);
        continue;
      }

      const color = PALETTE[solid.material] ?? PALETTE.stone;
      const channel = solid.material === 'timber' ? batch.wood
        : (solid.material === 'brass' ? batch.metal : (solid.material === 'iron' ? batch.metal : batch.stone));
      addBatchBlock(channel, solid.size, solid.center, color);
    }

    // Outer curtain architectural enhancement (corbels & machicolations)
    for (const zWall of [-24, 22]) {
      const isOuter = zWall === -24;
      const h = isOuter ? 6 : 7;
      const zOffset = isOuter ? -1.1 : 1.25;
      for (let x = -22; x <= 22; x += 3.2) {
        if (Math.abs(x) < 3.2) continue; // skip above gate
        addBatchBlock(batch.stone, [0.45, 0.7, 0.55], [x, h - 0.35, zWall + zOffset], PALETTE.stoneDark);
      }
    }
  }

  #buildRamps() {
    for (const r of RESTLESS_DAY_WORLD.ramps) {
      rampMesh(this.group, r, this.materials.stone);
    }
  }

  #buildMusteringGround(batch) {
    // Staging wagons with spoke wheels
    const makeWagon = (x, z, yaw) => {
      // Bed and sideboards
      addBatchBlock(batch.wood, [2.4, 0.28, 4.4], [x, 0.95, z], PALETTE.timber, { rotY: yaw });
      addBatchBlock(batch.wood, [0.12, 0.75, 4.4], [x - 1.15, 1.4, z], PALETTE.timber, { rotY: yaw });
      addBatchBlock(batch.wood, [0.12, 0.75, 4.4], [x + 1.15, 1.4, z], PALETTE.timber, { rotY: yaw });
      addBatchBlock(batch.wood, [2.4, 0.75, 0.12], [x, 1.4, z - 2.15], PALETTE.timber, { rotY: yaw });
      // Wheels
      for (const [wx, wz] of [[-1.3, -1.4], [1.3, -1.4], [-1.3, 1.4], [1.3, 1.4]]) {
        addBatchCylinder(batch.metal, {
          cx: x + wx, cy: 0.55, cz: z + wz,
          rTop: 0.55, rBot: 0.55, height: 0.18, segments: 10,
          color: PALETTE.iron, rotZ: Math.PI / 2
        });
        addBatchPipe(batch.wood, [x + wx, 0.55, z + wz], [x + (wx > 0 ? 0.9 : -0.9), 0.55, z + wz], 0.08, PALETTE.timberDark);
      }
      // Supplies inside: barrels and canvas
      addBatchBlock(batch.cloth, [1.6, 0.65, 2.2], [x, 1.35, z - 0.6], PALETTE.canvasDark, { rotY: yaw });
      addBatchCylinder(batch.wood, {
        cx: x + 0.5, cy: 1.45, cz: z + 1.1,
        rTop: 0.38, rBot: 0.38, height: 0.85, segments: 8,
        color: PALETTE.timberDark
      });
    };

    makeWagon(-21, -84, 0.15);
    makeWagon(21, -84, -0.12);

    // Ammunition shot pyramids
    const makeShotPyramid = (x, z) => {
      addBatchBlock(batch.wood, [1.8, 0.15, 1.8], [x, 0.08, z], PALETTE.timberDark);
      const r = 0.22;
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          addBatchCylinder(batch.stone, {
            cx: x + (row - 1) * r * 1.9, cy: 0.15 + r, cz: z + (col - 1) * r * 1.9,
            rTop: r * 0.8, rBot: r * 0.8, height: r * 1.6, segments: 6,
            color: PALETTE.stoneDark
          });
        }
      }
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 2; col++) {
          addBatchCylinder(batch.stone, {
            cx: x + (row - 0.5) * r * 1.9, cy: 0.15 + r * 2.6, cz: z + (col - 0.5) * r * 1.9,
            rTop: r * 0.8, rBot: r * 0.8, height: r * 1.6, segments: 6,
            color: PALETTE.stoneDark
          });
        }
      }
    };

    makeShotPyramid(-16, -72);
    makeShotPyramid(21, -74);

    // Military wedge pavilions / canvas tents on outer flanks
    const makeTent = (x, z, yaw) => {
      addBatchBlock(batch.cloth, [3.6, 2.4, 4.8], [x, 1.2, z], PALETTE.canvas, { rotY: yaw, chamfer: 0.08 });
      addBatchPipe(batch.wood, [x, 2.45, z - 2.4], [x, 2.45, z + 2.4], 0.07, PALETTE.timberDark);
      addBatchPipe(batch.wood, [x, 0, z - 2.4], [x, 2.8, z - 2.4], 0.06, PALETTE.timberDark);
      addBatchPipe(batch.wood, [x, 0, z + 2.4], [x, 2.8, z + 2.4], 0.06, PALETTE.timberDark);
      addBatchBlock(batch.cloth, [0.04, 0.45, 0.9], [x, 2.6, z + 2.0], PALETTE.crimson, { rotY: yaw });
    };

    makeTent(-22, -92, 0.2);
    makeTent(22, -92, -0.2);

    // Ladder staging trestles at z=-68
    for (const lx of [-10, 10]) {
      addBatchBlock(batch.wood, [2.6, 0.35, 0.7], [lx, 0.18, -69.8], PALETTE.timberDark);
      addBatchBlock(batch.metal, [0.35, 0.55, 0.35], [lx - 1.0, 0.28, -69.8], PALETTE.iron);
      addBatchBlock(batch.metal, [0.35, 0.55, 0.35], [lx + 1.0, 0.28, -69.8], PALETTE.iron);
    }
  }

  #buildExposedApproach(batch) {
    // Wicker gabions and angled stakes on flanks
    const makeGabion = (x, z, h = 1.3) => {
      addBatchCylinder(batch.wood, {
        cx: x, cy: h / 2, cz: z,
        rTop: 0.48, rBot: 0.48, height: h, segments: 8,
        color: PALETTE.timberDark
      });
      addBatchCylinder(batch.ground, {
        cx: x, cy: h + 0.04, cz: z,
        rTop: 0.42, rBot: 0.42, height: 0.08, segments: 8,
        color: PALETTE.earth
      });
    };

    makeGabion(-18, -37);
    makeGabion(-10.5, -37);
    makeGabion(12, -38);
    makeGabion(18, -38);
    makeGabion(-16, -52);
    makeGabion(7, -52);

    // Defensive stakes (abatis) angled forward toward attackers
    const makeStake = (x, z, yaw, pitch = 0.55) => {
      const len = 2.4;
      const topY = len * Math.sin(pitch);
      const topZ = z + len * Math.cos(pitch) * Math.cos(yaw);
      const topX = x - len * Math.cos(pitch) * Math.sin(yaw);
      addBatchPipe(batch.wood, [x, 0, z], [topX, topY, topZ], 0.08, PALETTE.timber);
    };

    for (let i = 0; i < 4; i++) {
      makeStake(-17 - i * 1.8, -42 - i * 1.5, 0.2);
      makeStake(17 + i * 1.8, -42 - i * 1.5, -0.2);
    }
  }

  #buildInnerCourt(batch) {
    // Ruined siege forge lean-to on west
    addBatchBlock(batch.wood, [3.8, 0.25, 3.2], [-20, 2.8, 2], PALETTE.timber);
    addBatchPipe(batch.wood, [-21.6, 0, 0.5], [-21.6, 2.8, 0.5], 0.12, PALETTE.timberDark);
    addBatchPipe(batch.wood, [-18.4, 0, 0.5], [-18.4, 2.8, 0.5], 0.12, PALETTE.timberDark);

    // Anvil
    addBatchBlock(batch.wood, [0.8, 0.65, 0.8], [-20, 0.32, 2], PALETTE.timberDark);
    addBatchBlock(batch.metal, [0.55, 0.4, 0.75], [-20, 0.85, 2], PALETTE.iron);

    // Masonry piles on east
    addBatchBlock(batch.stone, [2.4, 0.6, 1.8], [20, 0.3, 4], PALETTE.stoneDark);
    addBatchBlock(batch.stone, [1.6, 0.5, 1.4], [20.4, 0.85, 4.2], PALETTE.stoneLight);
  }

  #buildFinalCourtAndColonnade(batch) {
    // Triumphal Columns flanking the ceremonial approach
    const makeColumn = (x, z) => {
      const h = 4.8;
      addBatchBlock(batch.stone, [2.2, 0.6, 2.2], [x, 0.3, z], PALETTE.stoneDark);
      addBatchCylinder(batch.stone, {
        cx: x, cy: h / 2 + 0.6, cz: z,
        rTop: 0.85, rBot: 0.95, height: h, segments: 12,
        color: PALETTE.stoneLight
      });
      addBatchBlock(batch.metal, [2.2, 0.45, 2.2], [x, h + 0.82, z], PALETTE.brass);
      addBatchBlock(batch.stone, [2.4, 0.25, 2.4], [x, h + 1.15, z], PALETTE.stoneDark);
    };

    makeColumn(-15, 48);
    makeColumn(15, 48);
    makeColumn(-15, 64);
    makeColumn(15, 64);

    // Entablature beams connecting colonnade
    addBatchBlock(batch.stone, [2.0, 0.7, 16.0], [-15, 6.4, 56], PALETTE.stoneDark);
    addBatchBlock(batch.stone, [2.0, 0.7, 16.0], [15, 6.4, 56], PALETTE.stoneDark);

    // Brass coin inlays in the ceremonial court
    for (let cz = 48; cz <= 66; cz += 6) {
      for (const cx of [-6, 0, 6]) {
        if (cz === 54 && cx === 0) continue; // under dais
        addBatchCylinder(batch.metal, {
          cx, cy: 0.02, cz,
          rTop: 0.65, rBot: 0.65, height: 0.04, segments: 10,
          color: PALETTE.brass
        });
      }
    }

    // Ceremonial Braziers flanking the dais
    const makeBrazier = (x, z) => {
      addBatchBlock(batch.stone, [0.9, 0.7, 0.9], [x, 0.35 + 0.75, z], PALETTE.stoneDark);
      addBatchCylinder(batch.metal, {
        cx: x, cy: 0.9 + 0.75, cz: z,
        rTop: 0.65, rBot: 0.45, height: 0.45, segments: 8,
        color: PALETTE.iron
      });
      // Flickering flame cone kept as animated mesh
      const fire = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.6, 6), this.materials.flame);
      fire.position.set(x, 1.3 + 0.75, z);
      this.group.add(fire);
      this.flameMeshes.push(fire);
    };

    makeBrazier(-4.8, 52);
    makeBrazier(4.8, 52);
    makeBrazier(-4.8, 60);
    makeBrazier(4.8, 60);

    // Heraldic Gonfalons
    for (const x of [-21, 21]) {
      addBatchPipe(batch.metal, [x, 6, -24], [x, 10.2, -24], 0.11, PALETTE.iron);
      addBatchBlock(batch.cloth, [2.2, 1.5, 0.1], [x + 1.1, 8.8, -24], PALETTE.crimson);
      addBatchPipe(batch.metal, [x, 7, 22], [x, 11.2, 22], 0.11, PALETTE.iron);
      addBatchBlock(batch.cloth, [2.2, 1.5, 0.1], [x + 1.1, 9.8, 22], PALETTE.crimsonGold);
    }

    // Receiving tray velvet and brass lip
    addBatchBlock(batch.metal, [1.45, 0.28, 0.95], [0, 1.45, 52.6], PALETTE.brass);
    addBatchBlock(batch.cloth, [1.25, 0.12, 0.75], [0, 1.55, 52.6], PALETTE.crimson);
  }

  #buildMonument() {
    const {x, y, z} = RESTLESS_DAY_WORLD.restlessDay.renowner;
    this.renowner = new RenownerModel(this.group, [x, y, z], {
      scale: RESTLESS_RENOWNER_SCALE, carpet: false,
    });
  }

  #replaceLadders(list) {
    const key = JSON.stringify(list.map(l => [l.id, l.state, l.wall, l.position.x, l.position.y, l.position.z, l.health]));
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

      for (const x of [-1.23, 1.23]) {
        pipe(grp, [x, end0[1], end0[2]], [x, end1[1], end1[2]], 0.12, this.materials.iron);
      }
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

    for (const [id, m] of this.structureMeshes) {
      m.visible = (snapshot?.structures?.entities?.[id]?.health ?? 1) > 0;
    }
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
      if (!active.has(id)) {
        mesh.geometry.dispose();
        this.group.remove(mesh);
        this.coinVisuals.delete(id);
      }
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
    this.biByeMotion.push(snapshot?.bibyeBallista ?? null, snapshot?.bibyeProjectiles ?? [],
      snapshot?.serverTime ?? serverNow, snapshot?.bibyeRevision ?? 0);
    this.biByeServerTime = serverNow;
  }

  #updateSundownAtmosphere(now) {
    if (!this.sunLight || !this.hemiLight) {
      this.#cacheLights();
    }

    const totalSec = 780;
    const deadline = this.lastMode?.deadline;
    const remaining = Number.isFinite(deadline)
      ? Math.max(0, deadline - now)
      : (Number.isFinite(this.lastMode?.daylightRemaining) ? this.lastMode.daylightRemaining : totalSec);
    const progress = Math.min(1, Math.max(0, 1 - remaining / totalSec));

    // Dynamic color interpolation
    const sunColor = new THREE.Color().lerpColors(
      new THREE.Color(0xffd795),
      new THREE.Color(0xff5220),
      progress
    );
    const skyColor = new THREE.Color().lerpColors(
      new THREE.Color(0xb8d0df),
      new THREE.Color(0x4a2434),
      progress
    );
    const hemiSky = new THREE.Color().lerpColors(
      new THREE.Color(0xeaf1e7),
      new THREE.Color(0x753b4e),
      progress
    );

    // Apply to scene background and fog if available
    if (this.scene.background?.isColor) {
      this.scene.background.copy(skyColor);
    }
    if (this.scene.fog?.color) {
      this.scene.fog.color.copy(skyColor);
      this.scene.fog.density = 0.0017 + progress * 0.0015;
    }

    // Direct property update on cached lights without per-frame scene.traverse
    if (this.sunLight) {
      this.sunLight.color.copy(sunColor);
      this.sunLight.intensity = 2.25 - progress * 0.45;
      const sx = -55 - progress * 20;
      const sy = 70 - progress * 52;
      const sz = -25 + progress * 10;
      this.sunLight.position.set(sx, sy, sz);
    }

    if (this.hemiLight) {
      this.hemiLight.color.copy(hemiSky);
    }

    // Flickering braziers
    const flicker = 1.0 + Math.sin(now * 8) * 0.15 + Math.cos(now * 13) * 0.1;
    for (const flame of this.flameMeshes) {
      flame.scale.set(flicker, 1.0 + Math.sin(now * 10) * 0.25, flicker);
    }
  }

  update(now) {
    const view = this.biByeMotion.sample(this.biByeServerTime ?? now,
      this.biByePresentationOptions?.local, this.biByePresentationOptions?.frozen);
    this.biByeLlista?.update(view.clock, view.ballista, view.projectiles);

    for (const coin of this.coinVisuals.values()) coin.rotation.y += 0.1;

    this.renowner.restless(now, this.lastMode?.renowner);

    this.#updateSundownAtmosphere(now);
  }

  dispose() {
    this.renowner?.dispose();
    this.biByeLlista?.dispose();

    // Restore cached lights to original baseline
    if (this.sunLight) {
      if (this.originalSunColor) this.sunLight.color.copy(this.originalSunColor);
      if (this.originalSunIntensity !== undefined) this.sunLight.intensity = this.originalSunIntensity;
      if (this.originalSunPos) this.sunLight.position.copy(this.originalSunPos);
    }
    if (this.hemiLight && this.originalHemiColor) {
      this.hemiLight.color.copy(this.originalHemiColor);
      if (this.originalHemiIntensity !== undefined) this.hemiLight.intensity = this.originalHemiIntensity;
    }
    if (this.scene.background?.isColor && this.originalBackground) {
      this.scene.background.copy(this.originalBackground);
    }
    if (this.scene.fog && this.originalFogColor) {
      this.scene.fog.color.copy(this.originalFogColor);
      this.scene.fog.density = this.originalFogDensity;
    }

    this.scene.remove(this.group);
    this.group.traverse(x => x.geometry?.dispose?.());
    for (const mat of Object.values(this.materials)) mat.dispose?.();
    for (const mat of Object.values(this.batchMaterials)) mat.dispose?.();
  }
}
