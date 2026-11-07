import * as THREE from 'three';
import { RESTLESS_DAY_WORLD } from '../../shared/worlds/restlessDay.mjs';
import { BiByeLlistaRenderer } from './BiByeLlistaRenderer.mjs';
import { BiByeMotion } from './biByeMotion.mjs';

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

    this.structureMeshes = new Map();
    this.flameMeshes = [];
    this.torchLights = [];

    this.#buildFloors();
    this.#buildSolidsAndCurtains();
    this.#buildRamps();
    this.#buildMusteringGround();
    this.#buildExposedApproach();
    this.#buildInnerCourt();
    this.#buildFinalCourtAndColonnade();
    this.#buildMonument();

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

  #buildFloors() {
    for (const floor of RESTLESS_DAY_WORLD.floors) {
      const mat = floor.material === 'timber' ? this.materials.timber
        : floor.id === 'field' ? this.materials.turf
        : floor.id === 'final-court' ? this.materials.stoneLight
        : this.materials.stone;
      box(this.group, floor.size, floor.center, mat);
    }
    // Churned soil tracks for siege machinery
    box(this.group, [4.4, 0.02, 34], [-4, 0.01, -73], this.materials.earth);
    box(this.group, [4.2, 0.02, 34], [15, 0.01, -73], this.materials.earth);
  }

  #buildSolidsAndCurtains() {
    for (const solid of RESTLESS_DAY_WORLD.solids) {
      if (solid.id === 'renowner-body') continue;
      const mat = this.materials[solid.material] ?? this.materials.stone;
      const m = box(this.group, solid.size, solid.center, mat);
      if (solid.id === 'outer-gate' || solid.id === 'inner-gate') {
        this.structureMeshes.set(solid.id, m);
        // Architectural gate arch framing
        const h = solid.size[1], z = solid.center[2], w = solid.size[0];
        box(this.group, [w + 1.2, 0.7, solid.size[2] + 0.4], [0, h + 0.35, z], this.materials.stoneDark);
        // Flanking pilasters
        box(this.group, [0.8, h, solid.size[2] + 0.3], [-w / 2 - 0.4, h / 2, z], this.materials.stoneDark);
        box(this.group, [0.8, h, solid.size[2] + 0.3], [w / 2 + 0.4, h / 2, z], this.materials.stoneDark);
      }
    }

    // Outer curtain architectural enhancement (corbels & machicolations)
    for (const zWall of [-24, 22]) {
      const isOuter = zWall === -24;
      const h = isOuter ? 6 : 7;
      const zOffset = isOuter ? -1.1 : 1.25;
      for (let x = -22; x <= 22; x += 3.2) {
        if (Math.abs(x) < 3.2) continue; // skip above gate
        // Projecting stone corbel bracket
        box(this.group, [0.45, 0.7, 0.55], [x, h - 0.35, zWall + zOffset], this.materials.stoneDark);
      }
    }
  }

  #buildRamps() {
    for (const r of RESTLESS_DAY_WORLD.ramps) {
      rampMesh(this.group, r, this.materials.stone);
    }
  }

  #buildMusteringGround() {
    const parent = new THREE.Group();
    parent.name = 'Mustering Ground Staging';
    this.group.add(parent);

    // Staging wagons with spoke wheels
    const makeWagon = (x, z, yaw) => {
      const wGrp = new THREE.Group();
      wGrp.position.set(x, 0, z);
      wGrp.rotation.y = yaw;
      parent.add(wGrp);
      // Bed and sideboards
      box(wGrp, [2.4, 0.28, 4.4], [0, 0.95, 0], this.materials.timber);
      box(wGrp, [0.12, 0.75, 4.4], [-1.15, 1.4, 0], this.materials.timber);
      box(wGrp, [0.12, 0.75, 4.4], [1.15, 1.4, 0], this.materials.timber);
      box(wGrp, [2.4, 0.75, 0.12], [0, 1.4, -2.15], this.materials.timber);
      // Wheels
      for (const [wx, wz] of [[-1.3, -1.4], [1.3, -1.4], [-1.3, 1.4], [1.3, 1.4]]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.18, 12), this.materials.iron);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.55, wz);
        wheel.castShadow = true;
        wGrp.add(wheel);
        pipe(wGrp, [wx, 0.55, wz], [wx > 0 ? 0.9 : -0.9, 0.55, wz], 0.08, this.materials.timberDark);
      }
      // Supplies inside: barrels and canvas
      box(wGrp, [1.6, 0.65, 2.2], [0, 1.35, -0.6], this.materials.canvasDark);
      const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.85, 10), this.materials.timberDark);
      b1.position.set(0.5, 1.45, 1.1);
      wGrp.add(b1);
    };

    makeWagon(-21, -84, 0.15);
    makeWagon(21, -84, -0.12);

    // Ammunition shot pyramids
    const makeShotPyramid = (x, z) => {
      box(parent, [1.8, 0.15, 1.8], [x, 0.08, z], this.materials.timberDark);
      const r = 0.22;
      const sphereGeo = new THREE.SphereGeometry(r, 7, 6);
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          const ball = new THREE.Mesh(sphereGeo, this.materials.stoneDark);
          ball.position.set(x + (row - 1) * r * 1.9, 0.15 + r, z + (col - 1) * r * 1.9);
          ball.castShadow = true;
          parent.add(ball);
        }
      }
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 2; col++) {
          const ball = new THREE.Mesh(sphereGeo, this.materials.stoneDark);
          ball.position.set(x + (row - 0.5) * r * 1.9, 0.15 + r * 2.6, z + (col - 0.5) * r * 1.9);
          ball.castShadow = true;
          parent.add(ball);
        }
      }
    };

    makeShotPyramid(-16, -72);
    makeShotPyramid(21, -74);

    // Military wedge pavilions / canvas tents on outer flanks
    const makeTent = (x, z, yaw) => {
      const tGrp = new THREE.Group();
      tGrp.position.set(x, 0, z);
      tGrp.rotation.y = yaw;
      parent.add(tGrp);
      box(tGrp, [3.6, 2.4, 4.8], [0, 1.2, 0], this.materials.canvas);
      // Ridge beam & poles
      pipe(tGrp, [0, 2.45, -2.4], [0, 2.45, 2.4], 0.07, this.materials.timberDark);
      pipe(tGrp, [0, 0, -2.4], [0, 2.8, -2.4], 0.06, this.materials.timberDark);
      pipe(tGrp, [0, 0, 2.4], [0, 2.8, 2.4], 0.06, this.materials.timberDark);
      // Crest pennant
      box(tGrp, [0.04, 0.45, 0.9], [0, 2.6, 2.0], this.materials.crimson);
    };

    makeTent(-22, -92, 0.2);
    makeTent(22, -92, -0.2);

    // Ladder staging trestles at z=-68
    for (const lx of [-10, 10]) {
      box(parent, [2.6, 0.35, 0.7], [lx, 0.18, -69.8], this.materials.timberDark);
      box(parent, [0.35, 0.55, 0.35], [lx - 1.0, 0.28, -69.8], this.materials.iron);
      box(parent, [0.35, 0.55, 0.35], [lx + 1.0, 0.28, -69.8], this.materials.iron);
    }
  }

  #buildExposedApproach() {
    const parent = new THREE.Group();
    parent.name = 'Exposed Approach Defenses';
    this.group.add(parent);

    // Wicker gabions and angled stakes on flanks
    const makeGabion = (x, z, h = 1.3) => {
      const g = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, h, 10), this.materials.timberDark);
      g.position.set(x, h / 2, z);
      g.castShadow = true;
      parent.add(g);
      // Earth top
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 10), this.materials.earth);
      top.position.set(x, h + 0.04, z);
      parent.add(top);
    };

    makeGabion(-18, -37);
    makeGabion(-10.5, -37);
    makeGabion(12, -38);
    makeGabion(18, -38);
    makeGabion(-9.5, -52);
    makeGabion(9.5, -52);

    // Defensive stakes (abatis) angled forward toward attackers
    const makeStake = (x, z, yaw, pitch = 0.55) => {
      const len = 2.4;
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.11, len, 6), this.materials.timber);
      s.rotation.set(pitch, yaw, 0, 'YXZ');
      s.position.set(x, (len / 2) * Math.sin(pitch), z);
      s.castShadow = true;
      parent.add(s);
    };

    for (let i = 0; i < 4; i++) {
      makeStake(-17 - i * 1.8, -42 - i * 1.5, 0.2);
      makeStake(17 + i * 1.8, -42 - i * 1.5, -0.2);
    }
  }

  #buildInnerCourt() {
    const parent = new THREE.Group();
    parent.name = 'Contested Inner Court';
    this.group.add(parent);

    // Ruined siege forge lean-to on west
    box(parent, [3.8, 0.25, 3.2], [-20, 2.8, 2], this.materials.timber);
    pipe(parent, [-21.6, 0, 0.5], [-21.6, 2.8, 0.5], 0.12, this.materials.timberDark);
    pipe(parent, [-18.4, 0, 0.5], [-18.4, 2.8, 0.5], 0.12, this.materials.timberDark);

    // Anvil
    box(parent, [0.8, 0.65, 0.8], [-20, 0.32, 2], this.materials.timberDark);
    box(parent, [0.55, 0.4, 0.75], [-20, 0.85, 2], this.materials.iron);

    // Masonry piles on east
    box(parent, [2.4, 0.6, 1.8], [20, 0.3, 4], this.materials.stoneDark);
    box(parent, [1.6, 0.5, 1.4], [20.4, 0.85, 4.2], this.materials.stoneLight);
  }

  #buildFinalCourtAndColonnade() {
    const parent = new THREE.Group();
    parent.name = 'Renowner Monumental Colonnade';
    this.group.add(parent);

    // Triumphal Columns flanking the ceremonial approach
    const makeColumn = (x, z) => {
      const h = 4.8;
      // Base plinth
      box(parent, [2.2, 0.6, 2.2], [x, 0.3, z], this.materials.stoneDark);
      // Fluted cylindrical column
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, h, 14), this.materials.stoneLight);
      col.position.set(x, h / 2 + 0.6, z);
      col.castShadow = true;
      parent.add(col);
      // Ornate brass capital
      box(parent, [2.2, 0.45, 2.2], [x, h + 0.82, z], this.materials.brass);
      box(parent, [2.4, 0.25, 2.4], [x, h + 1.15, z], this.materials.stoneDark);
    };

    makeColumn(-15, 48);
    makeColumn(15, 48);
    makeColumn(-15, 64);
    makeColumn(15, 64);

    // Entablature beams connecting colonnade
    box(parent, [2.0, 0.7, 16.0], [-15, 6.4, 56], this.materials.stoneDark);
    box(parent, [2.0, 0.7, 16.0], [15, 6.4, 56], this.materials.stoneDark);

    // Brass coin inlays in the ceremonial court
    const coinGeo = new THREE.CylinderGeometry(0.65, 0.65, 0.04, 16);
    for (let cz = 48; cz <= 66; cz += 6) {
      for (const cx of [-6, 0, 6]) {
        if (cz === 54 && cx === 0) continue; // under dais
        const c = new THREE.Mesh(coinGeo, this.materials.brass);
        c.position.set(cx, 0.02, cz);
        c.receiveShadow = true;
        parent.add(c);
      }
    }

    // Ceremonial Braziers flanking the dais
    const makeBrazier = (x, z) => {
      const bGrp = new THREE.Group();
      bGrp.position.set(x, 0.75, z);
      parent.add(bGrp);
      box(bGrp, [0.9, 0.7, 0.9], [0, 0.35, 0], this.materials.stoneDark);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.45, 0.45, 8), this.materials.iron);
      bowl.position.set(0, 0.9, 0);
      bGrp.add(bowl);
      const fire = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.6, 6), this.materials.flame);
      fire.position.set(0, 1.3, 0);
      bGrp.add(fire);
      this.flameMeshes.push(fire);
    };

    makeBrazier(-4.8, 52);
    makeBrazier(4.8, 52);
    makeBrazier(-4.8, 60);
    makeBrazier(4.8, 60);
  }

  #buildMonument() {
    const parent = new THREE.Group();
    parent.name = 'The Rightful Renowner — Colossus of Bureaucracy';
    parent.position.set(0, 1.4, 56);
    this.group.add(parent);
    this.monument = parent;

    // Torso / Curass (heavy segmented plate)
    box(parent, [2.45, 2.4, 1.75], [0, 2.35, 0], this.materials.iron);
    box(parent, [2.75, 0.4, 2.1], [0, 3.64, 0], this.materials.brass);
    box(parent, [2.35, 0.3, 1.8], [0, 1.35, 0], this.materials.brassDark);

    // Ornate Gorget & Greathelm
    box(parent, [1.75, 1.35, 1.6], [0, 4.05, 0], this.materials.iron);
    box(parent, [1.85, 0.25, 1.75], [0, 4.65, 0], this.materials.brass);
    // Crested helm plume / finial
    box(parent, [0.25, 0.75, 1.2], [0, 5.15, -0.1], this.materials.crimsonGold);

    // Menacing visor slit
    const visor = box(parent, [1.6, 0.18, 0.14], [0, 4.12, 0.83], this.materials.ironRusted);
    visor.name = 'Renowner iron visor';

    // Massive Pauldrons
    for (let side of [-1, 1]) {
      box(parent, [0.75, 1.85, 0.85], [side * 1.45, 2.55, 0], this.materials.iron);
      box(parent, [0.85, 0.35, 0.95], [side * 1.45, 2.85, 0], this.materials.brass);
    }

    // Articulated Greatsword
    const sword = new THREE.Group();
    sword.name = 'Renowner articulated sword';
    sword.position.set(0.3, 2.9, 0.92);
    parent.add(sword);
    this.sword = sword;

    pipe(sword, [0, 0, 0], [0, 0, 1.9], 0.14, this.materials.brass);
    box(sword, [1.85, 0.16, 0.22], [0, 0, 1.9], this.materials.brass);
    box(sword, [0.33, 0.22, 5.0], [0, 0, 4.1], this.materials.stoneLight);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.72, 4), this.materials.stoneLight);
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 6.93;
    tip.castShadow = true;
    sword.add(tip);

    // Mechanical Coin Dispenser & Gilded Receiving Tray
    box(parent, [1.2, 1.4, 0.8], [0, 2.2, -0.9], this.materials.brassDark); // rear coin reservoir
    pipe(parent, [0, 1.5, -0.8], [0, 1.2, 0.8], 0.18, this.materials.brass); // feed chute
    // The solemn, modest receiving tray:
    box(this.group, [1.45, 0.28, 0.95], [0, 1.45, 52.6], this.materials.brass);
    box(this.group, [1.25, 0.12, 0.75], [0, 1.55, 52.6], this.materials.crimson); // velvet lining

    // Crimson Heraldic Gonfalons
    for (const x of [-21, 21]) {
      pipe(this.group, [x, 6, -24], [x, 10.2, -24], 0.11, this.materials.iron);
      box(this.group, [2.2, 1.5, 0.1], [x + 1.1, 8.8, -24], this.materials.crimson);
      pipe(this.group, [x, 7, 22], [x, 11.2, 22], 0.11, this.materials.iron);
      box(this.group, [2.2, 1.5, 0.1], [x + 1.1, 9.8, 22], this.materials.crimsonGold);
    }
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
    this.biByeMotion.push(snapshot?.bibyeBallista ?? null, snapshot?.bibyeProjectiles ?? [],
      snapshot?.serverTime ?? serverNow, snapshot?.bibyeRevision ?? 0);
    this.biByeServerTime = serverNow;
  }

  #updateSundownAtmosphere(now) {
    const totalSec = 780;
    const remaining = Number.isFinite(this.lastMode?.daylightRemaining)
      ? this.lastMode.daylightRemaining
      : totalSec;
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

    // Traverse scene lights to update sun position and intensity
    this.scene.traverse((obj) => {
      if (obj.isDirectionalLight) {
        obj.color.copy(sunColor);
        obj.intensity = 2.25 - progress * 0.45;
        // Sun dips lower toward the horizon
        const sx = -55 - progress * 20;
        const sy = 70 - progress * 52;
        const sz = -25 + progress * 10;
        obj.position.set(sx, sy, sz);
      } else if (obj.isHemisphereLight) {
        obj.color.copy(hemiSky);
      }
    });

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

    const attack = this.lastMode?.renowner?.attack;
    if (attack) {
      const swing = Math.max(0, Math.min(1, (now - attack.contactAt + 0.16) / 0.4));
      this.sword.rotation.x = attack.type === 'downstroke' ? -Math.sin(swing * Math.PI) * 1.25 : 0;
      this.sword.rotation.y = attack.type === 'sweep' ? (swing - 0.5) * 2.3 : 0;
    } else {
      this.sword.rotation.x = 0;
      this.sword.rotation.y = 0;
    }

    this.#updateSundownAtmosphere(now);
  }

  dispose() {
    this.biByeLlista?.dispose();
    this.scene.remove(this.group);
    this.group.traverse(x => x.geometry?.dispose?.());
    for (const mat of Object.values(this.materials)) mat.dispose();
  }
}
