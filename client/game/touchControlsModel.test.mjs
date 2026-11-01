import test from 'node:test';
import assert from 'node:assert/strict';
import { TOGGLE_TAP, TOUCH, isDeliberateTap, isTouchPrimary, lookDelta, stickVector, touchLayerPoint } from './touchControlsModel.mjs';

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

test('a stick part-way walks, further runs, and is a full run before the rim', () => {
  const at = (share) => stickVector(0, -TOUCH.stickRadius * share).forward;
  assert.ok(at(0.3) > 0 && at(0.3) < 0.4, 'a little tilt: a walk');
  assert.ok(at(0.6) > at(0.3) && at(0.6) < 1);
  close(at(TOUCH.fullAt), 1);
  close(at(0.95), 1);
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

test('the crouch toggle answers only a deliberate tap on it: quick, lifted where it was pressed', () => {
  const press = { at: 1000, x: 100, y: 200 };
  assert.equal(isDeliberateTap(press, { at: 1180, x: 104, y: 197, lifted: true }), true, 'a tap');
  assert.equal(isDeliberateTap(press, { at: 1000 + TOGGLE_TAP.maxMs + 50, x: 100, y: 200, lifted: true }), false, 'held too long: a rest, not a tap');
  assert.equal(isDeliberateTap(press, { at: 1100, x: 100 + TOGGLE_TAP.maxSlide + 5, y: 200, lifted: true }), false, 'slid away: on its way somewhere else');
  assert.equal(isDeliberateTap(press, { at: 1100, x: 100, y: 200, lifted: false }), false, 'cancelled, not lifted');
  assert.equal(isDeliberateTap(null, { at: 1100, x: 100, y: 200, lifted: true }), false, 'never pressed on it at all');
});

test('layer-relative touch positions account for viewport offsets and CSS scale', () => {
  // The viewport can be inset by browser UI or displayed with a non-unit scale.
  const rect = { left: 50, top: 30, width: 400, height: 300 };
  const size = { width: 800, height: 600 };
  assert.deepEqual(touchLayerPoint(130, 255, rect, size), { x: 160, y: 450 });
  assert.deepEqual(touchLayerPoint(30, 30, rect, size), { x: -40, y: 0 });
});

test('layer-relative touch positions undo both sideways rotations', () => {
  const rect = { left: 20, top: 40, width: 300, height: 600 };
  const size = { width: 600, height: 300 };
  assert.deepEqual(touchLayerPoint(110, 170, rect, size, 90), { x: 130, y: 210 });
  assert.deepEqual(touchLayerPoint(230, 510, rect, size, -90), { x: 130, y: 210 });
  assert.equal(touchLayerPoint(0, 0, null, size), null);
});

test('sprint and ram charge both use hysteresis without accidental diagonal acceleration', () => {
  const radius = TOUCH.stickRadius;
  assert.equal(stickVector(0,-radius * .93).sprint,true);
  assert.equal(stickVector(0,-radius * .88,{sprintActive:true}).sprint,true);
  assert.equal(stickVector(0,-radius * .82,{sprintActive:true}).sprint,false);
  assert.equal(stickVector(radius * .8,-radius * .8).sprint,false,'a broad diagonal does not trigger Sprint');
});
