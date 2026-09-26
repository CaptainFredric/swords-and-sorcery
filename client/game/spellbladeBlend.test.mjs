import test from 'node:test';
import assert from 'node:assert/strict';
import { blendProgressFor, blendSeconds, blendWeights, easeBlend } from './spellbladeBlend.mjs';

function close(actual, expected, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

test('attacks and hit reactions blend in fast, settling poses blend in slowly', () => {
  assert.ok(blendSeconds('Idle', 'Slash_1') <= 0.1);
  assert.ok(blendSeconds('Run', 'Dash') <= 0.08);
  assert.ok(blendSeconds('Guard', 'Stagger') <= 0.08);
  assert.ok(blendSeconds('Slash_3', 'Idle') >= 0.2);
  assert.ok(blendSeconds('Idle', 'Run') >= 0.2);
  assert.ok(blendSeconds('Idle', 'Guard') > blendSeconds('Idle', 'Slash_1'));
  assert.equal(blendSeconds('Slash_1', 'Slash_2'), 0.06, 'combo slashes meet at matching poses');
  assert.equal(blendSeconds('Death', 'Idle'), 0, 'respawn snaps out of the death pose');
  assert.equal(blendSeconds(null, 'Idle'), 0);
  assert.equal(blendSeconds('Idle', 'Idle'), 0);
});

test('the blend curve starts and ends at rest and inverts cleanly', () => {
  close(easeBlend(0), 0);
  close(easeBlend(1), 1);
  close(easeBlend(0.5), 0.5);
  close(easeBlend(-1), 0);
  close(easeBlend(2), 1);
  assert.ok(easeBlend(0.05) < 0.05, 'eases in');
  assert.ok(easeBlend(0.95) > 0.95, 'eases out');
  for (const weight of [0, 0.1, 0.37, 0.5, 0.82, 1]) close(easeBlend(blendProgressFor(weight)), weight, 1e-5);
});

test('blend weights always sum to one so the pose never sags toward the bind pose', () => {
  const cases = [
    [0, [{ startWeight: 1, progress: 0 }]],
    [0.4, [{ startWeight: 1, progress: 0.4 }]],
    [0.2, [{ startWeight: 0.6, progress: 0.2 }, { startWeight: 0.4, progress: 0.2 }]],
    [0.9, [{ startWeight: 0.3, progress: 0.9 }]],
  ];
  for (const [progress, fading] of cases) {
    const weights = blendWeights(progress, fading);
    close(weights.active + weights.fading.reduce((sum, value) => sum + value, 0), 1);
  }
  const done = blendWeights(1, [{ startWeight: 1, progress: 1 }]);
  close(done.active, 1);
  close(done.fading[0], 0);
});

test('a switch keeps the on-screen mix: fading clips start from their current weights', () => {
  // mid-blend A (0.35) -> B (0.65), then C starts: A and B keep 0.35 : 0.65 at the moment of the switch
  const weights = blendWeights(0, [{ startWeight: 0.35, progress: 0 }, { startWeight: 0.65, progress: 0 }]);
  close(weights.active, 0);
  close(weights.fading[0], 0.35);
  close(weights.fading[1], 0.65);
});
