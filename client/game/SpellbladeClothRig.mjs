import * as THREE from 'three';
import { CLOTH_CHAINS, createClothState, isTeleport, resetCloth, stepCloth } from './spellbladeCloth.mjs';

const UP = new THREE.Vector3(0, 1, 0);

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
      if (isTeleport(this.previousPosition, now)) resetCloth(this.state);
      if (this.previousPosition) {
        const vx = (now.x - this.previousPosition.x) / dt;
        const vz = (now.z - this.previousPosition.z) / dt;
        stepCloth(this.state, dt, {
          forward: vx * this.forward.x + vz * this.forward.z,
          right: vx * this.right.x + vz * this.right.z,
        });
      }
      this.previousPosition = now;
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
  }
}
