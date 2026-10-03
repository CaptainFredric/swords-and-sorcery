import { blendSeconds } from './spellbladeBlend.mjs';

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

/** Compact one handed cuts: the free gauntlet keeps Guard while the sword follows its contact direction. */
export function guardedSwordPose(pose, amount) {
  if (!pose) return pose;
  const u = Math.max(0, Math.min(1, amount));
  const w = u * u * (3 - 2 * u);
  const center = [0.18, -0.22, -0.64];
  return { ...pose,
    arm: { ...pose.arm,
      wrist: pose.arm.wrist.map((v, i) => v + (center[i] - v) * [0.28, 0.3, 0.12][i] * w),
      shoulder: pose.arm.shoulder?.map(v => v * (1 - 0.4 * w)),
    },
    offHand: pose.offHand ? { ...pose.offHand, weight: pose.offHand.weight * (1 - w) } : null,
    counter: pose.counter.map(v => v * (1 - w)),
    body: pose.body.map(v => v * (1 - 0.35 * w)),
    look: Object.fromEntries(Object.entries(pose.look).map(([k,v]) => [k,v * (1 - 0.35 * w)])),
  };
}
