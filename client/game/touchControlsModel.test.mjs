import test from 'node:test';
import assert from 'node:assert/strict';
import { TOUCH, isTouchPrimary, lookDelta, stickVector } from './touchControlsModel.mjs';

function close(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

test('the stick ignores tiny drifts and moves in the direction the thumb pushes', () => {
  const still = stickVector(3, -2);
  assert.equal(still.forward, 0);
  assert.equal(still.right, 0);
  const up = stickVector(0, -TOUCH.stickRadius * 0.6);
  assert.ok(up.forward > 0.4 && Math.abs(up.right) < 1e-9, 'thumb up moves forward');
  const right = stickVector(TOUCH.stickRadius * 0.6, 0);
  assert.ok(right.right > 0.4 && Math.abs(right.forward) < 1e-9, 'thumb right strafes right');
  const back = stickVector(0, TOUCH.stickRadius);
  close(back.forward, -1);
});

test('the knob stays on the rim when the thumb slides past it', () => {
  const far = stickVector(300, 0);
  close(far.knob.x, TOUCH.stickRadius);
  close(far.magnitude, 1);
});

test('pushing the stick to the rim straight ahead sprints; sideways or partway does not', () => {
  assert.equal(stickVector(0, -TOUCH.stickRadius).sprint, true);
  assert.equal(stickVector(0, -TOUCH.stickRadius * 0.7).sprint, false, 'not at the rim');
  assert.equal(stickVector(TOUCH.stickRadius, 0).sprint, false, 'sideways');
  assert.equal(stickVector(0, TOUCH.stickRadius).sprint, false, 'backwards');
  assert.equal(stickVector(TOUCH.stickRadius * 0.4, -TOUCH.stickRadius).sprint, true, 'slightly diagonal still counts');
});

test('dragging right turns right and dragging up looks up', () => {
  const turn = lookDelta(100, 0);
  assert.ok(turn.yaw < 0, 'yaw decreases turning right (three.js convention)');
  const up = lookDelta(0, -100);
  assert.ok(up.pitch > 0);
});

test('touch controls are for phones and tablets, not touchscreen laptops with a mouse', () => {
  assert.equal(isTouchPrimary((query) => ({ matches: query === '(hover: none) and (pointer: coarse)' })), true);
  assert.equal(isTouchPrimary(() => ({ matches: false })), false);
  assert.equal(isTouchPrimary(undefined), false);
});
