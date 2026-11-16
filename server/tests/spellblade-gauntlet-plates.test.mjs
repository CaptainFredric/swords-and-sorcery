// The sword arm's gauntlet plates hold their shape in every clip the knight has.
//
// The defect this guards (2026-11-16, reproduced in Castleward with scripts/spellblade-pose-gallery-browser.mjs): the
// gauntlets' hard plates were skinned with soft forearm-to-hand gradients, and the clips bend the sword hand 63-129°
// from its bind pose, so every plate with a gradient sheared along it: edges stretched to 5-9x their length, the cuff
// tore into a sliver over the hilt, and the forearm read as a jagged mass wrapped round the sword. The same stretch
// appears with the clips alone (scripts/spellblade-arm-strain.mjs), so it was the weights, not the game's composition.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadGlb } from '../../scripts/lib/glbPose.mjs';
import { gauntletPlates } from '../../scripts/lib/gauntletPlates.mjs';
import { reweightGauntlets } from '../../scripts/spellblade-reweight-gauntlet.mjs';

const path = new URL('../../client/assets/characters/spellblade/spellblade.glb', import.meta.url).pathname;
const model = loadGlb(path);

test('no clip stretches the sword arm\'s gauntlet plates: every edge within 15% of its modelled length', () => {
  // (de8c8655's own weights: 9.5x in Rigid_Riposte_Air_Dash_Thrust, 5.2x in Slash_1, 8.6x in Guard; corrected: 1.08x)
  const measure = gauntletPlates(model, 'R');
  const torn = [];
  for (const [clip, c] of model.clips) {
    let worst = 0, at = 0;
    for (let f = 0; f <= Math.round(c.duration * 30); f += 3) {
      const [, hi] = measure([{ clip, time: Math.min(c.duration, f / 30), weight: 1 }]);
      if (hi > worst) { worst = hi; at = f; }
    }
    if (worst > 1.15) torn.push(`${clip} ${worst.toFixed(2)}x @f${at}`);
  }
  assert.deepEqual(torn, []);
});

test('the gauntlet plates are weighted as plates: re-applying the correction changes nothing', () => {
  // (a model from Argon that brings back the gradients fails here, and spellblade-reweight-gauntlet.mjs says what to fix)
  const bytes = readFileSync(path);
  const { bytes: again } = reweightGauntlets(bytes);
  assert.equal(Buffer.compare(bytes, again), 0);
});
