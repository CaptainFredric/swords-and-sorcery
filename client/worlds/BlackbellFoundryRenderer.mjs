import * as THREE from 'three';
import { BLACKBELL_FOUNDRY } from '../../shared/worlds/blackbellFoundry.mjs';
import { everywhere } from '../game/viewLayers.mjs';

export const BLACKBELL_FOUNDRY_LIGHTING = Object.freeze({
  background: 0x181515,
  fog: Object.freeze({ color: 0x221a18, density: 0.012 }),
  hemisphere: Object.freeze({ skyColor: 0xb89580, groundColor: 0x33221a, intensity: 1.6 }),
  sun: Object.freeze({ color: 0xff8c42, intensity: 2.4, position: Object.freeze([-20, 24, -12]) }),
  sky: Object.freeze({ zenith: 0x2e2528, horizon: 0xba683a, below: 0x161312 }),
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

export class BlackbellFoundryRenderer {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'Blackbell Foundry';
    this.lighting = BLACKBELL_FOUNDRY_LIGHTING;
    this.furnaceLights = [];
    this.objectiveRings = [];
    this.currentObjective = null;
    this.localTeam = null;

    scene.background = new THREE.Color(BLACKBELL_FOUNDRY_LIGHTING.background);
    scene.fog = new THREE.FogExp2(BLACKBELL_FOUNDRY_LIGHTING.fog.color, BLACKBELL_FOUNDRY_LIGHTING.fog.density);
    scene.add(this.group);
    this.#build();
  }

  #build() {
    this.materials = {
      stone: new THREE.MeshStandardMaterial({ color: 0x5a544e, roughness: 0.88, metalness: 0.05 }),
      brick: new THREE.MeshStandardMaterial({ color: 0x4f362c, roughness: 0.90, metalness: 0.04 }),
      stoneFloor: new THREE.MeshStandardMaterial({ color: 0x484440, roughness: 0.85, metalness: 0.06 }),
      timber: new THREE.MeshStandardMaterial({ color: 0x4a3424, roughness: 0.92, metalness: 0.02 }),
      iron: new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.55, metalness: 0.82 }),
      rustedIron: new THREE.MeshStandardMaterial({ color: 0x543628, roughness: 0.82, metalness: 0.45 }),
      bronzeBell: new THREE.MeshStandardMaterial({ color: 0x826032, roughness: 0.38, metalness: 0.88 }),
      moltenGlow: new THREE.MeshStandardMaterial({
        color: 0xff5511,
        emissive: new THREE.Color(0xff4400),
        emissiveIntensity: 2.2,
        roughness: 0.3,
        metalness: 0.1,
      }),
      objInactive: new THREE.MeshBasicMaterial({
        color: 0x5c5550,
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
    for (const fl of BLACKBELL_FOUNDRY.floors) {
      const mat = fl.material === 'timber' ? this.materials.timber : this.materials.stoneFloor;
      const mesh = box(this.group, fl.size, mat, fl.center, [0, 0, 0], false);
      mesh.receiveShadow = true;
    }

    // --- Build Solids ---
    for (const sol of BLACKBELL_FOUNDRY.solids) {
      let mat = this.materials.iron;
      if (sol.material === 'stone') mat = this.materials.stone;
      else if (sol.material === 'timber') mat = this.materials.timber;
      else if (sol.material === 'brick') mat = this.materials.brick;
      box(this.group, sol.size, mat, sol.center, [0, 0, 0], true);
    }

    // --- Build Ramps ---
    for (const ramp of BLACKBELL_FOUNDRY.ramps) {
      const width = ramp.maxX - ramp.minX;
      const length = ramp.maxZ - ramp.minZ;
      const rise = ramp.endY - ramp.startY;
      const hyp = Math.hypot(length, rise);
      const mesh = box(
        this.group,
        [width, 0.3, hyp],
        ramp.id.includes('gantry') ? this.materials.timber : this.materials.stoneFloor,
        [(ramp.minX + ramp.maxX) / 2, (ramp.startY + ramp.endY) / 2 - 0.12, (ramp.minZ + ramp.maxZ) / 2],
        [-Math.atan2(rise, length), 0, 0],
      );
      mesh.receiveShadow = true;
    }

    // --- Architectural Scenery: Gantry Trestles ---
    for (const z of [-14, -8, -2, 4]) {
      // Wood cross-struts beneath the gantry
      box(this.group, [0.25, 2.7, 0.25], this.materials.timber, [15.2, 1.35, z], [0, 0, 0], true);
      box(this.group, [0.25, 2.7, 0.25], this.materials.timber, [9.8, 1.35, z], [0, 0, 0], true);
      box(this.group, [5.4, 0.2, 0.2], this.materials.timber, [12.5, 2.4, z], [0, 0, 0], true);
    }

    // --- The Chain Winch Machine (Centerpiece of Stage 1) ---
    this.#buildChainWinch();

    // --- The Great Bell ("Blackbell") (Centerpiece of Stage 2) ---
    this.#buildGreatBell();

    // --- Molten Metal Casting Sluice Radiance ---
    const sluice1 = box(this.group, [0.75, 0.08, 11], this.materials.moltenGlow, [-2.2, 0.52, 26], [0, 0, 0], false);
    sluice1.receiveShadow = false;
    const sluice2 = box(this.group, [0.75, 0.08, 11], this.materials.moltenGlow, [2.2, 0.52, 26], [0, 0, 0], false);
    sluice2.receiveShadow = false;

    // --- Build Objective Markers / Standards ---
    for (let i = 0; i < BLACKBELL_FOUNDRY.objectives.length; i++) {
      const obj = BLACKBELL_FOUNDRY.objectives[i];
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
      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 0.35, 8), this.materials.iron);
      plinth.position.y = 0.18;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.0, 8), this.materials.iron);
      pole.position.y = 2.0;
      const crossbar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.08), this.materials.rustedIron);
      crossbar.position.y = 3.6;
      const bannerMat = new THREE.MeshStandardMaterial({
        color: 0x944228,
        roughness: 0.75,
        metalness: 0.10,
        emissive: new THREE.Color(0x301006),
        side: THREE.DoubleSide,
      });
      const bannerCloth = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 1.5), bannerMat);
      bannerCloth.position.set(0, 2.78, 0.06);
      const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), this.materials.bronzeBell);
      finial.position.y = 4.12;
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

    // --- Furnace Lights & Forge Sconces ---
    this.#addFurnaceLight([-11.8, 2.2, 24], 0xff5511, 2.8, 16);
    this.#addFurnaceLight([-11.8, 2.2, 28], 0xff6622, 2.6, 16);
    this.#addFurnaceLight([0, 4.5, 26], 0xff7733, 2.2, 18);
    this.#addFurnaceLight([-4.0, 2.5, -2.0], 0xff8844, 1.8, 12);
    this.#addFurnaceLight([4.0, 2.5, -2.0], 0xff8844, 1.8, 12);
    this.#addFurnaceLight([0, 3.2, 11], 0xff7733, 2.0, 14);
  }

  #buildChainWinch() {
    const winchGroup = new THREE.Group();
    winchGroup.position.set(0, 0, -2);

    // Massive central geared drum
    const drum = cylinder(winchGroup, 0.9, 0.9, 3.2, 16, this.materials.rustedIron, [0, 1.8, 0], [0, 0, Math.PI / 2]);
    drum.castShadow = true;

    // Cog gear wheels on both sides of drum
    cylinder(winchGroup, 1.4, 1.4, 0.25, 16, this.materials.iron, [-1.7, 1.8, 0], [0, 0, Math.PI / 2]);
    cylinder(winchGroup, 1.4, 1.4, 0.25, 16, this.materials.iron, [1.7, 1.8, 0], [0, 0, Math.PI / 2]);

    // Heavy iron chains wrapped around drum and hanging downward
    for (let c = -1.2; c <= 1.2; c += 0.8) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.96, 0.08, 8, 24), this.materials.iron);
      ring.position.set(c, 1.8, 0);
      ring.rotation.y = Math.PI / 2;
      winchGroup.add(ring);
    }

    // Heavy timber tripod A-frame
    box(winchGroup, [0.35, 4.2, 0.35], this.materials.timber, [-3.2, 2.1, 0.8], [0.15, 0, 0.1]);
    box(winchGroup, [0.35, 4.2, 0.35], this.materials.timber, [-3.2, 2.1, -0.8], [-0.15, 0, 0.1]);
    box(winchGroup, [0.35, 4.2, 0.35], this.materials.timber, [3.2, 2.1, 0.8], [0.15, 0, -0.1]);
    box(winchGroup, [0.35, 4.2, 0.35], this.materials.timber, [3.2, 2.1, -0.8], [-0.15, 0, -0.1]);

    this.group.add(winchGroup);
  }

  #buildGreatBell() {
    this.bellGroup = new THREE.Group();
    this.bellGroup.position.set(0, 7.8, 26);

    // Massive suspended iron roof truss yoke
    box(this.bellGroup, [6.5, 0.5, 0.8], this.materials.iron, [0, 2.6, 0]);
    cylinder(this.bellGroup, 0.45, 0.6, 1.2, 12, this.materials.rustedIron, [0, 1.8, 0]);

    // High heavy suspension chains reaching up into the shadowy roof rafters
    cylinder(this.bellGroup, 0.12, 0.12, 5.0, 8, this.materials.iron, [-2.2, 5.0, 0]);
    cylinder(this.bellGroup, 0.12, 0.12, 5.0, 8, this.materials.iron, [2.2, 5.0, 0]);

    // Monumental War Bell Geometry
    // Crown / Shoulder (top dome of the bell)
    cylinder(this.bellGroup, 1.0, 1.6, 1.2, 24, this.materials.bronzeBell, [0, 1.0, 0]);
    // Waist (tapering mid section)
    cylinder(this.bellGroup, 1.6, 2.2, 1.6, 24, this.materials.bronzeBell, [0, -0.3, 0]);
    // Sound Bow & Flared Lip (heavy lower rim)
    cylinder(this.bellGroup, 2.2, 2.9, 1.1, 24, this.materials.bronzeBell, [0, -1.5, 0]);
    // Decorative relief rim band
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.85, 0.16, 12, 32), this.materials.rustedIron);
    rim.position.set(0, -2.0, 0);
    rim.rotation.x = Math.PI / 2;
    this.bellGroup.add(rim);

    // Giant Iron Clapper
    cylinder(this.bellGroup, 0.15, 0.15, 3.2, 8, this.materials.iron, [0, -0.5, 0]);
    const clapperBall = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 12), this.materials.iron);
    clapperBall.position.set(0, -2.1, 0);
    this.bellGroup.add(clapperBall);

    this.group.add(this.bellGroup);
  }

  #addFurnaceLight(position, colorHex, intensity, distance) {
    const light = everywhere(new THREE.PointLight(colorHex, intensity, distance, 1.8));
    light.position.set(...position);
    this.group.add(light);
    this.furnaceLights.push({
      light,
      baseIntensity: intensity,
      baseY: position[1],
      phase: Math.random() * Math.PI * 2,
    });
  }

  setObjectiveState(objective, localTeam = null) {
    this.currentObjective = objective ?? null;
    this.localTeam = localTeam;
  }

  update(timeSec, camera = null) {
    // Pulse glowing furnace fires and forge embers
    for (const fl of this.furnaceLights) {
      fl.light.intensity = fl.baseIntensity
        + Math.sin(timeSec * 7.5 + fl.phase) * (fl.baseIntensity * 0.15)
        + Math.sin(timeSec * 13.8) * (fl.baseIntensity * 0.08);
    }

    // Majestic subtle war bell resonance sway
    if (this.bellGroup) {
      this.bellGroup.rotation.z = Math.sin(timeSec * 0.8) * 0.015;
    }

    const objState = this.currentObjective;
    const activeIdx = objState?.index ?? 0;
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
        ring.bannerCloth.material.color.setHex(isCaptured ? 0x2b5cb8 : 0x542c1e);
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
    this.scene.remove(this.group);
    this.group.traverse((object) => {
      object.geometry?.dispose?.();
      disposeMaterial(object.material);
    });
  }
}
