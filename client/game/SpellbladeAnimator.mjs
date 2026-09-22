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

    for (const clip of clips) this.actions.set(clip.name, this.mixer.clipAction(clip));
  }

  has(clip) {
    return this.actions.has(clip);
  }

  apply(plan, dt = 0) {
    void dt;
    const action = this.actions.get(plan?.clip);
    if (!action) return false;

    if (this.activeAction !== action) {
      if (this.activeAction) this.activeAction.stop();
      action.reset();
      action.play();
      this.activeAction = action;
      this.activeClip = plan.clip;
    }

    const loop = Boolean(plan.loop);
    action.enabled = true;
    action.clampWhenFinished = !loop;
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    action.setEffectiveWeight(Number.isFinite(plan.weight) ? plan.weight : 1);
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
  }
}
