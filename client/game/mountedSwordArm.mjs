import * as THREE from 'three';
import { COMBO_END, comboPose } from './fpSlash.mjs';
import { guardTargets } from './fpGuardPose.mjs';
import { solveArm } from './swordArmIK.mjs';

// The sword arm of a knight riding Fight-and-Flight, while a strike or the guard has it. The standing strike clips
// swing the arm across the face (the knight's own turn carries his head out of their way, and seated he cannot turn),
// so seen from outside the fist went through the helmet, and from inside it (the mounted sight is the rider's own eyes)
// the arm filled the view. Instead the arm follows the first-person combo's own path (fpSlash.mjs: tuned from the eye,
// the blade crossing the view at each contact, never near the eye), and the first-person guard (fpGuardPose.mjs),
// carried from the eye into the rider's body at his own size and turned to where he aims, and solved on his real arm.
// From inside, a mounted strike looks as a strike on foot does; from outside, a cut made in front of a seated knight.
export const MOUNTED_SWORD = Object.freeze({
  // the eye, from the head bone in root space: where the machine's sight puts the rider's view (measured in game: the
  // sight camera sits 3 cm under the head bone and 23 cm ahead of it). The path is built round the eye that sees it,
  // so from the sight a mounted strike is framed as a strike on foot is, never across the lens.
  eye: Object.freeze([0, -0.03, -0.23]),
  // first-person arms are drawn at 83 % of the knight's (rodin/fp_arms.py): his reach is that much longer
  scale: 1 / 0.826,
  // how fast the solver takes the arm and gives it back (per second, as an exponential approach)
  rate: 14,
  // how far the strike turns to follow the aim before the seated body would have to (radians)
  yawLimit: 70 * Math.PI / 180,
  // the elbow's pole in root space: out to the right and down
  pole: Object.freeze([0.6, -0.7, 0.35]),
});

const _v = new THREE.Vector3();

/**
 * The third-person sword chain for this model, measured from it at rest: the blade's direction (`aim`) and its width
 * (`roll`) in the grip socket's own frame. (swordArmIK's stored THIRD_PERSON_SWORD_ARM was measured from the kit's
 * sword; the forged sword sits differently in the socket.)
 */
export function measureSwordChain(root) {
  const sword = root.getObjectByName('HeroSword');
  let socket = null;
  root.traverse((o) => { if (o.isBone && /^socket_?sword$/.test(o.name)) socket = o; });
  if (!sword || !socket) return null;
  root.updateMatrixWorld(true);
  const meshes = [];
  sword.traverse((o) => { if (o.isMesh && o.geometry?.attributes?.position) meshes.push(o); });
  const points = [];
  for (const mesh of meshes) {
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      if (mesh.isSkinnedMesh) mesh.getVertexPosition(i, _v); else _v.fromBufferAttribute(pos, i);
      points.push(_v.clone().applyMatrix4(mesh.matrixWorld));
    }
  }
  if (points.length < 8) return null;
  const grip = socket.getWorldPosition(new THREE.Vector3());
  const tip = points.reduce((best, p) => (p.distanceTo(grip) > best.distanceTo(grip) ? p : best), points[0]);
  const along = tip.clone().sub(grip).normalize();
  // the blade's width: the widest way across it, half way up the blade
  const mid = points.filter((p) => { const t = p.clone().sub(grip).dot(along); return t > 0.35 && t < 0.75; });
  let width = new THREE.Vector3(1, 0, 0);
  let widest = 0;
  for (const p of mid) {
    const across = p.clone().sub(grip);
    across.addScaledVector(along, -across.dot(along));
    if (across.length() > widest) { widest = across.length(); width = across.normalize(); }
  }
  const inverse = socket.getWorldQuaternion(new THREE.Quaternion()).invert();
  return {
    shoulder: 'upper_arm.R', elbow: 'forearm.R', wrist: 'hand.R', grip: 'socket_sword',
    aim: along.clone().applyQuaternion(inverse).toArray(),
    roll: width.clone().applyQuaternion(inverse).toArray(),
    pole: [...MOUNTED_SWORD.pole],
  };
}

/** Carry a first-person arm target (eye space) into the rider's root space: from his eye, at his size, aimed. */
export function fromEye(target, eye, yaw = 0) {
  const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const place = (p) => new THREE.Vector3(...p).multiplyScalar(MOUNTED_SWORD.scale).applyQuaternion(turn).add(eye).toArray();
  const point = (d) => new THREE.Vector3(...d).applyQuaternion(turn).toArray();
  return { wrist: place(target.wrist), blade: point(target.blade), edge: point(target.edge) };
}

/** The mounted sword arm's target this frame (eye space), or null when neither a strike nor the guard has it. */
export function mountedArmTarget({ attackAge = null, guarding = false } = {}, now = 0) {
  if (Number.isFinite(attackAge) && attackAge >= 0 && attackAge <= COMBO_END) return comboPose(attackAge)?.arm ?? null;
  if (guarding) return guardTargets(now).arm;
  return null;
}

export class MountedSwordArm {
  constructor(root, boneApi) {
    this.root = root;
    this.api = boneApi;
    this.weight = 0;
    this.last = null;
    this.chain = null;
  }

  /** combat: { attackAge (s since the chain began, or null), guarding, yawOffset (aim less heading, radians) } */
  apply(combat, now, dt) {
    const want = mountedArmTarget(combat ?? {}, now);
    if (want) this.last = want;
    const k = 1 - Math.exp(-MOUNTED_SWORD.rate * Math.max(0, Number.isFinite(dt) ? dt : 0));
    this.weight += ((want ? 1 : 0) - this.weight) * k;
    if (this.weight < 1e-3 || !this.last) return false;
    this.chain ??= measureSwordChain(this.root);
    if (!this.chain) return false;
    const head = this.api.position('head');
    const eye = new THREE.Vector3(...head).add(new THREE.Vector3(...MOUNTED_SWORD.eye));
    const yaw = Math.max(-MOUNTED_SWORD.yawLimit, Math.min(MOUNTED_SWORD.yawLimit, combat?.yawOffset ?? 0));
    solveArm(this.api, this.chain, fromEye(this.last, eye, yaw), this.weight);
    return true;
  }
}
