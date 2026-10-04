import { blendSeconds } from './spellbladeBlend.mjs';
import { blendPoses } from './fpSlash.mjs';
import { guardedBracePose, guardedComboPose } from './fpGuardedSlash.mjs';

export function ownershipBlendSeconds(fromClip, toClip) {
  // Answer attacks quickly, then let the hands and shoulders settle back into their stance.
  const ordinary = clip => clip?.replace('GuardCut_', 'Slash_');
  return fromClip ? blendSeconds(ordinary(fromClip), ordinary(toClip)) || 0.14 : 0.16;
}

/** A moving pose offset that arrives at rest without discarding its initial velocity. */
export function transitionResidual(offset, velocity, elapsed, duration) {
  if (!(duration > 0) || elapsed >= duration) return 0;
  const u = Math.max(0, elapsed / duration);
  return offset * (1 - 3 * u * u + 2 * u * u * u)
    + velocity * duration * u * (1 - u) * (1 - u);
}

/** Blend into a separately authored defensive path, including its persistent angled brace. */
export function guardedSwordPose(pose, amount, defended = pose ? guardedComboPose(pose.time) : guardedBracePose()) {
  const u = Math.max(0, Math.min(1, amount));
  if (!u) return pose;
  const w = u * u * (3 - 2 * u);
  const shown = pose ? blendPoses(pose, defended, u) : defended;
  return { ...shown, weight: (pose?.weight ?? (pose ? 1 : 0)) * (1-w) + w };
}
