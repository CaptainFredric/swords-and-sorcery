import * as THREE from 'three';
import { FIRST_PERSON_WEAPON_SCALE, resolveWeaponPose } from './weaponPose.mjs';

function box(parent, size, material, position = [0, 0, 0], rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

function damp(value, target, amount) {
  return value + (target - value) * amount;
}

function dampTransform(group, pose, amount = 0.28) {
  group.position.x = damp(group.position.x, pose.x, amount);
  group.position.y = damp(group.position.y, pose.y, amount);
  group.position.z = damp(group.position.z, pose.z, amount);
  group.rotation.x = damp(group.rotation.x, pose.rx, amount);
  group.rotation.y = damp(group.rotation.y, pose.ry, amount);
  group.rotation.z = damp(group.rotation.z, pose.rz, amount);
}

function makeSword(materials) {
  const sword = new THREE.Group();

  box(sword, [0.12, 0.12, 0.42], materials.leather, [0, 0, 0.19]);
  box(sword, [0.66, 0.09, 0.14], materials.trim, [0, 0, -0.04]);
  box(sword, [0.18, 0.075, 1.34], materials.blade, [0, 0, -0.78]);
  box(sword, [0.035, 0.082, 1.12], materials.bladeRidge, [0, -0.002, -0.72]);

  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.115, 0.34, 4), materials.blade);
  tip.rotation.x = -Math.PI / 2;
  tip.rotation.z = Math.PI / 4;
  tip.position.z = -1.61;
  sword.add(tip);

  const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), materials.trim);
  pommel.position.z = 0.48;
  sword.add(pommel);

  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.075, 0), materials.cloth);
  gem.scale.z = 0.7;
  gem.position.set(0, 0, -0.055);
  sword.add(gem);

  return sword;
}

function makeGauntletedArm(parent, materials, side = 1) {
  const arm = new THREE.Group();
  parent.add(arm);

  box(arm, [0.25, 0.22, 0.54], materials.sleeve, [0, -0.02, 0.28], [0.08, 0, side * -0.08]);
  box(arm, [0.3, 0.27, 0.25], materials.armor, [0, 0, -0.02]);
  box(arm, [0.33, 0.1, 0.3], materials.armorLight, [0, 0.08, -0.04]);
  box(arm, [0.23, 0.21, 0.22], materials.leather, [0, -0.01, -0.2]);

  return arm;
}

