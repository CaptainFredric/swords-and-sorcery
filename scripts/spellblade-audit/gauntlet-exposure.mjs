// How often, over everything the game plays (each played clip frame by frame, the sidecar's techniques, and the
// crossfades), a gauntlet shows a defect, pose for pose against a reference model (production):
//   stretched: a plate edge past 1.5x / 2x its modelled length (tearing);
//   folded:    a plate edge under half its modelled length (a plate collapsing);
//   new hole:  two neighbouring pieces more than 2 cm further apart than the reference has them in that same pose (a
//              gap the reference doesn't show).
// Exposure, not the single worst frame: what a player keeps seeing.
//   node scripts/spellblade-audit/gauntlet-exposure.mjs <reference.glb> <model.glb> [...more.glb]
import { gauntletIntegrity } from '../lib/gauntletIntegrity.mjs';
import { gameModel, TRANSITIONS } from './gauntlet-integrity.mjs';

function poses(model, clips) {
  const out = [];
  for (const clip of clips) { const c = model.clips.get(clip); for (let t = 0; t <= c.duration + 1e-9; t += 1 / 30) out.push({ label: `${clip}@${t.toFixed(3)}`, layers: [{ clip, time: Math.min(c.duration, t), weight: 1 }] }); }
  for (const [a, ta, b, tb] of TRANSITIONS) {
    if (!clips.includes(a) || !clips.includes(b)) continue;
    for (let w = 0.1; w < 0.95; w += 0.1) out.push({ label: `${a}->${b} ${w.toFixed(1)}`, layers: [{ clip: a, time: Math.min(model.clips.get(a).duration, ta + w * 0.12), weight: 1 - w }, { clip: b, time: Math.min(model.clips.get(b).duration, tb + w * 0.12), weight: w }] });
  }
  return out;
}

export function exposure(referencePath, path, side = 'R') {
  const [ref, { clips }] = gameModel(referencePath);
  const [model] = gameModel(path);
  const gr = gauntletIntegrity(ref, side), gm = gauntletIntegrity(model, side);
  const list = poses(model, clips);
  let s15 = 0, s2 = 0, hole = 0, either = 0, worstHole = { cm: 0 }, worstStretch = { x: 0 };
  const openedAll = [], stretchAll = [];
  let fold = 0, worstFold = { x: 1 };
  for (const { label, layers } of list) {
    const a = gm.measure(layers), b = gr.measure(layers);
    let opened = 0, pair = null;
    for (const [k, gap] of Object.entries(a.gaps)) { const d = gap - (b.gaps[k] ?? 0); if (d > opened) { opened = d; pair = k; } }
    openedAll.push(opened * 100); stretchAll.push(a.plate[1]);
    if (a.plate[0] < 0.5) fold += 1;
    if (a.plate[0] < worstFold.x) worstFold = { x: +a.plate[0].toFixed(3), at: label };
    const st15 = a.plate[1] > 1.5, st2 = a.plate[1] > 2, h = opened > 0.02;
    s15 += st15; s2 += st2; hole += h; either += (st2 || h);
    if (opened * 100 > worstHole.cm) worstHole = { cm: +(opened * 100).toFixed(1), at: label, pieces: gm.describe(pair) };
    if (a.plate[1] > worstStretch.x) worstStretch = { x: +a.plate[1].toFixed(2), at: label };
  }
  const pct = (x) => `${(100 * x / list.length).toFixed(1)}%`;
  const q = (arr, p) => +[...arr].sort((x, y) => x - y)[Math.min(arr.length - 1, Math.floor(p * arr.length))].toFixed(2);
  return { poses: list.length, stretched15: pct(s15), stretched2: pct(s2), newHole2cm: pct(hole), foldedUnderHalf: pct(fold), worstFold, either: pct(either), openedCm: { p50: q(openedAll, 0.5), p90: q(openedAll, 0.9), max: q(openedAll, 1) }, stretch: { p50: q(stretchAll, 0.5), p90: q(stretchAll, 0.9) }, worstHole, worstStretch };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [reference, ...models] = process.argv.slice(2);
  for (const path of [reference, ...models]) for (const side of ['R', 'L']) console.log(path.split('/').pop().padEnd(22), side, JSON.stringify(exposure(reference, path, side)));
}
