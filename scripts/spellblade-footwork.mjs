// The cuts' footwork, measured on the GLB as authored (the knight's root stays put in these clips, so a foot's world
// motion is its motion over the ground): per foot, per frame, its height and its speed over the ground; whether a
// "planted" foot is merely slow or pinned to the floor to the micron; the stepping foot's peak; and the leg's own
// articulation: the knee's bend, how near the leg comes to full stretch (hip to ankle against thigh + shin: a pinned
// foot with a travelling pelvis pulls the leg straight and pops the knee), and the pelvis's own travel and turn.
//   node scripts/spellblade-footwork.mjs [model.glb] [--clips Slash_1,Slash_2,Slash_3] [--json out.json]
import { writeFileSync } from 'node:fs';
import { loadGlb, localPose, worldMatrices, apply } from './lib/glbPose.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const path = args.find((a) => a.endsWith('.glb')) ?? new URL('../client/assets/characters/spellblade/spellblade.glb', import.meta.url).pathname;
const clips = option('--clips', 'Slash_1,Slash_2,Slash_3').split(',');
const m = loadGlb(path);
const idx = (n) => m.byName.get(n);
const P = (world, n) => apply(world[idx(n)], [0, 0, 0]);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const angle = (a, b, c) => { // at b
  const u = a.map((v, i) => v - b[i]), w = c.map((v, i) => v - b[i]);
  const d = (u[0] * w[0] + u[1] * w[1] + u[2] * w[2]) / (Math.hypot(...u) * Math.hypot(...w));
  return Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI;
};
const yawOf = (mat) => Math.atan2(mat[8], mat[10]) * 180 / Math.PI; // the pelvis's +Z heading in the floor plane
const bindWorld = worldMatrices(m, localPose(m, []));
const legLen = (s) => dist(P(bindWorld, `thigh.${s}`), P(bindWorld, `shin.${s}`)) + dist(P(bindWorld, `shin.${s}`), P(bindWorld, `foot.${s}`));
const report = { model: path, clips: {} };
for (const clip of clips) {
  const c = m.clips.get(clip); if (!c) continue;
  const frames = [];
  for (let f = 0; f <= Math.round(c.duration * 30); f += 1) {
    const w = worldMatrices(m, localPose(m, [{ clip, time: Math.min(c.duration, f / 30), weight: 1 }]));
    const row = { f, pelvis: P(w, 'pelvis'), pelvisYaw: yawOf(w[idx('pelvis')]) };
    for (const s of ['L', 'R']) {
      const hip = P(w, `thigh.${s}`), knee = P(w, `shin.${s}`), ankle = P(w, `foot.${s}`);
      row[s] = { ankle, knee: +(180 - angle(hip, knee, ankle)).toFixed(1), reach: +(dist(hip, ankle) / legLen(s)).toFixed(3) };
    }
    frames.push(row);
  }
  const floor = Math.min(...frames.flatMap((r) => [r.L.ankle[1], r.R.ankle[1]]));
  const feet = {};
  for (const s of ['L', 'R']) {
    const speeds = frames.slice(1).map((r, i) => Math.hypot(r[s].ankle[0] - frames[i][s].ankle[0], r[s].ankle[2] - frames[i][s].ankle[2]) * 30);
    const low = frames.map((r) => r[s].ankle[1] - floor < 0.04);
    const planted = speeds.filter((_, i) => low[i] && low[i + 1]);
    const exactZero = planted.filter((v) => v < 1e-6).length;
    const skating = speeds.filter((v, i) => low[i] && low[i + 1] && v > 1).length;
    const lift = Math.max(...frames.map((r) => r[s].ankle[1] - floor));
    feet[s] = { peak: +Math.max(...speeds).toFixed(3), peakFrame: speeds.indexOf(Math.max(...speeds)) + 1, plantedFrames: planted.length,
      plantedExactlyStill: exactZero, skating, maxLift: +lift.toFixed(3),
      kneeRange: [Math.min(...frames.map((r) => r[s].knee)), Math.max(...frames.map((r) => r[s].knee))],
      maxReach: Math.max(...frames.map((r) => r[s].reach)),
      kneeJerk: +Math.max(...frames.slice(2).map((r, i) => Math.abs(r[s].knee - 2 * frames[i + 1][s].knee + frames[i][s].knee))).toFixed(1),
      speeds: speeds.map((v) => +v.toFixed(3)) };
  }
  const pelvisTravel = +Math.hypot(frames.at(-1).pelvis[0] - frames[0].pelvis[0], frames.at(-1).pelvis[2] - frames[0].pelvis[2]).toFixed(3);
  const pelvisPath = +frames.slice(1).reduce((s, r, i) => s + Math.hypot(r.pelvis[0] - frames[i].pelvis[0], r.pelvis[2] - frames[i].pelvis[2]), 0).toFixed(3);
  const yaws = frames.map((r) => r.pelvisYaw);
  report.clips[clip] = { feet, pelvisTravel, pelvisPath, pelvisYawRange: +(Math.max(...yaws) - Math.min(...yaws)).toFixed(1) };
  console.log(`${clip}: pelvis path ${pelvisPath} m (net ${pelvisTravel}), pelvis turn ${report.clips[clip].pelvisYawRange}°`);
  for (const s of ['L', 'R']) {
    const x = feet[s];
    console.log(`  foot.${s}: peak ${x.peak} m/s @f${x.peakFrame}, lift ${x.maxLift} m, planted ${x.plantedFrames} fr (exactly still ${x.plantedExactlyStill}), skating ${x.skating}; knee ${x.kneeRange[0]}..${x.kneeRange[1]}°, max reach ${x.maxReach}, knee jerk ${x.kneeJerk}°/fr²`);
    console.log(`     speeds ${x.speeds.map((v) => v.toFixed(2)).join(' ')}`);
  }
}
const json = option('--json', null);
if (json) writeFileSync(json, JSON.stringify(report, null, 1));
