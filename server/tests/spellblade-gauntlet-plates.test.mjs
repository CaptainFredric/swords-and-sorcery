// The gauntlets hold together in everything the game plays: every frame of every clip, the motion sidecar's
// techniques composed as the client composes them, and the crossfades between clips.
//
// The defect this guards (2026-11-16, reproduced in Castleward with scripts/spellblade-pose-gallery-browser.mjs): the
// gauntlets' hard plates were skinned with soft gradients across each plate, and every played clip holds the sword hand
// 60° or more from its bind pose, so the plates sheared: edges to 5-9x, the cuff torn into slivers over the hilt, the
// forearm read as a jagged mass wrapped round the sword. The raw clips alone reproduce the in-game numbers, so it was the
// weights, not the game's composition. The correction gives each plate its own mean weights
// (scripts/spellblade-reweight-gauntlet.mjs). What it cannot do is close the wrist: hand.R pivots on the grip ~15 cm
// past the wrist, so neighbouring pieces still part where a clip bends the wrist far; the bounds below pin today's
// figures so that no revision makes that worse (docs/verification/spellblade-quality-8916d5bd/README.md §1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gauntletIntegrity } from '../../scripts/lib/gauntletIntegrity.mjs';
import { gameModel, TRANSITIONS } from '../../scripts/spellblade-audit/gauntlet-integrity.mjs';
import { reweightGauntlets } from '../../scripts/spellblade-reweight-gauntlet.mjs';

const path = new URL('../../client/assets/characters/spellblade/spellblade.glb', import.meta.url).pathname;
const [model, { clips: played }] = gameModel(path);
const step = 1 / 30;
function* poses(clips, transitions = true) {
  for (const clip of clips) { const c = model.clips.get(clip); for (let t = 0; t <= c.duration + 1e-9; t += step) yield [`${clip}@${t.toFixed(3)}`, [{ clip, time: Math.min(c.duration, t), weight: 1 }]]; }
  if (!transitions) return;
  for (const [a, ta, b, tb] of TRANSITIONS) {
    if (!clips.includes(a) || !clips.includes(b)) continue;
    for (let w = 0.1; w < 0.95; w += 0.1) yield [`${a}->${b} ${w.toFixed(1)}`, [{ clip: a, time: Math.min(model.clips.get(a).duration, ta + w * 0.12), weight: 1 - w }, { clip: b, time: Math.min(model.clips.get(b).duration, tb + w * 0.12), weight: w }]];
  }
}
const measured = {};
for (const side of ['R', 'L']) {
  const g = gauntletIntegrity(model, side);
  const r = { stretch: [], folded: 0, n: 0, blade: [], gap: {} };
  for (const [label, layers] of poses(played)) {
    const m = g.measure(layers);
    r.n += 1;
    if (m.plate[1] > 1.05) r.stretch.push(`${label} ${m.plate[1].toFixed(2)}x`);
    if (m.plate[0] < 0.5) r.folded += 1;
    if (m.inBlade) r.blade.push(label);
    for (const [k, gap] of Object.entries(m.gaps)) if (!(k in r.gap) || gap > r.gap[k]) r.gap[k] = gap;
  }
  r.archiveStretch = [];
  for (const [label, layers] of poses([...model.clips.keys()].filter((c) => !played.includes(c)), false)) {
    const m = g.measure(layers);
    if (m.plate[1] > 1.05) r.archiveStretch.push(`${label} ${m.plate[1].toFixed(2)}x`);
  }
  measured[side] = r;
}

test('no gauntlet plate is stretched, on either hand, in any frame or crossfade the game plays, or in any archive clip', () => {
  // (de8c8655's own weights: the sword hand past 2x in 96.7% of played poses, 9x at worst)
  for (const side of ['R', 'L']) {
    assert.deepEqual(measured[side].stretch.slice(0, 5), [], `Gauntlet.${side}: stretched past 1.05x`);
    assert.deepEqual(measured[side].archiveStretch.slice(0, 5), [], `Gauntlet.${side}: stretched past 1.05x in an archive clip`);
  }
});

test('the plates rarely fold: under half their size in at most 15% of played poses (de8c8655: 96%)', () => {
  // (what still folds is the half-forearm, half-hand wrist band where a clip turns the hand nearly opposite the forearm:
  // Rigid Riposte's thrust and the interrupted Whirl; it goes with the wrist re-model)
  assert.ok(measured.R.folded / measured.R.n <= 0.15, `sword hand folded in ${(100 * measured.R.folded / measured.R.n).toFixed(1)}% of poses`);
  assert.ok(measured.L.folded / measured.L.n <= 0.02, `magic hand folded in ${(100 * measured.L.folded / measured.L.n).toFixed(1)}% of poses`);
});

test('no sword-hand plate passes through the blade; the magic hand only where it rests on it falling asleep', () => {
  // (the Restless slump and sleep loop lay the magic hand on the blade: 25 and 73 frames, the same on de8c8655 frame for
  // frame, so authored, not the weights)
  assert.deepEqual(measured.R.blade, []);
  const sleep = new Set(['Restless_Fall_Asleep_Standing_Slump', 'Restless_Sleep_Breathing_Loop']);
  assert.deepEqual([...new Set(measured.L.blade.map((l) => l.split('@')[0]))].filter((c) => !sleep.has(c)), []);
});

test('neighbouring gauntlet pieces part no further than they do today (the wrist is still open: guard against worse)', () => {
  // (measured 2026-11-16 on the corrected model; the bind-relative opening includes the ~60° every pose holds the
  // wrist from bind. Worst: the vambrace and the back-of-hand plate in GuardCut_1 at 0.4 s, 20.4 cm.)
  const worst = (side) => Math.max(...Object.values(measured[side].gap)) * 100;
  assert.ok(worst('R') <= 21, `sword hand: neighbouring pieces part ${worst('R').toFixed(1)} cm`);
  assert.ok(worst('L') <= 15.5, `magic hand: neighbouring pieces part ${worst('L').toFixed(1)} cm`);
});

test('the gauntlet plates are weighted as whole plates: re-applying the correction changes nothing', () => {
  // (a revision from Argon that brings back the per-plate gradients fails here; the script says what to fix)
  const bytes = readFileSync(path);
  const { bytes: again } = reweightGauntlets(bytes);
  assert.equal(Buffer.compare(bytes, again), 0);
});
