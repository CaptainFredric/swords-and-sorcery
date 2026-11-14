import * as THREE from 'three';

// The first-person sword arm, joined at the wrist. In the supplied arms model the right fist was fitted round the grip
// and the vambrace left where the kit had it: the two are separate shells nineteen centimetres apart, so from the eye
// the fist floats under the guard with grass showing between it and the forearm. Here, once as the arms load, the
// vambrace is leaned over (a shear along its own length, nothing at the elbow, everything at the cuff) and drawn in a
// little, so its cuff closes round the back of the fist. It is done in the arm's rest shape, so every pose and clip
// carries it. The fist, the grip, the sword, the skeleton and the model file are left as they are.

export const SWORD_WRIST = Object.freeze({
  overlap: 0.05,   // how far behind the fist's middle the cuff's rim sits (m): the fist's back is inside it
  taper: 0.9,      // the cuff's width against the kit's, eased in from the elbow
  rim: 0.03,       // the depth of vambrace taken as its rim (m)
  joined: 0.03,    // a model whose cuff already reaches this near the fist is left alone (m)
});

const HAND = /^(handR|finger.*R|thumb.*R)$/;
const smooth = (u) => { const s = Math.max(0, Math.min(1, u)); return s * s * (3 - 2 * s); };

/** Join the sword arm's vambrace to its fist in a first-person arms model's scene. Once per model; returns whether it did. */
export function joinSwordWrist(scene, shape = SWORD_WRIST) {
  let done = false;
  scene.traverse((mesh) => {
    if (!mesh.isSkinnedMesh || !/^Arm\.?R/.test(mesh.name)) return;
    const geometry = mesh.geometry;
    if (geometry.userData.wristJoined != null) { done ||= geometry.userData.wristJoined; return; }
    geometry.userData.wristJoined = false;
    const position = geometry.getAttribute('position'), joints = geometry.getAttribute('skinIndex'), weights = geometry.getAttribute('skinWeight');
    const { bones, boneInverses } = mesh.skeleton;
    const names = bones.map((bone) => bone.name);
    const elbowAt = names.indexOf('forearmR'), wristAt = names.indexOf('handR');
    if (elbowAt < 0 || wristAt < 0) return;
    const toMesh = new THREE.Matrix4().copy(mesh.bindMatrix).invert();
    const atRest = (index) => new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(boneInverses[index]).invert()).applyMatrix4(toMesh);
    const elbow = atRest(elbowAt), axis = atRest(wristAt).sub(elbow).normalize();

    // each vertex by the bone that carries it most: the vambrace (forearm) and the fist (hand and fingers)
    const count = position.count, part = new Uint8Array(count), along = new Float32Array(count);
    const point = new THREE.Vector3(), fist = new THREE.Vector3();
    let fistCount = 0, near = Infinity, far = -Infinity;
    for (let i = 0; i < count; i += 1) {
      let k = 0;
      for (let c = 1; c < 4; c += 1) if (weights.getComponent(i, c) > weights.getComponent(i, k)) k = c;
      const name = names[joints.getComponent(i, k)];
      point.fromBufferAttribute(position, i);
      if (name === 'forearmR') {
        part[i] = 1; along[i] = point.clone().sub(elbow).dot(axis);
        near = Math.min(near, along[i]); far = Math.max(far, along[i]);
      } else if (HAND.test(name)) { part[i] = 2; fist.add(point); fistCount += 1; }
    }
    if (!fistCount || !(far > near)) return;
    fist.divideScalar(fistCount);
    const rim = new THREE.Vector3();
    let rimCount = 0;
    for (let i = 0; i < count; i += 1) if (part[i] === 1 && along[i] > far - shape.rim) { rim.add(point.fromBufferAttribute(position, i)); rimCount += 1; }
    rim.divideScalar(rimCount);
    // already joined (a remodelled arm): nothing to do
    let gap = Infinity;
    for (let i = 0; i < count; i += 1) if (part[i] === 2) gap = Math.min(gap, point.fromBufferAttribute(position, i).distanceTo(rim));
    let rimRadius = 0;
    for (let i = 0; i < count; i += 1) if (part[i] === 1 && along[i] > far - shape.rim) rimRadius = Math.max(rimRadius, point.fromBufferAttribute(position, i).distanceTo(rim));
    if (gap < rimRadius + shape.joined) return;

    // the vambrace's new line runs from its elbow end to the fist; its rim stops `overlap` short of the fist's middle
    const elbowEnd = rim.clone().addScaledVector(axis, near - far);
    const line = fist.clone().sub(elbowEnd).normalize();
    const lean = fist.clone().addScaledVector(line, -shape.overlap).sub(rim);
    const centre = new THREE.Vector3();
    for (let i = 0; i < count; i += 1) {
      if (part[i] !== 1) continue;
      const s = smooth((along[i] - near) / (far - near));
      point.fromBufferAttribute(position, i);
      centre.copy(rim).addScaledVector(axis, along[i] - far);
      point.sub(centre).multiplyScalar(1 - (1 - shape.taper) * s).add(centre).addScaledVector(lean, s);
      position.setXYZ(i, point.x, point.y, point.z);
    }
    position.needsUpdate = true;
    relight(geometry, part);
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    geometry.userData.wristJoined = true;
    done = true;
  });
  return done;
}

// the leaned plates' normals, from their own faces (the kit's plates are flat-shaded on split vertices)
function relight(geometry, part) {
  const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), index = geometry.getIndex();
  if (!normal) return;
  const sum = new Float32Array(position.count * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const faces = index ? index.count : position.count;
  for (let f = 0; f < faces; f += 3) {
    const i = index ? [index.getX(f), index.getX(f + 1), index.getX(f + 2)] : [f, f + 1, f + 2];
    if (part[i[0]] !== 1 || part[i[1]] !== 1 || part[i[2]] !== 1) continue;
    a.fromBufferAttribute(position, i[0]); b.fromBufferAttribute(position, i[1]); c.fromBufferAttribute(position, i[2]);
    b.sub(a); c.sub(a); b.cross(c);
    for (const v of i) { sum[v * 3] += b.x; sum[v * 3 + 1] += b.y; sum[v * 3 + 2] += b.z; }
  }
  for (let v = 0; v < position.count; v += 1) {
    if (part[v] !== 1) continue;
    a.set(sum[v * 3], sum[v * 3 + 1], sum[v * 3 + 2]);
    if (a.lengthSq() < 1e-16) continue;
    a.normalize(); normal.setXYZ(v, a.x, a.y, a.z);
  }
  normal.needsUpdate = true;
}
