import * as THREE from 'three';
import { facetedMesh } from './facetedGeometry.mjs';
import { taperedPrismData, wedgeData } from './facetedGeometryData.mjs';
import { SPELLBLADE_PALETTE } from './spellbladeDesign.mjs';
import { createSpellbladeSword } from './SpellbladeSword.mjs';
import { createSpellbladeAsset, reportSpellbladeAssetStatus } from './SpellbladeAssets.mjs';
import { resolveFirstPersonAnimationPlan } from './spellbladeAnimationPlan.mjs';
import { FIRST_PERSON_WEAPON_SCALE, resolveWeaponPose } from './weaponPose.mjs';
import { FP_MOTION, FirstPersonMotion } from './firstPersonMotion.mjs';

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

function disposeObject(root) {
  root.traverse((object) => {
    object.geometry?.dispose?.();
    if (Array.isArray(object.material)) for (const material of object.material) material?.dispose?.();
    else object.material?.dispose?.();
  });
}

function armPiece(parent, data, material, {
  position = [0, 0, 0],
  rotation = [Math.PI / 2, 0, 0],
  name = '',
} = {}) {
  const mesh = facetedMesh(data, material, { castShadow: false, receiveShadow: false, name });
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  parent.add(mesh);
  return mesh;
}

function makeGauntletedArm(parent, materials, side = 1) {
  const arm = new THREE.Group();
  arm.name = `${side < 0 ? 'left' : 'right'}-first-person-arm`;
  parent.add(arm);

  armPiece(arm, taperedPrismData({
    height: 0.54,
    topWidth: 0.22,
    bottomWidth: 0.27,
    topDepth: 0.22,
    bottomDepth: 0.25,
    topOffsetX: side * -0.015,
  }), materials.sleeve, {
    position: [0, -0.025, 0.29],
    rotation: [Math.PI / 2 + 0.08, 0, side * -0.08],
    name: 'dark-sleeve',
  });

  armPiece(arm, taperedPrismData({
    height: 0.14,
    topWidth: 0.255,
    bottomWidth: 0.245,
    topDepth: 0.25,
    bottomDepth: 0.24,
  }), materials.darkArmor, {
    position: [0, -0.005, 0.08],
    name: 'elbow-gap',
  });

  armPiece(arm, taperedPrismData({
    height: 0.31,
    topWidth: 0.27,
    bottomWidth: 0.33,
    topDepth: 0.27,
    bottomDepth: 0.32,
  }), materials.armor, {
    position: [0, 0, -0.045],
    name: 'faceted-bracer',
  });

  armPiece(arm, taperedPrismData({
    height: 0.2,
    topWidth: 0.25,
    bottomWidth: 0.19,
    topDepth: 0.14,
    bottomDepth: 0.11,
  }), materials.armorLight, {
    position: [0, 0.105, -0.055],
    name: 'bracer-ridge',
  });

  armPiece(arm, taperedPrismData({
    height: 0.22,
    topWidth: 0.275,
    bottomWidth: 0.225,
    topDepth: 0.255,
    bottomDepth: 0.21,
  }), materials.leather, {
    position: [0, -0.005, -0.225],
    name: 'gauntlet-hand',
  });

  armPiece(arm, wedgeData({ width: 0.285, height: 0.09, depth: 0.19, slope: 0.3 }), materials.armorLight, {
    position: [0, 0.09, -0.24],
    rotation: [Math.PI / 2, 0, 0],
    name: 'knuckle-plate',
  });

  return arm;
}

function addMagicWisp(parent, material, name, position, size, rotation) {
  const wisp = new THREE.Mesh(new THREE.TetrahedronGeometry(size, 0), material);
  wisp.name = name;
  wisp.position.set(...position);
  wisp.rotation.set(...rotation);
  parent.add(wisp);
  return wisp;
}


