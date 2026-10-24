import * as THREE from 'three';
import { everywhere } from '../game/viewLayers.mjs';
import { OUTERWORKS, OUTERWORKS_TERRACE_Y, OUTERWORKS_PARAPET_Y } from '../../shared/worlds/outerworks.mjs';
import { BiByeLlistaRenderer } from './BiByeLlistaRenderer.mjs';
import { BiByeMotion } from './biByeMotion.mjs';

export const OUTERWORKS_LIGHTING = Object.freeze({
  background: 0x202630,
  fog: Object.freeze({ color: 0x262d3a, density: 0.009 }),
  hemisphere: Object.freeze({ skyColor: 0xdde2ea, groundColor: 0x44403a, intensity: 1.9 }),
  sun: Object.freeze({ color: 0xffaa5e, intensity: 2.9, position: Object.freeze([-32, 26, -24]) }),
  sky: Object.freeze({ zenith: 0x364860, horizon: 0xd49468, below: 0x1e1c1a }),
});

function box(parent, size, material, position, rotation = [0, 0, 0], shadows = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  parent.add(mesh);
  return mesh;
}

function cylinder(parent, radiusTop, radiusBottom, height, radialSegments, material, position, rotation = [0, 0, 0], shadows = true) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments), material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  parent.add(mesh);
  return mesh;
}

function disposeMaterial(material) {
  if (Array.isArray(material)) {
    for (const item of material) item?.dispose?.();
  } else {
    material?.dispose?.();
  }
}

export class OuterworksRenderer {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.options = options;
    this.group = new THREE.Group();
    this.group.name = 'The Outerworks';
    this.lighting = OUTERWORKS_LIGHTING;
    this.torches = [];
    this.torchLights = [];
    this.flames = [];
    this.banners = [];
    this.objectiveRings = [];
    this.currentObjective = null;
    this.localTeam = null;
    this.palisadeCollapseProgress = 0.0;
    this.portcullisOpenProgress = 0.0;
    this.disposed = false;

    // Bi-Bye-llista integration
    this.biByeLlista = new BiByeLlistaRenderer(scene);
    this.biByeMotion = new BiByeMotion();
    this.biByeRoomCode = null;
    this.biByeServerTime = null;
    this.biByePresentationOptions = null;

