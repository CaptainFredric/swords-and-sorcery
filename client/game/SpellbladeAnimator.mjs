import * as THREE from 'three';
import { bootSide, soleContactOffset } from './spellbladeContact.mjs';
import { SpellbladeClothRig } from './SpellbladeClothRig.mjs';
import { blendProgressFor, blendSeconds, blendWeights } from './spellbladeBlend.mjs';
import { DEATH_REST, GAIT_CLIPS, deathRest, deathSlump, gaitTime, reactionPose } from './spellbladeMotion.mjs';

// three.js strips '.', ':', '/' and brackets from glTF node names ("thigh.L" loads as "thighL")
function sanitize(name) {
  return name.replace(/[[\].:/]/g, '');
}

const LEG_CHAINS = [['thigh.L', 'shin.L', 'foot.L'], ['thigh.R', 'shin.R', 'foot.R']];
const _q = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const _qpInv = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const clamp01 = (t) => Math.max(0, Math.min(1, t));

// the turn about a level `axis` through `pivot` (root space, radians, the smaller way round) that brings `point` down
// to `height`, or as low as it can go if it cannot reach
function swingDown(pivot, point, axis, height) {
  const r = [point.x - pivot.x, point.y - pivot.y, point.z - pivot.z];
  const along = r[0] * axis[0] + r[2] * axis[2];
  const perp = [r[0] - axis[0] * along, r[1], r[2] - axis[2] * along];
  // axis × perp, the way the point moves for a positive turn
  const b = [axis[1] * perp[2] - axis[2] * perp[1], axis[2] * perp[0] - axis[0] * perp[2], axis[0] * perp[1] - axis[1] * perp[0]];
  // height(θ) = pivot.y + perp.y cos θ + b.y sin θ
  const size = Math.hypot(perp[1], b[1]);
  if (size < 1e-6) return 0;
  const phase = Math.atan2(b[1], perp[1]);
  const want = Math.max(-1, Math.min(1, (height - pivot.y) / size));
  if (point.y <= height) return 0;
  const options = [phase + Math.acos(want), phase - Math.acos(want)].map((t) => Math.atan2(Math.sin(t), Math.cos(t)));
  return options.reduce((best, t) => (Math.abs(t) < Math.abs(best) ? t : best));
}
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _rootInv = new THREE.Matrix4();
const _rootQuatInv = new THREE.Quaternion();
const _bq = new THREE.Quaternion();

function clampActionTime(action, time, loop) {
  const duration = Math.max(0.0001, action.getClip().duration || 0.0001);
  if (loop) return ((time % duration) + duration) % duration;
  return Math.max(0, Math.min(duration, time));
}

export class SpellbladeAnimator {
  constructor(root, clips = [], onPose = null, { cloth = false } = {}) {
    this.onPose = onPose;
    this.root = root;
    this.mixer = new THREE.AnimationMixer(root);
    this.cloth = cloth ? new SpellbladeClothRig(root) : null;
    this.actions = new Map();
    this.activeAction = null;
    this.activeClip = null;
    this.activeBlend = { elapsed: 0, duration: 0 };
    // clips still fading out, each frozen at the pose it was showing when it was replaced
    this.fading = [];

    for (const clip of clips) this.actions.set(clip.name, this.mixer.clipAction(clip));
    // Run and Sprint share one stride phase so a gait change keeps the feet where they are
    this.gaitPhase = 0;
    this.bones = new Map();
    root.traverse((object) => { if (object.isBone) this.bones.set(object.name, object); });
    // bone transforms the procedural layer changed last frame (restored before the next pose)
    this.touched = new Map();
    // Cache the rigid boots in their foot bones' space once. Contact checks then use cheap transforms,
    // retaining the real faceted sole instead of an ankle proxy or a box that exaggerates toe clearance.
    this.soles = new Map();
    root.updateMatrixWorld(true);
    root.traverse((object) => {
      if (!object.isSkinnedMesh) return;
      const side = bootSide(object.name);
      if (!side) return;
      const foot = this.bone(`foot.${side}`);
      if (!foot) return;
      object.skeleton.update();
      const inverse = foot.matrixWorld.clone().invert();
      const unique = new Map();
      for (let i = 0; i < object.geometry.attributes.position.count; i += 1) {
        const point = object.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(object.matrixWorld).applyMatrix4(inverse);
        unique.set(point.toArray().map((v) => v.toFixed(6)).join(','), point);
      }
      this.soles.set(`foot.${side}`, [...(this.soles.get(`foot.${side}`) ?? []), ...unique.values()]);
    });
    // what a procedural solver (motion.solve, e.g. the first-person sword arm) may read and turn, in root space
    this.boneApi = {
      position: (name) => {
        const bone = this.bone(name);
        return bone ? _v.setFromMatrixPosition(bone.matrixWorld).applyMatrix4(_rootInv).toArray() : [0, 0, 0];
      },
      direction: (name, axis) => {
        const bone = this.bone(name);
        if (!bone) return [0, 0, 0];
        bone.getWorldQuaternion(_bq).premultiply(_rootQuatInv);
        return _v.set(axis[0], axis[1], axis[2]).applyQuaternion(_bq).normalize().toArray();
      },
      rotate: (name, axis, angle) => this.#rotateInRootSpace(this.bone(name), axis, angle),
      shift: (name, offset) => this.#offsetInRootSpace(this.bone(name), offset),
    };
  }

