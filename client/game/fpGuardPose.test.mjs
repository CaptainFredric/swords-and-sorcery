import test from 'node:test';
import assert from 'node:assert/strict';
import { FP_GUARD, guardTargets } from './fpGuardPose.mjs';

// (the first-person blade's length from the wrist, drawn at the first-person scale; screen positions here are the
// tangents of the angle from straight ahead, before the camera's field of view scales them)
const BLADE = 0.66;
const screen = ([x, y, z]) => [x / -z, y / -z];

test('the sword hand stays low on the right and the blade rises across the body, inward and ahead', () => {
  const { wrist, blade } = FP_GUARD.arm;
  assert.ok(wrist[0] > 0.15 && wrist[1] < -0.2, 'the hand low on the right');
  assert.ok(blade[0] < -0.5, 'the blade turned in across the body');
  assert.ok(blade[1] > 0.2 && blade[1] < 0.5, 'raised: a guard, not hanging, nor upright');
  assert.ok(blade[2] < 0, 'and ahead');
});

test('the blade passes well below the crosshair and its point lies just above the raised magic hand', () => {
  const { wrist, blade } = FP_GUARD.arm;
  // where the blade crosses the middle of the view
  const s = -wrist[0] / blade[0];
  const centre = screen(wrist.map((v, i) => v + blade[i] * s));
  assert.ok(centre[1] < -0.12, `crosses the middle at ${centre[1].toFixed(3)}, under the crosshair and a foe's chest`);
  const point = screen(wrist.map((v, i) => v + blade[i] * BLADE));
  const hand = screen(FP_GUARD.off.wrist);
  assert.ok(point[0] < -0.15, 'its point out to the left');
  assert.ok(point[1] > hand[1] + 0.15, 'above the magic hand, not through it');
  assert.ok(point[1] < 0.05, 'and no higher than the eye line');
});

test('the magic hand is up in front on the left, palm out', () => {
  const { wrist, aim, roll } = FP_GUARD.off;
  assert.ok(wrist[0] < -0.2 && wrist[1] > -0.35);
  assert.ok(aim[1] > 0.6, 'fingers up');
  assert.ok(roll[2] < -0.8, 'palm toward the threat');
});

test('the held guard breathes, a little: the hands move millimetres, never centimetres', () => {
  let rise = 0;
  for (let t = 0; t < FP_GUARD.breath.period; t += 0.05) {
    const g = guardTargets(t);
    rise = Math.max(rise, Math.abs(g.arm.wrist[1] - FP_GUARD.arm.wrist[1]));
  }
  assert.ok(rise > 0.002 && rise <= 0.01, `breath ${rise.toFixed(4)} m`);
  assert.deepEqual(guardTargets(0, 0).arm.wrist, FP_GUARD.arm.wrist, 'no breath at no tension');
});
