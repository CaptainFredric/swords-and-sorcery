import * as THREE from 'three';
import { SpellbladeClothRig } from './SpellbladeClothRig.mjs';
import { blendProgressFor, blendSeconds, blendWeights } from './spellbladeBlend.mjs';

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
  }

  has(clip) {
    return this.actions.has(clip);
  }

  apply(plan, dt = 0) {
    const step = Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0;
    const action = this.actions.get(plan?.clip);
    if (!action) return false;

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
    action.time = clampActionTime(action, Number.isFinite(plan.time) ? plan.time : 0, loop);
    this.mixer.update(0);
    this.cloth?.apply(step);
    this.onPose?.(plan);
    return true;
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    this.actions.clear();
    this.activeAction = null;
    this.activeClip = null;
    this.fading = [];
  }
}