  bone(name) {
    return this.bones.get(sanitize(name)) ?? this.bones.get(name) ?? null;
  }

  has(clip) {
    return this.actions.has(clip);
  }

  apply(plan, dt = 0) {
    const step = Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0;
    const clip = this.actions.has(plan?.clip) ? plan.clip : plan?.fallback;
    const action = this.actions.get(clip);
    if (!action) return false;
    if (clip !== plan.clip) plan = { ...plan, clip };

    if (this.activeAction !== action) {
      const duration = step > 0 && this.activeAction ? blendSeconds(this.activeClip, plan.clip) : 0;
      let startProgress = 0;
      if (duration > 0) {
        // every outgoing clip restarts its fade from the weight it has right now, so a switch in the middle of a
        // blend (or straight back to a clip that is still fading out) continues from the pose on screen
        const returning = this.fading.find((entry) => entry.action === action);
        if (returning) startProgress = blendProgressFor(action.getEffectiveWeight());
        this.fading = this.fading.filter((entry) => entry.action !== action);
        this.fading.push({ action: this.activeAction });
        for (const entry of this.fading) {
          entry.startWeight = entry.action.getEffectiveWeight();
          entry.elapsed = 0;
          entry.duration = duration;
        }
      } else {
        for (const entry of this.fading) entry.action.stop();
        this.fading = [];
        this.activeAction?.stop();
      }
      for (const entry of this.fading) entry.clip ??= this.#clipOf(entry.action);
      action.reset();
      action.play();
      this.activeAction = action;
      this.activeClip = plan.clip;
      this.activeBlend = { elapsed: startProgress * duration, duration };
    }

    const loop = Boolean(plan.loop);
    action.enabled = true;
    action.clampWhenFinished = !loop;
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    const weight = Number.isFinite(plan.weight) ? plan.weight : 1;
    this.activeBlend.elapsed += step;
    const progress = this.activeBlend.duration > 0 ? this.activeBlend.elapsed / this.activeBlend.duration : 1;
    for (const entry of this.fading) entry.elapsed += step;
    const weights = blendWeights(progress, this.fading.map((entry) => ({
      startWeight: entry.startWeight,
      progress: entry.duration > 0 ? entry.elapsed / entry.duration : 1,
    })));
    this.fading.forEach((entry, i) => entry.action.setEffectiveWeight(weights.fading[i] * weight));
    if (weights.active >= 1) {
      for (const entry of this.fading) entry.action.stop();
      this.fading = [];
    }
    action.setEffectiveWeight(weights.active * weight);
    action.paused = true;

    const gait = GAIT_CLIPS.has(plan.clip) && loop && step > 0;
    if (gait) {
      const rate = Number.isFinite(plan.rate) ? plan.rate : 1;
      this.gaitPhase = (this.gaitPhase + (step * rate) / Math.max(0.05, action.getClip().duration)) % 1;
      action.time = gaitTime(this.gaitPhase, action.getClip().duration);
    } else {
      const time = Number.isFinite(plan.time) ? plan.time : 0;
      action.time = clampActionTime(action, plan.normalized ? time * action.getClip().duration : time, loop);
    }
    // gait clips that are fading out keep striding on the shared phase instead of freezing mid-step
    for (const entry of this.fading) {
      if (GAIT_CLIPS.has(entry.clip)) entry.action.time = gaitTime(this.gaitPhase, entry.action.getClip().duration);
    }

    this.#restoreTouched();
    this.mixer.update(0);
    this.#applyProcedural(plan.motion);
    this.cloth?.apply(step);
    this.onPose?.(plan);
    return true;
  }

