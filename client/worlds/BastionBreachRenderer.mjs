import * as THREE from 'three';
import { BASTION_BREACH, BASTION_GALLERY_Y } from '../../shared/worlds/bastionBreach.mjs';
import { everywhere } from '../game/viewLayers.mjs';

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
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'Bastion Breach';
    this.lighting = BASTION_BREACH_LIGHTING;
    this.torches = [];
    this.objectiveRings = [];
    this.currentObjective = null;
    this.localTeam = null;

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
      const isTimber = sol.material === 'timber' || sol.id.includes('timber') || sol.id.includes('crates') || sol.id.includes('wreckage') || sol.id.includes('barricade');
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

    // --- Gatehouse Breach Broken Arch & Portcullis Remnants (at z = 8.8) ---
    box(this.group, [2.5, 0.7, 1.2], this.materials.stone, [-4.5, 6.0, 8.8], [0, 0, 0.15]);
    box(this.group, [2.5, 0.7, 1.2], this.materials.stone, [4.5, 6.0, 8.8], [0, 0, -0.15]);
    box(this.group, [2.8, 0.45, 0.4], this.materials.iron, [0, 5.4, 8.8]);

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

  setObjectiveState(objective, localTeam = null) {
    this.currentObjective = objective ?? null;
    this.localTeam = localTeam;
  }

  update(timeSec, camera = null) {
    for (const torch of this.torches) {
      torch.light.intensity = 1.6 + Math.sin(timeSec * 8.5 + torch.phase) * 0.25 + Math.sin(timeSec * 14.1) * 0.12;
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
    this.scene.remove(this.group);
    this.group.traverse((object) => {
      object.geometry?.dispose?.();
      disposeMaterial(object.material);
    });
  }
}
