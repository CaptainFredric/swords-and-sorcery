import test from 'node:test';
import assert from 'node:assert/strict';
import { axisTurn, forearmRoll, spreadWristRoll, wristRoll } from './wristTwist.mjs';

const mul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const same = (a, b, eps = 1e-9) => Math.abs(Math.abs(a.reduce((s, v, i) => s + v * b[i], 0)) - 1) < eps;
const rad = (d) => d * Math.PI / 180;
const deg = (r) => r * 180 / Math.PI;

// the forearm's line in its own frame (the hand's offset), the bind turns, and bends across that line (no roll)
const axis = [0.05, 0.99, -0.12];
const handRest = axisTurn([0.3, 0.2, 0.93], 0.7);
const forearmRest = axisTurn([0.2, 0.9, 0.1], 0.3);
const wristBend = axisTurn([0.99, -0.05, 0], 0.5);
const elbowBend = axisTurn([0.99, -0.05, 0], 1.1);
const pose = (elbowDeg, wristDeg) => ({
  forearm: mul(mul(forearmRest, elbowBend), axisTurn(axis, rad(elbowDeg))),
  hand: mul(axisTurn(axis, rad(wristDeg)), mul(wristBend, handRest)),
  forearmRest, handRest, axis,
});
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('a cast rolling the hand 118 degrees shares it evenly between the wrist and the elbow; the hand does not move', () => {
  const arm = pose(0, 118);
  close(deg(wristRoll(arm.hand, handRest, axis)), 118);
  const spread = spreadWristRoll(arm);
  close(deg(wristRoll(spread.hand, handRest, axis)), 59);
  close(deg(forearmRoll(spread.forearm, forearmRest, axis)), 59);
  assert.ok(same(mul(spread.forearm, spread.hand), mul(arm.forearm, arm.hand)), 'the hand, the grip and the sword stay put');
});

test('a forearm twisted against the hand (Chivalry: 112 at the elbow, -58 at the wrist) unwinds both', () => {
  const arm = pose(112, -58);
  const spread = spreadWristRoll(arm);
  close(deg(forearmRoll(spread.forearm, forearmRest, axis)), 27);
  close(deg(wristRoll(spread.hand, handRest, axis)), 27);
  assert.ok(same(mul(spread.forearm, spread.hand), mul(arm.forearm, arm.hand)));
});

test('run twice in a frame, the second pass changes nothing', () => {
  const once = spreadWristRoll(pose(-30, 80));
  const twice = spreadWristRoll({ ...pose(-30, 80), forearm: once.forearm, hand: once.hand });
  assert.equal(twice.roll, 0);
  assert.deepEqual(twice.hand, once.hand);
});