  #clipOf(action) {
    for (const [name, candidate] of this.actions) if (candidate === action) return name;
    return null;
  }

  #touch(bone) {
    if (!this.touched.has(bone)) this.touched.set(bone, { q: bone.quaternion.clone(), p: bone.position.clone() });
  }

  #restoreTouched() {
    for (const [bone, saved] of this.touched) {
      bone.quaternion.copy(saved.q);
      bone.position.copy(saved.p);
    }
    this.touched.clear();
  }

  // rotate a bone about an axis given in the character's root space, through the bone's own pivot
  #rotateInRootSpace(bone, axis, angle) {
    if (!bone?.parent || Math.abs(angle) < 1e-5) return;
    _axis.set(axis[0], axis[1], axis[2]);
    if (_axis.lengthSq() < 1e-10) return;
    _axis.normalize();
    _m.multiplyMatrices(_rootInv, bone.parent.matrixWorld);
    _m.decompose(_v, _qp, _s);
    _qpInv.copy(_qp).invert();
    _q.setFromAxisAngle(_axis, angle);
    // local' = P^-1 * R * P * local
    this.#touch(bone);
    bone.quaternion.premultiply(_qp).premultiply(_q).premultiply(_qpInv);
    bone.updateMatrixWorld(true);
  }

  // rotate a bone about one of its own axes (a joint's own bend or twist, whatever the pose around it)
  #rotateLocal(bone, axis, angle) {
    if (!bone || Math.abs(angle) < 1e-5) return;
    _axis.set(axis[0], axis[1], axis[2]);
    if (_axis.lengthSq() < 1e-10) return;
    this.#touch(bone);
    _q.setFromAxisAngle(_axis.normalize(), angle);
    bone.quaternion.multiply(_q);
    bone.updateMatrixWorld(true);
  }

  #applyProcedural(motion) {
    if (!motion) return;
    const pose = reactionPose(motion.reactions, motion.now ?? 0, motion.yaw ?? 0, { slack: Boolean(motion.death) });
    // a death's first moments: the body loses its structure before the clip's fall takes over
    if (motion.death) {
      const slump = deathSlump(motion.death.age, motion.death.push, motion.yaw ?? 0);
      pose.rotations.push(...slump.rotations);
      pose.pelvis = pose.pelvis.map((v, i) => v + slump.pelvis[i]);
      pose.legFlex = Math.max(pose.legFlex, slump.legFlex);
    }
    // extra: caller-supplied rotations (first person uses them for the neutral spread and the sprint arm pump)
    if (Array.isArray(motion.extra)) pose.rotations.push(...motion.extra);
    // a landing's flex, plus any crouch asked for (a flourish gathering itself): the feet stay planted either way
    const landFlex = pose.legFlex + (Number.isFinite(motion.crouch) ? Math.max(0, motion.crouch) : 0);
    const airFlex = Number.isFinite(motion.airFlex) ? Math.max(0, motion.airFlex) : 0;
    const solve = typeof motion.solve === 'function' ? motion.solve : null;
    if (!pose.rotations.length && landFlex + airFlex < 1e-4 && Math.hypot(...pose.pelvis) < 1e-5 && !solve && !motion.death) return;

    this.root.updateMatrixWorld(true);
    _rootInv.copy(this.root.matrixWorld).invert();
    this.root.getWorldQuaternion(_rootQuatInv).invert();
    const pelvisBone = this.bone('pelvis');

    // Legs first. A landing lowers the pelvis by exactly what the bend lifted the feet, so they stay planted;
    // the airborne tuck lets the feet rise instead.
    const flex = landFlex + airFlex;
    if (flex > 1e-4 && pelvisBone) {
      // A moving crouch can swap support legs. Comparing each ankle's lift and taking the maximum
      // lowers the opposite boot into the floor. Preserve the lowest actual sole across the whole pose.
      // Keep the existing landing and airborne behavior, including ultimate action poses, unchanged.
      const movingCrouch = landFlex > 0 && motion.crouch > 1e-4 && airFlex < 1e-4
        && GAIT_CLIPS.has(this.activeClip) && this.soles.size === 2;
      const height = (foot) => movingCrouch ? this.#soleY(foot) : this.#rootY(this.bone(foot));
      const before = LEG_CHAINS.map(([, , foot]) => height(foot));
      for (const [thigh, shin, foot] of LEG_CHAINS) {
        // hips flex (knee forward), the knee bends twice as far back, the foot stays flat
        this.#rotateInRootSpace(this.bone(thigh), [1, 0, 0], flex);
        this.#rotateInRootSpace(this.bone(shin), [1, 0, 0], -2 * flex);
        this.#rotateInRootSpace(this.bone(foot), [1, 0, 0], flex);
      }
      const after = LEG_CHAINS.map(([, , foot]) => height(foot));
      const offset = movingCrouch ? soleContactOffset(before, after)
        : -Math.max(...after.map((y, i) => y - before[i])) * (landFlex / flex);
      if (Number.isFinite(offset) && landFlex > 1e-4) this.#offsetInRootSpace(pelvisBone, [0, offset, 0]);
    }

    for (const { bone, axis, angle, space } of pose.rotations) {
      if (space === 'local') this.#rotateLocal(this.bone(bone), axis, angle);
      else this.#rotateInRootSpace(this.bone(bone), axis, angle);
    }
    if (pelvisBone && Math.hypot(...pose.pelvis) > 1e-5) this.#offsetInRootSpace(pelvisBone, pose.pelvis);
    if (motion.death) this.#lieDown(motion.death.age);
    // last, a solver that places bones by where they should end up (reads the pose everything above has made)
    solve?.(this.boneApi);
  }

  // the rest of a death's fall (spellbladeMotion.deathRest): the knees give and the body comes down onto the ground
  // rather than kicking its feet up; the whole body turns about the heels until the trunk lies level, the arms drop
  // to the ground beside it, and its lowest part rests on the ground (never through it, never floating once down)
  #lieDown(age) {
    const rest = deathRest(age);
    const grounded = Math.max(rest, clamp01((age - DEATH_REST.buckle) / DEATH_REST.buckleSeconds));
    if (!(grounded > 1e-4)) return;
    const pelvis = this.bone('pelvis');
    const skeleton = pelvis?.parent;
    if (!skeleton?.isBone || !skeleton.parent) return;
    const at = (name) => {
      const bone = this.bone(name);
      return bone ? new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld).applyMatrix4(_rootInv) : null;
    };
    const hips = at('pelvis');
    const head = at('head');
    if (!hips || !head) return;
    const across = Math.hypot(head.x - hips.x, head.z - hips.z);
    // about the axis across the fall (up × the way it goes over)
    const axis = across > 1e-3 ? [(head.z - hips.z) / across, 0, -(head.x - hips.x) / across] : null;
    if (rest > 1e-4 && axis) {
      // how far the trunk still slants up from the hips to the head: turned that far, about the heels
      const slant = Math.atan2(head.y - hips.y, across);
      if (slant > 0) {
        const heels = () => {
          const l = at('foot.L');
          const r = at('foot.R');
          return l && r ? l.add(r).multiplyScalar(0.5) : at('pelvis').setY(0);
        };
        const before = heels();
        this.#rotateInRootSpace(skeleton, axis, slant * Math.min(1, rest));
        const after = heels();
        this.#offsetInRootSpace(skeleton, [before.x - after.x, before.y - after.y, before.z - after.z]);
      }
    }
    // resting: lowered onto its lowest part as he comes down (the trunk and legs: the arms follow it down after)
    const settleOn = (names, lowerBy) => {
      let lift = -Infinity;
      for (const name of names) {
        const point = at(name);
        if (point) lift = Math.max(lift, DEATH_REST.clearance[name] - point.y);
      }
      if (!Number.isFinite(lift)) return;
      const settle = Math.max(0, lift) + Math.min(0, lift) * lowerBy;
      if (Math.abs(settle) > 1e-5) this.#offsetInRootSpace(skeleton, [0, settle, 0]);
    };
    settleOn(['pelvis', 'chest', 'head', 'foot.L', 'foot.R'], Math.min(1, grounded));
    if (rest > 1e-4 && axis) {
      // the arms go down with him: each swung about the shoulder, the short way, until the hand is on the ground
      for (const side of ['L', 'R']) {
        const shoulder = at(`upper_arm.${side}`);
        const hand = at(`hand.${side}`);
        if (!shoulder || !hand) continue;
        const turn = swingDown(shoulder, hand, axis, DEATH_REST.clearance[`hand.${side}`]);
        if (Math.abs(turn) > 1e-3) this.#rotateInRootSpace(this.bone(`upper_arm.${side}`), axis, turn * Math.min(1, rest));
      }
    }
    // and nothing left in the ground
    settleOn(Object.keys(DEATH_REST.clearance), 0);
  }

  #soleY(name) {
    const bone = this.bone(name);
    _m.multiplyMatrices(_rootInv, bone.matrixWorld);
    let low = Infinity;
    for (const point of this.soles.get(name) ?? []) low = Math.min(low, _v.copy(point).applyMatrix4(_m).y);
    return low;
  }

  #rootY(bone) {
    if (!bone) return 0;
    _v.setFromMatrixPosition(bone.matrixWorld).applyMatrix4(_rootInv);
    return _v.y;
  }

  // move a bone by a root-space offset (metres), converted into its parent's space
  #offsetInRootSpace(bone, offset) {
    if (!bone?.parent) return;
    this.#touch(bone);
    _m.multiplyMatrices(_rootInv, bone.parent.matrixWorld).invert();
    _origin.set(0, 0, 0).applyMatrix4(_m);
    _v.set(offset[0], offset[1], offset[2]).applyMatrix4(_m).sub(_origin);
    bone.position.add(_v);
    bone.updateMatrixWorld(true);
  }

  dispose() {
    this.#restoreTouched();
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    this.actions.clear();
    this.activeAction = null;
    this.activeClip = null;
    this.fading = [];
  }
}
