// How far each arm goes into the knight's own torso, frame by frame: the forearm and the fist against a capsule round
// the trunk (pelvis to neck), sized to the breastplate. A clip whose sword arm passes through it reads as the arm going
// into himself.
//
//   node tools/animation/arm-torso.mjs [--motion a.motion.glb] [--clips Slash_1,Slash_2] [--radius 0.19]

import { fileURLToPath } from 'node:url';
import { loadGlb, localPose, worldMatrices, overlayMotion } from '../../scripts/lib/glbPose.mjs';

const args = process.argv.slice(2);
const option = (name, fallback = null) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const repo = fileURLToPath(new URL('../../', import.meta.url));
const model = loadGlb(option('--model', `${repo}client/assets/characters/spellblade/spellblade.glb`));
if (option('--motion')) overlayMotion(model, option('--motion'));
const R = Number(option('--radius', '0.19'));
const clips = option('--clips', 'Slash_1,Slash_2,Slash_3,Slash_1_to_2,Slash_2_to_3').split(',');

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// the closest distance between segments p0-p1 and q0-q1
function segDist(p0, p1, q0, q1) {
  const d1 = sub(p1, p0), d2 = sub(q1, q0), r = sub(p0, q0);
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  let s, t;
  const c = dot(d1, r), b = dot(d1, d2), den = a * e - b * b;
  s = den > 1e-9 ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0;
  t = (b * s + f) / e;
  if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); } else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }
  const pc = p0.map((v, i) => v + d1[i] * s), qc = q0.map((v, i) => v + d2[i] * t);
  return Math.hypot(...sub(pc, qc));
}
for (const name of clips) {
  const clip = model.clips.get(name);
  if (!clip) { console.log(`${name}: none`); continue; }
  const rows = [];
  for (let f = 0; f <= Math.round(clip.duration * 30); f += 1) {
    const W = worldMatrices(model, localPose(model, [{ clip: name, time: Math.min(clip.duration, f / 30), weight: 1 }]));
    const p = (n) => { const m = W[model.byName.get(n)]; return [m[12], m[13], m[14]]; };
    const trunk = [p('pelvis'), p('neck')];
    const depth = (side) => {
      const fore = segDist(p(`forearm.${side}`), p(`hand.${side}`), ...trunk);
      const upper = segDist(p(`upper_arm.${side}`), p(`forearm.${side}`), ...trunk);
      // (the upper arm hangs from the shoulder at the trunk's edge: only its lower half counts)
      const elbowHalf = segDist(p(`upper_arm.${side}`).map((v, i) => (v + p(`forearm.${side}`)[i]) / 2), p(`forearm.${side}`), ...trunk);
      void upper;
      return Math.max(0, R - Math.min(fore, elbowHalf));
    };
    rows.push({ f, R: depth('R'), L: depth('L') });
  }
  const worst = (s) => rows.reduce((a, r) => (r[s] > a[s] ? r : a), rows[0]);
  const count = (s) => rows.filter((r) => r[s] > 0.02).length;
  console.log(`${name.padEnd(14)} sword arm into the trunk on ${count('R')}/${rows.length} frames (deepest ${(worst('R').R * 100).toFixed(1)} cm, f${worst('R').f}); off arm ${count('L')} (deepest ${(worst('L').L * 100).toFixed(1)} cm, f${worst('L').f})`);
}