    this.#build();
    scene.add(this.group);
  }

  #build() {
    this.materials = {
      stone: new THREE.MeshStandardMaterial({ color: 0x766f68, roughness: 0.88, metalness: 0.06 }),
      stoneFloor: new THREE.MeshStandardMaterial({ color: 0x5a544e, roughness: 0.86, metalness: 0.08 }),
      terraceStone: new THREE.MeshStandardMaterial({ color: 0x6e6862, roughness: 0.84, metalness: 0.08 }),
      roadStone: new THREE.MeshStandardMaterial({ color: 0x4f4943, roughness: 0.88, metalness: 0.05 }),
      trenchDirt: new THREE.MeshStandardMaterial({ color: 0x3d352d, roughness: 0.94, metalness: 0.02 }),
      paleStoneTrim: new THREE.MeshStandardMaterial({ color: 0xb5afa5, roughness: 0.74, metalness: 0.08 }),
      timber: new THREE.MeshStandardMaterial({ color: 0x563e2d, roughness: 0.90, metalness: 0.02 }),
      darkTimber: new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 0.92, metalness: 0.02 }),
      iron: new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.55, metalness: 0.80 }),
      brass: new THREE.MeshStandardMaterial({ color: 0x9b783e, roughness: 0.45, metalness: 0.75 }),
      bannerCrimson: new THREE.MeshStandardMaterial({
        color: 0x8b201a,
        roughness: 0.70,
        metalness: 0.06,
        side: THREE.DoubleSide,
      }),
      bannerAzure: new THREE.MeshStandardMaterial({
        color: 0x1f4e8b,
        roughness: 0.70,
        metalness: 0.06,
        side: THREE.DoubleSide,
      }),
      torchFlame: new THREE.MeshBasicMaterial({ color: 0xff8822 }),
      objInactive: new THREE.MeshBasicMaterial({
        color: 0x6e6862,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
      }),
      objActiveRing: new THREE.MeshBasicMaterial({
        color: 0xdf843a,
        transparent: true,
        opacity: 0.70,
        side: THREE.DoubleSide,
      }),
      objProgressArc: new THREE.MeshBasicMaterial({
        color: 0x3d7eed,
        transparent: true,
        opacity: 0.88,
        side: THREE.DoubleSide,
      }),
    };

    // --- Build Floors ---
    for (const fl of OUTERWORKS.floors) {
      let mat = this.materials.stoneFloor;
      if (fl.id.includes('trench')) mat = this.materials.trenchDirt;
      else if (fl.id.includes('esplanade')) mat = this.materials.roadStone;
      else if (fl.id.includes('terrace') || fl.id.includes('parapet')) mat = this.materials.terraceStone;

      const mesh = box(this.group, fl.size, mat, fl.center, [0, 0, 0], false);
      mesh.receiveShadow = true;
    }

    // --- Build Solids ---
    for (const sol of OUTERWORKS.solids) {
      if (sol.id === 'barrier-outer-palisade' || sol.id === 'portcullis-inner-gate') continue;
      const isTimber = sol.material === 'timber' || sol.id.includes('timber') || sol.id.includes('crates')
        || sol.id.includes('mantlet') || sol.id.includes('cart') || sol.id.includes('barricade')
        || sol.id.includes('chicane');
      const mat = isTimber ? this.materials.timber : this.materials.stone;
      box(this.group, sol.size, mat, sol.center, [0, 0, 0], true);
    }

    // --- Build Ramps ---
    for (const ramp of OUTERWORKS.ramps) {
      const width = ramp.maxX - ramp.minX;
      const length = ramp.maxZ - ramp.minZ;
      const rise = ramp.endY - ramp.startY;
      const hyp = Math.hypot(length, rise);
      const mesh = box(
        this.group,
        [width, 0.3, hyp],
        this.materials.terraceStone,
        [(ramp.minX + ramp.maxX) / 2, (ramp.startY + ramp.endY) / 2 - 0.12, (ramp.minZ + ramp.maxZ) / 2],
        [-Math.atan2(rise, length), 0, 0],
      );
      mesh.receiveShadow = true;
    }

    // --- Dynamic Gate Collapsibles ---
    this.#buildDynamicFortifications();

    // --- Monumental Barbican Architecture Details ---
    this.#buildBarbicanDetails();

    // --- Objective Markers & Standards ---
    this.#buildObjectiveStandards();

    // --- Torches & Wall Banners ---
    this.#buildAtmosphere();
  }

  #buildDynamicFortifications() {
    // Dynamic Great Breach Palisade (Phase 0 obstacle, drops/folds on Redoubt capture)
    this.palisadeGroup = new THREE.Group();
    this.palisadeGroup.position.set(0, 0, 1.9);
    for (let i = -3; i <= 3; i++) {
      const log = cylinder(
        this.palisadeGroup,
        0.18, 0.22, 3.2, 8,
        this.materials.timber,
        [i * 0.48, 1.6, 0]
      );
      // Pointed stake tip
      cylinder(this.palisadeGroup, 0.02, 0.18, 0.45, 8, this.materials.darkTimber, [i * 0.48, 3.42, 0]);
    }
    // Cross timber beams
    box(this.palisadeGroup, [3.4, 0.22, 0.22], this.materials.darkTimber, [0, 1.2, -0.15]);
    box(this.palisadeGroup, [3.4, 0.22, 0.22], this.materials.darkTimber, [0, 2.4, -0.15]);
    this.group.add(this.palisadeGroup);

    // Dynamic Inner Barbican Portcullis (Phase 1 obstacle, winches open on victory)
    this.portcullisGroup = new THREE.Group();
    this.portcullisGroup.position.set(0, 0, 41.5);
    for (let i = -3; i <= 3; i++) {
      cylinder(this.portcullisGroup, 0.06, 0.06, 4.4, 8, this.materials.iron, [i * 0.5, 2.2, 0]);
      // Spike tip at bottom
      cylinder(this.portcullisGroup, 0.06, 0.01, 0.3, 8, this.materials.iron, [i * 0.5, -0.15, 0]);
    }
    for (const h of [0.8, 1.8, 2.8, 3.8]) {
      box(this.portcullisGroup, [3.6, 0.1, 0.1], this.materials.iron, [0, h, 0]);
    }
    this.group.add(this.portcullisGroup);
  }

  #buildBarbicanDetails() {
    // Barbican tower machicolations and cornices
    for (const x of [-5.9, 5.9]) {
      // Cornice band
      box(this.group, [4.6, 0.45, 8.4], this.materials.paleStoneTrim, [x, 8.1, 42]);
      // Crenellations
      for (let z = 38.5; z <= 45.5; z += 1.8) {
        box(this.group, [0.45, 1.1, 1.1], this.materials.stone, [x - 2.1, 9.0, z]);
        box(this.group, [0.45, 1.1, 1.1], this.materials.stone, [x + 2.1, 9.0, z]);
      }
    }
    // Overhead bridge machicolations
    box(this.group, [7.8, 0.4, 6.2], this.materials.paleStoneTrim, [0, 8.1, 42]);
  }

  #buildObjectiveStandards() {
    for (let i = 0; i < OUTERWORKS.objectives.length; i++) {
      const obj = OUTERWORKS.objectives[i];
      const ringGeom = new THREE.RingGeometry(obj.radius - 0.4, obj.radius, 64);
      const discGeom = new THREE.CircleGeometry(obj.radius - 0.4, 64);

      const ringMat = this.materials.objActiveRing.clone();
      const ringMesh = new THREE.Mesh(ringGeom, ringMat);
      ringMesh.rotation.x = -Math.PI / 2;
      ringMesh.position.set(obj.x, obj.y + 0.05, obj.z);
      this.group.add(ringMesh);

      const discMat = this.materials.objInactive.clone();
      const discMesh = new THREE.Mesh(discGeom, discMat);
      discMesh.rotation.x = -Math.PI / 2;
      discMesh.position.set(obj.x, obj.y + 0.03, obj.z);
      this.group.add(discMesh);

      const progressMat = this.materials.objProgressArc.clone();
      const progressMesh = new THREE.Mesh(new THREE.RingGeometry(obj.radius - 0.78, obj.radius - 0.42, 48, 1, 0, 0.001), progressMat);
      progressMesh.rotation.x = -Math.PI / 2;
      progressMesh.position.set(obj.x, obj.y + 0.07, obj.z);
      this.group.add(progressMesh);

      const standardGroup = new THREE.Group();
      standardGroup.position.set(obj.x, obj.y, obj.z);
      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 0.35, 8), this.materials.paleStoneTrim);
      plinth.position.y = 0.17;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 4.0, 8), this.materials.iron);
      pole.position.y = 2.0;
      const crossbar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.08), this.materials.brass);
      crossbar.position.y = 3.65;
      const bannerMat = i === 0 ? this.materials.bannerCrimson.clone() : this.materials.bannerAzure.clone();
      const bannerCloth = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.55), bannerMat);
      bannerCloth.position.set(0, 2.85, 0.06);
      const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), this.materials.brass);
      finial.position.y = 4.15;
      standardGroup.add(plinth, pole, crossbar, bannerCloth, finial);
      this.group.add(standardGroup);

      this.objectiveRings.push({
        id: obj.id,
        index: i,
        ringMesh,
        discMesh,
        progressMesh,
        progressMat,
        standardGroup,
        bannerMat,
      });
    }
  }

  #buildAtmosphere() {
    const torchDefs = [
      [-10, 2.2, -49],
      [10, 2.2, -49],
      [-5.5, 2.2, -32],
      [13.5, OUTERWORKS_TERRACE_Y + 1.8, -16],
      [13.5, OUTERWORKS_TERRACE_Y + 1.8, -6],
      [19.2, OUTERWORKS_PARAPET_Y + 1.8, 6],
      [19.2, OUTERWORKS_PARAPET_Y + 1.8, 22],
      [-4.0, 3.2, 38.5],
      [4.0, 3.2, 38.5],
    ];

    for (const [x, y, z] of torchDefs) {
      // Sconce
      box(this.group, [0.15, 0.35, 0.3], this.materials.iron, [x, y - 0.1, z]);
      // Torch bowl
      cylinder(this.group, 0.12, 0.08, 0.22, 6, this.materials.iron, [x, y, z]);
      // Flame
      const flame = cylinder(this.group, 0.02, 0.09, 0.28, 6, this.materials.torchFlame, [x, y + 0.18, z]);
      flame.userData = { baseY: y + 0.18, phase: Math.random() * Math.PI * 2, scale: 1.0 };
      this.flames.push(flame);

      const light = everywhere(new THREE.PointLight(0xff8833, 2.2, 9.0, 1.8));
      light.position.set(x, y + 0.25, z);
      light.userData = { phase: Math.random() * Math.PI * 2 };
      this.torchLights.push(light);
      this.group.add(light);
    }

    // Heraldic siege banners
    const bannerDefs = [
      { pos: [-4.0, 4.8, 0.1], rot: [0, 0, 0], mat: this.materials.bannerCrimson },
      { pos: [4.0, 4.8, 0.1], rot: [0, 0, 0], mat: this.materials.bannerCrimson },
      { pos: [-3.6, 6.2, 38.2], rot: [0, 0, 0], mat: this.materials.bannerAzure },
      { pos: [3.6, 6.2, 38.2], rot: [0, 0, 0], mat: this.materials.bannerAzure },
    ];
    for (const b of bannerDefs) {
      const rod = cylinder(this.group, 0.04, 0.04, 1.4, 6, this.materials.iron, [b.pos[0], b.pos[1] + 1.1, b.pos[2]], [0, 0, Math.PI / 2]);
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.2), b.mat);
      cloth.position.set(b.pos[0], b.pos[1], b.pos[2]);
      cloth.rotation.set(...b.rot);
      cloth.userData = { phase: Math.random() * Math.PI * 2 };
      this.banners.push(cloth);
      this.group.add(rod, cloth);
    }
  }

  setBiByeState(snapshot, serverNow = snapshot?.serverTime, options = {}) {
    if (this.biByeRoomCode !== snapshot?.roomCode) {
      this.biByeRoomCode = snapshot?.roomCode;
      this.biByeMotion = new BiByeMotion();
    }
    if ((snapshot?.bibyeRevision ?? 0) < this.biByeMotion.revision) return;
    this.biByePresentationOptions = options;
    this.biByeMotion.push(
      snapshot?.bibyeBallista ?? null,
      snapshot?.bibyeProjectiles ?? [],
      snapshot?.serverTime ?? serverNow,
      snapshot?.bibyeRevision ?? 0
    );
    this.biByeServerTime = serverNow;
  }

  setObjectiveState(objective, localTeam = null, serverTime = null) {
    this.currentObjective = objective ?? null;
    this.localTeam = localTeam;
    this.updateObjectiveVisuals(objective, serverTime, localTeam);
  }

  updateObjectiveVisuals(objectiveState, serverNow, localTeam = null) {
    if (!objectiveState) return;
    const activeIndex = objectiveState.index ?? 0;
    const progress = objectiveState.progress ?? 0;
    const completed = objectiveState.completed ?? false;

    // Palisade collapse animation (Phase 0 complete -> Redoubt fallen)
    const targetPalisade = activeIndex > 0 || completed ? 1.0 : 0.0;
    this.palisadeCollapseProgress += (targetPalisade - this.palisadeCollapseProgress) * 0.1;
    if (this.palisadeGroup) {
      this.palisadeGroup.rotation.x = this.palisadeCollapseProgress * (Math.PI / 2.2);
      this.palisadeGroup.position.y = -this.palisadeCollapseProgress * 0.6;
    }

    // Portcullis winch open animation (Phase 1 complete -> Gate breached)
    const targetPortcullis = completed ? 1.0 : 0.0;
    this.portcullisOpenProgress += (targetPortcullis - this.portcullisOpenProgress) * 0.08;
    if (this.portcullisGroup) {
      this.portcullisGroup.position.y = this.portcullisOpenProgress * 4.2;
    }

    // Rings and arcs
    for (const ring of this.objectiveRings) {
      const isCurrent = !completed && ring.index === activeIndex;
      const isPast = ring.index < activeIndex || completed;
      ring.ringMesh.visible = isCurrent;
      ring.discMesh.visible = isCurrent || isPast;
      ring.progressMesh.visible = isCurrent && progress > 0.01;

      if (isCurrent && progress > 0.01) {
        ring.progressMesh.geometry.dispose();
        const arc = Math.PI * 2 * Math.min(1.0, progress);
        const obj = OUTERWORKS.objectives[ring.index];
        ring.progressMesh.geometry = new THREE.RingGeometry(obj.radius - 0.78, obj.radius - 0.42, 48, 1, 0, arc);
      }
    }
  }

  update(timeSec, camera = null) {
    // Torches
    for (const flame of this.flames) {
      const pulse = 0.9 + Math.sin(timeSec * 8.5 + flame.userData.phase) * 0.07;
      flame.scale.set(pulse, pulse * 1.15, pulse);
      flame.position.y = flame.userData.baseY + Math.sin(timeSec * 6 + flame.userData.phase) * 0.02;
    }
    for (const light of this.torchLights) {
      light.intensity = 2.2 + Math.sin(timeSec * 9.0 + light.userData.phase) * 0.25;
    }

    // Banners fluttering
    for (const cloth of this.banners) {
      cloth.rotation.x = -0.06 * (0.5 + 0.5 * Math.sin(timeSec * 1.3 + cloth.userData.phase));
    }

    // Ballista update
    if (this.biByeLlista) {
      const view = this.biByeMotion.sample(
        this.biByeServerTime ?? timeSec,
        this.biByePresentationOptions?.local,
        this.biByePresentationOptions?.frozen
      );
      this.biByeLlista.update(view.clock, view.ballista, view.projectiles);
    }
  }

  dispose() {
    this.disposed = true;
    this.biByeLlista?.dispose();
    this.scene.remove(this.group);
    this.group.traverse((object) => {
      object.geometry?.dispose?.();
      if (object.material) disposeMaterial(object.material);
    });
    for (const mat of Object.values(this.materials)) {
      disposeMaterial(mat);
    }
  }
}
