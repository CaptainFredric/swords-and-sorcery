import * as THREE from 'three';
import { facetedMesh } from './facetedGeometry.mjs';
import { taperedPrismData, wedgeData } from './facetedGeometryData.mjs';
import { SPELLBLADE_PALETTE } from './spellbladeDesign.mjs';
import { createSpellbladeSword } from './SpellbladeSword.mjs';
import { castGesture, castGestureRotations } from './castGesture.mjs';
import { createSpellbladeAsset, reportSpellbladeAssetStatus } from './SpellbladeAssets.mjs';
import { resolveFirstPersonAnimationPlan } from './spellbladeAnimationPlan.mjs';
import { FIRST_PERSON_WEAPON_SCALE, resolveWeaponPose } from './weaponPose.mjs';
import { FP_MOTION, FirstPersonMotion } from './firstPersonMotion.mjs';
import { OFF_HAND_CLEAR, comboPose } from './fpSlash.mjs';
import { FIRST_PERSON_OFF_ARM, solveArm, solveSwordArm } from './swordArmIK.mjs';
import { LocalSwordChain } from './localSwordChain.mjs';
import { createSteelSheen } from './steelSheen.mjs';
import { swirlTexture } from './softTextures.mjs';

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


// what a spell looks like gathering in the palm
const SPELL_GLOW = Object.freeze({ fireball: 0xff7a2a, frostfire: 0x7fd6ff, gale: 0xe4ece2 });
// the light the palm throws on the arms while a spell gathers (air is pale, but lights them only a little)
const SPELL_LIGHT = Object.freeze({ fireball: 0xff7a2a, frostfire: 0x7fd6ff, gale: 0x7d9282 });
const EYE_TURN = new THREE.Quaternion();

// the clench of Sheathe in Steel: tightening over a moment, then letting go (0..1)
function clenchPulse(age) {
  if (!(age >= 0) || age > 0.42) return 0;
  return Math.sin(Math.PI * Math.min(1, age / 0.42)) ** 0.7;
}

