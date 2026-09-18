import * as THREE from 'three';
import { SHATTERED_KEEP } from '../../shared/src/map.mjs';

export class WorldRenderer {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.#build();
  }

  #build() {
    const stone = new THREE.MeshStandardMaterial({ color: 0x303746, roughness: 0.92, metalness: 0.06 });
    const stoneTop = new THREE.MeshStandardMaterial({ color: 0x414a5a, roughness: 0.88, metalness: 0.05 });
    const darkStone = new THREE.MeshStandardMaterial({ color: 0x242a35, roughness: 0.95 });
    const arcane = new THREE.MeshStandardMaterial({ color: 0x1d4a59, emissive: 0x17b8d8, emissiveIntensity: 1.6, roughness: 0.32 });

    for (const floor of SHATTERED_KEEP.floors) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...floor.size), stoneTop);
      mesh.position.set(...floor.center);
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      this.group.add(mesh);
    }

    for (const solid of SHATTERED_KEEP.solids) {
      const mat = solid.material === 'arcane' ? arcane : stone;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...solid.size), mat);
      mesh.position.set(...solid.center);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      if (solid.material === 'arcane') this.#addSpire(mesh.position);
    }

    for (const ramp of SHATTERED_KEEP.ramps) {
      const width = ramp.maxX - ramp.minX;
      const length = ramp.maxZ - ramp.minZ;
      const rise = ramp.endY - ramp.startY;
      const hyp = Math.hypot(length, rise);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 0.28, hyp), stoneTop);
      mesh.position.set((ramp.minX + ramp.maxX) / 2, (ramp.startY + ramp.endY) / 2 - 0.12, (ramp.minZ + ramp.maxZ) / 2);
      mesh.rotation.x = -Math.atan2(rise, length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }

    // Battlement teeth establish an unmistakable castle silhouette without extra collision complexity.
    for (let x = -6.5; x <= 6.5; x += 2.1) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.15, 0.75), darkStone);
      tooth.position.set(x, 3.65, 14.25);
      tooth.castShadow = true;
      this.group.add(tooth);
    }

    this.#addTorches();
    this.#addBackdrop();
  }

  #addSpire(basePosition) {
    const crystalMaterial = new THREE.MeshStandardMaterial({ color: 0x5ce7ff, emissive: 0x26c7f2, emissiveIntensity: 2.6, metalness: 0.12, roughness: 0.2 });
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.95, 0), crystalMaterial);
    crystal.position.set(basePosition.x, 3.5, basePosition.z);
    crystal.rotation.z = 0.27;
    crystal.castShadow = true;
    this.group.add(crystal);
    const shard1 = crystal.clone(); shard1.scale.setScalar(0.42); shard1.position.set(1.15, 2.8, 0.65); shard1.rotation.set(0.5, 0.3, 0.1); this.group.add(shard1);
    const shard2 = crystal.clone(); shard2.scale.setScalar(0.3); shard2.position.set(-0.9, 3.1, -0.9); shard2.rotation.set(-0.3, 0.7, 0.2); this.group.add(shard2);
    const light = new THREE.PointLight(0x40dfff, 18, 12, 2);
    light.position.set(0, 3.2, 0);
    this.group.add(light);
    this.crystal = crystal;
  }

  #addTorches() {
    const torchLocations = [[-8.6, 1.8, 4], [-8.6, 1.8, -4], [8.6, 1.8, 4], [8.6, 1.8, -4], [0, 1.6, -20.5]];
    for (const [x, y, z] of torchLocations) {
      const flame = new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 7, 5),
        new THREE.MeshBasicMaterial({ color: 0xffa534 }),
      );
      flame.position.set(x, y, z);
      this.group.add(flame);
      const light = new THREE.PointLight(0xff8a2b, 7, 6, 2);
      light.position.copy(flame.position);
      this.group.add(light);
    }
  }

  #addBackdrop() {
    const abyss = new THREE.Mesh(
      new THREE.CylinderGeometry(70, 85, 4, 48),
      new THREE.MeshBasicMaterial({ color: 0x0a0c17, side: THREE.BackSide }),
    );
    abyss.position.y = -11;
    this.group.add(abyss);
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0x343a55, transparent: true, opacity: 0.16, depthWrite: false });
    for (let i = 0; i < 26; i += 1) {
      const cloud = new THREE.Mesh(new THREE.SphereGeometry(3 + Math.random() * 4, 8, 5), cloudMat);
      const angle = Math.random() * Math.PI * 2;
      const radius = 25 + Math.random() * 35;
      cloud.position.set(Math.cos(angle) * radius, -4 - Math.random() * 6, Math.sin(angle) * radius);
      cloud.scale.y = 0.3 + Math.random() * 0.25;
      this.group.add(cloud);
    }
  }

  update(timeSec) {
    if (this.crystal) {
      this.crystal.rotation.y = timeSec * 0.45;
      this.crystal.position.y = 3.5 + Math.sin(timeSec * 1.7) * 0.08;
    }
  }
}
