// Fit the displayed blade to the existing brace samples without moving the body or the contact track.
import { SWORD_TECHNIQUE_CONTRACTS } from '../../shared/src/swordTechniqueContracts.mjs';
import { lerp, normalize, solveArm, THIRD_PERSON_SWORD_ARM } from './swordArmIK.mjs';

export const RIPOSTE_RECENT_GUARD_SEC = .3;
export const { braceUntil: RIPOSTE_BRACE_SEC } = SWORD_TECHNIQUE_CONTRACTS.rigid_riposte;
const { track } = SWORD_TECHNIQUE_CONTRACTS.rigid_riposte;
const ARM = { ...THIRD_PERSON_SWORD_ARM, grip: 'hand.R', aim: normalize([.131, 1.3383, -.1661]) };
const BLADE_BASE_FROM_WRIST = .117;
const smooth = (t) => {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
};

export function riposteBraceBlade(age) {
  // Give the incoming Guard time to settle, and hand the wrist back to the authored thrust at its seam.
  const weight = smooth((age - .105) / .034) * smooth((RIPOSTE_BRACE_SEC - age) / .018);
  if (weight <= 0) return null;

  const next = track.findIndex(sample => sample.time > age);
  const a = track[next - 1], b = track[next];
  const t = (age - a.time) / (b.time - a.time);
  const xyz = ({ x, y, z }) => [x, y, z];
  const base = lerp(xyz(a.base), xyz(b.base), t);
  const tip = lerp(xyz(a.tip), xyz(b.tip), t);
  return { base, tip, weight };
}

export function alignRiposteBraceBlade(api, { base, tip, weight }, settled) {
  const aim = normalize(tip.map((v, i) => v - base[i]));
  const wrist = base.map((v, i) => v - aim[i] * BLADE_BASE_FROM_WRIST);
  const shoulder = api.position(ARM.shoulder);
  const pole = api.position(ARM.elbow).map((v, i) => v - shoulder[i]);
  solveArm(api, { ...ARM, pole }, { wrist, aim }, weight * smooth(settled));
}
