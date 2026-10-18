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
      refractoryStone: new THREE.MeshStandardMaterial({ color: 0x2e2723, roughness: 0.94, metalness: 0.04 }),
      timber: new THREE.MeshStandardMaterial({ color: 0x4a3424, roughness: 0.92, metalness: 0.02 }),
      iron: new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.55, metalness: 0.82 }),
      rustedIron: new THREE.MeshStandardMaterial({ color: 0x543628, roughness: 0.82, metalness: 0.45 }),
      bronzeBell: new THREE.MeshStandardMaterial({ color: 0x8e6836, roughness: 0.40, metalness: 0.86 }),
      bronzeDark: new THREE.MeshStandardMaterial({ color: 0x583e20, roughness: 0.52, metalness: 0.80 }),
      moltenGlow: new THREE.MeshStandardMaterial({
        color: 0xff5511,
        emissive: new THREE.Color(0xff4400),
        emissiveIntensity: 2.3,
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
      box(this.group, [0.25, 2.7, 0.25], this.materials.timber, [15.2, 1.35, z], [0, 0, 0], true);
      box(this.group, [0.25, 2.7, 0.25], this.materials.timber, [9.8, 1.35, z], [0, 0, 0], true);
      box(this.group, [5.4, 0.2, 0.2], this.materials.timber, [12.5, 2.4, z], [0, 0, 0], true);
    }

    // --- The Chain Winch Machine (Centerpiece of Stage 1) ---
    this.#buildChainWinch();

    // --- The Great Bell ("Blackbell") (Centerpiece of Stage 2) ---
    this.#buildGreatBell();

    // --- Molten Metal Casting Channel Network (Flanking the Dais) ---
    this.#buildMoltenCastingNetwork();

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
    this.#addFurnaceLight([0, 5.2, 26], 0xff7733, 2.5, 20); // Dais under Great Bell
    this.#addFurnaceLight([-5.5, 1.2, 26], 0xff6622, 2.0, 10); // West Casting Channel
    this.#addFurnaceLight([5.5, 1.2, 26], 0xff6622, 2.0, 10); // East Casting Channel
    this.#addFurnaceLight([-4.0, 2.5, -2.0], 0xff8844, 1.8, 12);
    this.#addFurnaceLight([4.0, 2.5, -2.0], 0xff8844, 1.8, 12);
    this.#addFurnaceLight([0, 3.2, 11], 0xff7733, 2.0, 14);
  }

  #buildChainWinch() {
    const winchGroup = new THREE.Group();
    winchGroup.position.set(0, 0, -2);

    // --- Timber A-Frame Derrick & Foundation ---
    // Ground sill timbers
    box(winchGroup, [0.45, 0.35, 3.4], this.materials.timber, [-2.6, 0.18, 0]);
    box(winchGroup, [0.45, 0.35, 3.4], this.materials.timber, [2.6, 0.18, 0]);
    box(winchGroup, [5.2, 0.35, 0.45], this.materials.timber, [0, 0.18, -1.5]);
    box(winchGroup, [5.2, 0.35, 0.45], this.materials.timber, [0, 0.18, 1.5]);

    // Heavy inclined A-frame uprights
    box(winchGroup, [0.38, 4.4, 0.38], this.materials.timber, [-2.6, 2.2, 1.1], [0.18, 0, 0.08]);
    box(winchGroup, [0.38, 4.4, 0.38], this.materials.timber, [-2.6, 2.2, -1.1], [-0.18, 0, 0.08]);
    box(winchGroup, [0.38, 4.4, 0.38], this.materials.timber, [2.6, 2.2, 1.1], [0.18, 0, -0.08]);
    box(winchGroup, [0.38, 4.4, 0.38], this.materials.timber, [2.6, 2.2, -1.1], [-0.18, 0, -0.08]);

    // Overhead crown cross-beam
    box(winchGroup, [5.8, 0.5, 0.5], this.materials.timber, [0, 4.2, 0]);
    box(winchGroup, [5.8, 0.12, 0.52], this.materials.iron, [0, 4.5, 0]); // iron top cap

    // Overhead sheave pulley block
    cylinder(winchGroup, 0.65, 0.65, 0.22, 16, this.materials.iron, [0, 4.2, 0], [0, 0, Math.PI / 2]);

    // --- Main Hoist Axle & Bearings ---
    // Bronze journal pillow blocks on timber struts at y = 1.8
    box(winchGroup, [0.55, 0.5, 0.6], this.materials.iron, [-2.4, 1.8, 0]);
    box(winchGroup, [0.55, 0.5, 0.6], this.materials.iron, [2.4, 1.8, 0]);
    // Heavy forged main shaft
    cylinder(winchGroup, 0.18, 0.18, 5.2, 12, this.materials.iron, [0, 1.8, 0], [0, 0, Math.PI / 2]);

    // Heavy winding barrel (drum) with ribbed spiral guides
    const drum = cylinder(winchGroup, 0.85, 0.85, 3.2, 16, this.materials.rustedIron, [0, 1.8, 0], [0, 0, Math.PI / 2]);
    drum.castShadow = true;

    // --- Dual Monumental Spoked Cogwheels with Teeth ---
    for (const side of [-1.75, 1.75]) {
      const cogGroup = new THREE.Group();
      cogGroup.position.set(side, 1.8, 0);

      // Central hub
      cylinder(cogGroup, 0.38, 0.38, 0.28, 12, this.materials.iron, [0, 0, 0], [0, 0, Math.PI / 2]);
      // Outer rim
      const cogRim = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.12, 10, 24), this.materials.iron);
      cogRim.rotation.y = Math.PI / 2;
      cogGroup.add(cogRim);

      // 6 radial structural spokes
      for (let s = 0; s < 3; s++) {
        const spoke = box(cogGroup, [0.1, 2.5, 0.1], this.materials.iron, [0, 0, 0], [0, 0, (s * Math.PI) / 3]);
        cogGroup.add(spoke);
      }

      // 16 individually modeled gear teeth projecting from the rim
      for (let t = 0; t < 16; t++) {
        const theta = (t / 16) * Math.PI * 2;
        const tooth = box(cogGroup, [0.18, 0.22, 0.26], this.materials.iron, [0, Math.sin(theta) * 1.45, Math.cos(theta) * 1.45]);
        tooth.rotation.x = theta;
      }
      winchGroup.add(cogGroup);
    }

    // Locking Ratchet Wheel & Gravity Pawl on West Side
    cylinder(winchGroup, 0.65, 0.65, 0.18, 16, this.materials.iron, [-1.98, 1.8, 0], [0, 0, Math.PI / 2]);
    box(winchGroup, [0.12, 0.75, 0.22], this.materials.iron, [-2.1, 2.3, 0.35], [-0.55, 0, 0]);

    // Driven Pinion Shaft & Operator Turning Capstan
    cylinder(winchGroup, 0.10, 0.10, 5.6, 8, this.materials.iron, [0, 0.7, -1.2], [0, 0, Math.PI / 2]);
    cylinder(winchGroup, 0.35, 0.35, 0.24, 12, this.materials.iron, [-1.75, 0.7, -1.2], [0, 0, Math.PI / 2]);
    cylinder(winchGroup, 0.35, 0.35, 0.24, 12, this.materials.iron, [1.75, 0.7, -1.2], [0, 0, Math.PI / 2]);

    // Operator Spoked Turning Wheel on East End
    box(winchGroup, [0.12, 2.2, 0.12], this.materials.timber, [2.9, 0.7, -1.2]);
    box(winchGroup, [0.12, 0.12, 2.2], this.materials.timber, [2.9, 0.7, -1.2]);
    cylinder(winchGroup, 0.08, 0.08, 0.35, 8, this.materials.timber, [3.05, 1.6, -1.2], [0, 0, Math.PI / 2]);
    cylinder(winchGroup, 0.08, 0.08, 0.35, 8, this.materials.timber, [3.05, -0.2, -1.2], [0, 0, Math.PI / 2]);

    // Tensioned Heavy Chains wrapped around drum and rising to the overhead crown pulley
    for (let c = -1.1; c <= 1.1; c += 0.55) {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.09, 8, 20), this.materials.iron);
      coil.position.set(c, 1.8, 0);
      coil.rotation.y = Math.PI / 2;
      winchGroup.add(coil);
    }
    cylinder(winchGroup, 0.08, 0.08, 2.6, 8, this.materials.iron, [-0.2, 3.0, 0.25]);
    cylinder(winchGroup, 0.08, 0.08, 2.6, 8, this.materials.iron, [0.2, 3.0, 0.25]);

    this.group.add(winchGroup);
  }

  #buildGreatBell() {
    // --- 1. Stationary Overhead Roof Truss & Bearing Brackets ---
    const stationary = new THREE.Group();

    // Massive timber tie-beam spanning across the furnace hall
    box(stationary, [18, 0.85, 0.85], this.materials.timber, [0, 11.2, 26]);
    box(stationary, [16, 0.22, 0.7], this.materials.iron, [0, 11.75, 26]); // top iron cap plate
    // Kingpost timber braces anchoring into high roof masonry
    box(stationary, [0.42, 4.4, 0.42], this.materials.timber, [-5.8, 12.6, 26], [0, 0, -0.42]);
    box(stationary, [0.42, 4.4, 0.42], this.materials.timber, [5.8, 12.6, 26], [0, 0, 0.42]);

    // Pillow block journal bearings beneath the beam
    box(stationary, [0.95, 0.7, 0.8], this.materials.iron, [-2.6, 10.4, 26]);
    box(stationary, [0.95, 0.7, 0.8], this.materials.iron, [2.6, 10.4, 26]);

    // Heavy vertical iron suspension rods reaching into roof rafters
    cylinder(stationary, 0.09, 0.09, 3.5, 8, this.materials.iron, [-2.6, 12.2, 26]);
    cylinder(stationary, 0.09, 0.09, 3.5, 8, this.materials.iron, [2.6, 12.2, 26]);
    this.group.add(stationary);

    // --- 2. Articulated Hanging Bell Assembly (Pivots at Axle: y = 10.2) ---
    this.bellAssembly = new THREE.Group();
    this.bellAssembly.position.set(0, 10.2, 26);

    // Forged steel axle
    cylinder(this.bellAssembly, 0.22, 0.22, 6.0, 12, this.materials.iron, [0, 0, 0], [0, 0, Math.PI / 2]);

    // Massive oak headstock (yoke) with iron straps and bolts
    box(this.bellAssembly, [5.0, 0.95, 0.95], this.materials.timber, [0, 0.38, 0]);
    box(this.bellAssembly, [5.2, 0.15, 0.98], this.materials.iron, [0, 0.88, 0]); // top strap
    box(this.bellAssembly, [0.18, 1.0, 0.98], this.materials.iron, [-1.85, 0.38, 0]);
    box(this.bellAssembly, [0.18, 1.0, 0.98], this.materials.iron, [1.85, 0.38, 0]);

    // Iron counterweights atop yoke
    cylinder(this.bellAssembly, 0.38, 0.48, 1.15, 12, this.materials.rustedIron, [-1.85, 1.05, 0]);
    cylinder(this.bellAssembly, 0.38, 0.48, 1.15, 12, this.materials.rustedIron, [1.85, 1.05, 0]);

    // Cast Canons (arched suspension loops connecting bell crown to headstock)
    for (const ang of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
      const rx = Math.sin(ang) * 0.72;
      const rz = Math.cos(ang) * 0.72;
      const canon = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.11, 8, 16, Math.PI), this.materials.bronzeDark);
      canon.position.set(rx, -0.22, rz);
      canon.rotation.y = ang;
      canon.rotation.z = Math.PI / 2;
      this.bellAssembly.add(canon);
    }

    // --- Hollow Monumental War Bell Profile (LatheGeometry) ---
    // Defined with a hollow internal cavity visible from underneath
    const bellProfile = [
      new THREE.Vector2(0.08, -0.6),   // internal crown apex
      new THREE.Vector2(0.85, -0.9),   // inner shoulder
      new THREE.Vector2(1.25, -1.8),   // inner waist
      new THREE.Vector2(1.95, -3.2),   // inner sound bow
      new THREE.Vector2(2.55, -4.15),  // inner lip edge
      new THREE.Vector2(2.72, -4.25),  // bottom rim lip
      new THREE.Vector2(2.98, -4.05),  // outer sound bow (thickest bronze rim)
      new THREE.Vector2(2.42, -3.0),   // lower waist
      new THREE.Vector2(1.78, -1.8),   // waist
      new THREE.Vector2(1.42, -0.8),   // shoulder
      new THREE.Vector2(1.12, -0.3),   // crown band
      new THREE.Vector2(0.12, -0.2),   // crown top
    ];
    const bellGeom = new THREE.LatheGeometry(bellProfile, 28);
    const bellMesh = new THREE.Mesh(bellGeom, this.materials.bronzeBell);
    bellMesh.castShadow = true;
    bellMesh.receiveShadow = true;
    this.bellAssembly.add(bellMesh);

    // Raised decorative relief bands
    const soundBowRelief = new THREE.Mesh(new THREE.TorusGeometry(2.94, 0.12, 10, 32), this.materials.bronzeDark);
    soundBowRelief.position.y = -3.95;
    soundBowRelief.rotation.x = Math.PI / 2;
    this.bellAssembly.add(soundBowRelief);

    const shoulderRelief = new THREE.Mesh(new THREE.TorusGeometry(1.50, 0.08, 8, 28), this.materials.bronzeDark);
    shoulderRelief.position.y = -0.95;
    shoulderRelief.rotation.x = Math.PI / 2;
    this.bellAssembly.add(shoulderRelief);

    // --- 3. Articulated Internal Clapper Assembly ---
    // Suspended from interior eyelet at (0, -0.6, 0)
    this.clapperAssembly = new THREE.Group();
    this.clapperAssembly.position.set(0, -0.6, 0);

    // Forged suspension eyelet
    const clapperEye = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.07, 8, 16), this.materials.iron);
    clapperEye.rotation.x = Math.PI / 2;
    this.clapperAssembly.add(clapperEye);

    // Tapered forged iron clapper shank
    const clapperShank = cylinder(this.clapperAssembly, 0.12, 0.17, 3.4, 8, this.materials.iron, [0, -1.7, 0]);
    clapperShank.castShadow = true;

    // Heavy spherical strike ball positioned at sound bow height
    const strikeBall = new THREE.Mesh(new THREE.SphereGeometry(0.64, 16, 14), this.materials.iron);
    strikeBall.position.set(0, -3.4, 0);
    strikeBall.castShadow = true;
    this.clapperAssembly.add(strikeBall);

    // Lower teardrop flight
    const clapperFlight = cylinder(this.clapperAssembly, 0.22, 0.06, 0.8, 8, this.materials.rustedIron, [0, -4.1, 0]);
    this.clapperAssembly.add(clapperFlight);

    this.bellAssembly.add(this.clapperAssembly);
    this.group.add(this.bellAssembly);
  }

  #buildMoltenCastingNetwork() {
    // Recessed refractory stone troughs flanking the central Great Bell dais (which sits at x: [-4, 4], z: [22, 30], y = 1.0)
    // The molten conduits run at y = 0.12 alongside the platform curbs (y = 0.28) without penetrating the player's walkway!

    // West Arterial Channel (x = -5.4, z = 20 to 32)
    box(this.group, [0.22, 0.32, 12], this.materials.refractoryStone, [-6.0, 0.16, 26]); // outer curb
    box(this.group, [0.22, 0.32, 12], this.materials.refractoryStone, [-4.8, 0.16, 26]); // inner curb
    const westMolten = box(this.group, [0.95, 0.08, 11.8], this.materials.moltenGlow, [-5.4, 0.12, 26], [0, 0, 0], false);
    westMolten.receiveShadow = false;

    // East Arterial Channel (x = 5.4, z = 20 to 32)
    box(this.group, [0.22, 0.32, 12], this.materials.refractoryStone, [4.8, 0.16, 26]); // inner curb
    box(this.group, [0.22, 0.32, 12], this.materials.refractoryStone, [6.0, 0.16, 26]); // outer curb
    const eastMolten = box(this.group, [0.95, 0.08, 11.8], this.materials.moltenGlow, [5.4, 0.12, 26], [0, 0, 0], false);
    eastMolten.receiveShadow = false;

    // Feeder Channels from Western Wall Furnaces (x = -11.5 to -5.4 at z = 24 and z = 28)
    for (const z of [24, 28]) {
      box(this.group, [5.8, 0.28, 0.22], this.materials.refractoryStone, [-8.5, 0.14, z - 0.5]);
      box(this.group, [5.8, 0.28, 0.22], this.materials.refractoryStone, [-8.5, 0.14, z + 0.5]);
      const feeder = box(this.group, [5.8, 0.08, 0.75], this.materials.moltenGlow, [-8.5, 0.10, z], [0, 0, 0], false);
      feeder.receiveShadow = false;
      // Iron control sluice gate at tap-hole
      box(this.group, [0.18, 0.9, 0.85], this.materials.iron, [-6.0, 0.45, z]);
      cylinder(this.group, 0.04, 0.04, 0.7, 6, this.materials.iron, [-6.0, 0.95, z]);
    }

    // Refractory Stone Bell Casting Basins at center dais flanks
    for (const x of [-5.4, 5.4]) {
      const basinRing = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 0.35, 16, 1, true), this.materials.refractoryStone);
      basinRing.position.set(x, 0.18, 26);
      this.group.add(basinRing);
      const basinMolten = new THREE.Mesh(new THREE.CircleGeometry(1.15, 16), this.materials.moltenGlow);
      basinMolten.rotation.x = -Math.PI / 2;
      basinMolten.position.set(x, 0.14, 26);
      this.group.add(basinMolten);
    }
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

    // Physically separated bell resonance sway and independent clapper oscillation
    if (this.bellAssembly) {
      this.bellAssembly.rotation.z = Math.sin(timeSec * 1.35) * 0.045;
    }
    if (this.clapperAssembly) {
      // Clapper lags behind the bell with trailing pendulum physics
      this.clapperAssembly.rotation.z = Math.sin(timeSec * 1.35 - 0.48) * 0.075;
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
