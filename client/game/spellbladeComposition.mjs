import * as THREE from 'three';
import { ownershipBlendSeconds, transitionResidual } from './chivalryMotion.mjs';

export const COMPOSITION_BLEND_SEC = 0.1;

// Each authored track has exactly one owner. No whole-body clips compete for an arm.
export function spellbladeBoneOwner(name) {
  const bone = name.replace(/[.]/g, '');
  if (/^(upper_arm|forearm|hand|finger|thumb).*R$/.test(bone) || bone === 'socket_sword') return 'sword';
  if (/^(upper_arm|forearm|hand|finger|thumb).*L$/.test(bone) || bone === 'socket_sorcery') return 'sorcery';
  if (/^(spine|chest|neck|head|clavicle)/.test(bone)) return 'posture';
  return 'locomotion';
}

function valueOf(bone, property) { return bone[property].clone(); }
function difference(from, to, property) {
  if (property !== 'quaternion') return from.clone().sub(to);
  const q = from.clone().multiply(to.clone().invert()).normalize();
  if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
  const length = Math.hypot(q.x, q.y, q.z);
  return length < 1e-8 ? new THREE.Vector3() : new THREE.Vector3(q.x, q.y, q.z).multiplyScalar(2 * Math.atan2(length, q.w) / length);
}
function corrected(target, property, offset) {
  if (property !== 'quaternion') return target.add(offset);
  const angle = offset.length();
  if (angle > 1e-8) target.premultiply(new THREE.Quaternion().setFromAxisAngle(offset.multiplyScalar(1 / angle), angle));
  return target.normalize();
}
function clipTime(clip, plan, advance = 0) {
  let time = Number.isFinite(plan.time) ? plan.time : 0;
  if (plan.normalized) time *= clip.duration;
  time += advance;
  return plan.loop ? ((time % clip.duration) + clip.duration) % clip.duration : Math.max(0, Math.min(clip.duration, time));
}

/** Samples authored tracks at supplied clocks, with independent action and recovery handovers. */
export class SpellbladeComposition {
  constructor(root, clips) {
    this.root = root;
    this.clips = new Map();
    this.channels = new Map();
    for (const clip of clips) {
      const tracks = [];
      for (const track of clip.tracks) {
        const path = THREE.PropertyBinding.parseTrackName(track.name);
        const bone = THREE.PropertyBinding.findNode(root, path.nodeName);
        if (!bone || !['quaternion', 'position', 'scale'].includes(path.propertyName)) continue;
        tracks.push({ bone, property: path.propertyName, owner: spellbladeBoneOwner(bone.name), sample: track.createInterpolant() });
      }
      this.clips.set(clip.name, { duration: clip.duration, tracks });
    }
  }

  begin() { this.channels.clear(); this.out = null; }

  apply(layers, dt) {
    const step = Math.max(0, dt);
    for (let [owner, plan] of Object.entries(layers)) {
      const own = this.clips.get(plan.clip);
      const clip = own ?? this.clips.get(plan.fallback);
      if (!clip) continue;
      // (a fallback clip is shown at its own frame, when the plan names one)
      if (!own && Number.isFinite(plan.fallbackTime)) plan = { ...plan, time: plan.fallbackTime };
      const signature = `${plan.clip}:${plan.actionKey ?? ''}`;
      let channel = this.channels.get(owner);
      if (!channel || channel.signature !== signature) {
        const outgoing = channel;
        channel = { signature, clip: plan.clip, duration: Number.isFinite(plan.blend) && outgoing && (!plan.blendFrom || plan.blendFrom === outgoing.clip) ? plan.blend : ownershipBlendSeconds(outgoing?.clip, plan.clip), elapsed: 0,
          corrections: new Map(), history: new Map(), incomingVelocity: outgoing?.history ?? new Map() };
        this.channels.set(owner, channel);
      }
      const overlay = plan.overlay;
      const overlayClip = overlay ? this.clips.get(overlay.clip) : null;
      if (overlayClip) channel.overlay = { ...overlay, clip: overlayClip };
      const wantedOverlay = overlayClip ? Math.max(0, Math.min(1, overlay.weight ?? 0)) : 0;
      channel.overlayWeight ??= 0;
      channel.overlayWeight += (wantedOverlay - channel.overlayWeight) * (1 - Math.exp(-step / 0.045));
      const time = clipTime(clip, plan);
      for (const track of clip.tracks) {
        if (track.owner !== owner) continue;
        const key = track.bone.uuid + track.property;
        const target = valueOf(track.bone, track.property).fromArray(track.sample.evaluate(time));
        if (channel.overlay && channel.overlayWeight > 0.001) {
          const other = channel.overlay.clip.tracks.find(candidate => candidate.bone === track.bone && candidate.property === track.property);
          if (other) {
            const sampled = valueOf(track.bone, track.property).fromArray(other.sample.evaluate(clipTime(channel.overlay.clip, channel.overlay)));
            if (track.property === 'quaternion') target.slerp(sampled, channel.overlayWeight);
            else target.lerp(sampled, channel.overlayWeight);
          }
        }
        if (!channel.corrections.has(key)) {
          const from = valueOf(track.bone, track.property);
          const future = valueOf(track.bone, track.property).fromArray(track.sample.evaluate(clipTime(clip, plan, 1 / 240)));
          const incoming = difference(future, target, track.property).multiplyScalar(240);
          const outgoing = channel.incomingVelocity.get(key)?.velocity ?? new THREE.Vector3();
          const velocity = outgoing.clone().sub(incoming);
          velocity.clampLength(0, track.property === 'quaternion' ? 18 : 3);
          channel.corrections.set(key, { offset: difference(from, target, track.property), velocity });
        }
        const correction = channel.corrections.get(key);
        const elapsed = channel.elapsed + step;
        const offset = correction.offset.clone();
        for (const axis of ['x', 'y', 'z']) offset[axis] = transitionResidual(correction.offset[axis], correction.velocity[axis], elapsed, channel.duration);
        corrected(target, track.property, offset);
        const previous = channel.history.get(key);
        const velocity = step > 0 && previous ? difference(target, previous.value, track.property).multiplyScalar(1 / step)
          : previous?.velocity ?? channel.incomingVelocity.get(key)?.velocity ?? new THREE.Vector3();
        channel.history.set(key, { value: target.clone(), velocity });
        track.bone[track.property].copy(target);
      }
      channel.elapsed += step;
    }
    this.root.updateMatrixWorld(true);
  }

