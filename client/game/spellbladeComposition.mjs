import * as THREE from 'three';
import { ownershipBlendSeconds } from './chivalryMotion.mjs';

export const COMPOSITION_BLEND_SEC = 0.1;

// Each authored track has exactly one owner. No whole-body clips compete for an arm.
export function spellbladeBoneOwner(name) {
  const bone = name.replace(/[.]/g, '');
  if (/^(upper_arm|forearm|hand|finger|thumb).*R$/.test(bone) || bone === 'socket_sword') return 'sword';
  if (/^(upper_arm|forearm|hand|finger|thumb).*L$/.test(bone) || bone === 'socket_sorcery') return 'sorcery';
  if (/^(spine|chest|neck|head|clavicle)/.test(bone)) return 'posture';
  return 'locomotion';
}

const smooth = (t) => t * t * (3 - 2 * t);
function valueOf(bone, property) { return bone[property].clone(); }
function blendValue(bone, property, from, to, amount) {
  if (property === 'quaternion') bone.quaternion.copy(from).slerp(to, amount);
  else bone[property].copy(from).lerp(to, amount);
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
    for (const [owner, plan] of Object.entries(layers)) {
      const clip = this.clips.get(plan.clip) ?? this.clips.get(plan.fallback);
      if (!clip) continue;
      const signature = `${plan.clip}:${plan.actionKey ?? ''}`;
      let channel = this.channels.get(owner);
      if (!channel || channel.signature !== signature) {
        channel = { signature, clip: plan.clip, duration: ownershipBlendSeconds(channel?.clip, plan.clip), elapsed: 0, from: new Map() };
        for (const track of clip.tracks) if (track.owner === owner) channel.from.set(track.bone.uuid + track.property, valueOf(track.bone, track.property));
        channel.overlayWeight = 0;
        this.channels.set(owner, channel);
      }
      channel.elapsed += dt;
      const overlay = plan.overlay;
      const overlayClip = overlay ? this.clips.get(overlay.clip) : null;
      // Keep sampling the outgoing Guard while its influence eases away during a continuing strike.
      if (overlayClip) channel.overlay = { ...overlay, clip: overlayClip };
      const wantedOverlay = overlayClip ? Math.max(0, Math.min(1, overlay.weight ?? 0)) : 0;
      channel.overlayWeight += (wantedOverlay - channel.overlayWeight) * (1 - Math.exp(-Math.max(0, dt) / 0.045));
      const weight = smooth(Math.min(1, channel.elapsed / channel.duration));
      let time = Number.isFinite(plan.time) ? plan.time : 0;
      if (plan.normalized) time *= clip.duration;
      if (plan.loop) time = ((time % clip.duration) + clip.duration) % clip.duration;
      else time = Math.max(0, Math.min(clip.duration, time));
      for (const track of clip.tracks) {
        if (track.owner !== owner) continue;
        const target = valueOf(track.bone, track.property).fromArray(track.sample.evaluate(time));
        if (channel.overlay && channel.overlayWeight > 0.001) {
          const other = channel.overlay.clip.tracks.find(candidate => candidate.bone === track.bone && candidate.property === track.property);
          if (other) {
            const sampled = valueOf(track.bone, track.property).fromArray(other.sample.evaluate(Math.max(0, Math.min(channel.overlay.clip.duration, channel.overlay.time ?? 0))));
            if (track.property === 'quaternion') target.slerp(sampled, channel.overlayWeight);
            else target.lerp(sampled, channel.overlayWeight);
          }
        }
        const from = channel.from.get(track.bone.uuid + track.property) ?? target;
        blendValue(track.bone, track.property, from, target, weight);
      }
    }
    this.root.updateMatrixWorld(true);
  }

  release(duration = 0.2) {
    this.out = { elapsed: 0, duration, bones: new Map() };
    this.root.traverse((bone) => {
      if (bone.isBone) this.out.bones.set(bone, { quaternion: bone.quaternion.clone(), position: bone.position.clone(), scale: bone.scale.clone() });
    });
    this.channels.clear();
  }

  blendOut(dt) {
    if (!this.out) return;
    this.out.elapsed += dt;
    const weight = smooth(Math.min(1, this.out.elapsed / this.out.duration));
    for (const [bone, from] of this.out.bones) {
      for (const property of ['quaternion', 'position', 'scale']) blendValue(bone, property, from[property], valueOf(bone, property), weight);
    }
    if (weight === 1) this.out = null;
  }
}
