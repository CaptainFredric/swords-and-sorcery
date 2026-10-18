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
      stone: new THREE.MeshStandardMaterial({ color: 0x7a746b, roughness: 0.88, metalness: 0.05 }),
      stoneFloor: new THREE.MeshStandardMaterial({ color: 0x8a8479, roughness: 0.84, metalness: 0.04 }),
      stoneDais: new THREE.MeshStandardMaterial({ color: 0x9c9588, roughness: 0.80, metalness: 0.06 }),
      timber: new THREE.MeshStandardMaterial({ color: 0x5a3e28, roughness: 0.92, metalness: 0.02 }),
      brass: new THREE.MeshStandardMaterial({ color: 0xc8a45f, roughness: 0.35, metalness: 0.78 }),
      iron: new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.55, metalness: 0.75 }),
      objInactive: new THREE.MeshBasicMaterial({
        color: 0x6c757d,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
      }),
      objActiveRing: new THREE.MeshBasicMaterial({
        color: 0xd5b76f,
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide,
      }),
      objProgressArc: new THREE.MeshBasicMaterial({
        color: 0x3d7eed,
        transparent: true,
        opacity: 0.88,
        side: THREE.DoubleSide,
      }),
    };

    for (const fl of BASTION_BREACH.floors) {
      const mat = fl.id.includes('dais') ? this.materials.stoneDais : this.materials.stoneFloor;
      const mesh = box(this.group, fl.size, mat, fl.center, [0, 0, 0], false);
      mesh.receiveShadow = true;
    }

    for (const sol of BASTION_BREACH.solids) {
      const mat = sol.material === 'timber' ? this.materials.timber : this.materials.stone;
      box(this.group, sol.size, mat, sol.center, [0, 0, 0], true);
    }

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

    // --- Architectural Fortress Elements ---
    // Gatehouse Breach Broken Arch & Portcullis Remnants
    box(this.group, [2.5, 0.7, 1.2], this.materials.stone, [-4.5, 6.0, 8.8], [0, 0, 0.15]);
    box(this.group, [2.5, 0.7, 1.2], this.materials.stone, [4.5, 6.0, 8.8], [0, 0, -0.15]);
    box(this.group, [2.8, 0.45, 0.4], this.materials.iron, [0, 5.4, 8.8]);

    // Wall Battlements & Crenellations (Merlons along fortress parapets)
    for (let x = -14; x <= 14; x += 3.5) {
      // South camp wall merlons
      box(this.group, [1.8, 0.9, 0.9], this.materials.stone, [x, 4.95, -38.0]);
    }
    for (let z = 8; z <= 22; z += 3.2) {
      // Eastern gallery outer merlons
      box(this.group, [0.8, 0.8, 1.6], this.materials.stone, [15.1, BASTION_GALLERY_Y + 1.6, z]);
    }
    for (let z = -24; z <= 6; z += 4.5) {
      // Western courtyard wall merlons
      box(this.group, [0.9, 0.8, 2.0], this.materials.stone, [-16.0, 4.9, z]);
    }

    // High Sanctum Gothic Vault Arch Ribs (pointed stone ceiling arches spanning the chapel nave)
    this.#buildSanctumVaultArches();

    // Stone Knight Effigies (carved sarcophagi tops in side aisles)
    this.#buildKnightEffigy([-9.5, 1.1, 24.0]);
    this.#buildKnightEffigy([9.5, 1.1, 24.0]);

    // Heraldic Wall Banners along Sanctum walls
    this.#buildSanctumBanners();

    // Torches & Wall Sconces
    this.#addTorch([-4.5, 2.2, -1.5]);
    this.#addTorch([4.5, 2.2, -1.5]);
    this.#addTorch([0, 2.8, 11]);
    this.#addTorch([-5.0, 2.5, 20.2]);
    this.#addTorch([5.0, 2.5, 20.2]);
    this.#addTorch([-2.2, 2.2, 31.0]);
    this.#addTorch([2.2, 2.2, 31.0]);
    this.#addTorch([0, 2.2, -36.5]);
    this.#addTorch([-7.5, 2.2, -18.0]);
  }

  #buildSanctumVaultArches() {
    // Stone ribs connecting the 4 main chapel pillars to the ceiling apex
    const ribMat = this.materials.stone;
    // Arch spanning South pillars (sw to se)
    box(this.group, [4.8, 0.45, 0.45], ribMat, [-2.4, 6.2, 20.25], [0, 0, 0.22]);
    box(this.group, [4.8, 0.45, 0.45], ribMat, [2.4, 6.2, 20.25], [0, 0, -0.22]);
    box(this.group, [0.8, 0.6, 0.6], this.materials.stoneDais, [0, 6.7, 20.25]);

    // Arch spanning North pillars (nw to ne)
    box(this.group, [4.8, 0.45, 0.45], ribMat, [-2.4, 6.2, 29.75], [0, 0, 0.22]);
    box(this.group, [4.8, 0.45, 0.45], ribMat, [2.4, 6.2, 29.75], [0, 0, -0.22]);
    box(this.group, [0.8, 0.6, 0.6], this.materials.stoneDais, [0, 6.7, 29.75]);

    // Longitudinal longitudinal rib beams running sw-nw and se-ne
    box(this.group, [0.45, 0.45, 9.5], ribMat, [-4.75, 5.8, 25.0]);
    box(this.group, [0.45, 0.45, 9.5], ribMat, [4.75, 5.8, 25.0]);

    // Central Vault Ridge Beam
    box(this.group, [0.4, 0.4, 12.0], ribMat, [0, 6.7, 25.0]);
  }

  #buildKnightEffigy([x, y, z]) {
    const effigyGroup = new THREE.Group();
    effigyGroup.position.set(x, y, z);
    const mat = this.materials.stoneDais;

    // Headrest stone pillow
    box(effigyGroup, [1.2, 0.18, 0.55], mat, [0, 0.09, -1.0]);
    // Helm / head
    const helm = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.42, 8), mat);
    helm.position.set(0, 0.24, -1.0);
    helm.rotation.x = Math.PI / 2;
    effigyGroup.add(helm);

    // Torso in plate armor
    box(effigyGroup, [0.95, 0.24, 1.1], mat, [0, 0.12, -0.2]);
    // Legs
    box(effigyGroup, [0.38, 0.22, 1.1], mat, [-0.25, 0.11, 0.8]);
    box(effigyGroup, [0.38, 0.22, 1.1], mat, [0.25, 0.11, 0.8]);

    // Stone broadsword lying along knight's center
    box(effigyGroup, [0.12, 0.14, 2.1], this.materials.stone, [0, 0.28, 0.1]);
    box(effigyGroup, [0.55, 0.12, 0.12], this.materials.stone, [0, 0.28, -0.7]);

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
    // Sconce bracket on wall / column
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
        ring.ringMesh.material.color.setHex(isCaptured ? 0x3d7eed : 0x555b62);
        ring.ringMesh.material.opacity = isCaptured ? 0.28 : 0.16;
        ring.discMesh.material.color.setHex(isCaptured ? 0x264b82 : 0x3a3f45);
        ring.discMesh.material.opacity = 0.08;
        ring.progressMesh.visible = false;
        ring.bannerCloth.material.color.setHex(isCaptured ? 0x2b5cb8 : 0x6b2824);
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
        ring.ringMesh.material.color.setHex(0xd5b76f);
        ring.ringMesh.material.opacity = pulse;
        ring.discMesh.material.color.setHex(0x7a2924);
        ring.discMesh.material.opacity = 0.14;
        ring.progressMesh.material.color.setHex(0xc8a45f);
        ring.bannerCloth.material.color.setHex(0x8a2922);
        ring.bannerCloth.material.emissive.setHex(0x240806);
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