  /**
   * Hand the pose on screen over to whatever plays next, its difference dying away over `duration` seconds.
   * space 'model': the turns die away in the model's own space, parent before child (each bone's shown orientation
   * goes the short way from where it was to where the clip has it), not bone by bone in each one's own frame. For a
   * hand-over where neighbouring bones trade a large roll between them (Candidate v3's Riposte rolls the forearm about
   * half a turn from every ordinary clip and the hand back again): eased each in its own frame the two turns did not
   * cancel, and the sword between them wobbled through the hand-over.
   */
  release(duration = 0.2, { space = 'local' } = {}) {
    this.out = { elapsed: 0, duration, space, bones: new Map(), base: new Map(), corrections: new Map(), history: new Map() };
    for (const channel of this.channels.values()) for (const [key, value] of channel.history) this.out.history.set(key, value);
    this.root.traverse((bone) => {
      if (bone.isBone) this.out.bones.set(bone, { quaternion: bone.quaternion.clone(), position: bone.position.clone(), scale: bone.scale.clone() });
    });
    if (space === 'model') {
      // each bone's orientation in the model then (the bones are visited parent first)
      this.out.fromWorld = new Map();
      for (const [bone, from] of this.out.bones) this.out.fromWorld.set(bone, this.#parentTurn(bone, this.out.fromWorld).multiply(from.quaternion));
      this.out.offsets = new Map();
    }
    this.channels.clear();
  }

  // a bone's parent's orientation in the model: from `known` (bones already worked out), else its chain up to the root
  #parentTurn(bone, known) {
    const parent = bone.parent;
    if (known.has(parent)) return known.get(parent).clone();
    const turn = new THREE.Quaternion();
    for (let node = parent; node && node !== this.root; node = node.parent) turn.premultiply(node.quaternion);
    return turn;
  }

  #blendOutModel(step) {
    const out = this.out;
    out.elapsed += step;
    const u = Math.min(1, out.elapsed / out.duration), keep = 1 - 3 * u * u + 2 * u * u * u;
    const target = new Map(), shown = new Map(), identity = new THREE.Quaternion();
    for (const [bone, from] of out.bones) {
      out.base.set(bone, { quaternion: bone.quaternion.clone(), position: bone.position.clone(), scale: bone.scale.clone() });
      const there = this.#parentTurn(bone, target).multiply(bone.quaternion);
      let offset = out.offsets.get(bone);
      if (!offset) {
        offset = { turn: out.fromWorld.get(bone).clone().multiply(there.clone().invert()).normalize(), position: from.position.clone().sub(bone.position) };
        if (offset.turn.w < 0) offset.turn.set(-offset.turn.x, -offset.turn.y, -offset.turn.z, -offset.turn.w);
        out.offsets.set(bone, offset);
      }
      const here = identity.clone().slerp(offset.turn, keep).multiply(there);
      target.set(bone, there);
      shown.set(bone, here);
      bone.quaternion.copy(this.#parentTurn(bone, shown).invert().multiply(here));
      bone.position.addScaledVector(offset.position, keep);
    }
    if (u >= 1) this.out = null;
  }

  restoreBase() {
    if (!this.out) return;
    for (const [bone, values] of this.out.base) for (const property of ['quaternion', 'position', 'scale']) bone[property].copy(values[property]);
  }

  blendOut(dt) {
    if (!this.out) return;
    const step = Math.max(0, dt);
    if (this.out.space === 'model') { this.#blendOutModel(step); return; }
    this.out.elapsed += step;
    for (const [bone, from] of this.out.bones) {
      this.out.base.set(bone, { quaternion: bone.quaternion.clone(), position: bone.position.clone(), scale: bone.scale.clone() });
      for (const property of ['quaternion', 'position', 'scale']) {
        const key = bone.uuid + property;
        const target = valueOf(bone, property);
        let correction = this.out.corrections.get(key);
        if (!correction) {
          correction = { offset: difference(from[property], target, property),
            velocity: this.out.history.get(key)?.velocity?.clone() ?? new THREE.Vector3(), target: target.clone(), pending: true };
          this.out.corrections.set(key, correction);
        } else if (step > 0 && correction.pending) {
          correction.velocity.sub(difference(target, correction.target, property).multiplyScalar(1 / step));
          correction.velocity.clampLength(0, property === 'quaternion' ? 18 : 3);
          correction.pending = false;
        }
        const offset = correction.offset.clone();
        for (const axis of ['x', 'y', 'z']) offset[axis] = transitionResidual(correction.offset[axis], correction.velocity[axis], this.out.elapsed, this.out.duration);
        bone[property].copy(corrected(target, property, offset));
      }
    }
    if (this.out.elapsed >= this.out.duration) this.out = null;
  }
}
