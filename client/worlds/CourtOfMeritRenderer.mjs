import * as THREE from 'three';
import { COURT_OF_MERIT } from '../../shared/worlds/courtOfMerit.mjs';
import { facetMesh, kitMaterials, seededRandom, shadeColor, KIT_PALETTE as K } from './kit/facetKit.mjs';
import { createBatch, masonry, banner } from './kit/kitPieces.mjs';
import { drawnFloors, flagstoneTexture } from './kit/surfaceTextures.mjs';
import { BACKDROP_MOODS, backdropLighting, buildBackdrop } from './kit/backdrop.mjs';

// (the court stands open to a late-afternoon sky over a green march: kit/backdrop.mjs)
const COURT_BACKDROP_RADIUS = 260;
export const COURT_OF_MERIT_LIGHTING = backdropLighting({
  background: 0x8a7a70,
  fog: Object.freeze({ color: 0x8a7a70, density: 0.0028 }),
  hemisphere: Object.freeze({ skyColor: 0xffeed6, groundColor: 0x5a4a3c, intensity: 1.8 }),
  sun: Object.freeze({ color: 0xffd9a0, intensity: 2.8, position: [15, 45, -20] }),
  sky: Object.freeze({ zenith: 0x55688a, horizon: 0xe8b98a, below: 0x3a3430 }),
}, { radius: COURT_BACKDROP_RADIUS, density: 0.0028 });

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
    this.lastServerNow = 0;
    this.lastCeremonyId = null;
    this.handledCues = new Set();

    this.coinGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.024, 10);
    this.geometries.push(this.coinGeo);
    this.goldCoinMat = this.#registerMat(new THREE.MeshStandardMaterial({
      color: 0xdaa520, roughness: 0.3, metalness: 0.85,
    }));
    this.lethalCoinMat = this.#registerMat(new THREE.MeshStandardMaterial({
      color: 0xff3322, emissive: 0xaa1100, emissiveIntensity: 0.85, roughness: 0.25, metalness: 0.9,
    }));

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
    const brassM = this.#registerMat(mat(PALETTE.brass, 0.35, 0.75));
    const brassDarkM = this.#registerMat(mat(PALETTE.brassDark, 0.45, 0.65));
    const ironM = this.#registerMat(mat(PALETTE.iron, 0.5, 0.6));
    const ironDarkM = this.#registerMat(mat(PALETTE.ironDark, 0.55, 0.65));
    const crimsonM = this.#registerMat(mat(PALETTE.crimson, 0.75));
    const crimsonGoldM = this.#registerMat(mat(PALETTE.crimsonGold, 0.65, 0.1));
    const flameM = this.#registerMat(new THREE.MeshBasicMaterial({ color: PALETTE.flame }));
    this.kit = kitMaterials();
    const rand = seededRandom(1907);
    const batch = createBatch();

    // 1. Floors: polished marble for the trial floor, dressed stone for the tribunal and the gate passages
    this.kit.marble = new THREE.MeshStandardMaterial({ map: flagstoneTexture(0xd9d1c2, 71), roughness: 0.42, metalness: 0.06 });
    this.kit.paving = new THREE.MeshStandardMaterial({ map: flagstoneTexture(0xa79f90, 73), roughness: 0.8, metalness: 0.04 });
    this.group.add(drawnFloors(COURT_OF_MERIT.floors.filter((f) => f.material === 'marble'), this.kit.marble, { name: 'court-marble', metres: 3.2 }));
    this.group.add(drawnFloors(COURT_OF_MERIT.floors.filter((f) => f.material !== 'marble'), this.kit.paving, { name: 'court-paving' }));
    for (const r of COURT_OF_MERIT.ramps) this.#steps(batch, rand, r);

    // 2. The brass compass of the trial circle, and the ruled lines out to each gate
    const compassGroup = new THREE.Group();
    compassGroup.position.set(0, 0.015, 0);
    this.group.add(compassGroup);
    for (const [radius, tube] of [[8.0, 0.08], [4.0, 0.06], [12.5, 0.05]]) {
      const ringGeo = new THREE.TorusGeometry(radius, tube, 6, 64);
      this.geometries.push(ringGeo);
      const ring = new THREE.Mesh(ringGeo, brassM);
      ring.rotation.x = Math.PI / 2;
      compassGroup.add(ring);
    }
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8;
      const rayLen = i % 2 === 0 ? 7.6 : 5.0;
      const ray = box(compassGroup, [0.12, 0.03, rayLen], [Math.sin(angle) * (rayLen / 2), 0.01, Math.cos(angle) * (rayLen / 2)], brassM);
      ray.rotation.y = angle;
    }

    // 3. Everything that stands, each in its own piece of the kit (and the effigy and braziers as their own groups)
    for (const s of COURT_OF_MERIT.solids) {
      const kind = s.kind ?? '';
      const [cx, cy, cz] = s.center;
      const [sx, sy, sz] = s.size;
      const y0 = cy - sy / 2;
      if (kind === 'renowner-body') { this.#buildRenownerEffigy(s.center, s.size, ironM, ironDarkM, brassM, brassDarkM, crimsonM, crimsonGoldM); continue; }
      if (kind === 'brazier') { this.#buildBrazier(s.center, s.size, ironM, flameM); continue; }
      if (kind === 'podium') { batch.metal.block({ cx, cy: y0, cz, sx, sy, sz, chamfer: 0.05, jitter: 0, color: PALETTE.brass, rand, shade: 0.04 }); continue; }
      if (kind === 'pillar') { this.#column(batch, rand, s); continue; }
      if (kind === 'stand-tier') { this.#tier(batch, rand, s); continue; }
      if (kind === 'balustrade') {
        batch.metal.block({ cx, cy: y0, cz, sx, sy: 0.12, sz, chamfer: 0.02, jitter: 0, color: PALETTE.brassDark, rand });
        batch.metal.block({ cx, cy: y0 + sy - 0.1, cz, sx: sx + 0.06, sy: 0.1, sz, chamfer: 0.02, jitter: 0, color: PALETTE.brass, rand });
        const along = sz >= sx;
        const n = Math.round((along ? sz : sx) / 0.45);
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n - 0.5;
          batch.metal.prism({ cx: cx + (along ? 0 : t * sx), cy: y0 + 0.12, cz: cz + (along ? t * sz : 0), radiusBottom: 0.06, radiusTop: 0.05, height: sy - 0.22, sides: 6, color: PALETTE.brass, rand });
        }
        continue;
      }
      if (kind === 'jury-box') {
        // the jurors' panelled box: dark timber below a brass rail, crimson cushions along its bench
        batch.wood.block({ cx, cy: y0, cz, sx, sy: sy - 0.1, sz, chamfer: 0.03, jitter: 0, color: K.timberDark, rand });
        batch.metal.block({ cx, cy: y0 + sy - 0.1, cz, sx: sx + 0.08, sy: 0.1, sz: sz + 0.08, chamfer: 0.02, jitter: 0, color: PALETTE.brass, rand });
        for (let x = cx - sx / 2 + 0.6; x < cx + sx / 2 - 0.3; x += 1.1) batch.wood.block({ cx: x, cy: y0 + 0.3, cz: cz - sz / 2 - 0.01, sx: 0.9, sy: sy - 0.7, sz: 0.04, chamfer: 0.01, jitter: 0, color: shadeColor(K.timber, 1.05), rand });
        continue;
      }
      if (kind === 'dais-base') { if (s.drawTo) masonry(batch, rand, { ...s, center: [cx, (y0 + s.drawTo) / 2, cz], size: [sx, s.drawTo - y0, sz] }, { coping: true }); else masonry(batch, rand, s, { coping: false }); continue; }
      if (kind === 'stand-back' || kind === 'curtain' || kind === 'pier' || kind === 'arch') {
        masonry(batch, rand, s, { merlons: kind === 'curtain' || kind === 'pier', merlonHeight: 0.7 });
        continue;
      }
      masonry(batch, rand, s);
    }

    // 4. The gates' portcullises, raised into their arches (each wave walks in under them)
    for (const id of ['west-sally-arch', 'east-sally-arch', 'south-portal-arch']) {
      const a = COURT_OF_MERIT.solids.find((x) => x.id === id);
      const alongZ = a.size[2] > a.size[0];
      const [ax, ay, az] = a.center;
      const span = alongZ ? a.size[2] : a.size[0];
      for (let t = -span / 2 + 0.25; t <= span / 2 - 0.2; t += 0.45) {
        batch.metal.block({ cx: ax + (alongZ ? 0 : t), cy: ay - a.size[1] / 2 - 0.6, cz: az + (alongZ ? t : 0), sx: 0.07, sy: 0.6, sz: 0.07, chamfer: 0, jitter: 0, color: K.iron, rand });
      }
    }

    // 5. Crimson banners down the north curtain behind the tribunal, and over each gate
    const hang = (at) => {
      const mesh = banner(batch, rand, at);
      if (!this.bannerMaterial) { this.bannerMaterial = mesh.material; this.materials.push(mesh.material); }
      else { mesh.material.map?.dispose?.(); mesh.material.dispose(); mesh.material = this.bannerMaterial; }
      this.group.add(mesh);
      this.banners.push(mesh);
    };
    for (const x of [-13.5, -9, 9, 13.5]) hang({ x, y: 6.2, z: 17.45, width: 1.7, height: 4.0, facing: Math.PI });
    hang({ x: -23.45, y: 4.4, z: 6.5, width: 1.4, height: 2.6, facing: Math.PI / 2 });
    hang({ x: 23.45, y: 4.4, z: 6.5, width: 1.4, height: 2.6, facing: -Math.PI / 2 });
    hang({ x: -8, y: 4.9, z: -23.45, width: 1.4, height: 2.6, facing: 0 });
    hang({ x: 8, y: 4.9, z: -23.45, width: 1.4, height: 2.6, facing: 0 });

    for (const [name, builder] of Object.entries(batch)) {
      if (!builder.triangleCount) continue;
      this.group.add(facetMesh(builder, this.kit[name], { castShadow: name !== 'ground', receiveShadow: true, name: `court-${name}` }));
    }
    this.backdrop = buildBackdrop(this.group, {
      footprint: [-25, 25, -25, 19], floorY: 0, sky: COURT_OF_MERIT_LIGHTING.sky, mood: BACKDROP_MOODS.dusk,
      seed: 61, radius: COURT_BACKDROP_RADIUS, depth: 16, materials: this.kit,
    });
  }

  /** A flight of steps filling its ramp (each tread's top at the slope's height there, and solid to the ground). */
  #steps(batch, rand, ramp) {
    const axisX = ramp.axis === 'x';
    const length = axisX ? ramp.maxX - ramp.minX : ramp.maxZ - ramp.minZ;
    const count = Math.max(2, Math.round(Math.abs(ramp.endY - ramp.startY) / 0.2));
    const width = axisX ? ramp.maxZ - ramp.minZ : ramp.maxX - ramp.minX;
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const top = ramp.startY + (ramp.endY - ramp.startY) * t;
      const base = Math.min(ramp.startY, ramp.endY);
      const along = (axisX ? ramp.minX : ramp.minZ) + t * length;
      batch.stone.block({
        cx: axisX ? along : (ramp.minX + ramp.maxX) / 2, cy: base, cz: axisX ? (ramp.minZ + ramp.maxZ) / 2 : along,
        sx: axisX ? length / count + 0.01 : width, sy: Math.max(0.02, top - base), sz: axisX ? width : length / count + 0.01,
        chamfer: 0.02, jitter: 0, color: shadeColor(PALETTE.marble, 0.92 + rand() * 0.08), rand, shade: 0.04,
      });
    }
  }

  /** A slender column of judgment: a plinth, a fluted shaft, a brass capital, all inside its own box. */
  #column(batch, rand, s) {
    const [cx, cy, cz] = s.center;
    const [sx, sy, sz] = s.size;
    const y0 = cy - sy / 2;
    batch.stone.block({ cx, cy: y0, cz, sx, sy: 0.45, sz, chamfer: 0.05, jitter: 0, color: K.stoneDark, rand });
    batch.stone.prism({ cx, cy: y0 + 0.45, cz, radiusBottom: sx * 0.42, radiusTop: sx * 0.37, height: sy - 0.95, sides: 12, color: PALETTE.marble, rand });
    batch.metal.block({ cx, cy: y0 + sy - 0.5, cz, sx, sy: 0.5, sz, chamfer: 0.08, jitter: 0, color: PALETTE.brass, rand, shade: 0.04 });
  }

  /** A tier of the stands: its stone riser, a timber bench along its front, and the crowd's cushions. */
  #tier(batch, rand, s) {
    const [cx, cy, cz] = s.center;
    const [sx, sy, sz] = s.size;
    const y0 = cy - sy / 2;
    masonry(batch, rand, s, { coping: true, color: K.stoneLight });
    const alongZ = sz > sx;
    const length = alongZ ? sz : sx;
    // which side faces the floor: the side nearest the court's middle
    const inward = alongZ ? -Math.sign(cx) : -Math.sign(cz);
    const depth = alongZ ? sx : sz;
    const bx = alongZ ? cx + inward * (depth / 2 - 0.35) : cx;
    const bz = alongZ ? cz : cz + inward * (depth / 2 - 0.35);
    batch.wood.block({ cx: bx, cy: y0 + sy, cz: bz, sx: alongZ ? 0.5 : length - 0.1, sy: 0.08, sz: alongZ ? length - 0.1 : 0.5, chamfer: 0.01, jitter: 0, color: K.timber, rand });
    for (let u = -length / 2 + 0.7; u < length / 2 - 0.4; u += 1.3 + rand() * 0.6) {
      if (rand() < 0.45) continue;
      const colour = rand() < 0.5 ? PALETTE.crimson : rand() < 0.5 ? 0x274a7a : K.cream;
      batch.cloth.block({ cx: alongZ ? bx : cx + u, cy: y0 + sy + 0.08, cz: alongZ ? cz + u : bz, sx: 0.42, sy: 0.07, sz: 0.42, chamfer: 0.02, jitter: 0, color: colour, rand });
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

  #spawnCoins(count, isLethal = false) {
    const coinMat = isLethal ? this.lethalCoinMat : this.goldCoinMat;
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.coinGeo, coinMat);
      mesh.castShadow = true;
      mesh.position.set(
        (Math.random() - 0.5) * 0.35,
        3.65 + (Math.random() - 0.5) * 0.05,
        14.85 + (Math.random() - 0.5) * 0.1
      );
      mesh.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );
      this.group.add(mesh);
      const vx = (Math.random() - 0.5) * (isLethal ? 3.0 : 0.8);
      const vy = isLethal ? (Math.random() * 1.5 - 0.5) : (0.4 + Math.random() * 0.8);
      const vz = isLethal ? -(14.0 + Math.random() * 6.0) : -(1.8 + Math.random() * 1.6);
      this.coinVisuals.push({
        mesh,
        vx, vy, vz,
        rotVx: (Math.random() - 0.5) * 12,
        rotVy: (Math.random() - 0.5) * 12,
        rotVz: (Math.random() - 0.5) * 12,
        age: 0,
        isLethal,
      });
    }
  }

  setTrialState(snapshot, serverNow = null) {
    this.lastTrialState = snapshot?.renownTrial ?? null;
    if (serverNow !== null) {
      this.lastServerNow = serverNow;
    } else if (snapshot?.serverTime != null) {
      this.lastServerNow = snapshot.serverTime;
    }

    const ceremony = this.lastTrialState?.ceremony;
    if (!ceremony) {
      this.lastCeremonyId = null;
      return;
    }

    if (ceremony.id !== this.lastCeremonyId) {
      this.lastCeremonyId = ceremony.id;
      this.handledCues.clear();
    }

    const cue = ceremony.cue;
    if (cue && !this.handledCues.has(cue)) {
      this.handledCues.add(cue);
      if (cue === 'REWARD_COIN') {
        this.#spawnCoins(18, false);
      } else if (cue === 'CONSOLATION_COIN') {
        this.#spawnCoins(8, false);
      } else if (cue === 'LATE_COIN') {
        this.#spawnCoins(1, false);
      } else if (cue === 'COIN_RETALIATION') {
        this.#spawnCoins(24, true);
      }
      // NO_REWARD spawns 0 coins
    }
  }

  triggerJudgmentPresentation(verdict, reward = 0) {
    if (verdict === 'EXECUTION' || verdict === 'SWORD') {
      if (this.sword) this.sword.rotation.x = 0.95;
    } else if (verdict === 'COIN_RETALIATION') {
      this.#spawnCoins(24, true);
    } else if (verdict === 'COMMENDED' || verdict === 'COIN' || reward > 0) {
      this.#spawnCoins(18, false);
    }
  }

  update(timeSec = 0, camera = null, dt = null) {
    const serverNow = this.lastServerNow || timeSec;
    let stepDt;
    if (typeof dt === 'number' && dt > 0 && dt < 0.5) {
      stepDt = dt;
    } else if (typeof this.lastFrameTimeSec === 'number' && timeSec > this.lastFrameTimeSec) {
      stepDt = Math.min(0.1, Math.max(0.001, timeSec - this.lastFrameTimeSec));
    } else {
      stepDt = 0.016;
    }
    this.lastFrameTimeSec = timeSec;

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
    if (this.sword) {
      if (ceremony) {
        const cue = ceremony.cue;
        const elapsed = Math.max(0, serverNow - ceremony.startedAt);
        if (cue === 'SWORD_RAISE') {
          const progress = Math.min(1, elapsed / 1.7);
          this.sword.rotation.x = -progress * 1.6;
          this.sword.position.y = 0.75 + progress * 0.45;
        } else if (cue === 'SWORD_EXECUTION') {
          const sub = elapsed - 1.7;
          const down = Math.min(1, Math.max(0, sub) / 0.35);
          const impactVibe = down >= 1 ? Math.exp(-(sub - 0.35) * 5) * Math.sin((sub - 0.35) * 40) * 0.06 : 0;
          this.sword.rotation.x = -1.6 + down * 2.55 + impactVibe;
          this.sword.position.y = 1.2 - down * 0.65;
        } else if (cue === 'SWORD_EVADED') {
          this.sword.rotation.x = 0.95;
          this.sword.position.y = 0.55;
        } else if (cue === 'I_HAVE_SURPASSED_JUDGEMENT') {
          this.sword.rotation.x = 0.4;
          this.sword.position.y = 0.65;
        } else if (cue === 'SWORD_RESET') {
          this.sword.rotation.x = THREE.MathUtils.lerp(this.sword.rotation.x, 0, stepDt * 2.5);
          this.sword.position.y = THREE.MathUtils.lerp(this.sword.position.y, 0.75, stepDt * 2.5);
        } else if (cue === 'KNIGHTING') {
          const k = Math.sin(Math.min(1, Math.max(0, elapsed - 1.1) / 1.2) * Math.PI);
          this.sword.rotation.x = -0.45 * k;
        } else {
          this.sword.rotation.x = THREE.MathUtils.lerp(this.sword.rotation.x, 0, stepDt * 3.5);
          this.sword.position.y = THREE.MathUtils.lerp(this.sword.position.y, 0.75, stepDt * 3.5);
        }
      } else {
        this.sword.rotation.x = THREE.MathUtils.lerp(this.sword.rotation.x, 0, stepDt * 3.5);
        this.sword.position.y = THREE.MathUtils.lerp(this.sword.position.y, 0.75, stepDt * 3.5);
      }
    }

    // Synchronized Coin Physics
    for (let i = this.coinVisuals.length - 1; i >= 0; i--) {
      const c = this.coinVisuals[i];
      c.age += stepDt;
      c.vy -= 9.8 * stepDt;
      c.mesh.position.x += c.vx * stepDt;
      c.mesh.position.y += c.vy * stepDt;
      c.mesh.position.z += c.vz * stepDt;
      c.mesh.rotation.x += c.rotVx * stepDt;
      c.mesh.rotation.y += c.rotVy * stepDt;
      c.mesh.rotation.z += c.rotVz * stepDt;

      const px = c.mesh.position.x;
      const py = c.mesh.position.y;
      const pz = c.mesh.position.z;

      // Tray collision at y ~ 2.28 in world coordinates
      if (!c.isLethal && py <= 2.28 && Math.abs(px) <= 0.65 && pz >= 13.9 && pz <= 14.9) {
        c.mesh.position.y = 2.28;
        c.vy = -c.vy * 0.22;
        c.vx *= 0.6;
        c.vz *= 0.6;
        c.rotVx *= 0.5;
        c.rotVy *= 0.5;
        c.rotVz *= 0.5;
      } else if (py <= 0.8 && pz >= 12.0) {
        // Dais collision
        c.mesh.position.y = 0.8;
        c.vy = -c.vy * 0.25;
        c.vx *= 0.6;
        c.vz *= 0.6;
      } else if (py <= 0.0) {
        // Arena floor collision
        c.mesh.position.y = 0.0;
        c.vy = -c.vy * 0.25;
        c.vx *= 0.6;
        c.vz *= 0.6;
      }

      if (c.age > 5.0) {
        this.group.remove(c.mesh);
        this.coinVisuals.splice(i, 1);
      }
    }
  }

  dispose() {
    this.scene.remove(this.group);
    for (const m of Object.values(this.kit ?? {})) { m.map?.dispose?.(); m.dispose?.(); }
    for (const c of this.coinVisuals) {
      this.group.remove(c.mesh);
    }
    this.coinVisuals.length = 0;
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