export class WeaponView {
  constructor(camera) {
    this.camera = camera;
    this.group = new THREE.Group();
    this.group.name = 'first-person-spellblade-root';
    camera.add(this.group);

    this.fallbackVisual = new THREE.Group();
    this.fallbackVisual.name = 'first-person-spellblade-fallback';
    this.fallbackVisual.scale.setScalar(FIRST_PERSON_WEAPON_SCALE);
    // shown only if the production arms fail to load (never during a normal load)
    this.fallbackVisual.visible = false;
    this.group.add(this.fallbackVisual);

    this.productionOffset = new THREE.Group();
    this.productionOffset.name = 'first-person-spellblade-production-offset';
    this.group.add(this.productionOffset);
    this.productionInstance = null;
    this.assetGeneration = 0;
    this.disposed = false;
    this.visualKind = 'fallback';
    reportSpellbladeAssetStatus('firstPerson');

    const materials = {
      sleeve: new THREE.MeshStandardMaterial({ color: SPELLBLADE_PALETTE.darkArmor, roughness: 0.78, metalness: 0.18 }),
      darkArmor: new THREE.MeshStandardMaterial({ color: SPELLBLADE_PALETTE.darkArmor, roughness: 0.72, metalness: 0.32 }),
      armor: new THREE.MeshStandardMaterial({ color: SPELLBLADE_PALETTE.armor, roughness: 0.56, metalness: 0.52 }),
      armorLight: new THREE.MeshStandardMaterial({ color: SPELLBLADE_PALETTE.armorLight, roughness: 0.46, metalness: 0.62 }),
      leather: new THREE.MeshStandardMaterial({ color: SPELLBLADE_PALETTE.leather, roughness: 0.9 }),
      trim: new THREE.MeshStandardMaterial({ color: SPELLBLADE_PALETTE.trim, roughness: 0.42, metalness: 0.68 }),
      cloth: new THREE.MeshStandardMaterial({ color: SPELLBLADE_PALETTE.cloth, roughness: 0.86 }),
      blade: new THREE.MeshStandardMaterial({ color: SPELLBLADE_PALETTE.blade, roughness: 0.18, metalness: 0.94 }),
      bladeRidge: new THREE.MeshStandardMaterial({ color: SPELLBLADE_PALETTE.bladeRidge, roughness: 0.24, metalness: 0.88 }),
      magic: new THREE.MeshStandardMaterial({
        color: SPELLBLADE_PALETTE.magic,
        emissive: SPELLBLADE_PALETTE.magic,
        emissiveIntensity: 2.4,
        roughness: 0.2,
        metalness: 0.08,
      }),
    };

    this.weaponGroup = new THREE.Group();
    this.weaponGroup.position.set(0.50, -0.47, -0.94);
    this.weaponGroup.rotation.set(-0.08, -0.10, -0.10);
    this.fallbackVisual.add(this.weaponGroup);

    this.rightArm = makeGauntletedArm(this.weaponGroup, materials, 1);
    this.rightArm.position.set(0.02, -0.03, 0.18);

    this.swordPivot = new THREE.Group();
    this.swordPivot.position.set(0, -0.01, -0.18);
    this.weaponGroup.add(this.swordPivot);
    this.sword = createSpellbladeSword(materials, { axis: 'z', scale: 1.08, castShadow: false });
    this.swordPivot.add(this.sword);

    this.leftHandGroup = makeGauntletedArm(this.fallbackVisual, materials, -1);
    this.leftHandGroup.position.set(-0.42, -0.58, -0.82);
    this.leftHandGroup.rotation.set(-0.28, 0.16, 0.18);

    this.magicAnchor = new THREE.Group();
    this.magicAnchor.position.set(0, 0, -0.34);
    this.leftHandGroup.add(this.magicAnchor);
    const magicCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), materials.magic);
    magicCore.name = 'first-person-magic-core';
    this.magicAnchor.add(magicCore);
    this.magicHalo = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.014, 5, 12), materials.magic);
    this.magicHalo.name = 'first-person-magic-halo';
    this.magicHalo.rotation.x = Math.PI / 2;
    this.magicAnchor.add(this.magicHalo);
    this.magicWisps = [
      addMagicWisp(this.magicAnchor, materials.magic, 'first-person-magic-wisp-a', [-0.11, 0.055, -0.02], 0.045, [0.2, 0.5, 0.1]),
      addMagicWisp(this.magicAnchor, materials.magic, 'first-person-magic-wisp-b', [0.1, 0.08, 0.03], 0.04, [-0.3, 0.2, 0.6]),
      addMagicWisp(this.magicAnchor, materials.magic, 'first-person-magic-wisp-c', [0.025, -0.105, -0.025], 0.043, [0.4, -0.25, 0.35]),
    ];
    this.magicLight = new THREE.PointLight(SPELLBLADE_PALETTE.magic, 1.0, 2.1, 2);
    this.magicAnchor.add(this.magicLight);

    this.attackHeld = false;
    this.attackStartedAt = 0;
    this.guard = false;
    this.recoilUntil = 0;
    this.parryUntil = 0;
    this.castStartedAt = 0;
    this.castUntil = 0;
    this.dashUntil = 0;
    // procedural stride, inertia, sway and impact motion over the authored first-person clips
    this.motion = new FirstPersonMotion();

    this.#upgradeVisual();
  }

  #upgradeVisual() {
    const generation = ++this.assetGeneration;
    createSpellbladeAsset({ kind: 'firstPerson' }).then((instance) => {
      if (!instance) {
        this.fallbackVisual.visible = true;
        return;
      }
      if (this.disposed || generation !== this.assetGeneration) {
        instance.dispose();
        return;
      }

      this.productionInstance = instance;
      this.visualKind = 'production';
      this.productionOffset.add(instance.root);
      instance.animator.apply({ clip: 'Idle', loop: true, time: performance.now() / 1000 });
      reportSpellbladeAssetStatus('firstPerson', instance);

      if (instance.sockets.sorcery) {
        instance.sockets.sorcery.add(this.magicLight);
        this.magicLight.position.set(0, 0, 0);
      }

      this.group.remove(this.fallbackVisual);
      disposeObject(this.fallbackVisual);
    }).catch(() => {
      if (!this.disposed) {
        this.visualKind = 'fallback';
        this.fallbackVisual.visible = true;
        reportSpellbladeAssetStatus('firstPerson');
      }
    });
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
    this.motion.clang();
  }

  parry() {
    this.parryUntil = performance.now() / 1000 + 0.3;
    this.motion.parry();
  }

  // a blow caught on my guard (heavy: it broke the guard)
  block(heavy = false) {
    this.motion.block(heavy);
  }

  // my swing was caught on someone's guard
  rebound() {
    this.motion.rebound();
  }

  // push: from the attacker toward me in view space (+x right, +z backward)
  damage(push, amount) {
    this.motion.damage(push, amount);
  }

  land(impactSpeed) {
    this.motion.land(impactSpeed);
  }

  /**
   * @param {{speed?:number, grounded?:boolean, yaw?:number, pitch?:number}} body  the local Spellblade's motion
   * @returns {{camera:{y:number,pitch:number,roll:number}, fov:number}} view offsets for the camera
   */
  update(timeSec, dt = 0, { speed = 0, grounded = true, yaw = 0, pitch = 0 } = {}) {
    const movingAmount = Math.min(1, speed / 7.5);
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

    const motion = this.motion.step({ dt, speed, grounded, yaw, pitch, state: pose.state, dashing: pose.state === 'dash' });

    if (this.visualKind === 'production' && this.productionInstance) {
      const plan = resolveFirstPersonAnimationPlan(pose, this, timeSec);
      // neutral hands sit a little wider apart (clear sightline); in the sprint the arms pump with the stride
      const spread = FP_MOTION.neutralSpread * motion.neutral;
      plan.motion = {
        extra: [
          { bone: 'upper_arm.R', axis: [0, 1, 0], angle: -spread },
          { bone: 'upper_arm.L', axis: [0, 1, 0], angle: spread },
          { bone: 'upper_arm.R', axis: [1, 0, 0], angle: 0.1 * motion.pump },
          { bone: 'upper_arm.L', axis: [1, 0, 0], angle: -0.1 * motion.pump },
        ],
      };
      this.productionInstance.animator.apply(plan, dt);
      const w = motion.weapon;
      this.productionOffset.position.set(w.x, w.y, w.z);
      this.productionOffset.rotation.set(w.rx, w.ry, w.rz);
      // gauntlet runes and palm light follow the palm sorcery: dim at rest, bright only while a cast gathers
      const level = this.productionInstance.sorceryLevel?.() ?? 0;
      for (const material of this.productionInstance.materials.SorceryAccent ?? []) material.emissiveIntensity = 0.7 + 2.1 * level;
      this.magicLight.intensity = 0.12 + 2.6 * level;
      return motion;
    }

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
    for (let i = 0; i < this.magicWisps.length; i += 1) {
      const wisp = this.magicWisps[i];
      wisp.rotation.x += 0.012 + i * 0.003;
      wisp.rotation.y = timeSec * (1.1 + i * 0.22);
    }
    this.magicLight.intensity = pose.state === 'cast' ? 3.2 : 0.95 * Math.max(0.4, magicScale);
    return motion;
  }

  dispose() {
    this.disposed = true;
    this.assetGeneration += 1;
    if (this.productionInstance) {
      this.productionOffset.remove(this.productionInstance.root);
      this.productionInstance.dispose();
      this.productionInstance = null;
    } else if (this.fallbackVisual.parent) {
      this.group.remove(this.fallbackVisual);
      disposeObject(this.fallbackVisual);
    }
    this.camera.remove(this.group);
  }
}
