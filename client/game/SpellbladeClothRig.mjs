import * as THREE from 'three';
import { CLOTH_CHAINS, createClothState, isTeleport, resetCloth, stepCloth } from './spellbladeCloth.mjs';

const UP = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _body = new THREE.Quaternion();
const _rootInverse = new THREE.Quaternion();
const _up = new THREE.Vector3();
const _fwd = new THREE.Vector3();

function wrapAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

// Applies spellbladeCloth springs to the tabard bones after the animation mixer has posed them.
// The model faces -Z and its right is +X (glTF conversion of Blender +Y forward, +X right).
export class SpellbladeClothRig {
  constructor(root) {
    this.root = root;
    this.anchor = root.getObjectByName('tabard_root') ?? root.getObjectByName('pelvis');
    this.chains = [];
    for (const [name, spec] of Object.entries(CLOTH_CHAINS)) {
      const bones = spec.bones.map((bone) => root.getObjectByName(bone)).filter(Boolean);
      if (bones.length === spec.bones.length) {
        this.chains.push({ name, spec, bones, written: bones.map(() => null), base: bones.map(() => null) });
      }
    }
    this.enabled = Boolean(this.anchor && this.chains.length);
    this.state = createClothState();
    this.previousPosition = null;
    this.position = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.worldQuat = new THREE.Quaternion();
    this.parentQuat = new THREE.Quaternion();
    this.axis = new THREE.Vector3();
    this.offset = new THREE.Quaternion();
    this.side = new THREE.Quaternion();
    // how the anchor sits in the character at rest (the bind pose, before any clip plays): its turning and leaning
    // are measured from there
    this.restInverse = this.enabled ? this.#anchorInRoot(new THREE.Quaternion()).invert() : null;
    this.previousBody = null;
  }

  // the body the cloth hangs from, this frame: which way it faces (heading) and how far it leans from upright,
  // taken from the anchor bone (the animation's twists and leans) inside the root (a whole-body turn or tilt)
  #anchorInRoot(into) {
    this.root.updateWorldMatrix(true, false);
    this.anchor.updateWorldMatrix(true, false);
    _rootInverse.copy(this.root.getWorldQuaternion(this.worldQuat)).invert();
    return this.anchor.getWorldQuaternion(into).premultiply(_rootInverse);
  }

  #bodyFrame() {
    const anchorInRoot = this.#anchorInRoot(_q);
    // the anchor's turn away from its rest, applied to the root: the body frame in the world
    const body = _body.copy(this.worldQuat).multiply(anchorInRoot.multiply(this.restInverse));
    _fwd.set(0, 0, -1).applyQuaternion(body);
    _up.set(0, 1, 0).applyQuaternion(body);
    const heading = Math.atan2(_fwd.x, -_fwd.z);
    const flatForward = { x: Math.sin(heading), z: -Math.cos(heading) };
    const flatRight = { x: -flatForward.z, z: flatForward.x };
    const upright = Math.max(1e-3, _up.y);
    return {
      heading,
      forward: Math.atan2(_up.x * flatForward.x + _up.z * flatForward.z, upright),
      right: Math.atan2(_up.x * flatRight.x + _up.z * flatRight.z, upright),
    };
  }

  // Call right after the mixer has written this frame's pose.
  apply(dt) {
    if (!this.enabled) return;
    this.anchor.updateWorldMatrix(true, false);
    this.anchor.getWorldPosition(this.position);
    this.root.getWorldQuaternion(this.worldQuat);
    this.forward.set(0, 0, -1).applyQuaternion(this.worldQuat).setY(0).normalize();
    this.right.crossVectors(this.forward, UP).normalize();

    if (dt > 0) {
      const now = { x: this.position.x, y: this.position.y, z: this.position.z };
      const body = this.#bodyFrame();
      if (isTeleport(this.previousPosition, now)) {
        resetCloth(this.state);
        this.previousBody = null;
      }
      if (this.previousPosition) {
        const vx = (now.x - this.previousPosition.x) / dt;
        const vz = (now.z - this.previousPosition.z) / dt;
        const before = this.previousBody ?? body;
        stepCloth(this.state, dt, {
          forward: vx * this.forward.x + vz * this.forward.z,
          right: vx * this.right.x + vz * this.right.z,
        }, {
          turn: wrapAngle(body.heading - before.heading) / dt,
          tilt: { forward: body.forward, right: body.right },
          tiltRate: { forward: (body.forward - before.forward) / dt, right: (body.right - before.right) / dt },
        });
      }
      this.previousPosition = now;
      this.previousBody = body;
    }

    for (const chain of this.chains) {
      const motion = this.state.chains[chain.name];
      chain.bones.forEach((bone, i) => {
        // The mixer rewrites animated bones every frame; if it did not touch this one, reuse the
        // previous base so offsets never accumulate.
        const written = chain.written[i];
        const base = written && bone.quaternion.equals(written) ? chain.base[i] : bone.quaternion.clone();
        chain.base[i] = base;

        const share = chain.spec.share[i];
        bone.parent.getWorldQuaternion(this.parentQuat).invert();
        // swing > 0 = tip backward: rotate about the character's right axis by -angle
        this.axis.copy(this.right).applyQuaternion(this.parentQuat).normalize();
        this.offset.setFromAxisAngle(this.axis, -motion.swing * share);
        // side > 0 = tip to the right: rotate about the forward axis by -angle
        this.axis.copy(this.forward).applyQuaternion(this.parentQuat).normalize();
        this.side.setFromAxisAngle(this.axis, -motion.side * share);
        bone.quaternion.copy(this.side).multiply(this.offset).multiply(base);
        bone.updateWorldMatrix(false, false);
        chain.written[i] = bone.quaternion.clone();
      });
    }
  }

  reset() {
    resetCloth(this.state);
    this.previousPosition = null;
    this.previousBody = null;
  }
}
