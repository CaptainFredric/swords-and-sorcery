// The Sword Techniques in first person, drawn by the arm solver as the ordinary cuts are (fpSlash.mjs): the authored
// first-person clips barely moved the sword (the Riposte's thrust brought the hand 3 cm forward and only tipped the
// blade from 33 to 13 degrees), so the player never felt the lunge the server makes. On the server's own technique
// clock, nothing here moves anyone or decides a hit.
//
// Rigid Riposte (shared/src/swordTechniqueContracts.mjs): a 0.22 s brace, then a 5.7 m lunge over 0.26 s, then recovery.
//   - the brace: the blade comes up across the body to take the blow (the interception), then is drawn back to the
//     hip with its point levelled at the aim, the hand cocked behind it;
//   - the drive: the hand thrown forward along the aim with the body behind it, the blade level and steady, the point
//     leading; the magic arm swept back to balance it;
//   - held at full stretch to the lunge's end, then brought home.
//
// Pose format: fpSlash's ({ arm: { wrist, blade, edge, shoulder }, offHand, look, body, counter }). View space: +x
// right, +y up, -z ahead.

import { REST_ARM } from './fpSlash.mjs';
import { normalize } from './swordArmIK.mjs';
import { RIPOSTE_MOTION } from './techniqueMotion.mjs';

const DEG = Math.PI / 180;
const clamp01 = (t) => Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
const smooth = (t) => { const s = clamp01(t); return s * s * (3 - 2 * s); };
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const dir = (left, rise) => [-Math.sin(left * DEG) * Math.cos(rise * DEG), Math.sin(rise * DEG), -Math.cos(left * DEG) * Math.cos(rise * DEG)];

const REST = Object.freeze({ wrist: REST_ARM.wrist, blade: REST_ARM.blade, edge: REST_ARM.edge, shoulder: [0, 0, 0] });
// the blade from a wrist toward a point on the aim this far ahead: seen converging on the crosshair from the lower right
// (a blade laid straight along the line of sight is all but invisible: only its guard shows)
const AIM_POINT = Object.freeze([0, 0.04, -1.7]);
const atAim = (wrist) => normalize(AIM_POINT.map((v, i) => v - wrist[i]));
const LOADED_WRIST = [0.27, -0.29, -0.5];
const DRIVEN_WRIST = [0.2, -0.27, -0.7];
export const FP_RIPOSTE = Object.freeze({
  // the interception: the blade up across the body, edge out to meet the blow
  intercept: Object.freeze({ wrist: [0.3, -0.24, -0.62], blade: dir(20, 48), edge: [-0.75, 0.05, -0.65], shoulder: [-0.02, 0.03, -0.02] }),
  // loaded: drawn back by the hip, the point levelled at the aim, the hand on the grip as at rest
  loaded: Object.freeze({ wrist: LOADED_WRIST, blade: atAim(LOADED_WRIST), edge: REST_ARM.edge, shoulder: [0.03, -0.01, 0.06] }),
  // driven home: the arm at full stretch along the aim (within its reach: the body carries it the rest of the way),
  // the shoulder thrown after it
  driven: Object.freeze({ wrist: DRIVEN_WRIST, blade: atAim(DRIVEN_WRIST), edge: REST_ARM.edge, shoulder: [-0.07, 0.01, -0.14] }),
  interceptBy: 0.1,   // the blade across to take the blow
  loadFrom: 0.12,     // and drawn back from here to the brace's end
  driveSec: 0.14,     // thrown forward over this long (the hand at about 5 m/s at its fastest)
});

function blend(a, b, t) {
  return { wrist: mix(a.wrist, b.wrist, t), blade: normalize(mix(a.blade, b.blade, t)), edge: normalize(mix(a.edge, b.edge, t)), shoulder: mix(a.shoulder, b.shoulder, t) };
}

/** The Riposte's sword arm `age` seconds after it began (null once it is home). */
export function riposteFirstPersonPose(age, m = FP_RIPOSTE, timing = RIPOSTE_MOTION) {
  if (!Number.isFinite(age) || age < 0) return null;
  const end = timing.driveTo + timing.hold + timing.rise;
  if (age >= end) return null;
  let arm;
  let counter = [0, 0, 0];
  let body = [0, 0, 0];
  if (age < timing.brace) {
    const across = smooth(age / m.interceptBy);
    const load = smooth((age - m.loadFrom) / (timing.brace - m.loadFrom));
    arm = blend(blend(REST, m.intercept, across), m.loaded, load);
    counter = [0.1 * load, 0.2 * load, 0];
    body = [0, -0.01 * load, 0.03 * load];
    // (the point levelled at the aim as the hand comes back)
  } else if (age < timing.driveTo + timing.hold) {
    const drive = smooth((age - timing.brace) / m.driveSec);
    arm = blend(m.loaded, m.driven, drive);
    // the magic arm flung back to balance the thrust
    counter = [0.1 + 0.35 * drive, 0.2 + 0.55 * drive, 0.05 * drive];
    body = [-0.03 * drive, -0.01, 0.03 - 0.16 * drive];
  } else {
    const home = smooth((age - timing.driveTo - timing.hold) / timing.rise);
    arm = blend(m.driven, REST, home);
    counter = [0.45 * (1 - home), 0.75 * (1 - home), 0.05 * (1 - home)];
    body = [-0.03 * (1 - home), -0.01 * (1 - home), -0.13 * (1 - home)];
  }
  return { arm, offHand: null, look: { pitch: 0, roll: 0, yaw: 0 }, body, counter };
}
