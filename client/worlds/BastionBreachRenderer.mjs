import * as THREE from 'three';
import { BASTION_BREACH } from '../../shared/worlds/bastionBreach.mjs';
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
      trim: new THREE.MeshStandardMaterial({ color: 0x46423c, roughness: 0.95 }),
      objInactive: new THREE.MeshBasicMaterial({
        color: 0x778899,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
      }),
      objActiveAttacker: new THREE.MeshBasicMaterial({
        color: 0xffaa33,
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide,
      }),
      objContested: new THREE.MeshBasicMaterial({
        color: 0xdd3322,
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
      }),
    };

    // 1. Floors
    for (const fl of BASTION_BREACH.floors) {
      const mat = fl.id.includes('dais') ? this.materials.stoneDais : this.materials.stoneFloor;
      const mesh = box(this.group, fl.size, mat, fl.center, [0, 0, 0], false);
      mesh.receiveShadow = true;
    }

    // 2. Solids (Walls, pillars, barricades)
    for (const sol of BASTION_BREACH.solids) {
      const mat = sol.material === 'timber' ? this.materials.timber : this.materials.stone;
      box(this.group, sol.size, mat, sol.center, [0, 0, 0], true);
    }

    // 3. Ramps (East Gallery Ramp)
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

    // 4. Luminous Objective Ground Rings
    for (let i = 0; i < BASTION_BREACH.objectives.length; i++) {
      const obj = BASTION_BREACH.objectives[i];
      const ringGeom = new THREE.RingGeometry(obj.radius - 0.45, obj.radius, 48);
      const discGeom = new THREE.CircleGeometry(obj.radius - 0.45, 48);
      
      const ringMesh = new THREE.Mesh(ringGeom, this.materials.objActiveAttacker.clone());
      ringMesh.rotation.x = -Math.PI / 2;
      ringMesh.position.set(obj.x, obj.y + 0.06, obj.z);
      this.group.add(ringMesh);

      const discMesh = new THREE.Mesh(discGeom, this.materials.objInactive.clone());
      discMesh.rotation.x = -Math.PI / 2;
      discMesh.position.set(obj.x, obj.y + 0.04, obj.z);
      this.group.add(discMesh);

      this.objectiveRings.push({
        index: i,
        id: obj.id,
        radius: obj.radius,
        ringMesh,
        discMesh,
      });
    }

    // 5. Ambient Torches in courtyard and gatehouse
    this.#addTorch([ -4.5, 2.2, -1.5 ]);
    this.#addTorch([ 4.5, 2.2, -1.5 ]);
    this.#addTorch([ 0, 2.8, 11 ]);
  }

  #addTorch(position) {
    const torchLight = everywhere(new THREE.PointLight(0xff9944, 1.8, 14, 1.6));
    torchLight.position.set(...position);
    this.group.add(torchLight);
    this.torches.push({ light: torchLight, baseY: position[1], phase: Math.random() * Math.PI * 2 });
  }

  update(timeSec, camera = null) {
    // Torch flicker
    for (const torch of this.torches) {
      torch.light.intensity = 1.6 + Math.sin(timeSec * 8.5 + torch.phase) * 0.25 + Math.sin(timeSec * 14.1) * 0.12;
    }

    // Subtle breathing pulse for active objective rings
    const pulse = 0.55 + Math.sin(timeSec * 3.2) * 0.15;
    for (const ring of this.objectiveRings) {
      if (ring.ringMesh.material) {
        ring.ringMesh.material.opacity = pulse;
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
