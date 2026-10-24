import * as THREE from 'three';
import { everywhere } from '../game/viewLayers.mjs';
import {
  OUTERWORKS,
  OUTERWORKS_TERRACE_Y,
  OUTERWORKS_PARAPET_Y,
  OUTERWORKS_TRENCH_Y,
} from '../../shared/worlds/outerworks.mjs';
import { BiByeLlistaRenderer } from './BiByeLlistaRenderer.mjs';
import { BiByeMotion } from './biByeMotion.mjs';

export const OUTERWORKS_LIGHTING = Object.freeze({
  background: 0x1e242e,
  fog: Object.freeze({ color: 0x242b38, density: 0.009 }),
  hemisphere: Object.freeze({ skyColor: 0xdde3eb, groundColor: 0x403c36, intensity: 1.85 }),
  sun: Object.freeze({ color: 0xffaa5e, intensity: 3.0, position: Object.freeze([-36, 28, -26]) }),
  sky: Object.freeze({ zenith: 0x32445c, horizon: 0xd69666, below: 0x1c1a18 }),
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
      stoneDark: new THREE.MeshStandardMaterial({ color: 0x5a544e, roughness: 0.90, metalness: 0.06 }),
      stoneFloor: new THREE.MeshStandardMaterial({ color: 0x5e5852, roughness: 0.86, metalness: 0.08 }),
      terraceStone: new THREE.MeshStandardMaterial({ color: 0x6e6862, roughness: 0.84, metalness: 0.08 }),
      roadStone: new THREE.MeshStandardMaterial({ color: 0x524b45, roughness: 0.86, metalness: 0.05 }),
      curbStone: new THREE.MeshStandardMaterial({ color: 0x827a72, roughness: 0.80, metalness: 0.06 }),
      trenchDirt: new THREE.MeshStandardMaterial({ color: 0x362e26, roughness: 0.96, metalness: 0.02 }),
      campDirt: new THREE.MeshStandardMaterial({ color: 0x42382e, roughness: 0.94, metalness: 0.02 }),
      paleStoneTrim: new THREE.MeshStandardMaterial({ color: 0xb8b1a6, roughness: 0.74, metalness: 0.08 }),
      timber: new THREE.MeshStandardMaterial({ color: 0x563e2d, roughness: 0.90, metalness: 0.02 }),
      woodPlank: new THREE.MeshStandardMaterial({ color: 0x6e523c, roughness: 0.86, metalness: 0.02 }),
      darkTimber: new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 0.92, metalness: 0.02 }),
      sandbag: new THREE.MeshStandardMaterial({ color: 0x8a7b68, roughness: 0.92, metalness: 0.02 }),
      wicker: new THREE.MeshStandardMaterial({ color: 0x5c4936, roughness: 0.90, metalness: 0.02 }),
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
      canvasTent: new THREE.MeshStandardMaterial({
        color: 0x9e8f7a,
        roughness: 0.85,
        metalness: 0.02,
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
      else if (fl.id.includes('att-camp')) mat = this.materials.campDirt;
      else if (fl.id.includes('esplanade')) mat = this.materials.roadStone;
      else if (fl.id.includes('terrace') || fl.id.includes('parapet')) mat = this.materials.terraceStone;

      const mesh = box(this.group, fl.size, mat, fl.center, [0, 0, 0], false);
      mesh.receiveShadow = true;
    }

    // --- Build Authoritative Collision Solids ---
    for (const sol of OUTERWORKS.solids) {
      if (sol.id === 'barrier-outer-palisade' || sol.id === 'portcullis-inner-gate' || sol.id === 'cover-esplanade-mantlet' || sol.id === 'cover-esplanade-cart') continue;
      const isTimber = sol.material === 'timber' || sol.id.includes('timber') || sol.id.includes('crates')
        || sol.id.includes('mantlet') || sol.id.includes('cart') || sol.id.includes('barricade')
        || sol.id.includes('chicane');
      const mat = isTimber ? this.materials.timber : this.materials.stone;
      box(this.group, sol.size, mat, sol.center, [0, 0, 0], true);
    }

    // --- Build Authoritative Ramps ---
    for (const ramp of OUTERWORKS.ramps) {
      const width = ramp.maxX - ramp.minX;
      const length = ramp.maxZ - ramp.minZ;
      const rise = ramp.endY - ramp.startY;
      const hyp = Math.hypot(length, rise);
      const isTrench = ramp.id.includes('trench');
      const mat = isTrench ? this.materials.trenchDirt : this.materials.terraceStone;
      const mesh = box(
        this.group,
        [width, 0.3, hyp],
        mat,
        [(ramp.minX + ramp.maxX) / 2, (ramp.startY + ramp.endY) / 2 - 0.12, (ramp.minZ + ramp.maxZ) / 2],
        [-Math.atan2(rise, length), 0, 0],
      );
      mesh.receiveShadow = true;
    }

    // --- Architectural Character & Art Direction Passes ---
    this.#buildDynamicFortifications();
    this.#buildMonumentalBarbican();
    this.#buildSunkenSallyTrench();
    this.#buildGreatEsplanade();
    this.#buildForwardRedoubt();
    this.#buildFiringTerrace();
    this.#buildAttackerCamp();
    this.#buildPerimeterButtresses();
    this.#buildObjectiveStandards();
    this.#buildAtmosphere();
  }

  #buildDynamicFortifications() {
    // Dynamic Great Breach Palisade (Phase 0 obstacle, drops/folds on Redoubt capture)
    this.palisadeGroup = new THREE.Group();
    this.palisadeGroup.position.set(0, 0, 1.9);
    for (let i = -7; i <= 7; i++) {
      const height = 3.2 + Math.sin(i * 1.7) * 0.25;
      const log = cylinder(
        this.palisadeGroup,
        0.18, 0.22, height, 8,
        this.materials.timber,
        [i * 0.46, height / 2, 0]
      );
      // Sharpened stake tip
      cylinder(this.palisadeGroup, 0.02, 0.18, 0.45, 8, this.materials.darkTimber, [i * 0.46, height + 0.22, 0]);
    }
    // Cross timber beams and iron bracing straps
    box(this.palisadeGroup, [7.0, 0.24, 0.24], this.materials.darkTimber, [0, 1.1, -0.16]);
    box(this.palisadeGroup, [7.0, 0.24, 0.24], this.materials.darkTimber, [0, 2.3, -0.16]);
    for (let i = -3; i <= 3; i++) {
      box(this.palisadeGroup, [0.12, 0.3, 0.28], this.materials.iron, [i * 1.0, 1.1, -0.16]);
      box(this.palisadeGroup, [0.12, 0.3, 0.28], this.materials.iron, [i * 1.0, 2.3, -0.16]);
    }
    // Diagonal brace timbers anchored to ground
    box(this.palisadeGroup, [0.18, 2.2, 0.18], this.materials.darkTimber, [-2.2, 1.1, 0.8], [0.65, 0, 0]);
    box(this.palisadeGroup, [0.18, 2.2, 0.18], this.materials.darkTimber, [2.2, 1.1, 0.8], [0.65, 0, 0]);
    this.group.add(this.palisadeGroup);

    // Dynamic Inner Barbican Portcullis (Phase 1 obstacle, winches open on victory)
    this.portcullisGroup = new THREE.Group();
    this.portcullisGroup.position.set(0, 0, 41.5);
    // Vertical iron bars
    for (let i = -7; i <= 7; i++) {
      cylinder(this.portcullisGroup, 0.065, 0.065, 4.6, 8, this.materials.iron, [i * 0.48, 2.3, 0]);
      // Spikes at bottom
      cylinder(this.portcullisGroup, 0.065, 0.01, 0.4, 8, this.materials.iron, [i * 0.48, -0.18, 0]);
    }
    // Horizontal iron crossbars
    for (const h of [0.7, 1.6, 2.5, 3.4, 4.3]) {
      box(this.portcullisGroup, [7.2, 0.12, 0.12], this.materials.iron, [0, h, 0]);
    }
    this.group.add(this.portcullisGroup);
  }

  #buildMonumentalBarbican() {
    // Twin massive Barbican Gatehouse Towers flanking z = 42
    for (const x of [-5.9, 5.9]) {
      // Tower plinth / base
      box(this.group, [4.8, 1.2, 8.6], this.materials.stoneDark, [x, 0.6, 42]);
      // Tower corbelled machicolation overhang
      box(this.group, [4.8, 0.6, 8.8], this.materials.paleStoneTrim, [x, 8.0, 42]);
      // Bartizan stone corner turrets
      for (const cx of [x - 1.9, x + 1.9]) {
        for (const cz of [38.4, 45.6]) {
          cylinder(this.group, 0.6, 0.5, 2.2, 8, this.materials.paleStoneTrim, [cx, 9.2, cz]);
          cylinder(this.group, 0.1, 0.6, 0.8, 8, this.materials.darkTimber, [cx, 10.7, cz]);
        }
      }
      // Crenellations & Merlons
      for (let z = 38.2; z <= 45.8; z += 1.8) {
        box(this.group, [0.5, 1.2, 1.0], this.materials.stone, [x - 2.1, 9.1, z]);
        box(this.group, [0.5, 1.2, 1.0], this.materials.stone, [x + 2.1, 9.1, z]);
      }
      // Arrow slits
      box(this.group, [0.15, 1.4, 0.4], this.materials.darkTimber, [x, 4.5, x < 0 ? 37.9 : 37.9]);
    }

    // Overhead gate vault arch and winch housing
    box(this.group, [7.8, 0.6, 6.4], this.materials.paleStoneTrim, [0, 8.0, 42]);
    // Gatehouse Winch Drum & Chains
    const winch = cylinder(this.group, 0.28, 0.28, 4.2, 12, this.materials.darkTimber, [0, 7.3, 41.5], [0, 0, Math.PI / 2]);
    cylinder(this.group, 0.05, 0.05, 5.5, 8, this.materials.iron, [-1.8, 4.8, 41.5]);
    cylinder(this.group, 0.05, 0.05, 5.5, 8, this.materials.iron, [1.8, 4.8, 41.5]);

    // Tower Banners (Grand Azure & Crimson standards)
    this.#addWallBanner(-5.9, 7.0, 37.8, 'azure', 1.4, 3.2);
    this.#addWallBanner(5.9, 7.0, 37.8, 'azure', 1.4, 3.2);
  }

  #buildSunkenSallyTrench() {
    // The Western Sally Trench floor is at y = OUTERWORKS_TRENCH_Y (-1.2m)
    // Timber shoring posts every 3.5m along both sides of the sunken ditch
    for (let z = -38; z <= -9; z += 3.5) {
      // East revetment post
      cylinder(this.group, 0.12, 0.14, 2.5, 6, this.materials.darkTimber, [-16.7, 0.0, z]);
      // West outer post
      cylinder(this.group, 0.12, 0.14, 2.5, 6, this.materials.darkTimber, [-24.3, 0.0, z]);
      // Horizontal shoring boards along east revetment
      box(this.group, [0.12, 0.35, 3.4], this.materials.woodPlank, [-16.7, -0.6, z + 1.75]);
      box(this.group, [0.12, 0.35, 3.4], this.materials.woodPlank, [-16.7, -0.1, z + 1.75]);
      box(this.group, [0.12, 0.35, 3.4], this.materials.woodPlank, [-16.7, 0.4, z + 1.75]);
    }

    // Overhead heavy cross-strut timbers (anti-cave-in siege trench construction)
    for (const z of [-34, -25, -15]) {
      box(this.group, [7.8, 0.22, 0.22], this.materials.darkTimber, [-20.5, 0.85, z]);
    }

    // Sunken duckboards along the walking trench floor
    for (let z = -39; z <= -9; z += 1.8) {
      box(this.group, [2.2, 0.08, 1.4], this.materials.woodPlank, [-20.5, OUTERWORKS_TRENCH_Y + 0.04, z]);
    }

    // Sandbag revetment crest atop the eastern trench lip (providing +0.6m head cover above y=1.0)
    for (let z = -38; z <= -10; z += 2.0) {
      box(this.group, [0.55, 0.32, 1.8], this.materials.sandbag, [-16.6, 1.15, z]);
    }
  }

  #buildGreatEsplanade() {
    // Paved central assault road curbstones
    for (let z = -43; z <= -15; z += 2.5) {
      box(this.group, [0.35, 0.22, 2.4], this.materials.curbStone, [-4.4, 0.11, z]);
      box(this.group, [0.35, 0.22, 2.4], this.materials.curbStone, [4.4, 0.11, z]);
    }

    // Sloped Oak Assault Mantlets on the Esplanade
    this.#addMantlet(-10.5, 0, -32.5, 0.1);
    this.#addMantlet(8.5, 0, -31.0, -0.15);

    // Damaged Supply Wagon / Smashed Cart Wreckage at x = 6.0, z = -26.0
    const cartGroup = new THREE.Group();
    cartGroup.position.set(5.5, 0, -25.5);
    // Tilted wagon bed
    box(cartGroup, [1.8, 0.16, 2.8], this.materials.woodPlank, [0, 0.65, 0], [0.12, 0.2, 0.25]);
    // Wheels (iron rim + wooden spokes)
    cylinder(cartGroup, 0.7, 0.7, 0.14, 12, this.materials.iron, [-1.0, 0.7, -0.9], [0, 0, Math.PI / 2]);
    cylinder(cartGroup, 0.7, 0.7, 0.14, 12, this.materials.iron, [1.0, 0.5, 0.9], [0, 0, Math.PI / 2 + 0.3]);
    // Broken crate stack beside cart
    box(cartGroup, [0.8, 0.8, 0.8], this.materials.woodPlank, [-0.5, 0.4, 1.4], [0, 0.4, 0]);
    box(cartGroup, [0.65, 0.65, 0.65], this.materials.woodPlank, [-0.4, 1.1, 1.3], [0, 0.1, 0]);
    cylinder(cartGroup, 0.35, 0.38, 0.9, 10, this.materials.darkTimber, [0.6, 0.45, 1.2]);
    this.group.add(cartGroup);
  }

  #addMantlet(x, y, z, rotY = 0) {
    const mantlet = new THREE.Group();
    mantlet.position.set(x, y, z);
    mantlet.rotation.y = rotY;
    // Sloped oak timber face
    box(mantlet, [2.0, 1.8, 0.18], this.materials.timber, [0, 0.9, 0], [-0.25, 0, 0]);
    // Arrow-slit aperture
    box(mantlet, [0.16, 0.45, 0.22], this.materials.darkTimber, [0, 1.25, -0.09], [-0.25, 0, 0]);
    // Rear diagonal timber skids
    cylinder(mantlet, 0.08, 0.08, 1.6, 6, this.materials.darkTimber, [-0.8, 0.6, 0.5], [0.9, 0, 0]);
    cylinder(mantlet, 0.08, 0.08, 1.6, 6, this.materials.darkTimber, [0.8, 0.6, 0.5], [0.9, 0, 0]);
    this.group.add(mantlet);
  }

  #buildForwardRedoubt() {
    // Earthwork ramparts & gabion revetments around Objective 1 (z = -12)
    // Sloped earthwork berms
    box(this.group, [9.0, 0.6, 1.2], this.materials.campDirt, [-9.2, 0.3, -15.6], [0.35, 0, 0]);
    box(this.group, [7.5, 0.6, 1.2], this.materials.campDirt, [8.3, 0.3, -15.6], [0.35, 0, 0]);

    // Wicker gabions (earth-filled wicker cylinders) flanking the redoubt gateway
    for (let x of [-4.5, -3.5, 3.5, 4.5]) {
      cylinder(this.group, 0.42, 0.44, 1.3, 10, this.materials.wicker, [x, 0.65, -14.5]);
      // Earth top fill
      cylinder(this.group, 0.4, 0.4, 0.08, 10, this.materials.trenchDirt, [x, 1.32, -14.5]);
    }

    // Heavy pointed timber palisade stakes atop the redoubt earthwork
    for (let x = -13.5; x <= -5.0; x += 0.8) {
      cylinder(this.group, 0.14, 0.16, 1.6, 6, this.materials.timber, [x, 1.8, -14.4]);
      cylinder(this.group, 0.02, 0.14, 0.35, 6, this.materials.darkTimber, [x, 2.75, -14.4]);
    }
    for (let x = 5.0; x <= 11.5; x += 0.8) {
      cylinder(this.group, 0.14, 0.16, 1.6, 6, this.materials.timber, [x, 1.8, -14.4]);
      cylinder(this.group, 0.02, 0.14, 0.35, 6, this.materials.darkTimber, [x, 2.75, -14.4]);
    }
  }

  #buildFiringTerrace() {
    // Eastern Elevated Firing Terrace (Ballista platform at y = 1.2m)
    // Sloped battered stone foundation plinth
    box(this.group, [0.6, 1.2, 14.5], this.materials.stoneDark, [12.5, 0.6, -11.0], [0, 0, -0.15]);

    // Heavy timber corbel beams under the terrace overhang
    for (let z = -17; z <= -5; z += 3.0) {
      box(this.group, [1.4, 0.28, 0.28], this.materials.darkTimber, [12.6, 1.0, z]);
    }

    // Open ballista shooting embrasure in terrace parapet (z: -14 to -8)
    // Solid parapet with coping on either side
    box(this.group, [0.8, 0.25, 4.2], this.materials.paleStoneTrim, [12.6, 2.22, -16.0]);
    box(this.group, [0.8, 0.25, 4.2], this.materials.paleStoneTrim, [12.6, 2.22, -6.0]);
  }

  #buildAttackerCamp() {
    // Attacker Staging Camp (z: -58 to -44)
    // Command Pavilion Tent at x = 12.0, z = -52.0
    const tentGroup = new THREE.Group();
    tentGroup.position.set(12.0, 0, -52.0);
    // Conical canvas roof
    cylinder(tentGroup, 0.1, 3.2, 2.8, 10, this.materials.canvasTent, [0, 2.8, 0]);
    // Cylindrical tent walls
    cylinder(tentGroup, 3.1, 3.1, 1.5, 10, this.materials.canvasTent, [0, 0.75, 0]);
    // Center pole & brass finial
    cylinder(tentGroup, 0.08, 0.08, 4.5, 8, this.materials.timber, [0, 2.25, 0]);
    cylinder(tentGroup, 0.02, 0.12, 0.4, 8, this.materials.brass, [0, 4.6, 0]);
    // Heraldic camp flag
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.4), this.materials.bannerCrimson);
    flag.position.set(0.4, 3.8, 0);
    tentGroup.add(flag);
    this.group.add(tentGroup);

    // Ballista Staging Revetment at (-8.0, 0, -46.0)
    // Heavy timber wheel stops and alignment guides marking the authorized position
    box(this.group, [3.8, 0.28, 0.28], this.materials.darkTimber, [-8.0, 0.14, -48.2]);
    box(this.group, [0.28, 0.28, 4.5], this.materials.darkTimber, [-10.2, 0.14, -46.0]);
    box(this.group, [0.28, 0.28, 4.5], this.materials.darkTimber, [-5.8, 0.14, -46.0]);

    // Stacked Weapon Racks & Halberds in Staging Area
    this.#addWeaponRack(-4.0, 0, -55.0);
    this.#addWeaponRack(4.0, 0, -55.0);
  }

  #addWeaponRack(x, y, z) {
    const rack = new THREE.Group();
    rack.position.set(x, y, z);
    // A-frame timber supports
    box(rack, [0.12, 1.4, 0.12], this.materials.timber, [-0.9, 0.7, 0]);
    box(rack, [0.12, 1.4, 0.12], this.materials.timber, [0.9, 0.7, 0]);
    box(rack, [2.0, 0.12, 0.12], this.materials.timber, [0, 1.1, 0]);
    // Halberds / Spears in rack
    for (let i = -3; i <= 3; i++) {
      cylinder(rack, 0.025, 0.025, 2.2, 6, this.materials.timber, [i * 0.24, 1.1, 0], [0.12, 0, 0]);
      cylinder(rack, 0.01, 0.06, 0.35, 6, this.materials.iron, [i * 0.24, 2.3, 0], [0.12, 0, 0]);
    }
    this.group.add(rack);
  }

  #buildPerimeterButtresses() {
    // External Stone Buttresses along long curtain wall runs
    for (let z = -54; z <= 54; z += 12) {
      if (z > -28 && z < 44) {
        // East wall buttress
        box(this.group, [0.8, 4.5, 1.2], this.materials.stoneDark, [25.8, 2.25, z]);
      }
      if (z > 8 && z < 44) {
        // West bailey buttress
        box(this.group, [0.8, 4.5, 1.2], this.materials.stoneDark, [-26.4, 2.25, z]);
      }
    }
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

      standardGroup.add(plinth);
      standardGroup.add(pole);
      standardGroup.add(crossbar);
      standardGroup.add(bannerCloth);
      standardGroup.add(finial);
      this.group.add(standardGroup);

      this.banners.push(bannerCloth);
      this.objectiveRings.push({
        index: i,
        ringMesh,
        discMesh,
        progressMesh,
        standardGroup,
        bannerCloth,
      });
    }
  }

  #buildAtmosphere() {
    // Sconces & Braziers with dynamic flickering torch lights
    const torchCoords = [
      [-17.8, 2.4, -48.0],
      [17.8, 2.4, -48.0],
      [-5.0, 2.2, -14.0],
      [5.0, 2.2, -14.0],
      [13.2, OUTERWORKS_TERRACE_Y + 1.2, -14.0],
      [-4.2, 2.8, 38.0],
      [4.2, 2.8, 38.0],
    ];

    for (const [x, y, z] of torchCoords) {
      // Iron wall sconce bracket
      cylinder(this.group, 0.05, 0.04, 0.5, 6, this.materials.iron, [x, y, z]);
      const bowl = cylinder(this.group, 0.18, 0.08, 0.16, 8, this.materials.brass, [x, y + 0.25, z]);

      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 8), this.materials.torchFlame);
      flame.position.set(x, y + 0.44, z);
      flame.userData = { baseY: y + 0.44, phase: Math.random() * Math.PI * 2 };
      this.group.add(flame);
      this.flames.push(flame);

      const light = new THREE.PointLight(0xff8833, 2.2, 14, 1.4);
      light.position.set(x, y + 0.55, z);
      light.userData = { phase: flame.userData.phase };
      this.group.add(light);
      this.torchLights.push(light);
    }
  }

  #addWallBanner(x, y, z, faction = 'crimson', width = 1.2, height = 2.6) {
    const mat = faction === 'crimson' ? this.materials.bannerCrimson : this.materials.bannerAzure;
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
    banner.position.set(x, y, z);
    banner.userData = { phase: Math.random() * Math.PI * 2 };
    this.group.add(banner);
    this.banners.push(banner);
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
    this.palisadeCollapseProgress += (targetPalisade - this.palisadeCollapseProgress) * 0.12;
    if (this.palisadeGroup) {
      this.palisadeGroup.rotation.x = this.palisadeCollapseProgress * (Math.PI / 2.05);
      this.palisadeGroup.position.y = -this.palisadeCollapseProgress * 0.45;
    }

    // Portcullis winch open animation (Phase 1 complete -> Gate breached)
    const targetPortcullis = completed ? 1.0 : 0.0;
    this.portcullisOpenProgress += (targetPortcullis - this.portcullisOpenProgress) * 0.08;
    if (this.portcullisGroup) {
      this.portcullisGroup.position.y = this.portcullisOpenProgress * 4.4;
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
