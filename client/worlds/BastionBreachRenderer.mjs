import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { appUrl } from '../appUrl.mjs';
import { BASTION_BREACH, BASTION_GALLERY_Y, BASTION_GATE_OPEN_DURATION_SEC } from '../../shared/worlds/bastionBreach.mjs';
import { everywhere } from '../game/viewLayers.mjs';

export const GATEHOUSE_MODEL_URL = '/client/assets/worlds/bastion-breach/honorable-entry-gatehouse.glb';

let gatehouseGltfPromise = null;

export function loadHonorableGatehouseAsset() {
  if (!gatehouseGltfPromise) {
    const loader = new GLTFLoader();
    gatehouseGltfPromise = new Promise((resolve) => {
      loader.load(
        appUrl(GATEHOUSE_MODEL_URL),
        (gltf) => resolve(gltf),
        undefined,
        (err) => {
          console.warn('Honorable Entry Gatehouse GLB failed to load:', err);
          gatehouseGltfPromise = null;
          resolve(null);
        }
      );
    });
  }
  return gatehouseGltfPromise;
}

export function resetGatehouseAssetCache() {
  gatehouseGltfPromise = null;
}

export const BASTION_BREACH_LIGHTING = Object.freeze({
  background: 0x242832,
  fog: Object.freeze({ color: 0x2c3340, density: 0.011 }),
  hemisphere: Object.freeze({ skyColor: 0xd8d4c8, groundColor: 0x48423b, intensity: 1.8 }),
  sun: Object.freeze({ color: 0xffb570, intensity: 2.8, position: Object.freeze([-25, 22, -18]) }),
  sky: Object.freeze({ zenith: 0x3d4b60, horizon: 0xca8c64, below: 0x252320 }),
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

export class BastionBreachRenderer {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.options = options;
    this.group = new THREE.Group();
    this.group.name = 'Bastion Breach';
    this.lighting = BASTION_BREACH_LIGHTING;
    this.torches = [];
    this.objectiveRings = [];
    this.currentObjective = null;
    this.localTeam = null;
    this.gateOpenProgress = 0.0;
    this.targetGateOpen = 0.0;
    this.lastTimeSec = null;
    this.serverTime = null;
    this.disposed = false;

    // Gatehouse references (authored GLB)
    this.gatehouseGroup = null;
    this.gatehouseModel = null;
    this.gatehouseMixer = null;
    this.gatehouseActions = null;
    this.gatehouseOwnedMaterials = new Set();

    // Fallback references (lightweight procedural gate while GLB is pending)
    this.fallbackGatehouseGroup = null;
    this.gatePortcullisGroup = null;
    this.gateLeftDoor = null;
    this.gateRightDoor = null;
    this.gateWinchDrum = null;
    this.gateCounterweightLeft = null;
    this.gateCounterweightRight = null;

    scene.background = new THREE.Color(BASTION_BREACH_LIGHTING.background);
    scene.fog = new THREE.FogExp2(BASTION_BREACH_LIGHTING.fog.color, BASTION_BREACH_LIGHTING.fog.density);
    scene.add(this.group);
    this.#build();
  }

  #build() {
    this.materials = {
      stone: new THREE.MeshStandardMaterial({ color: 0x766f68, roughness: 0.88, metalness: 0.06 }),
      stoneFloor: new THREE.MeshStandardMaterial({ color: 0x5e5852, roughness: 0.85, metalness: 0.08 }),
      stoneDais: new THREE.MeshStandardMaterial({ color: 0x8a827a, roughness: 0.78, metalness: 0.10 }),
      paleStone: new THREE.MeshStandardMaterial({ color: 0x9e988f, roughness: 0.82, metalness: 0.06 }),
      paleStoneTrim: new THREE.MeshStandardMaterial({ color: 0xbdb7ad, roughness: 0.72, metalness: 0.08 }),
      darkOak: new THREE.MeshStandardMaterial({ color: 0x3d2b1f, roughness: 0.88, metalness: 0.02 }),
      bannerCrimson: new THREE.MeshStandardMaterial({
        color: 0x8b201a,
        roughness: 0.70,
        metalness: 0.06,
        side: THREE.DoubleSide,
      }),
      timber: new THREE.MeshStandardMaterial({ color: 0x563e2d, roughness: 0.90, metalness: 0.02 }),
      iron: new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.55, metalness: 0.80 }),
      brass: new THREE.MeshStandardMaterial({ color: 0x9b783e, roughness: 0.45, metalness: 0.75 }),
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
    for (const fl of BASTION_BREACH.floors) {
      const isDais = fl.id.includes('dais') || fl.id.includes('step');
      const mat = isDais ? this.materials.stoneDais : this.materials.stoneFloor;
      const mesh = box(this.group, fl.size, mat, fl.center, [0, 0, 0], false);
      mesh.receiveShadow = true;
    }

    // --- Build Solids ---
    for (const sol of BASTION_BREACH.solids) {
      if (sol.id.startsWith('gatehouse-') || BASTION_BREACH.structures.some(def => def.solidIds.includes(sol.id))) continue;
      const isTimber = sol.material === 'timber' || sol.id.includes('timber') || sol.id.includes('crates') || sol.id.includes('wreckage') || sol.id.includes('barricade') || sol.id.includes('hoarding');
      const mat = isTimber ? this.materials.timber : this.materials.stone;
      box(this.group, sol.size, mat, sol.center, [0, 0, 0], true);
    }

    // --- Build Ramps ---
    for (const ramp of BASTION_BREACH.ramps) {
      const width = ramp.maxX - ramp.minX;
      const length = ramp.maxZ - ramp.minZ;
      const rise = ramp.endY - ramp.startY;
      const hyp = Math.hypot(length, rise);
      const mesh = box(
        this.group,
        [width, 0.3, hyp],
        this.materials.stoneFloor,
        [(ramp.minX + ramp.maxX) / 2, (ramp.startY + ramp.endY) / 2 - 0.12, (ramp.minZ + ramp.maxZ) / 2],
        [-Math.atan2(rise, length), 0, 0],
      );
      mesh.receiveShadow = true;
    }

    // --- The Barbican Gatehouse (Centerpiece of Objective 1 at z = -2) ---
    this.#buildBarbicanGatehouse();

    // --- The Honorable Entry Gatehouse (Centerpiece of Transition & Doctrine at z = 8.8) ---
    this.#buildHonorableEntryGatehouse();

    // --- Wall Battlements & Crenellations (Merlons along fortress parapets) ---
    for (let x = -14; x <= 14; x += 3.5) {
      box(this.group, [1.8, 0.9, 0.9], this.materials.stone, [x, 4.95, -38.0]);
    }
    for (let z = 8; z <= 22; z += 3.2) {
      box(this.group, [0.8, 0.8, 1.6], this.materials.stone, [15.1, BASTION_GALLERY_Y + 1.6, z]);
    }
    for (let z = -24; z <= 6; z += 4.5) {
      box(this.group, [0.9, 0.8, 2.0], this.materials.stone, [-16.0, 4.9, z]);
    }

    // --- High Sanctum Gothic Vault Arch Ribs & Siege Damage ---
    this.#buildSanctumVaultArches();

    // --- Stone Knight Effigies (Carved sarcophagi tops in side aisles) ---
    this.#buildKnightEffigy([-9.5, 1.1, 24.0]);
    this.#buildKnightEffigy([9.5, 1.1, 24.0]);

    // --- Heraldic Wall Banners along Sanctum walls ---
    this.#buildSanctumBanners();

    // --- Build Objective Markers / Standards ---
    for (let i = 0; i < BASTION_BREACH.objectives.length; i++) {
      const obj = BASTION_BREACH.objectives[i];
      const ringGeom = new THREE.RingGeometry(obj.radius - 0.35, obj.radius, 64);
      const discGeom = new THREE.CircleGeometry(obj.radius - 0.35, 64);

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
      const progressMesh = new THREE.Mesh(new THREE.RingGeometry(obj.radius - 0.72, obj.radius - 0.38, 48, 1, 0, 0.001), progressMat);
      progressMesh.rotation.x = -Math.PI / 2;
      progressMesh.position.set(obj.x, obj.y + 0.07, obj.z);
      this.group.add(progressMesh);

      const standardGroup = new THREE.Group();
      standardGroup.position.set(obj.x, obj.y, obj.z);
      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 0.32, 8), this.materials.stoneDais);
      plinth.position.y = 0.16;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 3.8, 8), this.materials.iron);
      pole.position.y = 1.9;
      const crossbar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.07, 0.07), this.materials.brass);
      crossbar.position.y = 3.45;
      const bannerMat = new THREE.MeshStandardMaterial({
        color: 0x9c352f,
        roughness: 0.72,
        metalness: 0.08,
        emissive: new THREE.Color(0x2a0808),
        side: THREE.DoubleSide,
      });
      const bannerCloth = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 1.45), bannerMat);
      bannerCloth.position.set(0, 2.68, 0.06);
      const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), this.materials.brass);
      finial.position.y = 3.92;
      standardGroup.add(plinth, pole, crossbar, bannerCloth, finial);
      this.group.add(standardGroup);

      this.objectiveRings.push({
        index: i,
        id: obj.id,
        radius: obj.radius,
        ringMesh,
        discMesh,
        progressMesh,
        bannerCloth,
        finial,
        standardGroup,
        lastProgressQuantized: -1,
      });
    }

    // --- Torches & Wall Sconces ---
    this.#addTorch([-4.5, 2.4, -2.0]);
    this.#addTorch([4.5, 2.4, -2.0]);
    this.#addTorch([0, 2.8, 11]);
    this.#addTorch([-5.0, 2.5, 20.2]);
    this.#addTorch([5.0, 2.5, 20.2]);
    this.#addTorch([-2.2, 2.2, 31.0]);
    this.#addTorch([2.2, 2.2, 31.0]);
    this.#addTorch([0, 2.2, -36.5]);
    this.#addTorch([-7.5, 2.2, -18.0]);
  }

  #buildBarbicanGatehouse() {
    const barbicanGroup = new THREE.Group();
    barbicanGroup.position.set(0, 0, -2);

    // --- Flanking Barbican Towers Details ---
    for (const side of [-4.9, 4.9]) {
      // Stone stringcourse cornice
      box(barbicanGroup, [2.5, 0.25, 3.2], this.materials.stoneDais, [side, 4.6, 0]);
      // Crenellated merlons on tower tops
      box(barbicanGroup, [0.75, 0.85, 0.8], this.materials.stone, [side - 0.7, 6.2, -1.0]);
      box(barbicanGroup, [0.75, 0.85, 0.8], this.materials.stone, [side + 0.7, 6.2, -1.0]);
      box(barbicanGroup, [0.75, 0.85, 0.8], this.materials.stone, [side - 0.7, 6.2, 1.0]);
      box(barbicanGroup, [0.75, 0.85, 0.8], this.materials.stone, [side + 0.7, 6.2, 1.0]);
      // Arrow loop embrasures on outer tower faces
      box(barbicanGroup, [0.15, 1.2, 0.3], this.materials.iron, [side * 1.22, 2.8, 0]);

      // Projecting Timber Hoarding (wooden defensive overhang atop towers)
      box(barbicanGroup, [2.6, 0.25, 3.4], this.materials.timber, [side, 5.85, 0]);
      box(barbicanGroup, [0.15, 1.1, 3.4], this.materials.timber, [side + (side > 0 ? 1.25 : -1.25), 6.45, 0]);
    }

    // --- Pointed Stone Barbican Gateway Arch & Portcullis ---
    // Curved arch vault haunches
    box(barbicanGroup, [2.2, 0.55, 1.2], this.materials.stoneDais, [-2.6, 4.4, 0], [0, 0, 0.28]);
    box(barbicanGroup, [2.2, 0.55, 1.2], this.materials.stoneDais, [2.6, 4.4, 0], [0, 0, -0.28]);
    // Central carved keystone
    box(barbicanGroup, [0.95, 0.7, 1.3], this.materials.stoneDais, [0, 5.15, 0]);

    // Raised Spiked Iron Portcullis Frame (suspended under archway)
    box(barbicanGroup, [6.8, 0.18, 0.18], this.materials.iron, [0, 4.6, 0.2]); // top crossbeam
    for (let x = -2.8; x <= 2.8; x += 0.7) {
      // Vertical portcullis bars with sharpened bottom spikes
      cylinder(barbicanGroup, 0.05, 0.05, 1.8, 6, this.materials.iron, [x, 3.7, 0.2]);
      cylinder(barbicanGroup, 0.06, 0.01, 0.35, 6, this.materials.iron, [x, 2.7, 0.2]);
    }

    // Overhead Timber Gate Winch Drum & Hoist Chains
    cylinder(barbicanGroup, 0.25, 0.25, 3.8, 12, this.materials.timber, [0, 5.2, 0.4], [0, 0, Math.PI / 2]);
    cylinder(barbicanGroup, 0.04, 0.04, 1.4, 6, this.materials.iron, [-1.6, 4.5, 0.3]);
    cylinder(barbicanGroup, 0.04, 0.04, 1.4, 6, this.materials.iron, [1.6, 4.5, 0.3]);

    this.group.add(barbicanGroup);
  }

  #buildHonorableEntryGatehouse() {
    this.gatehouseGroup = new THREE.Group();
    this.gatehouseGroup.name = "Honorable Entry Gatehouse Group";
    this.gatehouseGroup.position.set(0, 0, 8.8);
    this.group.add(this.gatehouseGroup);

    if (this.options?.gatehouseGltf) {
      this.#setupAuthoredGatehouse(this.options.gatehouseGltf);
    } else {
      this.#buildFallbackProceduralGate();
      loadHonorableGatehouseAsset().then((gltf) => {
        if (!gltf || this.disposed) return;
        this.#setupAuthoredGatehouse(gltf);
      }).catch(() => {});
    }

    // --- Western Wall Unfinished Construction Gap & Scaffolding (Scene A Anchor) ---
    this.#buildConstructionGapScaffolding();
  }

  #setupAuthoredGatehouse(gltf) {
    if (!gltf?.scene || this.disposed) return;

    if (this.fallbackGatehouseGroup) {
      this.gatehouseGroup.remove(this.fallbackGatehouseGroup);
      this.fallbackGatehouseGroup.traverse((obj) => {
        obj.geometry?.dispose?.();
        // NOTE: Do NOT dispose obj.material here!
        // Fallback procedural elements use this.materials, which are shared across the renderer.
      });
      this.fallbackGatehouseGroup = null;
      this.gatePortcullisGroup = null;
      this.gateLeftDoor = null;
      this.gateRightDoor = null;
      this.gateWinchDrum = null;
      this.gateCounterweightLeft = null;
      this.gateCounterweightRight = null;
    }

    if (this.gatehouseMixer) {
      this.gatehouseMixer.stopAllAction();
      if (this.gatehouseModel) {
        this.gatehouseMixer.uncacheRoot(this.gatehouseModel);
        this.gatehouseGroup.remove(this.gatehouseModel);
        this.gatehouseModel.traverse((child) => {
          child.geometry?.dispose?.();
        });
        if (this.gatehouseOwnedMaterials) {
          for (const mat of this.gatehouseOwnedMaterials) {
            mat?.dispose?.();
          }
          this.gatehouseOwnedMaterials.clear();
        }
      }
    }

    const model = SkeletonUtils.clone(gltf.scene);
    model.name = "Authored_Honorable_Entry_Gatehouse";
    model.position.set(0, 0, 0);
    model.rotation.set(0, 0, 0);
    model.scale.set(1, 1, 1);

    // Clone materials so this instance owns its materials and disposing them upon renderer disposal
    // does not mutate or dispose the cached gltf.scene materials across repeated matches!
    const ownedMaterials = new Set();
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material = child.material.map((m) => {
              const c = m.clone();
              ownedMaterials.add(c);
              return c;
            });
          } else {
            const c = child.material.clone();
            ownedMaterials.add(c);
            child.material = c;
          }
        }
      }
    });
    this.gatehouseOwnedMaterials = ownedMaterials;

    this.gatehouseModel = model;
    this.gatehouseGroup.add(model);

    this.gatehouseMixer = new THREE.AnimationMixer(model);
    this.gatehouseActions = {};
    for (const clip of (gltf.animations || [])) {
      const action = this.gatehouseMixer.clipAction(clip);
      action.clampWhenFinished = true;
      action.setLoop(THREE.LoopOnce);
      this.gatehouseActions[clip.name] = action;
    }

    if (this.gatehouseActions.Gate_Open) {
      this.gatehouseActions.Gate_Open.clampWhenFinished = true;
      this.gatehouseActions.Gate_Open.setLoop(THREE.LoopOnce);
    }
    if (this.gatehouseActions.Gate_Close) {
      this.gatehouseActions.Gate_Close.clampWhenFinished = true;
      this.gatehouseActions.Gate_Close.setLoop(THREE.LoopOnce);
    }

    this.#applyGateTransform();
  }

  setGatehouseAsset(gltf) {
    this.#setupAuthoredGatehouse(gltf);
  }

  #buildFallbackProceduralGate() {
    this.fallbackGatehouseGroup = new THREE.Group();
    this.fallbackGatehouseGroup.name = "Procedural_Gatehouse_Fallback";

        // --- Pale Stone Gatehouse Piers and Molded Plinths ---
    for (const side of [-3.8, 3.8]) {
      // Main flanking stone piers
      box(this.fallbackGatehouseGroup, [1.4, 4.4, 2.0], this.materials.paleStone, [side, 2.2, 0]);
      // Molded base plinth
      box(this.fallbackGatehouseGroup, [1.6, 0.5, 2.2], this.materials.paleStoneTrim, [side, 0.25, 0]);
      // Molded capital / impost at arch spring
      box(this.fallbackGatehouseGroup, [1.55, 0.35, 2.1], this.materials.paleStoneTrim, [side, 4.4, 0]);
      // Decorative pilaster strips facing courtyard (-z)
      box(this.fallbackGatehouseGroup, [0.35, 4.2, 0.15], this.materials.paleStoneTrim, [side, 2.2, -1.05]);
      // Arrow loops in outer flanks
      box(this.fallbackGatehouseGroup, [0.12, 1.4, 0.35], this.materials.iron, [side * 1.15, 2.6, 0]);
    }

    // --- Molded Pointed Gothic Arch Voussoirs ---
    // Lower angled springers
    box(this.fallbackGatehouseGroup, [2.2, 0.55, 1.8], this.materials.paleStoneTrim, [-2.2, 4.95, 0], [0, 0, 0.36]);
    box(this.fallbackGatehouseGroup, [2.2, 0.55, 1.8], this.materials.paleStoneTrim, [2.2, 4.95, 0], [0, 0, -0.36]);
    // Upper converging voussoirs
    box(this.fallbackGatehouseGroup, [1.8, 0.50, 1.8], this.materials.paleStoneTrim, [-0.85, 5.65, 0], [0, 0, 0.16]);
    box(this.fallbackGatehouseGroup, [1.8, 0.50, 1.8], this.materials.paleStoneTrim, [0.85, 5.65, 0], [0, 0, -0.16]);

    // Central Carved Keystone Boss & Castleward Seal
    box(this.fallbackGatehouseGroup, [0.95, 0.85, 1.9], this.materials.paleStoneTrim, [0, 6.05, 0]);
    cylinder(this.fallbackGatehouseGroup, 0.42, 0.42, 0.14, 16, this.materials.brass, [0, 6.05, -0.98], [Math.PI / 2, 0, 0]);
    box(this.fallbackGatehouseGroup, [0.48, 0.12, 0.16], this.materials.iron, [0, 6.05, -1.02]);
    box(this.fallbackGatehouseGroup, [0.12, 0.48, 0.16], this.materials.iron, [0, 6.05, -1.02]);

    // Gatehouse Facade Parapet, Stringcourse & Machicolations
    box(this.fallbackGatehouseGroup, [9.0, 0.28, 2.2], this.materials.paleStoneTrim, [0, 6.45, 0]);
    box(this.fallbackGatehouseGroup, [9.0, 1.2, 0.6], this.materials.paleStone, [0, 7.15, -0.8]);
    for (const x of [-3.8, -1.9, 0, 1.9, 3.8]) {
      box(this.fallbackGatehouseGroup, [0.95, 0.8, 0.65], this.materials.paleStone, [x, 8.0, -0.8]);
    }
    for (const x of [-3.8, -2.5, -1.2, 0, 1.2, 2.5, 3.8]) {
      box(this.fallbackGatehouseGroup, [0.28, 0.45, 0.35], this.materials.paleStoneTrim, [x, 6.2, -1.05]);
    }

    // Interior Vault Soffit & Cylindrical Murder Holes
    box(this.fallbackGatehouseGroup, [6.4, 0.25, 1.8], this.materials.paleStone, [0, 5.85, 0]);
    for (const [mx, mz] of [[-1.2, -0.4], [1.2, -0.4], [-1.2, 0.4], [1.2, 0.4]]) {
      cylinder(this.fallbackGatehouseGroup, 0.26, 0.26, 0.32, 12, this.materials.iron, [mx, 5.85, mz]);
      box(this.fallbackGatehouseGroup, [0.48, 0.05, 0.05], this.materials.iron, [mx, 5.75, mz]);
      box(this.fallbackGatehouseGroup, [0.05, 0.05, 0.48], this.materials.iron, [mx, 5.75, mz]);
    }

    // Courtyard-facing Crimson Banners draped from iron corbels
    for (const side of [-3.8, 3.8]) {
      box(this.fallbackGatehouseGroup, [0.9, 0.08, 0.08], this.materials.iron, [side, 4.6, -1.05]);
      const bannerMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 2.4), this.materials.bannerCrimson);
      bannerMesh.position.set(side, 3.35, -1.08);
      bannerMesh.rotation.y = Math.PI;
      this.fallbackGatehouseGroup.add(bannerMesh);
    }

    // --- Overhead Gate Chamber Winch Machinery ---
    this.gateWinchDrum = new THREE.Group();
    this.gateWinchDrum.position.set(0, 6.7, 0);
    // Heavy timber drum axle
    cylinder(this.gateWinchDrum, 0.26, 0.26, 5.4, 14, this.materials.timber, [0, 0, 0], [0, 0, Math.PI / 2]);
    cylinder(this.gateWinchDrum, 0.10, 0.10, 6.2, 8, this.materials.iron, [0, 0, 0], [0, 0, Math.PI / 2]);
    // Iron spoked gear / ratchet wheels
    for (const gx of [-2.6, 2.6]) {
      cylinder(this.gateWinchDrum, 0.65, 0.65, 0.12, 16, this.materials.iron, [gx, 0, 0], [0, 0, Math.PI / 2]);
      for (let a = 0; a < 6; a++) {
        const rad = (a * Math.PI) / 3;
        box(this.gateWinchDrum, [0.08, 1.1, 0.08], this.materials.iron, [gx, 0, 0], [rad, 0, 0]);
      }
    }
    this.fallbackGatehouseGroup.add(this.gateWinchDrum);

    // Wall bearing blocks supporting axle
    box(this.fallbackGatehouseGroup, [0.45, 0.65, 0.55], this.materials.iron, [-3.1, 6.7, 0]);
    box(this.fallbackGatehouseGroup, [0.45, 0.65, 0.55], this.materials.iron, [3.1, 6.7, 0]);

    // Counterweight Boxes
    this.gateCounterweightLeft = new THREE.Group();
    this.gateCounterweightLeft.position.set(-3.1, 5.2, 0.45);
    box(this.gateCounterweightLeft, [0.55, 1.2, 0.55], this.materials.timber, [0, 0, 0]);
    box(this.gateCounterweightLeft, [0.60, 0.15, 0.60], this.materials.iron, [0, 0.45, 0]);
    box(this.gateCounterweightLeft, [0.60, 0.15, 0.60], this.materials.iron, [0, -0.45, 0]);
    this.fallbackGatehouseGroup.add(this.gateCounterweightLeft);

    this.gateCounterweightRight = new THREE.Group();
    this.gateCounterweightRight.position.set(3.1, 5.2, 0.45);
    box(this.gateCounterweightRight, [0.55, 1.2, 0.55], this.materials.timber, [0, 0, 0]);
    box(this.gateCounterweightRight, [0.60, 0.15, 0.60], this.materials.iron, [0, 0.45, 0]);
    box(this.gateCounterweightRight, [0.60, 0.15, 0.60], this.materials.iron, [0, -0.45, 0]);
    this.fallbackGatehouseGroup.add(this.gateCounterweightRight);

    // Counterweight suspension chains (fixed vertical guides)
    cylinder(this.fallbackGatehouseGroup, 0.035, 0.035, 3.4, 6, this.materials.iron, [-3.1, 5.1, 0.45]);
    cylinder(this.fallbackGatehouseGroup, 0.035, 0.035, 3.4, 6, this.materials.iron, [3.1, 5.1, 0.45]);

    // --- Articulated Moving Portcullis Grille ---
    this.gatePortcullisGroup = new THREE.Group();
    this.gatePortcullisGroup.position.set(0, 0, -0.2);
    // Portcullis horizontal beams
    box(this.gatePortcullisGroup, [6.4, 0.22, 0.20], this.materials.iron, [0, 4.3, 0]);
    box(this.gatePortcullisGroup, [6.2, 0.18, 0.18], this.materials.iron, [0, 2.5, 0]);
    box(this.gatePortcullisGroup, [6.2, 0.20, 0.20], this.materials.iron, [0, 0.75, 0]);
    // Vertical spiked iron bars
    for (let bx = -2.7; bx <= 2.75; bx += 0.675) {
      box(this.gatePortcullisGroup, [0.10, 4.2, 0.10], this.materials.iron, [bx, 2.3, 0]);
      cylinder(this.gatePortcullisGroup, 0.08, 0.01, 0.45, 6, this.materials.iron, [bx, 0.4, 0]);
    }
    // Portcullis hoist chains attached to top beam
    cylinder(this.gatePortcullisGroup, 0.04, 0.04, 2.6, 6, this.materials.iron, [-1.8, 5.6, 0]);
    cylinder(this.gatePortcullisGroup, 0.04, 0.04, 2.6, 6, this.materials.iron, [1.8, 5.6, 0]);
    this.fallbackGatehouseGroup.add(this.gatePortcullisGroup);

    // --- Articulated Twin Oak Gate Doors ---
    // Left door (hinged on west pier at x = -3.1, swinging inward toward +z)
    this.gateLeftDoor = new THREE.Group();
    this.gateLeftDoor.position.set(-3.1, 0, 0.25);
    box(this.gateLeftDoor, [3.05, 4.3, 0.22], this.materials.darkOak, [1.55, 2.15, 0]);
    for (const hy of [0.75, 2.15, 3.55]) {
      box(this.gateLeftDoor, [3.08, 0.14, 0.26], this.materials.iron, [1.55, hy, 0]);
    }
    box(this.gateLeftDoor, [0.12, 0.35, 0.15], this.materials.brass, [2.75, 2.05, -0.15]);
    this.fallbackGatehouseGroup.add(this.gateLeftDoor);

    // Right door (hinged on east pier at x = 3.1, swinging inward toward +z)
    this.gateRightDoor = new THREE.Group();
    this.gateRightDoor.position.set(3.1, 0, 0.25);
    box(this.gateRightDoor, [3.05, 4.3, 0.22], this.materials.darkOak, [-1.55, 2.15, 0]);
    for (const hy of [0.75, 2.15, 3.55]) {
      box(this.gateRightDoor, [3.08, 0.14, 0.26], this.materials.iron, [-1.55, hy, 0]);
    }
    box(this.gateRightDoor, [0.12, 0.35, 0.15], this.materials.brass, [-2.75, 2.05, -0.15]);
    this.fallbackGatehouseGroup.add(this.gateRightDoor);

    this.gatehouseGroup.add(this.fallbackGatehouseGroup);
  }

  #buildConstructionGapScaffolding() {
    const scaffoldGroup = new THREE.Group();
    scaffoldGroup.position.set(-11.5, 0, 6.8);

    // Upright timber scaffold standards (poles)
    const polePositions = [
      [-1.5, -0.6],
      [1.5, -0.6],
      [-1.5, 0.6],
      [1.5, 0.6],
    ];
    for (const [px, pz] of polePositions) {
      cylinder(scaffoldGroup, 0.08, 0.08, 5.2, 8, this.materials.timber, [px, 2.6, pz]);
    }

    // Horizontal ledger planks at lower (y = 1.8) and upper (y = 3.6) levels
    for (const ly of [1.8, 3.6]) {
      box(scaffoldGroup, [3.4, 0.08, 1.4], this.materials.timber, [0, ly, 0]);
      box(scaffoldGroup, [3.4, 0.12, 0.08], this.materials.timber, [0, ly + 0.9, -0.65]);
    }

    // Diagonal sway cross-bracing
    box(scaffoldGroup, [3.6, 0.08, 0.08], this.materials.timber, [0, 2.7, -0.65], [0, 0, 0.52]);
    box(scaffoldGroup, [3.6, 0.08, 0.08], this.materials.timber, [0, 2.7, -0.65], [0, 0, -0.52]);

    // Leaning timber ladder on south approach
    const ladderGroup = new THREE.Group();
    ladderGroup.position.set(0.6, 0, -0.9);
    ladderGroup.rotation.x = 0.28;
    box(ladderGroup, [0.06, 4.0, 0.06], this.materials.timber, [-0.25, 1.9, 0]);
    box(ladderGroup, [0.06, 4.0, 0.06], this.materials.timber, [0.25, 1.9, 0]);
    for (let ry = 0.4; ry <= 3.6; ry += 0.45) {
      box(ladderGroup, [0.46, 0.05, 0.05], this.materials.timber, [0, ry, 0]);
    }
    scaffoldGroup.add(ladderGroup);

    // Stacks of dressed ashlar stone blocks awaiting placement
    box(scaffoldGroup, [1.1, 0.55, 0.8], this.materials.paleStoneTrim, [1.8, 0.28, -1.0], [0, 0.2, 0]);
    box(scaffoldGroup, [0.85, 0.75, 0.85], this.materials.paleStoneTrim, [-1.9, 0.38, -0.9], [0, -0.15, 0]);

    // Mason's mortar mixing trough with lime mortar
    box(scaffoldGroup, [1.1, 0.4, 0.6], this.materials.timber, [0, 0.2, -1.2]);
    box(scaffoldGroup, [0.95, 0.08, 0.48], this.materials.paleStone, [0, 0.32, -1.2]);

    // Unfinished gap in the wall parapet with projecting timber headers
    box(scaffoldGroup, [2.4, 0.25, 1.2], this.materials.timber, [0, 5.2, 1.0]);
    box(scaffoldGroup, [0.18, 1.2, 0.18], this.materials.timber, [-0.8, 4.6, 1.0]);
    box(scaffoldGroup, [0.18, 1.2, 0.18], this.materials.timber, [0.8, 4.6, 1.0]);

    this.group.add(scaffoldGroup);
  }

  #buildSanctumVaultArches() {
    const ribMat = this.materials.stoneDais;
    const ribBaseMat = this.materials.stone;

    // --- Multi-Segment Gothic Vault Arches across the Nave ---
    // Spans South (z = 20.25), Center (z = 25.0), and North (z = 29.75)
    for (const z of [20.25, 25.0, 29.75]) {
      // Column springers (molded capitals at pillar tops)
      box(this.group, [1.8, 0.45, 1.8], ribMat, [-4.75, 5.5, z]);
      box(this.group, [1.8, 0.45, 1.8], ribMat, [4.75, 5.5, z]);

      // Lower curved haunches
      box(this.group, [2.4, 0.42, 0.42], ribMat, [-3.4, 6.0, z], [0, 0, 0.38]);
      box(this.group, [2.4, 0.42, 0.42], ribMat, [3.4, 6.0, z], [0, 0, -0.38]);

      // Upper pointed ribs meeting at apex
      box(this.group, [2.6, 0.38, 0.38], ribMat, [-1.3, 6.75, z], [0, 0, 0.16]);
      box(this.group, [2.6, 0.38, 0.38], ribMat, [1.3, 6.75, z], [0, 0, -0.16]);

      // Carved central foliate keystone boss
      box(this.group, [0.85, 0.65, 0.65], ribBaseMat, [0, 7.15, z]);
    }

    // Longitudinal Spine Ridge Beam running above nave center
    box(this.group, [0.38, 0.38, 12.5], ribMat, [0, 7.15, 25.0]);

    // Diagonal Cross-Ribs (Groin Vaulting between South & Center, Center & North)
    for (const [z0, z1] of [[20.25, 25.0], [25.0, 29.75]]) {
      const zMid = (z0 + z1) / 2;
      box(this.group, [6.5, 0.28, 0.28], ribMat, [0, 6.85, zMid], [0.35, 0, 0.45]);
      box(this.group, [6.5, 0.28, 0.28], ribMat, [0, 6.85, zMid], [-0.35, 0, -0.45]);
    }

    // --- Dramatic Siege Damage Breach in Ceiling (z = 27.5) ---
    // Broken jagged stone rib stumps where artillery smashed through
    box(this.group, [0.95, 0.4, 0.45], ribMat, [-2.2, 6.5, 27.2], [0.15, 0.2, 0.35]);
    box(this.group, [0.85, 0.35, 0.4], ribMat, [1.8, 6.6, 27.8], [-0.2, -0.15, -0.3]);
    // Smashed masonry blocks fallen onto floor near west aisle
    box(this.group, [0.95, 0.65, 1.1], ribBaseMat, [-7.2, 0.32, 27.5], [0, 0.4, 0.1]);
    box(this.group, [0.75, 0.55, 0.8], ribBaseMat, [-6.2, 0.28, 28.2], [0.2, -0.3, 0]);

    // Side Aisle Blind Lancet Arcades along East & West Walls
    for (const side of [-13.9, 13.9]) {
      for (const z of [22.5, 27.0, 31.5]) {
        // Recessed pilaster framing
        box(this.group, [0.15, 4.2, 0.35], ribMat, [side, 2.4, z - 1.2]);
        box(this.group, [0.15, 4.2, 0.35], ribMat, [side, 2.4, z + 1.2]);
        // Pointed arch lintel
        box(this.group, [0.16, 0.35, 1.5], ribMat, [side, 4.6, z - 0.5], [0.25, 0, 0]);
        box(this.group, [0.16, 0.35, 1.5], ribMat, [side, 4.6, z + 0.5], [-0.25, 0, 0]);
      }
    }

    // High Altar Reredos & Communion Brazier Details
    box(this.group, [4.8, 1.4, 0.45], ribMat, [0, 2.8, 36.2]);
    box(this.group, [1.4, 0.9, 0.48], ribMat, [0, 3.8, 36.2]); // altar crown cross
    // Twin standing sanctuary braziers flanking altar dais
    for (const x of [-3.2, 3.2]) {
      cylinder(this.group, 0.45, 0.3, 0.9, 8, this.materials.brass, [x, 0.75, 30.5]);
      cylinder(this.group, 0.55, 0.25, 0.35, 8, this.materials.iron, [x, 1.35, 30.5]);
    }
  }

  #buildKnightEffigy([x, y, z]) {
    const effigyGroup = new THREE.Group();
    effigyGroup.position.set(x, y, z);
    const mat = this.materials.stoneDais;

    // Sarcophagus plinth with decorative blind base panels
    box(effigyGroup, [1.4, 0.15, 2.4], mat, [0, -0.05, 0]);

    // Headrest stone pillow
    box(effigyGroup, [1.2, 0.18, 0.55], mat, [0, 0.09, -0.95]);

    // Knight's great helm (carved stone with crest)
    const helm = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.45, 8), mat);
    helm.position.set(0, 0.25, -0.95);
    helm.rotation.x = Math.PI / 2;
    effigyGroup.add(helm);

    // Torso in plate cuirass
    box(effigyGroup, [0.95, 0.24, 1.15], mat, [0, 0.14, -0.15]);

    // Hands folded in solemn prayer atop chest
    box(effigyGroup, [0.35, 0.18, 0.3], mat, [0, 0.32, -0.3]);

    // Armored legs and greaves
    box(effigyGroup, [0.36, 0.22, 1.1], mat, [-0.24, 0.12, 0.8]);
    box(effigyGroup, [0.36, 0.22, 1.1], mat, [0.24, 0.12, 0.8]);

    // Stone broadsword lying along knight's left flank
    box(effigyGroup, [0.12, 0.14, 2.2], this.materials.stone, [-0.45, 0.22, 0.1]);
    box(effigyGroup, [0.55, 0.12, 0.12], this.materials.stone, [-0.45, 0.22, -0.7]);

    // Heater shield resting on the right side
    const shield = box(effigyGroup, [0.15, 0.85, 1.4], mat, [0.45, 0.22, 0.1], [0.15, 0, 0.25]);

    this.group.add(effigyGroup);
  }

  #buildSanctumBanners() {
    const bannerColors = [0x8b2520, 0x22487a, 0x8b2520, 0x22487a];
    const bannerZs = [20.5, 24.5, 28.5, 32.5];

    for (let i = 0; i < bannerZs.length; i++) {
      const bZ = bannerZs[i];
      const color = bannerColors[i];

      // West Wall Banner
      const rodW = box(this.group, [0.8, 0.08, 0.08], this.materials.iron, [-13.7, 4.8, bZ]);
      const matW = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.05, side: THREE.DoubleSide });
      const clothW = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.4), matW);
      clothW.position.set(-13.85, 3.5, bZ);
      clothW.rotation.y = Math.PI / 2;
      this.group.add(clothW);

      // East Wall Banner
      const rodE = box(this.group, [0.8, 0.08, 0.08], this.materials.iron, [13.7, 4.8, bZ]);
      const matE = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.05, side: THREE.DoubleSide });
      const clothE = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.4), matE);
      clothE.position.set(13.85, 3.5, bZ);
      clothE.rotation.y = -Math.PI / 2;
      this.group.add(clothE);
    }
  }

  #addTorch(position) {
    box(this.group, [0.1, 0.4, 0.25], this.materials.iron, [position[0], position[1] - 0.2, position[2]]);
    const torchLight = everywhere(new THREE.PointLight(0xff9944, 1.8, 14, 1.6));
    torchLight.position.set(...position);
    this.group.add(torchLight);
    this.torches.push({ light: torchLight, baseY: position[1], phase: Math.random() * Math.PI * 2 });
  }

  setObjectiveState(objective, localTeam = null, serverTime = null) {
    const isFirstSet = this.currentObjective === null;
    this.currentObjective = objective ?? null;
    this.localTeam = localTeam;
    if (Number.isFinite(serverTime)) {
      this.serverTime = serverTime;
    }

    // When Objective 1 (The Outer Gate, index 0) is captured or match transitions to index >= 1 (High Sanctum),
    // Castleward defenders ceremonially open the Honorable Entry Gatehouse to admit attackers.
    const activeIdx = objective?.index ?? 0;
    const completed = Boolean(objective?.completed);
    const newTarget = (activeIdx >= 1 || completed) ? 1.0 : 0.0;
    const previousTarget = this.targetGateOpen;
    this.targetGateOpen = newTarget;

    // Reset detection: if match resets from open back to closed (Stage 1), snap closed immediately
    if (previousTarget === 1.0 && newTarget === 0.0) {
      this.gateOpenProgress = 0.0;
      this.#applyGateTransform();
    }

    if (isFirstSet) {
      if (this.targetGateOpen === 1.0) {
        const capturedAt = objective?.lastCapturedAt;
        if (Number.isFinite(capturedAt) && Number.isFinite(this.serverTime)) {
          const elapsed = this.serverTime - capturedAt;
          this.gateOpenProgress = Math.min(1.0, Math.max(0.0, elapsed / BASTION_GATE_OPEN_DURATION_SEC));
        } else {
          this.gateOpenProgress = 1.0;
        }
      } else {
        this.gateOpenProgress = 0.0;
      }
      this.#applyGateTransform();
    }
  }

  #applyGateTransform() {
    if (this.gatehouseMixer && this.gatehouseActions?.Gate_Open) {
      const openAction = this.gatehouseActions.Gate_Open;
      const clip = openAction.getClip();
      openAction.play();
      const clipTime = Math.min(clip.duration, Math.max(0, this.gateOpenProgress * clip.duration));
      openAction.time = clipTime;
      this.gatehouseMixer.update(0);
    } else {
      if (this.gatePortcullisGroup) {
        this.gatePortcullisGroup.position.y = this.gateOpenProgress * 3.8;
      }
      if (this.gateLeftDoor && this.gateRightDoor) {
        const doorAngle = this.gateOpenProgress * (Math.PI * 0.48);
        this.gateLeftDoor.rotation.y = -doorAngle;
        this.gateRightDoor.rotation.y = doorAngle;
      }
      if (this.gateWinchDrum) {
        this.gateWinchDrum.rotation.x = this.gateOpenProgress * (Math.PI * 3.5);
      }
      if (this.gateCounterweightLeft && this.gateCounterweightRight) {
        const cwY = 5.2 - this.gateOpenProgress * 3.2;
        this.gateCounterweightLeft.position.y = cwY;
        this.gateCounterweightRight.position.y = cwY;
      }
    }
  }

  update(timeSec, camera = null) {
    const dt = this.lastTimeSec !== null ? Math.min(0.1, Math.max(0.0001, timeSec - this.lastTimeSec)) : 0.016;
    this.lastTimeSec = timeSec;
    if (this.serverTime !== null) {
      this.serverTime += dt;
    }

    // Deterministic Honorable Entry Gatehouse opening animation
    // Coordinated precisely with server-authoritative BASTION_GATE_OPEN_DURATION_SEC (1.2s)
    const activeIdx = this.currentObjective?.index ?? 0;
    const capturedAt = this.currentObjective?.lastCapturedAt;
    if (this.targetGateOpen === 1.0) {
      if (activeIdx === 1 && Number.isFinite(capturedAt) && Number.isFinite(this.serverTime)) {
        const elapsed = this.serverTime - capturedAt;
        this.gateOpenProgress = Math.min(1.0, Math.max(0.0, elapsed / BASTION_GATE_OPEN_DURATION_SEC));
      } else {
        const rate = 1.0 / BASTION_GATE_OPEN_DURATION_SEC;
        this.gateOpenProgress = Math.min(1.0, this.gateOpenProgress + dt * rate);
      }
    } else {
      const rate = 1.0 / BASTION_GATE_OPEN_DURATION_SEC;
      this.gateOpenProgress = Math.max(0.0, this.gateOpenProgress - dt * rate);
    }

    this.#applyGateTransform();

    for (const torch of this.torches) {
      torch.light.intensity = 1.6 + Math.sin(timeSec * 8.5 + torch.phase) * 0.25 + Math.sin(timeSec * 14.1) * 0.12;
    }

    const objState = this.currentObjective;
    const progress = Math.max(0, Math.min(1, objState?.progress ?? 0));
    const contested = Boolean(objState?.contested);
    const capturing = Boolean(objState?.capturing);
    const completed = Boolean(objState?.completed);

    for (const ring of this.objectiveRings) {
      const isCurrent = !completed && ring.index === activeIdx;
      const isCaptured = completed || ring.index < activeIdx;

      ring.finial.rotation.y = timeSec * (isCurrent ? 1.8 : 0.4);

      if (!isCurrent) {
        ring.ringMesh.material.color.setHex(isCaptured ? 0x3d7eed : 0x55504c);
        ring.ringMesh.material.opacity = isCaptured ? 0.28 : 0.16;
        ring.discMesh.material.color.setHex(isCaptured ? 0x264b82 : 0x36322e);
        ring.discMesh.material.opacity = 0.08;
        ring.progressMesh.visible = false;
        ring.bannerCloth.material.color.setHex(isCaptured ? 0x2b5cb8 : 0x6e3626);
        ring.bannerCloth.material.emissive.setHex(0x000000);
        continue;
      }

      ring.progressMesh.visible = progress > 0.005;
      const quantized = Math.round(progress * 120);
      if (quantized !== ring.lastProgressQuantized) {
        ring.lastProgressQuantized = quantized;
        ring.progressMesh.geometry?.dispose?.();
        const theta = Math.max(0.01, progress * Math.PI * 2);
        ring.progressMesh.geometry = new THREE.RingGeometry(ring.radius - 0.76, ring.radius - 0.36, 56, 1, Math.PI / 2, theta);
      }

      if (contested) {
        const clash = (Math.sin(timeSec * 9.0) + 1) * 0.5;
        ring.ringMesh.material.color.setHex(clash > 0.5 ? 0xe98243 : 0xd65d55);
        ring.ringMesh.material.opacity = 0.72 + clash * 0.22;
        ring.discMesh.material.color.setHex(0x8a3b22);
        ring.discMesh.material.opacity = 0.22 + clash * 0.10;
        ring.progressMesh.material.color.setHex(0xe98243);
        ring.bannerCloth.material.color.setHex(0xb85d28);
        ring.bannerCloth.material.emissive.setHex(0x3a1808);
      } else if (capturing) {
        const pulse = 0.65 + Math.sin(timeSec * 5.2) * 0.18;
        ring.ringMesh.material.color.setHex(0x5294ff);
        ring.ringMesh.material.opacity = pulse;
        ring.discMesh.material.color.setHex(0x2d5ca8);
        ring.discMesh.material.opacity = 0.20 + Math.sin(timeSec * 5.2) * 0.06;
        ring.progressMesh.material.color.setHex(0x5294ff);
        ring.bannerCloth.material.color.setHex(0x3d7eed);
        ring.bannerCloth.material.emissive.setHex(0x122b52);
      } else {
        const pulse = 0.52 + Math.sin(timeSec * 2.8) * 0.12;
        ring.ringMesh.material.color.setHex(0xdf843a);
        ring.ringMesh.material.opacity = pulse;
        ring.discMesh.material.color.setHex(0x6e2814);
        ring.discMesh.material.opacity = 0.14;
        ring.progressMesh.material.color.setHex(0xc87430);
        ring.bannerCloth.material.color.setHex(0x84321c);
        ring.bannerCloth.material.emissive.setHex(0x280e06);
      }
    }
  }

  dispose() {
    this.disposed = true;
    this.gatehouseMixer?.stopAllAction?.();
    if (this.gatehouseModel) {
      this.gatehouseMixer?.uncacheRoot?.(this.gatehouseModel);
    }
    this.scene.remove(this.group);
    this.group.traverse((object) => {
      object.geometry?.dispose?.();
    });
    if (this.gatehouseOwnedMaterials) {
      for (const mat of this.gatehouseOwnedMaterials) {
        mat?.dispose?.();
      }
      this.gatehouseOwnedMaterials.clear();
    }
    for (const mat of Object.values(this.materials)) {
      disposeMaterial(mat);
    }
  }
}