export class WeaponView {
  constructor(camera) {
    this.group = new THREE.Group();
    this.group.scale.setScalar(FIRST_PERSON_WEAPON_SCALE);
    camera.add(this.group);

    const materials = {
      sleeve: new THREE.MeshStandardMaterial({ color: 0x252b35, roughness: 0.74, metalness: 0.24 }),
      armor: new THREE.MeshStandardMaterial({ color: 0x596575, roughness: 0.56, metalness: 0.52 }),
      armorLight: new THREE.MeshStandardMaterial({ color: 0x7f8d9e, roughness: 0.46, metalness: 0.62 }),
      leather: new THREE.MeshStandardMaterial({ color: 0x49352b, roughness: 0.9 }),
      trim: new THREE.MeshStandardMaterial({ color: 0xa1804d, roughness: 0.42, metalness: 0.68 }),
      cloth: new THREE.MeshStandardMaterial({ color: 0x7a3038, roughness: 0.86 }),
      blade: new THREE.MeshStandardMaterial({ color: 0xd0d8e2, roughness: 0.18, metalness: 0.94 }),
      bladeRidge: new THREE.MeshStandardMaterial({ color: 0x8e9aaa, roughness: 0.24, metalness: 0.88 }),
      magic: new THREE.MeshStandardMaterial({ color: 0x67dcff, emissive: 0x2acbff, emissiveIntensity: 2.4, roughness: 0.2, metalness: 0.08 }),
    };

    this.weaponGroup = new THREE.Group();
    this.weaponGroup.position.set(0.50, -0.47, -0.94);
    this.weaponGroup.rotation.set(-0.08, -0.10, -0.10);
    this.group.add(this.weaponGroup);

    this.rightArm = makeGauntletedArm(this.weaponGroup, materials, 1);
    this.rightArm.position.set(0.02, -0.03, 0.18);

    this.swordPivot = new THREE.Group();
    this.swordPivot.position.set(0, -0.01, -0.18);
    this.weaponGroup.add(this.swordPivot);
    this.sword = makeSword(materials);
    this.swordPivot.add(this.sword);

    this.leftHandGroup = makeGauntletedArm(this.group, materials, -1);
    this.leftHandGroup.position.set(-0.42, -0.58, -0.82);
    this.leftHandGroup.rotation.set(-0.28, 0.16, 0.18);

    this.magicAnchor = new THREE.Group();
    this.magicAnchor.position.set(0, 0, -0.31);
    this.leftHandGroup.add(this.magicAnchor);
    const magicCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), materials.magic);
    this.magicAnchor.add(magicCore);
    this.magicHalo = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.014, 5, 12), materials.magic);
    this.magicHalo.rotation.x = Math.PI / 2;
    this.magicAnchor.add(this.magicHalo);
    this.magicLight = new THREE.PointLight(0x4bd8ff, 1.0, 2.1, 2);
    this.magicAnchor.add(this.magicLight);

    this.attackHeld = false;
    this.attackStartedAt = 0;
    this.guard = false;
    this.recoilUntil = 0;
    this.parryUntil = 0;
    this.castStartedAt = 0;
    this.castUntil = 0;
    this.dashUntil = 0;
  }

  setAttack(held) {
    if (held && !this.attackHeld) this.attackStartedAt = performance.now() / 1000;
    this.attackHeld = held;
    if (held) this.guard = false;
  }

  setGuard(guard) {
    this.guard = guard;
    if (guard) this.attackHeld = false;
  }

  cast(durationSec = 0.36) {
    const duration = Number.isFinite(durationSec) ? Math.max(0, durationSec) : 0.36;
    if (duration <= 0) return;
    const now = performance.now() / 1000;
    this.castStartedAt = now;
    this.castUntil = now + duration;
    this.guard = false;
    this.attackHeld = false;
  }

  dash() {
    this.dashUntil = performance.now() / 1000 + 0.18;
  }

  wallImpact() {
    this.recoilUntil = performance.now() / 1000 + 0.23;
    this.attackHeld = false;
  }

  parry() {
    this.parryUntil = performance.now() / 1000 + 0.3;
  }

  update(timeSec, movingAmount = 0) {
    const pose = resolveWeaponPose({
      timeSec,
      movingAmount,
      attackHeld: this.attackHeld,
      attackStartedAt: this.attackStartedAt,
      guard: this.guard,
      recoilUntil: this.recoilUntil,
      parryUntil: this.parryUntil,
      castStartedAt: this.castStartedAt,
      castUntil: this.castUntil,
      dashUntil: this.dashUntil,
    });

    const groupSnap = pose.state === 'attack' ? 0.40 : pose.state === 'guard' || pose.state === 'cast' ? 0.34 : 0.27;
    const swordSnap = pose.state === 'attack' ? 0.58 : pose.state === 'guard' ? 0.42 : 0.32;
    dampTransform(this.weaponGroup, pose.group, groupSnap);
    dampTransform(this.swordPivot, pose.sword, swordSnap);
    dampTransform(this.leftHandGroup, pose.leftHand, pose.state === 'cast' ? 0.42 : 0.27);

    this.rightArm.rotation.x = damp(this.rightArm.rotation.x, pose.rightHand.rx, 0.28);
    this.rightArm.rotation.y = damp(this.rightArm.rotation.y, pose.rightHand.ry, 0.28);
    this.rightArm.rotation.z = damp(this.rightArm.rotation.z, pose.rightHand.rz, 0.28);

    const magicScale = damp(this.magicAnchor.scale.x, pose.magicScale, pose.state === 'cast' ? 0.42 : 0.30);
    this.magicAnchor.scale.setScalar(magicScale);
    this.magicHalo.rotation.z = timeSec * 3.2;
    this.magicHalo.rotation.y = Math.sin(timeSec * 2.6) * 0.22;
    this.magicLight.intensity = pose.state === 'cast' ? 3.2 : 0.95 * Math.max(0.4, magicScale);
  }
}
