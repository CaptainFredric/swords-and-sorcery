import * as THREE from 'three';
import { COURT_OF_MERIT } from '../../shared/worlds/courtOfMerit.mjs';

export const COURT_OF_MERIT_LIGHTING = Object.freeze({
  cameraFar: 280,
  background: 0x221a18,
  fog: Object.freeze({ color: 0x362822, density: 0.003 }),
  hemisphere: Object.freeze({ skyColor: 0xffeed6, groundColor: 0x483a30, intensity: 1.8 }),
  sun: Object.freeze({ color: 0xffd9a0, intensity: 2.8, position: [15, 45, -20] }),
});

const PALETTE = Object.freeze({
  stone: 0x9c9485,
  stoneDark: 0x676055,
  stoneLight: 0xd4ccbd,
  marble: 0xdfd9cc,
  timber: 0x563a29,
  brass: 0xc49a4a,
  brassDark: 0x82632b,
  iron: 0x3d444b,
  ironDark: 0x24282c,
  crimson: 0x8a2327,
  crimsonGold: 0xb5363c,
  flame: 0xff9030,
});

const mat = (color, roughness = 0.72, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

function box(parent, dimensions, where, m) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...dimensions), m);
  mesh.position.set(...where);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function cylinder(parent, radiusTop, radiusBottom, height, segments, where, m) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), m);
  mesh.position.set(...where);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function pipe(parent, from, to, radius, m, segments = 8) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const v = new THREE.Vector3().subVectors(b, a);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, v.length(), segments), m);
  mesh.position.copy(a.add(b).multiplyScalar(0.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export class CourtOfMeritRenderer {
  constructor(scene) {
    this.scene = scene;
    this.lighting = COURT_OF_MERIT_LIGHTING;
    this.group = new THREE.Group();
    this.group.name = 'Court of Merit';
    this.braziers = [];
    this.banners = [];
    this.materials = [];
    this.geometries = [];
    this.coinVisuals = [];
    this.lastTrialState = null;

    scene.background = new THREE.Color(this.lighting.background);
    scene.fog = new THREE.FogExp2(this.lighting.fog.color, this.lighting.fog.density);
    scene.add(this.group);
    this.#build();
  }

  #registerMat(m) {
    this.materials.push(m);
    return m;
  }

  #build() {
    const stoneM = this.#registerMat(mat(PALETTE.stone, 0.8));
    const stoneDarkM = this.#registerMat(mat(PALETTE.stoneDark, 0.85));
    const marbleM = this.#registerMat(mat(PALETTE.marble, 0.45, 0.05));
    const brassM = this.#registerMat(mat(PALETTE.brass, 0.35, 0.75));
    const brassDarkM = this.#registerMat(mat(PALETTE.brassDark, 0.45, 0.65));
    const ironM = this.#registerMat(mat(PALETTE.iron, 0.5, 0.6));
    const ironDarkM = this.#registerMat(mat(PALETTE.ironDark, 0.55, 0.65));
    const crimsonM = this.#registerMat(mat(PALETTE.crimson, 0.75));
    const crimsonGoldM = this.#registerMat(mat(PALETTE.crimsonGold, 0.65, 0.1));
    const flameM = this.#registerMat(new THREE.MeshBasicMaterial({ color: PALETTE.flame }));

    // 1. Arena Floors
    for (const f of COURT_OF_MERIT.floors) {
      box(this.group, f.size, f.center, f.id === 'court-arena' ? marbleM : stoneM);
    }

    // 2. Central Brass Compass Star Inlay in Trial Circle
    const compassGroup = new THREE.Group();
    compassGroup.position.set(0, 0.015, 0);
    this.group.add(compassGroup);
    const ringGeo = new THREE.TorusGeometry(8.0, 0.08, 6, 48);
    this.geometries.push(ringGeo);
    const ringMesh = new THREE.Mesh(ringGeo, brassM);
    ringMesh.rotation.x = Math.PI / 2;
    compassGroup.add(ringMesh);

    const innerRingGeo = new THREE.TorusGeometry(4.0, 0.06, 6, 36);
    this.geometries.push(innerRingGeo);
    const innerRing = new THREE.Mesh(innerRingGeo, brassM);
    innerRing.rotation.x = Math.PI / 2;
    compassGroup.add(innerRing);

    // 8-point compass star rays
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8;
      const rayLen = i % 2 === 0 ? 7.6 : 5.0;
      const ray = box(compassGroup, [0.12, 0.03, rayLen], [
        Math.sin(angle) * (rayLen / 2),
        0.01,
        Math.cos(angle) * (rayLen / 2),
      ], brassM);
      ray.rotation.y = angle;
    }

    // 3. Walls, Piers, and Balustrades
    for (const s of COURT_OF_MERIT.solids) {
      const kind = s.kind ?? '';
      if (kind === 'pillar') {
        // Fluted column with pedestal and brass Corinthian capital
        const [cx, cy, cz] = s.center;
        const [sx, sy, sz] = s.size;
        const radius = Math.min(sx, sz) * 0.42;
        cylinder(this.group, radius, radius * 1.05, sy - 0.9, 16, [cx, cy - 0.2, cz], stoneM);
        box(this.group, [sx, 0.5, sz], [cx, s.center[1] - sy / 2 + 0.25, cz], stoneDarkM);
        cylinder(this.group, radius * 1.25, radius, 0.45, 12, [cx, cy + sy / 2 - 0.25, cz], brassM);
      } else if (kind === 'podium') {
        box(this.group, s.size, s.center, brassM);
      } else if (kind === 'renowner-body') {
        this.#buildRenownerEffigy(s.center, s.size, ironM, ironDarkM, brassM, brassDarkM, crimsonM, crimsonGoldM);
      } else if (kind === 'brazier') {
        this.#buildBrazier(s.center, s.size, ironM, flameM);
      } else if (kind === 'balustrade') {
        box(this.group, s.size, s.center, s.material === 'brass' ? brassM : stoneDarkM);
      } else {
        box(this.group, s.size, s.center, stoneDarkM);
      }
    }

    // 4. Amphitheater Spectator Benches along Galleries
    for (const side of [-1, 1]) {
      const gx = side * 21;
      for (let z = -16; z <= 16; z += 3.2) {
        box(this.group, [2.4, 0.45, 2.6], [gx, COURT_OF_MERIT.floors[5].y + 0.25, z], stoneM);
      }
    }

    // 5. Ceremonial Crimson Banners hung from Gallery Pillars
    for (const side of [-1, 1]) {
      for (const z of [-6, 6]) {
        const bx = side * 17.6;
        const pole = box(this.group, [0.1, 0.1, 1.4], [bx, 3.8, z], brassM);
        pole.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        const bannerMesh = box(this.group, [0.04, 3.2, 1.2], [bx + side * 0.05, 2.2, z], crimsonM);
        this.banners.push(bannerMesh);
      }
    }

    // 6. Sally Portcullis Grates
    for (const [x, z, rot] of [[-18.5, 0, Math.PI / 2], [18.5, 0, Math.PI / 2], [0, -18.5, 0]]) {
      for (let bar = -2.8; bar <= 2.8; bar += 0.45) {
        box(this.group, [0.06, 3.8, 0.06], [x + (rot ? 0 : bar), 1.9, z + (rot ? bar : 0)], ironM);
      }
      box(this.group, [rot ? 0.15 : 6.0, 0.15, rot ? 6.0 : 0.15], [x, 3.6, z], ironM);
    }
  }

  #buildRenownerEffigy(center, size, ironM, ironDarkM, brassM, brassDarkM, crimsonM, crimsonGoldM) {
    const [cx, cy, cz] = center;
    const monument = new THREE.Group();
    monument.name = 'Rightful Renowner Martial Colossus';
    monument.position.set(cx, cy, cz);
    this.group.add(monument);
    this.monument = monument;

    // Imposing standing posture in fluted full plate armor
    // Greaves & Sabatons planted wide on dais
    box(monument, [0.45, 1.4, 0.65], [-0.55, -1.0, 0.05], ironM);
    box(monument, [0.45, 1.4, 0.65], [0.55, -1.0, 0.05], ironM);
    box(monument, [0.52, 0.35, 0.85], [-0.55, -1.5, -0.1], ironDarkM);
    box(monument, [0.52, 0.35, 0.85], [0.55, -1.5, -0.1], ironDarkM);

    // Segmented Faulds and Tassets
    box(monument, [1.5, 0.6, 1.05], [0, -0.3, 0], brassDarkM);
    box(monument, [0.65, 0.75, 0.25], [-0.45, -0.5, -0.5], brassM);
    box(monument, [0.65, 0.75, 0.25], [0.45, -0.5, -0.5], brassM);

    // Fluted heavy cuirass (torso) with brass heraldic eagle ribbing
    box(monument, [1.6, 1.7, 1.15], [0, 0.65, 0], ironM);
    box(monument, [1.35, 1.5, 0.2], [0, 0.65, -0.6], brassM);

    // Towering Greathelm with slotted iron visor
    box(monument, [0.85, 1.0, 0.95], [0, 1.9, 0], ironM);
    box(monument, [0.75, 0.14, 0.15], [0, 1.95, -0.48], ironDarkM); // visor slit
    box(monument, [0.92, 0.22, 1.02], [0, 2.35, 0], brassM); // crown crest
    box(monument, [0.18, 0.75, 1.1], [0, 2.8, 0.1], crimsonGoldM); // flowing heraldic crest

    // Massive fluted Pauldrons spanning 2.8m
    for (const side of [-1, 1]) {
      const p = box(monument, [0.65, 1.35, 0.85], [side * 1.15, 1.1, 0], ironM);
      p.rotation.z = side * -0.15;
      const rim = box(monument, [0.72, 0.3, 0.92], [side * 1.2, 1.45, 0], brassM);
      rim.rotation.z = side * -0.15;
    }

    // Heavy Gauntlets resting on Greatsword Hilt
    box(monument, [0.35, 0.35, 0.45], [-0.22, 0.75, -0.75], ironDarkM);
    box(monument, [0.35, 0.35, 0.45], [0.22, 0.75, -0.75], ironDarkM);

    // Monumental Articulated Greatsword — point driven into the stone floor
    const sword = new THREE.Group();
    sword.name = 'Renowner Greatsword of Judgment';
    sword.position.set(0, 0.75, -0.75);
    monument.add(sword);
    this.sword = sword;

    // Crossguard & Pommel
    box(sword, [1.8, 0.18, 0.22], [0, 0, 0], brassM);
    pipe(sword, [0, 0, 0], [0, 0.75, 0], 0.09, brassDarkM);
    cylinder(sword, 0.16, 0.16, 0.18, 8, [0, 0.82, 0], brassM); // pommel

    // Massive double-edged execution blade (4.2m tall, reaching dais floor at y = -2.2)
    box(sword, [0.38, 3.2, 0.08], [0, -1.6, 0], ironM);
    box(sword, [0.12, 3.0, 0.10], [0, -1.6, 0], brassM); // fuller
    const swordTip = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.75, 4), ironM);
    swordTip.rotation.y = Math.PI / 4;
    swordTip.position.set(0, -3.55, 0);
    sword.add(swordTip);

    // Mechanical Brass Coin Hopper & Angled Dispense Chute
    // Rear hopper reservoir behind belt
    box(monument, [1.1, 0.9, 0.75], [0, 0.35, 0.65], brassDarkM);
    // Forward chute angled down 30 deg facing recipient at dais center
    const chute = box(monument, [0.75, 0.28, 1.2], [0, 0.1, -0.75], brassM);
    chute.rotation.x = -0.32;

    // Solemn brass payout receiving tray on the ceremonial dais
    box(monument, [1.5, 0.22, 1.0], [0, -1.6, -1.8], brassM);
    box(monument, [1.3, 0.08, 0.8], [0, -1.5, -1.8], crimsonM); // velvet lining
  }

  #buildBrazier(center, size, ironM, flameM) {
    const [cx, cy, cz] = center;
    // Tripod iron stand
    for (const a of [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]) {
      const leg = cylinder(this.group, 0.04, 0.05, 0.9, 6, [
        cx + Math.sin(a) * 0.32,
        cy - 0.15,
        cz + Math.cos(a) * 0.32,
      ], ironM);
      leg.rotation.z = Math.sin(a) * 0.2;
      leg.rotation.x = -Math.cos(a) * 0.2;
    }
    // Bronze fire bowl
    cylinder(this.group, 0.45, 0.25, 0.3, 10, [cx, cy + 0.3, cz], ironM);
    // Flickering flame core
    const flameGeo = new THREE.OctahedronGeometry(0.2, 0);
    this.geometries.push(flameGeo);
    const flameMesh = new THREE.Mesh(flameGeo, flameM);
    flameMesh.position.set(cx, cy + 0.52, cz);
    this.group.add(flameMesh);
    this.braziers.push(flameMesh);
  }

  setTrialState(snapshot) {
    this.lastTrialState = snapshot?.renownTrial ?? null;
  }

  update(serverNow = 0) {
    // Dynamic brazier flame flicker
    for (let i = 0; i < this.braziers.length; i++) {
      const b = this.braziers[i];
      const s = 1.0 + Math.sin(serverNow * 9.0 + i * 2.1) * 0.12;
      b.scale.set(s, s * (1.1 + Math.sin(serverNow * 14.0 + i) * 0.15), s);
      b.rotation.y = serverNow * 2.0;
    }
    // Cloth stir on ceremonial banners
    for (let i = 0; i < this.banners.length; i++) {
      const ban = this.banners[i];
      ban.rotation.x = Math.sin(serverNow * 1.5 + i * 1.2) * 0.06;
    }

    // Articulated judgment presentation
    const ceremony = this.lastTrialState?.ceremony;
    if (ceremony && this.sword) {
      if (ceremony.kind === 'execution') {
        const t = Math.max(0, Math.min(1, (serverNow - ceremony.startedAt) / (ceremony.endsAt - ceremony.startedAt)));
        // Sword lift and downstroke reaching player position
        const swing = Math.sin(t * Math.PI);
        this.sword.rotation.x = swing * 0.85;
      } else {
        this.sword.rotation.x = 0;
      }
    } else if (this.sword) {
      this.sword.rotation.x = 0;
    }
  }

  dispose() {
    this.scene.remove(this.group);
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });
  }
}
