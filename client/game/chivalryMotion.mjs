import { blendSeconds } from './spellbladeBlend.mjs';

export function ownershipBlendSeconds(fromClip, toClip) {
  // Answer attacks quickly, then let the hands and shoulders settle back into their stance.
  return fromClip ? blendSeconds(fromClip, toClip) || 0.1 : 0.12;
}

export function guardedSwordArm(arm, amount) {
  const weight = Math.max(0, Math.min(1, amount));
  return { ...arm, wrist: arm.wrist.map((value, i) => i === 0
    ? value + (0.16 - value) * 0.18 * weight
    : i === 1 ? value - 0.035 * weight : value) };
}