// the magic hand tightening into a fist (the wrist curling in, the forearm turning, the arm drawn in a touch)
function clenchRotations(age) {
  const c = clenchPulse(age);
  if (c <= 0) return [];
  return [
    { bone: 'hand.L', axis: [1, 0, 0], angle: -0.55 * c, space: 'local' },
    { bone: 'forearm.L', axis: [0, 1, 0], angle: -0.3 * c, space: 'local' },
    { bone: 'upper_arm.L', axis: [1, 0, 0], angle: 0.12 * c },
  ];
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

    // the sword chain, played ahead of the server by its own rule: a tap is one swing, a hold chains, and a swing
    // under way plays out when the button is let go (localSwordChain.mjs)
    this.swordChain = new LocalSwordChain();
    this.attackButton = false;
    this.attackStartedAt = 0;
    this.guard = false;
    this.recoilUntil = 0;
    this.parryUntil = 0;
    this.castStartedAt = 0;
    this.castUntil = 0;
    this.castGather = 0.3;
    this.castSpell = 'fireball';
    this.castReleased = true;
    this.dashUntil = 0;
    // procedural stride, inertia, sway and impact motion over the authored first-person clips
    this.motion = new FirstPersonMotion();
    // hit-stop: while frozen the arms hold their pose (the procedural kick keeps playing)
    this.frozenUntil = 0;
    this.lastPlan = null;
    // Sheathe in Steel: the magic hand's clench (a quick pulse), and the plate's sheen while the armour is hard
    this.clenchAt = -Infinity;
    this.steel = { strength: 0, rippleAge: null };
    this.steelSheen = null;
    // told when each stroke of the combo begins its cut (the swing sound plays from here, without network delay)
    this.onSwing = () => {};
    this.lastSwingKey = null;
    // the combo's last pose, and when the chain was let go (it eases back to rest from there)
    this.lastCombo = null;
    this.comboReleasedAt = null;

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
      // the plate's steel readied with the arms (its shader built now, not the first time it is called)
      this.steelSheen?.dispose();
      this.steelSheen = createSteelSheen(instance, { ready: true });
      this.productionOffset.add(instance.root);
      // the arms are always in view, and a swung blade leaves the bounds the skinned meshes were measured at rest
      instance.root.traverse((object) => { if (object.isMesh) object.frustumCulled = false; });
      instance.animator.apply({ clip: 'Idle', loop: true, time: performance.now() / 1000 });
      reportSpellbladeAssetStatus('firstPerson', instance);

      if (instance.sockets.sorcery) {
        instance.sockets.sorcery.add(this.magicLight);
        this.magicLight.position.set(0, 0, 0);
        // the spell gathering in the palm: a hot core and a softer glow, in the spell's colour
        this.chargeOrb = new THREE.Group();
        this.chargeCore = new THREE.Mesh(new THREE.IcosahedronGeometry(0.035, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        this.chargeGlow = new THREE.Mesh(new THREE.IcosahedronGeometry(0.068, 1), new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
        // Gale's breath drawn into the palm: two soft swirls of air turning against each other round the fist, facing
        // the eye (no core, no glow)
        const swirlMaterial = new THREE.MeshBasicMaterial({ map: swirlTexture(), color: 0xf1f5ef, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
        this.chargeSwirl = new THREE.Group();
        for (const tilt of [0.25, -0.35]) {
          const swirl = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), swirlMaterial);
          swirl.rotation.x = tilt;
          this.chargeSwirl.add(swirl);
        }
        this.chargeOrb.add(this.chargeCore, this.chargeGlow, this.chargeSwirl);
        this.chargeOrb.visible = false;
        instance.sockets.sorcery.add(this.chargeOrb);
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

  /** The attack button: a press starts a chain (or asks for its next strike); a release lets go (the swing plays out). */
  setAttack(held) {
    if (held && !this.attackButton) this.swordChain.press(performance.now() / 1000);
    if (!held) this.swordChain.release();
    this.attackButton = held;
    if (held) this.guard = false;
  }

  /** Stop the chain outright (a parry, a wall, a stagger, a fall, the match over). */
  cancelAttack() {
    this.swordChain.cancel();
    this.attackButton = false;
  }

  /** Whether the arms are in the sword chain. */
  get attackHeld() { return this.swordChain.active; }

  setGuard(guard) {
    this.guard = guard;
    if (guard) this.cancelAttack();
  }

  /**
   * Gather a spell in the palm and throw it: gatherSec until it flies (the rest of the server's gather), glowing in
   * the spell's colour. A cast already gathering (started on the key press) is not restarted by the server's word.
   */
  cast({ gatherSec = 0.3, spell = 'fireball' } = {}) {
    const now = performance.now() / 1000;
    const gather = Number.isFinite(gatherSec) ? Math.max(0, gatherSec) : 0.3;
    if (!this.castReleased && now < this.castStartedAt + this.castGather + 0.05) {
      this.castSpell = spell;
      return;
    }
    this.castStartedAt = now;
    this.castGather = gather;
    this.castUntil = now + gather + 0.06;
    this.castSpell = spell;
    this.castReleased = false;
    this.guard = false;
    this.cancelAttack();
  }

  /** The magic hand clenches (Sheathe in Steel): a quick tightening, the palm light flashing to steel. */
  clench() {
    this.clenchAt = performance.now() / 1000;
  }

  /** The armour's hardening on my arms: strength 0..1, and seconds since it was called (for the glint), or null. */
  setSteel(strength = 0, rippleAge = null) {
    this.steel = { strength, rippleAge };
  }

  dash() {
    this.dashUntil = performance.now() / 1000 + 0.18;
  }

  wallImpact() {
    this.recoilUntil = performance.now() / 1000 + 0.23;
    this.cancelAttack();
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

  // the blow connected: freeze the swing for a beat and jolt the arms and view
  hitstop(seconds, kick = 0.5) {
    this.frozenUntil = Math.max(this.frozenUntil, performance.now() / 1000 + Math.max(0, seconds));
    this.motion.hitConfirm(kick);
  }

  /**
   * @param {{speed?:number, grounded?:boolean, yaw?:number, pitch?:number}} body  the local Spellblade's motion
   * @returns {{camera:{y:number,pitch:number,roll:number}, fov:number}} view offsets for the camera
   */
  update(timeSec, dt = 0, { speed = 0, grounded = true, yaw = 0, pitch = 0 } = {}) {
    const movingAmount = Math.min(1, speed / 7.5);
    const chain = this.swordChain.step(timeSec);
    if (chain) this.attackStartedAt = chain.startedAt;
    const pose = resolveWeaponPose({
      timeSec,
      movingAmount,
      attackHeld: Boolean(chain),
      attackStartedAt: this.attackStartedAt,
      guard: this.guard,
      recoilUntil: this.recoilUntil,
      parryUntil: this.parryUntil,
      castStartedAt: this.castStartedAt,
      castUntil: this.castUntil,
      dashUntil: this.dashUntil,
    });

    const motion = this.motion.step({ dt, speed, grounded, yaw, pitch, state: pose.state, dashing: pose.state === 'dash' });
    if (pose.state === 'attack' && pose.attackPhase === 'cut') {
      const key = `${this.attackStartedAt}:${pose.strike}`;
      if (key !== this.lastSwingKey) {
        this.lastSwingKey = key;
        this.onSwing(pose.strike);
      }
    }
    const frozen = timeSec < this.frozenUntil;

    if (this.visualKind === 'production' && this.productionInstance) {
      let plan = resolveFirstPersonAnimationPlan(pose, this, timeSec);
      // the combo is one unbroken path of both hands (fpSlash.mjs): fast, fast, then heavy with both on the grip
      const combo = this.#combo(pose.state, timeSec);
      if (combo) {
        plan = { clip: 'Idle', loop: true, time: timeSec };
        // the view leans with the body into each cut (purely visual: aim is the input's)
        motion.camera.pitch += combo.look.pitch * combo.weight;
        motion.camera.roll += combo.look.roll * combo.weight;
        motion.camera.yaw += combo.look.yaw * combo.weight;
      }
      // neutral hands sit a little wider apart (clear sightline); in the sprint the arms pump with the stride
      const spread = FP_MOTION.neutralSpread * motion.neutral;
      // the magic arm draws the spell in close, then throws it (see castGesture.mjs)
      const gesture = castGesture(timeSec - this.castStartedAt, this.castGather);
      if (!this.castReleased && timeSec >= this.castStartedAt + this.castGather) {
        this.castReleased = true;
        this.motion.release();
      }
      plan.motion = {
        extra: [
          { bone: 'upper_arm.R', axis: [0, 1, 0], angle: -spread },
          { bone: 'upper_arm.L', axis: [0, 1, 0], angle: spread },
          { bone: 'upper_arm.R', axis: [1, 0, 0], angle: 0.1 * motion.pump },
          { bone: 'upper_arm.L', axis: [1, 0, 0], angle: -0.1 * motion.pump },
          // at rest only (actions keep their authored arms): a clean grip on the sword, the magic hand lower
          { bone: 'hand.R', axis: [1, 0, 0], angle: FP_MOTION.swordWristFlex * motion.neutral, space: 'local' },
          { bone: 'forearm.R', axis: [0, 1, 0], angle: FP_MOTION.swordForearmTurn * motion.neutral, space: 'local' },
          { bone: 'hand.R', axis: [0, 0, 1], angle: FP_MOTION.swordWristLean * motion.neutral, space: 'local' },
          { bone: 'forearm.L', axis: [0, 1, 0], angle: FP_MOTION.magicForearmTwist * motion.neutral, space: 'local' },
          { bone: 'upper_arm.L', axis: [1, 0, 0], angle: -FP_MOTION.magicArmDrop * motion.neutral, space: 'local' },
          ...castGestureRotations(gesture),
          ...clenchRotations(timeSec - this.clenchAt),
          // the magic arm drops out of the blade's way while it works (unless it is on the grip)
          // (fading as it reaches for the grip, so the two never pull against each other)
          ...(combo ? OFF_HAND_CLEAR.map((turn) => ({ ...turn, angle: turn.angle * combo.weight * (1 - (combo.offHand?.weight ?? 0)) })) : []),
        ],
        solve: combo ? (bones) => {
          solveSwordArm(bones, combo.arm, combo.weight);
          if (combo.offHand) solveArm(bones, FIRST_PERSON_OFF_ARM, combo.offHand, combo.offHand.weight * combo.weight);
        } : undefined,
      };
      const shown = frozen && this.lastPlan ? this.lastPlan : plan;
      this.productionInstance.animator.apply(shown, frozen ? 0 : dt);
      this.lastPlan = shown;
      const w = motion.weapon;
      this.productionOffset.position.set(w.x, w.y, w.z);
      this.productionOffset.rotation.set(w.rx, w.ry, w.rz);
      // gauntlet runes and palm light follow the palm sorcery: dim at rest, bright only while a cast gathers
      const level = Math.max(this.productionInstance.sorceryLevel?.() ?? 0, gesture.draw);
      for (const material of this.productionInstance.materials.SorceryAccent ?? []) material.emissiveIntensity = 0.7 + 2.1 * level;
      this.magicLight.intensity = 0.12 + 2.6 * level;
      this.#chargeGlow(gesture, timeSec);
      // the clench: the palm light flares to steel and dies back as the hand opens
      const clench = clenchPulse(timeSec - this.clenchAt);
      if (clench > 0) {
        this.magicLight.color.setHex(0xcfdbe8);
        this.magicLight.intensity += 1.1 * clench;
      }
      // the steel on my own arms
      if (this.steel.strength > 0.001 || this.steelSheen || Number.isFinite(this.steel.rippleAge)) {
        this.steelSheen ??= createSteelSheen(this.productionInstance);
        this.steelSheen.set(this.steel.strength, this.steel.rippleAge);
      }
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

  // the combo while the attack is held; let go, it eases back to rest from wherever it was (never a snap). A fresh
  // chain starts from the resting arm, so it only needs a beat to take hold.
  #combo(state, timeSec) {
    const ease = (t) => t * t * (3 - 2 * t);
    if (state === 'attack') {
      const since = timeSec - this.attackStartedAt;
      this.lastCombo = comboPose(since);
      this.comboReleasedAt = null;
      return this.lastCombo && { ...this.lastCombo, weight: since < 0.08 ? ease(Math.max(0, since) / 0.08) : 1 };
    }
    if (!this.lastCombo) return null;
    if (this.comboReleasedAt === null) this.comboReleasedAt = timeSec;
    // back to rest from wherever the last swing left the arms
    const left = 1 - (timeSec - this.comboReleasedAt) / 0.3;
    if (left <= 0) {
      this.lastCombo = null;
      return null;
    }
    return { ...this.lastCombo, weight: ease(left) };
  }

  // the spell in the palm grows as it gathers and is gone when thrown; the palm light takes on its colour
  #chargeGlow(gesture, timeSec) {
    const color = SPELL_GLOW[this.castSpell] ?? SPELL_GLOW.fireball;
    this.magicLight.color.setHex(gesture.draw > 0.01 ? SPELL_LIGHT[this.castSpell] ?? color : SPELLBLADE_PALETTE.magic);
    if (!this.chargeOrb) return;
    this.chargeOrb.visible = gesture.draw > 0.02;
    if (!this.chargeOrb.visible) return;
    const flicker = 1 + Math.sin(timeSec * 38) * 0.08;
    this.chargeOrb.scale.setScalar((0.35 + 0.9 * gesture.draw) * flicker);
    const gale = this.castSpell === 'gale';
    this.chargeCore.visible = !gale;
    this.chargeGlow.visible = !gale;
    this.chargeSwirl.visible = gale;
    if (gale) {
      this.chargeSwirl.parent.getWorldQuaternion(this.chargeSwirl.quaternion).invert();
      this.chargeSwirl.quaternion.multiply(this.camera.getWorldQuaternion(EYE_TURN));
      this.chargeSwirl.children[0].rotation.z = -timeSec * 13;
      this.chargeSwirl.children[1].rotation.z = timeSec * 9;
      return;
    }
    this.chargeGlow.material.color.setHex(color);
    this.chargeCore.material.color.setHex(this.castSpell === 'frostfire' ? 0xeafcff : this.castSpell === 'gale' ? 0xffffff : 0xfff0c8);
    this.chargeGlow.rotation.y = timeSec * 5;
  }

  dispose() {
    this.disposed = true;
    this.steelSheen?.dispose();
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
