import * as THREE from 'three';

function clampActionTime(action, time, loop) {
  const duration = Math.max(0.0001, action.getClip().duration || 0.0001);
  if (loop) return ((time % duration) + duration) % duration;
  return Math.max(0, Math.min(duration, time));
}

export class SpellbladeAnimator {
  constructor(root, clips = [], onPose = null) {
    this.onPose = onPose;
    this.root = root;
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = new Map();
    this.activeAction = null;
    this.activeClip = null;
    this.transition = null;

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
      if (this.transition) this.transition.from.stop();
      this.transition = step > 0 && this.activeAction
        ? { from: this.activeAction, elapsed: 0 }
        : null;
      if (!this.transition && this.activeAction) this.activeAction.stop();
      action.reset();
      action.play();
      this.activeAction = action;
      this.activeClip = plan.clip;
    }

    const loop = Boolean(plan.loop);
    action.enabled = true;
    action.clampWhenFinished = !loop;
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    const weight = Number.isFinite(plan.weight) ? plan.weight : 1;
    let blend = 1;
    if (this.transition) {
      this.transition.elapsed += step;
      blend = step === 0 ? 1 : Math.min(1, this.transition.elapsed / 0.08);
      this.transition.from.setEffectiveWeight((1 - blend) * weight);
      if (blend === 1) {
        this.transition.from.stop();
        this.transition = null;
      }
    }
    action.setEffectiveWeight(blend * weight);
    action.paused = true;
    action.time = clampActionTime(action, Number.isFinite(plan.time) ? plan.time : 0, loop);
    this.mixer.update(0);
    this.onPose?.(plan);
    return true;
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    this.actions.clear();
    this.activeAction = null;
    this.activeClip = null;
    this.transition = null;
  }
}
