import * as THREE from 'three';

// The first-person sword hand, trimmed. The armour kit's right fist is modelled half again the size of a gauntleted
// hand around the grip (about 20 cm each way), with a broad vambrace behind it: from the eye it reads as one bulky
// clump under the guard. Here, once as the first-person arms load: the fist is drawn in toward the grip (eased in from
// the wrist, so it stays joined to its cuff) and the vambrace slimmed a little, in the arm's own rest shape, so every
// pose and swing carries it. The model itself is left as it is; the third-person knight keeps its proportions.

export const SWORD_HAND = Object.freeze({
  fist: 0.72,          // the fist's size, drawn toward the grip
  vambrace: 0.84,      // the vambrace's thickness
  // where the grip sits in the hand bone's frame (the sword's socket), and where the fist begins beyond the wrist
  grip: Object.freeze([-0.01, 0.094, 0.003]),
  wristFrom: 0.01,
  wristTo: 0.06,
});

const smooth = (t) => {
  const s = Math.max(0, Math.min(1, t));
  return s * s * (3 - 2 * s);
};

/** Trim the sword hand of a first-person arms model's scene (its right arm's meshes). Once per model. */
export function trimSwordHand(scene, hand = SWORD_HAND) {
  const grip = new THREE.Vector3(...hand.grip);
  const point = new THREE.Vector3();
  const fromBone = new THREE.Matrix4();
  const toMesh = new THREE.Matrix4();
  scene.traverse((object) => {
    if (!object.isSkinnedMesh || !/^ArmR/.test(object.name)) return;
    const geometry = object.geometry;
    if (geometry.userData.handTrimmed) return;
    const position = geometry.getAttribute('position');
    const joints = geometry.getAttribute('skinIndex');
    const weights = geometry.getAttribute('skinWeight');
    const { bones, boneInverses } = object.skeleton;
    toMesh.copy(object.bindMatrix).invert();
    for (let i = 0; i < position.count; i += 1) {
      // the bone that carries this vertex most
      let joint = 0;
      let most = -1;
      for (let k = 0; k < 4; k += 1) {
        const w = weights.getComponent(i, k);
        if (w > most) { most = w; joint = joints.getComponent(i, k); }
      }
      const bone = bones[joint]?.name;
      if (bone !== 'handR' && bone !== 'forearmR') continue;
      // into the bone's own frame at rest (+y runs along the arm), reshaped there, and back
      point.fromBufferAttribute(position, i).applyMatrix4(object.bindMatrix).applyMatrix4(boneInverses[joint]);
      if (bone === 'handR') {
        const s = 1 - (1 - hand.fist) * smooth((point.y - hand.wristFrom) / (hand.wristTo - hand.wristFrom));
        point.sub(grip).multiplyScalar(s).add(grip);
      } else {
        point.x *= hand.vambrace;
        point.z *= hand.vambrace;
      }
      point.applyMatrix4(fromBone.copy(boneInverses[joint]).invert()).applyMatrix4(toMesh);
      position.setXYZ(i, point.x, point.y, point.z);
    }
    position.needsUpdate = true;
    geometry.computeBoundingSphere();
    geometry.userData.handTrimmed = true;
  });
}
