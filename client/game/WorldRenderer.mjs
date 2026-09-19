import * as THREE from 'three';
import { KEEP_HORIZONTAL_SCALE, SHATTERED_KEEP } from '../../shared/src/map.mjs';
import { buildKeepDecorPlan, KEEP_ROUTE_COLORS } from './worldDecor.mjs';
import { SCENE_PRESENTATION } from './scenePresentation.mjs';

function box(parent, size, material, position, rotation = [0, 0, 0], shadows = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  parent.add(mesh);
  return mesh;
}

function h(value) {
  return value * KEEP_HORIZONTAL_SCALE;
}

export class WorldRenderer {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.floatingStones = [];
    this.decor = buildKeepDecorPlan(1337);
    scene.add(this.group);
    this.#build();
  }

  #build() {
    const palette = SCENE_PRESENTATION.materials;
    this.materials = {
      stone: new THREE.MeshStandardMaterial({ color: palette.stone, roughness: 0.92, metalness: 0.04 }),
      stoneTop: new THREE.MeshStandardMaterial({ color: palette.stoneTop, roughness: 0.9, metalness: 0.035 }),
      westStone: new THREE.MeshStandardMaterial({ color: palette.westStone, roughness: 0.92, metalness: 0.03 }),
      westTrim: new THREE.MeshStandardMaterial({ color: 0x785c48, emissive: 0x3b1f12, emissiveIntensity: 0.16, roughness: 0.82, metalness: 0.1 }),
      eastStone: new THREE.MeshStandardMaterial({ color: palette.eastStone, roughness: 0.92, metalness: 0.035 }),
      darkStone: new THREE.MeshStandardMaterial({ color: palette.darkStone, roughness: 0.96 }),
      rubble: new THREE.MeshStandardMaterial({ color: palette.rubble, roughness: 0.97 }),
      arcane: new THREE.MeshStandardMaterial({ color: 0x28474a, emissive: 0x1497ad, emissiveIntensity: 1.25, roughness: 0.38 }),
      cyanGlow: new THREE.MeshBasicMaterial({ color: KEEP_ROUTE_COLORS.courtyard, transparent: true, opacity: 0.72 }),
      violetGlow: new THREE.MeshBasicMaterial({ color: KEEP_ROUTE_COLORS.east, transparent: true, opacity: 0.68 }),
      warmGlow: new THREE.MeshBasicMaterial({ color: KEEP_ROUTE_COLORS.west }),
      banner: new THREE.MeshStandardMaterial({ color: KEEP_ROUTE_COLORS.north, roughness: 0.92, side: THREE.DoubleSide }),
    };

    for (const floor of SHATTERED_KEEP.floors) {
      let material = this.materials.stoneTop;
      if (floor.id === 'west-hall') material = this.materials.westStone;
      if (floor.id === 'east-hall') material = this.materials.eastStone;
      const mesh = box(this.group, floor.size, material, floor.center, [0, 0, 0], false);
      mesh.receiveShadow = true;
    }

    for (const solid of SHATTERED_KEEP.solids) {
      const material = solid.material === 'arcane' ? this.materials.arcane : this.materials.stone;
      const mesh = box(this.group, solid.size, material, solid.center);
      if (solid.material === 'arcane') this.#addSpire(mesh.position);
      else this.#addStoneCap(solid);
    }

    for (const ramp of SHATTERED_KEEP.ramps) {
      const width = ramp.maxX - ramp.minX;
      const length = ramp.maxZ - ramp.minZ;
      const rise = ramp.endY - ramp.startY;
      const hyp = Math.hypot(length, rise);
      const mesh = box(
        this.group,
        [width, 0.28, hyp],
        this.materials.stoneTop,
        [(ramp.minX + ramp.maxX) / 2, (ramp.startY + ramp.endY) / 2 - 0.12, (ramp.minZ + ramp.maxZ) / 2],
        [-Math.atan2(rise, length), 0, 0],
      );
      mesh.receiveShadow = true;
    }

    this.#addBattlements();
    this.#addHallLanguage();
    this.#addDecorPlan();
    this.#addTorches();
    this.#addBackdrop();
  }

  #addStoneCap(solid) {
    if (solid.size[1] < 2 || solid.id.includes('bridge')) return;
    const y = solid.center[1] + solid.size[1] / 2 + 0.035;
    box(
      this.group,
      [Math.max(0.18, solid.size[0] * 0.92), 0.07, Math.max(0.18, solid.size[2] * 0.92)],
      this.materials.stoneTop,
      [solid.center[0], y, solid.center[2]],
      [0, 0, 0],
      false,
    );
  }

  #addBattlements() {
    for (let x = h(-6.5); x <= h(6.5) + 0.001; x += h(2.1)) {
      box(this.group, [1.15, 1.15, 0.75], this.materials.darkStone, [x, 3.65, h(14.25)]);
    }
    for (let z = h(11.65); z <= h(14.1) + 0.001; z += h(1.55)) {
      box(this.group, [0.72, 0.9, 0.82], this.materials.darkStone, [h(-6.65), 3.5, z]);
      box(this.group, [0.72, 0.9, 0.82], this.materials.darkStone, [h(6.65), 3.5, z]);
    }
  }

  #addHallLanguage() {
    for (const accent of this.decor.wallAccents) {
      box(
        this.group,
        [accent.sx, accent.sy, accent.sz],
        this.materials.westTrim,
        [accent.x, accent.y, accent.z],
        [0, 0, 0],
        false,
      );
    }

    for (const z of [-3.7, 0, 3.7].map(h)) {
      const sigil = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 4, 12), this.materials.violetGlow);
      sigil.position.set(h(17.62), 1.55, z);
      sigil.rotation.y = Math.PI / 2;
      this.group.add(sigil);
    }
  }

  #addSpire(basePosition) {
    const crystalMaterial = new THREE.MeshStandardMaterial({
      color: 0x5ce7ff,
      emissive: 0x26c7f2,
      emissiveIntensity: 2.7,
      metalness: 0.1,
      roughness: 0.22,
    });
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.95, 0), crystalMaterial);
    crystal.position.set(basePosition.x, 3.2, basePosition.z);
    crystal.rotation.z = 0.27;
    crystal.castShadow = true;
    this.group.add(crystal);

    const shardSpecs = [
      [1.18, 2.72, 0.72, 0.42, 0.5, 0.3, 0.1],
      [-0.95, 2.92, -0.92, 0.3, -0.3, 0.7, 0.2],
      [0.5, 3.9, -0.88, 0.22, 0.8, -0.2, 0.4],
      [-1.22, 3.42, 0.22, 0.2, -0.4, 0.25, -0.5],
    ];
    this.spireShards = shardSpecs.map(([x, y, z, scale, rx, ry, rz], index) => {
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.95, 0), crystalMaterial);
      shard.scale.setScalar(scale);
      shard.position.set(basePosition.x + x, y, basePosition.z + z);
      shard.rotation.set(rx, ry, rz);
      shard.userData.phase = index * 1.4;
      shard.userData.baseY = y;
      shard.castShadow = true;
      this.group.add(shard);
      return shard;
    });

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: KEEP_ROUTE_COLORS.courtyard,
      transparent: true,
      opacity: 0.26,
      side: THREE.DoubleSide,
    });
    this.spireRing = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.025, 5, 32), ringMaterial);
    this.spireRing.position.set(basePosition.x, 3.18, basePosition.z);
    this.spireRing.rotation.x = Math.PI / 2;
    this.group.add(this.spireRing);

    const light = new THREE.PointLight(0x40dfff, 14, 11, 2);
    light.position.set(basePosition.x, 3.0, basePosition.z);
    this.group.add(light);
    this.crystal = crystal;
    this.crystalBaseY = 3.2;
  }

  #addDecorPlan() {
    for (const piece of this.decor.rubble) {
      box(this.group, [piece.sx, piece.sy, piece.sz], this.materials.rubble, [piece.x, piece.y, piece.z], [0, piece.ry, piece.rz], false);
    }

    for (const piece of this.decor.bridgeEdges) {
      box(this.group, [piece.sx, piece.sy, piece.sz], this.materials.rubble, [piece.x, piece.y, piece.z], [piece.rx ?? 0, piece.ry ?? 0, piece.rz ?? 0]);
    }

    for (const fissure of this.decor.fissures) {
      const material = fissure.color === KEEP_ROUTE_COLORS.east ? this.materials.violetGlow : this.materials.cyanGlow;
      box(this.group, [fissure.sx, 0.018, fissure.sz], material, [fissure.x, fissure.y, fissure.z], [0, fissure.ry, 0], false);
    }

    for (const banner of this.decor.banners) {
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(banner.width, banner.height, 1, 2), this.materials.banner);
      cloth.position.set(banner.x, banner.y, banner.z);
      this.group.add(cloth);
      box(this.group, [banner.width + 0.28, 0.07, 0.07], this.materials.darkStone, [banner.x, banner.y + banner.height / 2 + 0.03, banner.z], [0, 0, 0], false);
    }

    for (const routeLight of this.decor.routeLights) {
      const light = new THREE.PointLight(routeLight.color, routeLight.intensity, routeLight.distance, 2);
      light.position.set(routeLight.x, routeLight.y, routeLight.z);
      this.group.add(light);
      const markerMaterial = routeLight.color === KEEP_ROUTE_COLORS.east ? this.materials.violetGlow : this.materials.warmGlow;
      const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), markerMaterial);
      marker.position.copy(light.position);
      this.group.add(marker);
    }

    for (const stone of this.decor.floatingMasonry) {
      const mesh = box(this.group, [stone.sx, stone.sy, stone.sz], this.materials.darkStone, [stone.x, stone.y, stone.z], [stone.rx, stone.ry, stone.rz], false);
      this.floatingStones.push({ mesh, baseY: stone.y, phase: stone.phase, drift: stone.drift });
    }
  }

  #addTorches() {
    const torchLocations = [
      [h(-8.62), 1.8, h(4.2)],
      [h(-8.62), 1.8, h(-4.2)],
      [h(-16.9), 1.65, h(1.8)],
      [h(-16.9), 1.65, h(-1.8)],
      [0, 1.55, h(-20.6)],
    ];
    const flameMaterial = new THREE.MeshBasicMaterial({ color: 0xffa534 });
    const flameGeometry = new THREE.OctahedronGeometry(0.14, 0);
    for (const [x, y, z] of torchLocations) {
      box(this.group, [0.08, 0.42, 0.08], this.materials.darkStone, [x, y - 0.25, z], [0, 0, 0], false);
      const flame = new THREE.Mesh(flameGeometry, flameMaterial);
      flame.position.set(x, y, z);
      this.group.add(flame);
      const light = new THREE.PointLight(0xff8a2b, SCENE_PRESENTATION.torches.intensity, SCENE_PRESENTATION.torches.distance, 2);
      light.position.copy(flame.position);
      this.group.add(light);
    }
  }

  #addBackdrop() {
    const abyss = new THREE.Mesh(
      new THREE.CylinderGeometry(77, 94, 4, 48),
      new THREE.MeshBasicMaterial({ color: 0x0d0e11, side: THREE.BackSide }),
    );
    abyss.position.y = -11;
    this.group.add(abyss);

    const cloudMaterial = new THREE.MeshBasicMaterial({
      color: 0x4a4b50,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    });
    const cloudGeometry = new THREE.SphereGeometry(1, 8, 5);
    for (const cloudSpec of this.decor.clouds) {
      const cloud = new THREE.Mesh(cloudGeometry, cloudMaterial);
      cloud.position.set(cloudSpec.x, cloudSpec.y, cloudSpec.z);
      cloud.scale.set(cloudSpec.scale, cloudSpec.scale * cloudSpec.flatten, cloudSpec.scale);
      this.group.add(cloud);
    }
  }

  update(timeSec) {
    if (this.crystal) {
      this.crystal.rotation.y = timeSec * 0.45;
      this.crystal.position.y = this.crystalBaseY + Math.sin(timeSec * 1.7) * 0.08;
    }
    if (this.spireRing) {
      this.spireRing.rotation.z = timeSec * 0.16;
      this.spireRing.scale.setScalar(1 + Math.sin(timeSec * 1.15) * 0.03);
    }
    for (const shard of this.spireShards ?? []) {
      shard.rotation.y += 0.0035;
      shard.position.y = shard.userData.baseY + Math.sin(timeSec * 1.35 + shard.userData.phase) * 0.08;
    }
    for (const stone of this.floatingStones) {
      stone.mesh.position.y = stone.baseY + Math.sin(timeSec * stone.drift + stone.phase) * 0.12;
      stone.mesh.rotation.y += 0.0007;
    }
  }
}
