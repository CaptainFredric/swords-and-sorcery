import * as THREE from 'three';
import { BI_BYE_OPERATOR_POSES as DATA } from './biByeOperatorPoses.mjs';
import { spellHandTurns } from './spellHand.mjs';

const clean = (name) => name.replace(/[[\].:/]/g, '');
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const _axisX = new THREE.Vector3(1, 0, 0);
const _axisY = new THREE.Vector3(0, 1, 0);
const _qTmp = new THREE.Quaternion();
const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vC = new THREE.Vector3();
const _openPalm = spellHandTurns({ palm: 0.9, spread: 0.7 });
const _fistGrip = spellHandTurns({ fist: 1 });

/**
 * Braced interior seated pose for DRAG-OON operators and passengers (V4.1 cabin).
 * Keeps pelvis on the 1.06 m bench (with rig root shifted onto the 0.68 m deck),
 * tucks spine/helmet safely below the 2.38 m roof armor (<= 2.12 m), stows the sword inside,
 * and extends the sorcery forearm through open embrasures when a passenger casts.
 */
export class DragOonOccupantPose {
  constructor(root, bones, siegeStow = null) {
    this.root = root;
    this.bones = bones;
    this.siegeStow = siegeStow;
    this.active = false;
    this.rest = new Map([...bones.values()].map((b) => [b, { p: b.position.clone(), q: b.quaternion.clone() }]));
    this.wheelPose = new Map(
      Object.entries(DATA.poses.wheel).map(([name, t]) => [
        clean(name),
        { p: new THREE.Vector3(...t.position), q: new THREE.Quaternion(...t.quaternion) },
      ])
    );
    this.sword = root.getObjectByName('HeroSword');
    this.castBlend = 0;
  }

  bone(name) {
    return this.bones.get(clean(name));
  }

  apply(ctx = {}, dt = 1 / 60) {
    if (!this.active) {
      this.active = true;
      this.swordVisible = this.sword?.visible ?? true;
    }

    // Apply fitted seated lower-body leg bend while lowering pelvis from 1.057m to 0.44m above floor (bench height)
    for (const [name, xform] of this.wheelPose) {
      const bone = this.bones.get(name);
      if (!bone) continue;
      bone.position.copy(xform.p);
      bone.quaternion.copy(xform.q);
      if (name === 'pelvis') {
        // Sit snugly on the interior deck bench with pelvis at +0.28m so helmet crests never peek through upper armor slits.
        bone.position.y = 0.28;
      }
    }

    // Subtle braced crouch lean so helmet crown never clears the 2.38m interior ceiling even during recoil/camp fire
    const spine = this.bone('spine');
    if (spine) spine.quaternion.multiply(_qTmp.setFromAxisAngle(_axisX, 0.30));
    const chest = this.bone('chest');
    if (chest) chest.quaternion.multiply(_qTmp.setFromAxisAngle(_axisX, 0.14));
    const neck = this.bone('neck');
    if (neck) neck.quaternion.multiply(_qTmp.setFromAxisAngle(_axisX, -0.16));
    const head = this.bone('head');
    if (head) {
      const lookPitch = clamp(ctx.pitch ?? 0, -0.35, 0.35);
      head.quaternion.multiply(_qTmp.setFromAxisAngle(_axisX, -0.12 - lookPitch * 0.35));
    }

    // Stow sword cleanly inside the hull (reuse fitted stowed sword when available, else hide exterior blade)
    if (this.sword) this.sword.visible = false;
    if (this.siegeStow?.stowed) {
      this.siegeStow.stowed.visible = true;
    }

    // Passenger casting extends left gauntlet toward embrasure aperture when unsealed; operator braces hands inside cabin
    const canCastOut = Boolean(ctx.role === 'passenger' && ctx.casting && !ctx.sealed && !ctx.riteActive);
    this.castBlend += ((canCastOut ? 1 : 0) - this.castBlend) * clamp((dt || 1 / 60) * 14, 0, 1);

    // Tuck right sword arm safely across lap inside hull
    const uaR = this.bone('upper_arm.R');
    const faR = this.bone('forearm.R');
    if (uaR) uaR.quaternion.multiply(_qTmp.setFromAxisAngle(_axisX, -0.35));
    if (faR) faR.quaternion.multiply(_qTmp.setFromAxisAngle(_axisY, -0.25));

    // Left sorcery arm: braced inside by default, reaches forward/outward into aperture on cast
    const uaL = this.bone('upper_arm.L');
    const faL = this.bone('forearm.L');
    if (uaL && faL && this.castBlend < 0.05) {
      uaL.quaternion.multiply(_qTmp.setFromAxisAngle(_axisX, -0.22));
    }

    const turns = this.castBlend > 0.25 ? _openPalm : _fistGrip;
    for (const t of turns) {
      const bone = this.bones.get(clean(t.bone));
      if (bone) bone.quaternion.multiply(_qTmp.setFromAxisAngle(_axisX.fromArray(t.axis), t.angle));
    }
    _axisX.set(1, 0, 0);

    this.root.updateWorldMatrix(true, true);
    if (this.castBlend > 0.02 && ctx.apertureWorld) {
      this.#reachLeftArm(ctx.apertureWorld, this.castBlend);
    }
  }

  #reachLeftArm(targetWorld, weight) {
    const a = this.bone('upper_arm.L');
    const b = this.bone('forearm.L');
    const c = this.bone('hand.L');
    if (!a || !b || !c || !a.parent || !b.parent || !c.parent) return;

    const start = a.getWorldPosition(_vA);
    const elbow = b.getWorldPosition(_vB);
    const wrist = c.getWorldPosition(_vC);
    const l1 = start.distanceTo(elbow);
    const l2 = elbow.distanceTo(wrist);
    const goal = wrist.clone().lerp(targetWorld, weight);
    const delta = goal.clone().sub(start);
    if (delta.lengthSq() < 1e-6) return;
    const axis = delta.clone().normalize();
    const dist = Math.max(0.05, Math.min(delta.length(), l1 + l2 - 0.01));
    const along = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
    const height = Math.sqrt(Math.max(0, l1 * l1 - along * along));
    const pole = elbow.clone().sub(start);
    pole.addScaledVector(axis, -pole.dot(axis));
    if (pole.lengthSq() > 1e-6) pole.normalize();
    else pole.set(0, -1, 0);
    const elbowTarget = start.clone().addScaledVector(axis, along).addScaledVector(pole, height);
    this.#aimBone(a, b, elbowTarget);
    this.#aimBone(b, c, goal);
  }

  #aimBone(bone, child, target) {
    if (!bone || !child || !target || !bone.parent) return;
    const start = bone.getWorldPosition(new THREE.Vector3());
    const from = child.getWorldPosition(new THREE.Vector3()).sub(start);
    const to = target.clone().sub(start);
    if (from.lengthSq() < 1e-6 || to.lengthSq() < 1e-6) return;
    from.normalize();
    to.normalize();
    const delta = new THREE.Quaternion().setFromUnitVectors(from, to);
    const world = bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(delta);
    bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world));
    bone.updateMatrixWorld(true);
  }

  release() {
    if (!this.active) return false;
    for (const [bone, t] of this.rest) {
      bone.position.copy(t.p);
      bone.quaternion.copy(t.q);
    }
    if (this.sword) this.sword.visible = this.swordVisible;
    if (this.siegeStow?.stowed) this.siegeStow.stowed.visible = false;
    this.castBlend = 0;
    this.active = false;
    return true;
  }
}
