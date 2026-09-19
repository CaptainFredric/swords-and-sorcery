import * as THREE from 'three';
import { CASTLEWARD } from '../../shared/worlds/castleward.mjs';
import { buildCastlewardDecorPlan } from './castlewardDecor.mjs';

function box(parent, size, material, position, rotation = [0, 0, 0], shadows = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  parent.add(mesh);
  return mesh;
}

function cylinder(parent, radius, height, sides, material, position, shadows = true) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, sides), material);
  mesh.position.set(...position);
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  parent.add(mesh);
  return mesh;
}

function disposeMaterial(material) {
  if (Array.isArray(material)) for (const item of material) item?.dispose?.();
  else material?.dispose?.();
}

export class CastlewardRenderer {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'Castleward';
    this.decor = buildCastlewardDecorPlan(1337);
    this.flames = [];
    scene.background = new THREE.Color(0x9fb8bd);
    scene.fog = new THREE.FogExp2(0xb2beb2, 0.0085);
    scene.add(this.group);
    this.#build();
  }

  #build() {
    this.materials = {
      grass: new THREE.MeshStandardMaterial({ color: 0x5f783f, roughness: 1 }),
      earth: new THREE.MeshStandardMaterial({ color: 0x786048, roughness: 1 }),
      limestone: new THREE.MeshStandardMaterial({ color: 0xa39b87, roughness: 0.94 }),
      limestoneTop: new THREE.MeshStandardMaterial({ color: 0xb6ad95, roughness: 0.91 }),
      stone: new THREE.MeshStandardMaterial({ color: 0x777466, roughness: 0.98 }),
      plaster: new THREE.MeshStandardMaterial({ color: 0xc2b89c, roughness: 0.98 }),
      timber: new THREE.MeshStandardMaterial({ color: 0x4d3828, roughness: 0.96 }),
      timberDark: new THREE.MeshStandardMaterial({ color: 0x33261d, roughness: 0.98 }),
      slate: new THREE.MeshStandardMaterial({ color: 0x4d5050, roughness: 0.94 }),
      thatch: new THREE.MeshStandardMaterial({ color: 0x8b7650, roughness: 1 }),
      hedge: new THREE.MeshStandardMaterial({ color: 0x405b32, roughness: 1 }),
      foliage: new THREE.MeshStandardMaterial({ color: 0x496b3c, roughness: 1 }),
      foliageLight: new THREE.MeshStandardMaterial({ color: 0x5e7b45, roughness: 1 }),
      banner: new THREE.MeshStandardMaterial({ color: 0x7a2f27, roughness: 0.93, side: THREE.DoubleSide }),
      iron: new THREE.MeshStandardMaterial({ color: 0x343533, roughness: 0.7, metalness: 0.45 }),
      flame: new THREE.MeshBasicMaterial({ color: 0xffa33a }),
      marketCloth: new THREE.MeshStandardMaterial({ color: 0x8a5635, roughness: 0.95, side: THREE.DoubleSide }),
    };

    this.#addAuthoritativeGeometry();
    this.#addVillageDetails();
    this.#addCastleDetails();
    this.#addMarketDetails();
    this.#addChapelDetails();
    this.#addPerimeterNature();
    this.#addTorchesAndBanners();
    this.#addDistantGround();
  }

  #materialFor(name) {
    return ({
      grass: this.materials.grass,
      earth: this.materials.earth,
      stone: this.materials.stone,
      limestone: this.materials.limestone,
      plaster: this.materials.plaster,
      timber: this.materials.timber,
      hedge: this.materials.hedge,
    })[name] ?? this.materials.stone;
  }

  #addAuthoritativeGeometry() {
    for (const floor of CASTLEWARD.floors) {
      const mesh = box(this.group, floor.size, this.#materialFor(floor.material), floor.center, [0, 0, 0], false);
      mesh.receiveShadow = true;
    }

    for (const solid of CASTLEWARD.solids) {
      box(this.group, solid.size, this.#materialFor(solid.material), solid.center);
      if (solid.material === 'limestone' && solid.size[1] >= 2.5) {
        box(
          this.group,
          [Math.max(0.2, solid.size[0] * 0.94), 0.08, Math.max(0.2, solid.size[2] * 0.94)],
          this.materials.limestoneTop,
          [solid.center[0], solid.center[1] + solid.size[1] / 2 + 0.04, solid.center[2]],
          [0, 0, 0],
          false,
        );
      }
    }

    for (const ramp of CASTLEWARD.ramps) {
      const xRun = ramp.maxX - ramp.minX;
      const zRun = ramp.maxZ - ramp.minZ;
      const rise = ramp.endY - ramp.startY;
      const center = [(ramp.minX + ramp.maxX) / 2, (ramp.startY + ramp.endY) / 2 - 0.12, (ramp.minZ + ramp.maxZ) / 2];
      if (ramp.axis === 'z') {
        box(this.group, [xRun, 0.28, Math.hypot(zRun, rise)], this.materials.earth, center, [-Math.atan2(rise, zRun), 0, 0]);
      } else {
        box(this.group, [Math.hypot(xRun, rise), 0.28, zRun], this.materials.limestoneTop, center, [0, 0, Math.atan2(rise, xRun)]);
      }
    }
  }

  #addVillageDetails() {
    for (const house of this.decor.houses) {
      if (house.id.includes('backdrop')) {
        box(this.group, [house.sx, house.y, house.sz], this.materials.plaster, [house.x, house.y / 2, house.z], [0, house.yaw, 0]);
      }
      const roofMaterial = house.roof === 'thatch' ? this.materials.thatch : this.materials.slate;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(house.sx, house.sz) * 0.72, 2.0, 4), roofMaterial);
      roof.position.set(house.x, house.y + 1.0, house.z);
      roof.rotation.y = Math.PI / 4 + house.yaw;
      roof.scale.z = Math.max(0.82, house.sz / house.sx);
      roof.castShadow = true;
      this.group.add(roof);
    }

    for (const id of ['west-house-north', 'west-house-mid']) {
      const solid = CASTLEWARD.solids.find((item) => item.id === id);
      if (!solid) continue;
      const frontZ = solid.center[2] - solid.size[2] / 2 - 0.015;
      box(this.group, [solid.size[0] * 0.78, 0.10, 0.07], this.materials.timberDark, [solid.center[0], 1.15, frontZ], [0, 0, 0], false);
      for (const offset of [-solid.size[0] * 0.28, solid.size[0] * 0.28]) {
        box(this.group, [0.10, 2.3, 0.07], this.materials.timberDark, [solid.center[0] + offset, 1.55, frontZ], [0, 0, 0], false);
      }
    }

    const southHouse = CASTLEWARD.solids.find((item) => item.id === 'west-house-south');
    if (southHouse) {
      const z = southHouse.center[2] + southHouse.size[2] / 2 + 0.015;
      box(this.group, [southHouse.size[0] * 0.82, 0.11, 0.07], this.materials.plaster, [southHouse.center[0], 1.15, z], [0, 0, 0], false);
    }
  }

  #addCastleDetails() {
    for (const piece of this.decor.castlePieces) {
      box(this.group, [piece.sx, piece.sy, piece.sz], this.materials.limestoneTop, [piece.x, piece.y, piece.z]);
    }

    for (const x of [-8.5, 8.5]) {
      const tower = cylinder(this.group, 1.15, 2.3, 8, this.materials.limestone, [x, 5.0, 25.0]);
      tower.scale.z = 0.95;
      const cap = new THREE.Mesh(new THREE.ConeGeometry(1.45, 1.4, 8), this.materials.slate);
      cap.position.set(x, 6.85, 25.0);
      cap.castShadow = true;
      this.group.add(cap);
    }

    // Decorative gate masonry stays flush with the authoritative gatehouse edges.
    // The broad central run lane remains visually and physically open.
    box(this.group, [8.15, 0.55, 0.55], this.materials.limestoneTop, [0, 4.0, 15.75]);
    box(this.group, [0.28, 3.7, 0.55], this.materials.limestoneTop, [-4.08, 2.05, 15.75]);
    box(this.group, [0.28, 3.7, 0.55], this.materials.limestoneTop, [4.08, 2.05, 15.75]);
  }

  #addMarketDetails() {
    for (const item of this.decor.market) {
      if (item.kind === 'awning') {
        box(this.group, [item.sx, item.sy, item.sz], this.materials.marketCloth, [item.x, item.y, item.z], [0, 0, -0.04], false);
        for (const dx of [-item.sx / 2 + 0.12, item.sx / 2 - 0.12]) {
          box(this.group, [0.09, 1.8, 0.09], this.materials.timberDark, [item.x + dx, 0.9, item.z], [0, 0, 0], false);
        }
      }
      if (item.kind === 'well-roof') {
        for (const dx of [-0.72, 0.72]) box(this.group, [0.10, 1.6, 0.10], this.materials.timberDark, [item.x + dx, 1.45, item.z], [0, 0, 0], false);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(1.2, 0.7, 4), this.materials.slate);
        roof.position.set(item.x, item.y, item.z);
        roof.rotation.y = Math.PI / 4;
        roof.castShadow = true;
        this.group.add(roof);
      }
    }
  }

  #addChapelDetails() {
    const pillar = CASTLEWARD.solids.find((item) => item.id === 'chapel-pillar');
    if (pillar) box(this.group, [1.35, 0.26, 1.35], this.materials.limestoneTop, [pillar.center[0], 2.92, pillar.center[2]], [0.08, 0.12, -0.09]);
    for (const [x, y, z, sx, sy, sz, ry] of [
      [18.0, 0.20, 5.2, 2.3, 0.28, 0.8, 0.24],
      [20.3, 0.18, 2.6, 1.7, 0.25, 0.7, -0.18],
      [15.0, 0.16, 9.1, 1.4, 0.22, 0.8, 0.42],
    ]) box(this.group, [sx, sy, sz], this.materials.limestone, [x, y, z], [0, ry, 0], false);
  }

  #addPerimeterNature() {
    for (const tree of this.decor.trees) {
      const trunkHeight = 2.2 * tree.scale;
      cylinder(this.group, 0.23 * tree.scale, trunkHeight, 6, this.materials.timberDark, [tree.x, trunkHeight / 2, tree.z], false);
      for (let i = 0; i < 3; i += 1) {
        const crown = new THREE.Mesh(
          new THREE.ConeGeometry((1.35 - i * 0.15) * tree.scale, 1.8 * tree.scale, 7),
          i === 1 ? this.materials.foliageLight : this.materials.foliage,
        );
        crown.position.set(tree.x, trunkHeight + 0.55 + i * 0.72, tree.z);
        crown.rotation.y = tree.turn + i * 0.6;
        crown.castShadow = true;
        this.group.add(crown);
      }
    }

    for (const fence of this.decor.fences) {
      const horizontal = fence.axis === 'x';
      const railSize = horizontal ? [fence.length, 0.09, 0.09] : [0.09, 0.09, fence.length];
      const z = horizontal ? (fence.z > 0 ? 12.15 : -8.15) : fence.z;
      const x = horizontal ? fence.x : -22.25;
      box(this.group, railSize, this.materials.timberDark, [x, fence.y, z], [0, 0, 0], false);
      box(this.group, railSize, this.materials.timberDark, [x, fence.y + 0.42, z], [0, 0, 0], false);
      const steps = Math.max(2, Math.floor(fence.length / 2.5));
      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps - 0.5;
        const px = horizontal ? fence.x + t * fence.length : x;
        const pz = horizontal ? z : fence.z + t * fence.length;
        box(this.group, [0.11, 1.25, 0.11], this.materials.timberDark, [px, 0.62, pz], [0, 0, 0], false);
      }
    }
  }

  #addTorchesAndBanners() {
    const flameGeometry = new THREE.OctahedronGeometry(0.13, 0);
    for (const torch of this.decor.torches) {
      box(this.group, [0.07, 0.42, 0.07], this.materials.iron, [torch.x, torch.y - 0.24, torch.z], [0, 0, 0], false);
      const flame = new THREE.Mesh(flameGeometry, this.materials.flame);
      flame.position.set(torch.x, torch.y, torch.z);
      flame.userData.baseY = torch.y;
      flame.userData.phase = this.flames.length * 1.27;
      this.group.add(flame);
      this.flames.push(flame);
      const light = new THREE.PointLight(0xff9a38, 2.8, 4.8, 2);
      light.position.copy(flame.position);
      this.group.add(light);
    }

    for (const banner of this.decor.banners) {
      const clothMaterial = this.materials.banner.clone();
      clothMaterial.color.setHex(banner.color);
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(banner.width, banner.height), clothMaterial);
      cloth.position.set(banner.x, banner.y, banner.z);
      cloth.castShadow = true;
      this.group.add(cloth);
      box(this.group, [banner.width + 0.22, 0.07, 0.07], this.materials.iron, [banner.x, banner.y + banner.height / 2 + 0.03, banner.z], [0, 0, 0], false);
    }
  }

  #addDistantGround() {
    const hillMaterial = new THREE.MeshStandardMaterial({ color: 0x526d3c, roughness: 1 });
    for (const [x, y, z, sx, sy, sz] of [
      [-31, -1.8, -5, 12, 5.0, 18], [31, -2.0, 2, 14, 5.5, 20],
      [-18, -2.2, 32, 18, 6.0, 12], [18, -2.3, 34, 20, 6.5, 13],
      [-19, -2.2, -31, 20, 6.0, 15], [20, -2.5, -32, 22, 6.5, 16],
    ]) {
      const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), hillMaterial);
      hill.position.set(x, y, z);
      hill.scale.set(sx, sy, sz);
      hill.receiveShadow = true;
      this.group.add(hill);
    }
  }

  update(timeSec) {
    for (const flame of this.flames) {
      const pulse = 0.92 + Math.sin(timeSec * 8 + flame.userData.phase) * 0.08;
      flame.scale.set(pulse, 1.0 + (pulse - 1) * 1.4, pulse);
      flame.position.y = flame.userData.baseY + Math.sin(timeSec * 6 + flame.userData.phase) * 0.025;
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
