// Developer verification against the real skinned geometry and current ordinary combo solver.
import * as THREE from 'three';
import { createSpellbladeAsset } from './SpellbladeAssets.mjs';
import { comboPose, counterRotations } from './fpSlash.mjs';
import { FIRST_PERSON_OFF_ARM, solveArm, solveSwordArm } from './swordArmIK.mjs';

function triangles(mesh) {
  mesh.skeleton?.update();
  const vertices = Array.from({ length: mesh.geometry.attributes.position.count }, (_, i) => mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
  const index = mesh.geometry.index;
  const result = [];
  for (let i = 0; i < (index?.count ?? vertices.length); i += 3) {
    const v = [0, 1, 2].map((n) => vertices[index ? index.getX(i + n) : i + n]);
    result.push({ v, box: new THREE.Box3().setFromPoints(v) });
  }
  return result;
}
function crosses(a, b) {
  const ray = new THREE.Ray();
  const direction = new THREE.Vector3();
  const hit = new THREE.Vector3();
  for (let i = 0; i < 3; i += 1) {
    direction.subVectors(a[(i + 1) % 3], a[i]);
    const length = direction.length();
    ray.set(a[i], direction.normalize());
    if (ray.intersectTriangle(b[0], b[1], b[2], false, hit) && hit.distanceTo(a[i]) <= length) return true;
  }
  return false;
}
export async function checkOrdinaryOffhand({ step = 1 / 120 } = {}) {
  const instance = await createSpellbladeAsset({ kind: 'firstPerson' });
  const meshes = [];
  instance.root.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
  const sword = meshes.filter((o) => o.name.startsWith('HeroSword'));
  const arms = meshes.filter((o) => /^ArmL(?:_|$)/.test(o.name));
  const contacts = [];
  try {
    if (!sword.length || !arms.length) throw new Error('Exported blade or left gauntlet missing');
    for (let t = 0.72; t < 1.32; t += step) {
      const pose = comboPose(t);
      instance.animator.apply({ clip: 'Idle', time: 1 / 30, loop: true, motion: {
        extra: counterRotations(pose.counter, 1 - (pose.offHand?.weight ?? 0)),
        solve: (bones) => {
          solveSwordArm(bones, pose.arm, 1);
          if (pose.offHand) solveArm(bones, FIRST_PERSON_OFF_ARM, pose.offHand, pose.offHand.weight);
        },
      } }, 0);
      instance.root.updateMatrixWorld(true);
      const s = sword.flatMap(triangles);
      const a = arms.flatMap(triangles);
      if (s.some((st) => a.some((at) => st.box.intersectsBox(at.box) && (crosses(st.v, at.v) || crosses(at.v, st.v))))) contacts.push(t);
    }
    return { samples: Math.ceil(0.6 / step), contacts };
  } finally { instance.dispose(); }
}
