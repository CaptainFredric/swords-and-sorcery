// Twitches: how sharply each arm bone's turn changes from one frame to the next (degrees per frame, and the change of
// that, per frame squared). A smooth swing changes its speed gradually; a twitch reverses or jumps in one frame.
//
//   node tools/animation/arm-jerk.mjs [--motion a.motion.glb] [--clips Slash_1,Slash_2]

import { fileURLToPath } from 'node:url';
import { loadGlb, localPose, worldMatrices, overlayMotion } from '../../scripts/lib/glbPose.mjs';
import { quat } from '../../scripts/lib/bvh.mjs';

const args = process.argv.slice(2);
const option = (name, fallback = null) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const repo = fileURLToPath(new URL('../../', import.meta.url));
const model = loadGlb(option('--model', `${repo}client/assets/characters/spellblade/spellblade.glb`));
if (option('--motion')) overlayMotion(model, option('--motion'));
const rotOf = (m) => {
  const n = (a, b, c) => { const l = Math.hypot(a, b, c); return [a / l, b / l, c / l]; };
  return quat.fromBasis(n(m[0], m[1], m[2]), n(m[4], m[5], m[6]), n(m[8], m[9], m[10]));
};
const BONES = ['upper_arm.R', 'forearm.R', 'hand.R', 'upper_arm.L', 'forearm.L', 'hand.L', 'chest'];
for (const name of option('--clips', 'Slash_1,Slash_2,Slash_3').split(',')) {
  const clip = model.clips.get(name);
  const n = Math.round(clip.duration * 30);
  const rots = [];
  for (let f = 0; f <= n; f += 1) {
    const W = worldMatrices(model, localPose(model, [{ clip: name, time: Math.min(clip.duration, f / 30), weight: 1 }]));
    rots.push(BONES.map((b) => rotOf(W[model.byName.get(b)])));
  }
  const out = BONES.map((b, k) => {
    // each frame's turn as a rotation vector (axis times angle), so a reversal shows as a jump between frames
    const vel = [];
    for (let f = 1; f <= n; f += 1) {
      const d = quat.mul(rots[f][k], quat.inv(rots[f - 1][k]));
      const s = d[3] < 0 ? -1 : 1;
      const len = Math.hypot(d[0], d[1], d[2]);
      const ang = 2 * Math.atan2(len, Math.abs(d[3]));
      vel.push(len > 1e-9 ? [d[0] * s / len * ang, d[1] * s / len * ang, d[2] * s / len * ang] : [0, 0, 0]);
    }
    let speed = 0, jerk = 0, at = 0;
    vel.forEach((v, i) => {
      speed = Math.max(speed, Math.hypot(...v));
      if (i) { const j = Math.hypot(v[0] - vel[i - 1][0], v[1] - vel[i - 1][1], v[2] - vel[i - 1][2]); if (j > jerk) { jerk = j; at = i; } }
    });
    return `${b} ${(speed * 180 / Math.PI).toFixed(0)}°/f ${(jerk * 180 / Math.PI).toFixed(0)}°/f² (f${at})`;
  });
  console.log(`${name}: ${out.join(' | ')}`);
}
