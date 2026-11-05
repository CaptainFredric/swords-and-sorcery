import * as THREE from 'three';
import {FlightRiderPose} from './FlightRiderPose.mjs';
import {RamOperatorPose} from './RamOperatorPose.mjs';
import { BiByeOperatorPose } from './BiByeOperatorPose.mjs';
import { SpellbladeComposition } from './spellbladeComposition.mjs';
import { BODY_GROUND_CLEARANCE, bodyGroundLift, bootSide, soleContactOffset } from './spellbladeContact.mjs';
import { COPS, COP_SHARE, pauldronFollow } from './pauldronFollow.mjs';
import { MountedSwordArm } from './mountedSwordArm.mjs';
import { GESTURE_ARMS, PALM_REACH } from './spellbladeGestures.mjs';
import { solveArm } from './swordArmIK.mjs';
import { SPELL_HAND } from './spellHand.mjs';
import { SpellbladeClothRig } from './SpellbladeClothRig.mjs';
import { ClothGridRig, hasClothGrids } from './ClothGridRig.mjs';
import { blendProgressFor, blendSeconds, blendWeights } from './spellbladeBlend.mjs';
import { DEATH_REST, GAIT_CLIPS, deathRest, deathSlump, gaitTime, nonlethalRecovery, reactionPose } from './spellbladeMotion.mjs';

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
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

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
// a hammer fist on a casing: the wrist's first goal this far above the surface (metres; about how far the gauntlet
// reaches below its wrist, aimed down and forward); the fist's own lowest plate then sets it exactly (#fistLowest)
const STRIKE_HEEL = 0.185;

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
    // (a model with cloth grids gets cloth; one with the older two-bone chains, their springs)
    this.cloth = cloth ? (hasClothGrids(root) ? new ClothGridRig(root) : new SpellbladeClothRig(root)) : null;
    // (the pauldrons' bones and their rest turns, read as the model loads: at its rest)
    this.pauldrons = [];
    this.actions = new Map();
    this.composition = new SpellbladeComposition(root, clips);
    this.composing = false;
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
    for (const side of ['L', 'R']) {
      const plate = this.bones.get(`pauldron${side}`);
      const arm = this.bones.get(`upper_arm${side}`);
      if (plate && arm) this.pauldrons.push({ plate, arm, rest: plate.quaternion.clone() });
    }
    // and each joint's cop, half way with its limb (a model without them has none)
    for (const [cop, limb] of COPS) {
      const plate = this.bones.get(cop);
      const arm = this.bones.get(limb);
      if (plate && arm) this.pauldrons.push({ plate, arm, rest: plate.quaternion.clone(), share: () => COP_SHARE });
    }
    // the finger lames' rest turns (the modelled cup), read as the model loads
    this.fingerRest = new Map();
    for (const [name, bone] of this.bones) if (/^(finger_|thumb_)/.test(name)) this.fingerRest.set(bone, bone.quaternion.clone());
    // the helmet's rest turn in root space, read as the model loads: a gesture's hand placed from the head (shading the
    // eyes) turns with the head from it
    root.updateMatrixWorld(true);
    this.headRest = this.bone('head') ? this.bone('head').getWorldQuaternion(new THREE.Quaternion()).premultiply(root.getWorldQuaternion(new THREE.Quaternion()).invert()) : null;
    // (and the chest's: a hand placed from the chest, brushing the breastplate, stays on it however he leans)
    this.chestRest = this.bone('chest') ? this.bone('chest').getWorldQuaternion(new THREE.Quaternion()).premultiply(root.getWorldQuaternion(new THREE.Quaternion()).invert()) : null;
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
    this.siege = new BiByeOperatorPose(root,this.bones);
    this.flightRider=new FlightRiderPose(root,this.bones,this.siege,this.soles);
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
    // the character layer (spellbladeSecondary + spellbladeGestures): set for each frame by setCharacter, applied over
    // whatever pose ran last (on foot, or a machine's), its own changes undone at the start of the next frame
    this.character = null;
    this.characterSaved = new Map();
    this.characterApi = {
      ...this.boneApi,
      rotate: (name, axis, angle) => this.#rotateInRootSpace(this.bone(name), axis, angle, this.characterSaved),
      shift: (name, offset) => this.#offsetInRootSpace(this.bone(name), offset, this.characterSaved),
    };
  }

  /**
   * This frame's character layer: { turns (root-space turns: the body's weight, momentum and a machine's recoil),
   * gestures (spellbladeGestures poses, any number, each already weighted region by region) }, or null. Applied last,
   * so it never changes what a clip, a solver or a machine's pose decided: it only adds to it.
   */
  setCharacter(layer) {
    this.character = layer ?? null;
  }

  #restoreCharacter() {
    for (const [bone, saved] of this.characterSaved) {
      bone.quaternion.copy(saved.q);
      bone.position.copy(saved.p);
    }
    this.characterSaved.clear();
  }

  // each hand where a machine's pose put it (root space): its wrist, which way its fingers and palm lie, and which way
  // its elbow hangs, so the hand can be put back on its control after the body moves under it
  #handPins() {
    const api = this.characterApi;
    const pins = {};
    for (const side of ['L', 'R']) {
      const chain = GESTURE_ARMS[side];
      if (!this.bone(chain.wrist)) continue;
      const S = api.position(chain.shoulder);
      const E = api.position(chain.elbow);
      const W = api.position(chain.wrist);
      const line = unit(W.map((v, i) => v - S[i]));
      const out = E.map((v, i) => v - S[i]);
      const along = dot(out, line);
      pins[side] = {
        wrist: W, aim: api.direction(chain.grip, chain.aim), roll: api.direction(chain.grip, chain.roll),
        pole: unit(out.map((v, i) => v - line[i] * along)),
      };
    }
    return pins;
  }

  /**
   * Apply the character layer. pinned: the hands are on a machine's controls (handPins taken before the layer), and
   * stay there as the trunk moves (the arms take it at the elbows), unless a gesture takes one off. casing: where on
   * the machine a fist may come down (world), for a strike.
   */
  #applyCharacter({ pinned = false, casing = null } = {}) {
    const layer = this.character;
    const gestures = (layer?.gestures ?? []).filter((g) => g && g.weight > 1e-3);
    const turns = layer?.turns ?? [];
    if (!turns.length && !gestures.length) return;
    this.root.updateMatrixWorld(true);
    _rootInv.copy(this.root.matrixWorld).invert();
    this.root.getWorldQuaternion(_rootQuatInv).invert();
    const api = this.characterApi;
    const pins = pinned ? this.#handPins() : null;
    for (const { bone, axis, angle } of turns) api.rotate(bone, axis, angle);
    for (const g of gestures) for (const { bone, axis, angle } of g.turns ?? []) api.rotate(bone, axis, angle * g.weight);
    // the hands back on their controls
    if (pins) {
      for (const [side, pin] of Object.entries(pins)) {
        solveArm(api, { ...GESTURE_ARMS[side], pole: pin.pole }, { wrist: pin.wrist, aim: pin.aim, roll: pin.roll }, 1);
      }
    }
    for (const g of gestures) {
      const w = g.weight;
      if (g.legs) this.#liftLegs(g.legs, w);
      if (g.hand) {
        // the palm's centre where the gesture puts it (from the head, or the chest), the wrist a hand's length back
        // along the fingers (in that bone's own frame, when it asks: the hand turns with the helmet as it scans, and
        // with the chest as he leans, so a brush stays on the breastplate at a run)
        const fromChest = g.hand.frame === 'chest';
        const turn = fromChest ? this.#chestTurn() : g.hand.frame === 'head' ? this.#headTurn() : null;
        const along = (v) => (turn ? _v.set(v[0], v[1], v[2]).applyQuaternion(turn).toArray() : v);
        const { side } = g.hand;
        const at = along(g.hand.at);
        const fingers = unit(along(g.hand.aim));
        const palm = unit(along(g.hand.palm));
        const origin = api.position(fromChest ? 'chest' : 'head');
        const centre = [origin[0] + at[0], origin[1] + at[1], origin[2] + at[2]];
        const wrist = centre.map((v, i) => v - fingers[i] * PALM_REACH);
        solveArm(api, pins?.[side] ? { ...GESTURE_ARMS[side], pole: pins[side].pole } : GESTURE_ARMS[side], { wrist, aim: fingers, roll: palm }, w);
        if (g.hand.open) this.#flattenHand(side, w);
      }
      if (g.strike && casing) {
        // the fist off what it holds, up, and down onto the machine's casing: its heel (the little finger's side) on
        // the surface, the wrist just above and behind it, the palm turned in
        const { side, reach = 0, lift = 0 } = g.strike;
        const chain = pins?.[side] ? { ...GESTURE_ARMS[side], pole: pins[side].pole } : GESTURE_ARMS[side];
        const from = api.position(chain.wrist);
        const onto = _v.set(casing.x, casing.y, casing.z).applyMatrix4(_rootInv).toArray();
        const wristOn = [onto[0] + (side === 'R' ? 0.02 : -0.02), onto[1] + STRIKE_HEEL, onto[2] + 0.035];
        const goal = from.map((v, i) => v + (wristOn[i] - v) * reach + (i === 1 ? lift : 0));
        const aimNow = api.direction(chain.grip, chain.aim);
        const rollNow = api.direction(chain.grip, chain.roll);
        const hammer = { aim: [0, -0.55, -0.83], roll: [side === 'R' ? -1 : 1, 0, 0] };
        const mix = (a, b) => unit(a.map((v, i) => v + (b[i] - v) * reach));
        const target = { wrist: goal, aim: mix(aimNow, hammer.aim), roll: mix(rollNow, hammer.roll) };
        solveArm(api, chain, target, w);
        // then the fist's own lowest plate put on the casing (lift above it), whatever angle the arm meets it at: the
        // wrist's goal moved by what is left, and solved again (only near full weight, where the blow lands)
        if (w > 0.98 && reach > 0.5) {
          const low = this.#fistLowest(side);
          if (low !== null) {
            const short = (onto[1] + lift * reach) - low;
            if (Math.abs(short) > 0.002) solveArm(api, chain, { ...target, wrist: goal.map((v, i) => (i === 1 ? v + short * reach : v)) }, 1);
          }
        }
      }
    }
    this.#followPauldrons();
  }

  // the lowest point of a fist (root space y), from its gauntlet's own surface: the hand's and fingers' plates, and the
  // cuff on the forearm just behind them (in a downward blow its rim can be lowest), each read once into its own bone's
  // frame (the fist they are in when first asked) and carried with that bone from then on
  #fistLowest(side) {
    const hand = this.bone(`hand.${side}`);
    const forearm = this.bone(`forearm.${side}`);
    if (!hand || !forearm) return null;
    if (!this.fistPoints?.[side]) {
      let mesh = null;
      this.root.traverse((o) => { if (o.isSkinnedMesh && o.name === `Gauntlet${side}`) mesh = o; });
      if (!mesh) return null;
      const bones = mesh.skeleton.bones;
      const skin = mesh.geometry.attributes.skinIndex;
      const weight = mesh.geometry.attributes.skinWeight;
      const toHand = hand.matrixWorld.clone().invert();
      const toForearm = forearm.matrixWorld.clone().invert();
      const wrist = hand.getWorldPosition(new THREE.Vector3());
      const sets = { hand: [], forearm: [] };
      for (let i = 0; i < skin.count; i += 1) {
        let best = 0;
        let most = -1;
        for (let k = 0; k < 4; k += 1) if (weight.getComponent(i, k) > most) { most = weight.getComponent(i, k); best = skin.getComponent(i, k); }
        const name = bones[best]?.name ?? '';
        if (/^(hand|finger|thumb)/.test(name)) {
          if (i % 3) continue;
          mesh.getVertexPosition(i, _s).applyMatrix4(mesh.matrixWorld);
          sets.hand.push(_s.clone().applyMatrix4(toHand));
        } else if (/^forearm/.test(name)) {
          // (the cuff and the vambrace's end: all of the forearm within a hand's length of the wrist)
          mesh.getVertexPosition(i, _s).applyMatrix4(mesh.matrixWorld);
          if (_s.distanceTo(wrist) < 0.2) sets.forearm.push(_s.clone().applyMatrix4(toForearm));
        }
      }
      (this.fistPoints ??= {})[side] = [[hand, sets.hand], [forearm, sets.forearm]];
    }
    let low = Infinity;
    for (const [bone, points] of this.fistPoints[side]) {
      bone.updateMatrixWorld(true);
      _m.multiplyMatrices(_rootInv, bone.matrixWorld);
      for (const p of points) low = Math.min(low, _v.copy(p).applyMatrix4(_m).y);
    }
    return Number.isFinite(low) ? low : null;
  }

  // how far the helmet has turned from its rest, in root space (this frame's pose and turns)
  #headTurn() {
    const head = this.bone('head');
    if (!head || !this.headRest) return null;
    head.getWorldQuaternion(_q).premultiply(_rootQuatInv);
    return _q.multiply(_bq.copy(this.headRest).invert()).clone();
  }

  // the chest's turn from its rest, in root space
  #chestTurn() {
    const chest = this.bone('chest');
    if (!chest || !this.chestRest) return null;
    chest.getWorldQuaternion(_q).premultiply(_rootQuatInv);
    return _q.multiply(_bq.copy(this.chestRest).invert()).clone();
  }

  // a hand's fingers straightened out of whatever curl they hold (each lame's own x turn is its curl: rodin/hands.py),
  // toward SPELL_HAND.open, by `w`
  #flattenHand(side, w) {
    const joints = [...SPELL_HAND.fingers.map((f) => [`finger_${f}_`, 'finger']), ['thumb_', 'thumb']];
    for (const [prefix, kind] of joints) {
      for (let k = 0; k < 3; k += 1) {
        const bone = this.bone(`${prefix}${k + 1}.${side}`);
        if (!bone) continue;
        // (the curl about x now, from the bone's own rest: unwound to the open hand's)
        const rest = this.fingerRest?.get(bone) ?? null;
        if (!rest) continue;
        _q.copy(rest).invert().multiply(bone.quaternion);
        const curl = 2 * Math.atan2(_q.x, _q.w);
        const want = SPELL_HAND.open[kind][k];
        this.#rotateLocal(bone, [1, 0, 0], (want - curl) * w, this.characterSaved);
      }
    }
  }

  // the flight L-sit: each leg straightened by `lift` of its bend and laid along its `dir` (root space), then its knee
  // bent `knee` radians about its own hinge (a kick)
  #liftLegs({ lift = 0, dir = {}, knee = {} }, w) {
    const api = this.characterApi;
    const share = Math.max(0, Math.min(1, lift * w));
    if (share < 1e-3) return;
    for (const side of ['L', 'R']) {
      const top = api.position(`thigh.${side}`);
      const middle = api.position(`shin.${side}`);
      const bottom = api.position(`foot.${side}`);
      const upper = middle.map((v, i) => v - top[i]);
      const lower = bottom.map((v, i) => v - middle[i]);
      const hinge = cross(upper, lower);
      const bend = Math.acos(Math.max(-1, Math.min(1, dot(unit(upper), unit(lower)))));
      if (Math.hypot(...hinge) > 1e-6 && bend > 1e-3) api.rotate(`shin.${side}`, unit(hinge), -bend * share);
      const want = dir[side];
      if (want) {
        const foot = api.position(`foot.${side}`);
        const now = unit(foot.map((v, i) => v - top[i]));
        const goal = unit(now.map((v, i) => v + (unit(want)[i] - v) * share));
        const axis = cross(now, goal);
        const angle = Math.acos(Math.max(-1, Math.min(1, dot(now, goal))));
        if (Math.hypot(...axis) > 1e-6 && angle > 1e-4) api.rotate(`thigh.${side}`, unit(axis), angle);
      }
      // (the shin's own -x is its bend: rodin/rigid.py's knees)
      if (knee[side]) api.rotate(`shin.${side}`, api.direction(`shin.${side}`, [-1, 0, 0]), knee[side] * share);
    }
  }

  #followPauldrons() {
    for (const { plate, arm, rest, share = pauldronFollow } of this.pauldrons) {
      // (they share a rest: how far the arm has turned from it)
      const turn = THREE.MathUtils.radToDeg(2 * Math.acos(Math.min(1, Math.abs(rest.dot(arm.quaternion)))));
      plate.quaternion.copy(rest).slerp(arm.quaternion, share(turn));
      plate.position.copy(arm.position);
    }
  }

  bone(name) {
    return this.bones.get(sanitize(name)) ?? this.bones.get(name) ?? null;
  }

  has(clip) {
    return this.actions.has(clip);
  }

  apply(plan, dt = 0) {
    // (the character layer's changes first: it was applied last)
    this.#restoreCharacter();
    this.flightRider.restore();
    this.restoreRamArms();if(!plan?.ramMounted)this.siege.releaseStanding();
    if(plan?.mounted){
      if(!this.siege.active)this.reset();
      this.siege.apply();this.onPose?.(plan);return true;
    }
    this.releaseMounted();
    const step = Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0;
    if (plan?.layers) {
      this.#restoreTouched();
      if (!this.composing) {
        this.composition.begin();
        // Stop full-body bindings before applying their individually owned tracks.
        const held = new Map();
        for (const bone of this.bones.values()) held.set(bone, { q: bone.quaternion.clone(), p: bone.position.clone(), s: bone.scale.clone() });
        this.mixer.stopAllAction();
        for (const [bone, value] of held) { bone.quaternion.copy(value.q); bone.position.copy(value.p); bone.scale.copy(value.s); }
        this.activeAction = null;
        this.fading = [];
        this.composing = true;
      }
      const layers = { ...plan.layers };
      const locomotion = layers.locomotion;
      if (locomotion?.loop && GAIT_CLIPS.has(locomotion.clip)) {
        const clip = this.actions.get(locomotion.clip)?.getClip() ?? this.actions.get(locomotion.fallback)?.getClip();
        if (clip) {
          this.gaitPhase = (this.gaitPhase + step * (locomotion.rate ?? 1) / Math.max(0.05, clip.duration)) % 1;
          layers.locomotion = { ...locomotion, time: gaitTime(this.gaitPhase, clip.duration), normalized: false };
          if (layers.posture?.overlay?.clip === locomotion.clip) {
            layers.posture = { ...layers.posture, overlay: { ...layers.posture.overlay, time: layers.locomotion.time, normalized: false } };
          }
        }
      }
      this.activeClip = locomotion?.clip ?? this.activeClip;
      this.composition.apply(layers, step);
      this.#applyProcedural(plan.motion);
      // (a machine's own pose applies it after its own, on the machine's path)
      if (!plan.ramMounted && !plan.flightMounted && !plan.mounted) this.#applyCharacter();
      this.#followPauldrons();
      this.cloth?.apply(step);
      this.onPose?.(plan);
      return true;
    }
    if (this.composing) {
      this.#restoreTouched();
      this.composition.release(['stagger', 'dead'].includes(plan?.state) || ['Stagger', 'Death'].includes(plan?.clip) ? 0.08 : 0.2);
      this.composing = false;
    }
    // The mixer may skip an unchanged binding. Restore its underlying sample before blending the exit again.
    this.composition.restoreBase();
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
    this.composition.blendOut(step);
    this.#applyProcedural(plan.motion);
    // (a machine's pose comes after this: its own apply* draws the character layer over it)
    // (a machine's own pose applies it after its own, on the machine's path)
      if (!plan.ramMounted && !plan.flightMounted && !plan.mounted) this.#applyCharacter();
    this.#followPauldrons();
    this.cloth?.apply(step);
    this.onPose?.(plan);
    return true;
  }

  applyMounted(machine,now,grips){this.siege.apply(machine,now,grips);this.#applyCharacter({pinned:true,casing:grips?.casing??null});}
  // combat: { attackAge, guarding, yawOffset } for the mounted sword arm (mountedSwordArm.mjs), which takes the sword
  // arm from the riding pose while a strike or the guard has it
  applyFightFlight(grips, priority = false, machine = null, now = 0, dt = 1/60, combat = null){
    this.flightRider.apply(grips,machine,now,priority,dt);
    this.mountedSword ??= new MountedSwordArm(this.root, this.boneApi);
    this.root.updateMatrixWorld(true);
    _rootInv.copy(this.root.matrixWorld).invert();
    this.root.getWorldQuaternion(_rootQuatInv).invert();
    this.mountedSword.apply(combat, now, dt);
    this.#applyCharacter({ pinned: true });
    this.#followPauldrons();
  }
  applyRam(station){
    this.ramArms=new Map([...this.bones.values()].map(b=>[b,{q:b.quaternion.clone(),p:b.position.clone()}]));
    this.ramPose??=new RamOperatorPose(this.root,this.bones,this.siege,this.soles);
    this.ramPose.apply(station);this.#applyCharacter({pinned:true,casing:station?.casing??null});this.#followPauldrons();
  }
  restoreRamArms(){for(const [b,t]of this.ramArms??[]){b.quaternion.copy(t.q);b.position.copy(t.p);}this.ramArms=null;}
  releaseRam(){this.restoreRamArms();this.siege.releaseStanding();}
  releaseMounted(){this.flightRider?.restore?.();if(this.siege.release())this.reset();}

  #clipOf(action) {
    for (const [name, candidate] of this.actions) if (candidate === action) return name;
    return null;
  }

  #touch(bone, into = this.touched) {
    if (!into.has(bone)) into.set(bone, { q: bone.quaternion.clone(), p: bone.position.clone() });
  }

  /** Fully reset all touched bones, compositional tracks, fading actions, and mixer channels to clean baseline. */
  reset() {
    this.#restoreCharacter();
    this.#restoreTouched();
    if (this.composing) {
      this.composition.release(0);
      this.composing = false;
    }
    for (const entry of this.fading) entry.action?.stop?.();
    this.fading = [];
    if (this.activeAction) {
      this.activeAction.stop();
      this.activeAction = null;
    }
    this.activeClip = null;
    this.activeBlend = { elapsed: 0, duration: 0 };
    this.gaitPhase = 0;
    this.mixer.stopAllAction();
    this.composition.restoreBase();
    this.cloth?.reset?.();
  }

  #restoreTouched() {
    for (const [bone, saved] of this.touched) {
      bone.quaternion.copy(saved.q);
      bone.position.copy(saved.p);
    }
    this.touched.clear();
  }

  // rotate a bone about an axis given in the character's root space, through the bone's own pivot
  #rotateInRootSpace(bone, axis, angle, into = this.touched) {
    if (!bone?.parent || Math.abs(angle) < 1e-5) return;
    _axis.set(axis[0], axis[1], axis[2]);
    if (_axis.lengthSq() < 1e-10) return;
    _axis.normalize();
    _m.multiplyMatrices(_rootInv, bone.parent.matrixWorld);
    _m.decompose(_v, _qp, _s);
    _qpInv.copy(_qp).invert();
    _q.setFromAxisAngle(_axis, angle);
    // local' = P^-1 * R * P * local
    this.#touch(bone, into);
    bone.quaternion.premultiply(_qp).premultiply(_q).premultiply(_qpInv);
    bone.updateMatrixWorld(true);
  }

  // rotate a bone about one of its own axes (a joint's own bend or twist, whatever the pose around it)
  #rotateLocal(bone, axis, angle, into = this.touched) {
    if (!bone || Math.abs(angle) < 1e-5) return;
    _axis.set(axis[0], axis[1], axis[2]);
    if (_axis.lengthSq() < 1e-10) return;
    this.#touch(bone, into);
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
    if (motion.recovery && !motion.death) {
      const recovering = nonlethalRecovery(motion.recovery.age, motion.recovery.duration, motion.recovery.hold ?? 0);
      pose.rotations.push(...recovering.rotations);
      pose.pelvis = pose.pelvis.map((v, i) => v + recovering.pelvis[i]);
      pose.legFlex = Math.max(pose.legFlex, recovering.legFlex);
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
      // A crouch can swap support legs as it moves, and standing it bends uneven legs unevenly: comparing each
      // ankle's lift and taking the maximum lowers the other boot into the floor (the supplied model's stance put a
      // standing crouch's boot 7 mm under). Preserve the lowest actual sole across the whole pose.
      // Keep the existing landing and airborne behavior, including ultimate action poses, unchanged.
      const soleCrouch = landFlex > 0 && motion.crouch > 1e-4 && airFlex < 1e-4 && this.soles.size === 2;
      const height = (foot) => soleCrouch ? this.#soleY(foot) : this.#rootY(this.bone(foot));
      const before = LEG_CHAINS.map(([, , foot]) => height(foot));
      for (const [thigh, shin, foot] of LEG_CHAINS) {
        // hips flex (knee forward), the knee bends twice as far back, the foot stays flat
        this.#rotateInRootSpace(this.bone(thigh), [1, 0, 0], flex);
        this.#rotateInRootSpace(this.bone(shin), [1, 0, 0], -2 * flex);
        this.#rotateInRootSpace(this.bone(foot), [1, 0, 0], flex);
      }
      const after = LEG_CHAINS.map(([, , foot]) => height(foot));
      const offset = soleCrouch ? soleContactOffset(before, after)
        : -Math.max(...after.map((y, i) => y - before[i])) * (landFlex / flex);
      if (Number.isFinite(offset) && landFlex > 1e-4) this.#offsetInRootSpace(pelvisBone, [0, offset, 0]);
    }

    for (const { bone, axis, angle, space } of pose.rotations) {
      if (space === 'local') this.#rotateLocal(this.bone(bone), axis, angle);
      else this.#rotateInRootSpace(this.bone(bone), axis, angle);
    }
    if (pelvisBone && Math.hypot(...pose.pelvis) > 1e-5) this.#offsetInRootSpace(pelvisBone, pose.pelvis);
    if (motion.death) this.#lieDown(motion.death.age);
    // Downed and dead poses put much more than a boot near the floor. After all authored rotations and pelvis motion,
    // lift the whole skeleton only if a sampled arm/leg/torso point has actually gone through the ground.
    if (motion.death || motion.recovery) this.#keepGroundedBodyClear();
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

  #keepGroundedBodyClear() {
    const pelvis = this.bone('pelvis');
    const skeleton = pelvis?.parent;
    if (!skeleton?.isBone) return;
    const samples = {};
    for (const name of Object.keys(BODY_GROUND_CLEARANCE)) {
      const bone = this.bone(name);
      if (!bone) continue;
      samples[name] = _v.setFromMatrixPosition(bone.matrixWorld).applyMatrix4(_rootInv).y;
    }
    const lift = bodyGroundLift(samples);
    if (lift > 1e-5) this.#offsetInRootSpace(skeleton, [0, lift, 0]);
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
  #offsetInRootSpace(bone, offset, into = this.touched) {
    if (!bone?.parent) return;
    this.#touch(bone, into);
    _m.multiplyMatrices(_rootInv, bone.parent.matrixWorld).invert();
    _origin.set(0, 0, 0).applyMatrix4(_m);
    _v.set(offset[0], offset[1], offset[2]).applyMatrix4(_m).sub(_origin);
    bone.position.add(_v);
    bone.updateMatrixWorld(true);
  }

  dispose() {
    this.siege.dispose();
    this.#restoreCharacter();
    this.#restoreTouched();
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    this.actions.clear();
    this.activeAction = null;
    this.activeClip = null;
    this.fading = [];
  }
}
