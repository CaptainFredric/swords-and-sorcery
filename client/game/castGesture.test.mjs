import assert from 'node:assert/strict';
import test from 'node:test';
import { CAST_GESTURE, castGesture, castGestureRotations } from './castGesture.mjs';

test('the palm draws in over the gather, snaps out at the release, then settles', () => {
  assert.deepEqual(castGesture(0), { draw: 0, thrust: 0, done: false });
  const halfway = castGesture(0.15);
  assert.ok(halfway.draw > 0.7 && halfway.thrust === 0, 'eases in quickly');
  const drawn = castGesture(0.2999);
  assert.ok(drawn.draw > 0.99);
  const thrown = castGesture(0.3 + CAST_GESTURE.releaseSec * 0.99);
  assert.ok(thrown.thrust > 0.99 && thrown.draw < 0.02, 'at full stretch as the spell flies');
  const settling = castGesture(0.3 + CAST_GESTURE.releaseSec + CAST_GESTURE.recoverSec / 2);
  assert.ok(settling.thrust > 0 && settling.thrust < 0.5);
  assert.equal(castGesture(0.3 + CAST_GESTURE.releaseSec + CAST_GESTURE.recoverSec + 0.01).done, true);
  assert.equal(castGesture(-1).done, true);
  assert.equal(castGesture(0.1, 0).draw, 0, 'no gather: straight to the throw');
});

test('the gesture turns the magic arm with local bone turns, scaled by how far into it the arm is', () => {
  assert.deepEqual(castGestureRotations({ draw: 0, thrust: 0 }), []);
  const full = castGestureRotations({ draw: 1, thrust: 0 });
  assert.equal(full.length, CAST_GESTURE.draw.length);
  assert.ok(full.every((turn) => turn.space === 'local' && /\.L$/.test(turn.bone)));
  const half = castGestureRotations({ draw: 0.5, thrust: 0 });
  assert.ok(Math.abs(half[0].angle - CAST_GESTURE.draw[0].angle / 2) < 1e-9);
});
