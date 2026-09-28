import test from 'node:test';
import assert from 'node:assert/strict';
import { elbowAngleFor, normalize, rotateVector, solveSwordArm } from './swordArmIK.mjs';
import { OFF_HAND_CLEAR, SLASHES, slashPose } from './fpSlash.mjs';

// a toy arm with the first-person rig's proportions: each bone a pivot and an orientation (three axes), turning a
// bone carries everything after it in the chain
function toyArm() {
  const bones = {
    'upper_arm.R': { pivot: [0.44, -0.49, -0.08] },
    'forearm.R': { pivot: [0.424, -0.4, -0.364] },
    'hand.R': { pivot: [0.395, -0.308, -0.648] },
    socket_sword: { pivot: [0.366, -0.248, -0.715] },
  };
  const order = ['upper_arm.R', 'forearm.R', 'hand.R', 'socket_sword'];
  for (const name of order) bones[name].axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const after = (name) => order.slice(order.indexOf(name));
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const add = (a, b) => a.map((v, i) => v + b[i]);
  return {
    bones,
    api: {
      position: (name) => [...bones[name].pivot],
      direction: (name, axis) => normalize(bones[name].axes.reduce((sum, basis, i) => add(sum, basis.map((v) => v * axis[i])), [0, 0, 0])),
      rotate: (name, axis, angle) => {
        const pivot = bones[name].pivot;
        for (const bone of after(name)) {
          bones[bone].pivot = add(pivot, rotateVector(sub(bones[bone].pivot, pivot), axis, angle));
          bones[bone].axes = bones[bone].axes.map((basis) => rotateVector(basis, axis, angle));
        }
      },
      shift: (name, offset) => { for (const bone of after(name)) bones[bone].pivot = add(bones[bone].pivot, offset); },
    },
  };
}

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const BLADE = [0.283, 0.767, 0.576];
const EDGE = [0.959, -0.212, -0.189];

test('the elbow bends to the reach asked of it, and a straight arm is as far as it goes', () => {
  assert.ok(Math.abs(elbowAngleFor(0.3, 0.3, 0.3) - Math.PI / 3) < 1e-9, 'equal sides: 60 degrees');
  assert.ok(Math.abs(elbowAngleFor(0.3, 0.3, 5) - Math.PI) < 0.05, 'out of reach: straight');
  assert.ok(elbowAngleFor(0.3, 0.3, 0) > 0, 'never folds flat');
  const turned = rotateVector([1, 0, 0], [0, 0, 1], Math.PI / 2);
  assert.ok(distance(turned, [0, 1, 0]) < 1e-9);
});

test('the sword arm puts the wrist where it is asked and points the blade, edge leading', () => {
  for (const [index, keys] of SLASHES.entries()) {
    for (const key of keys) {
      const arm = toyArm();
      const reach = distance(arm.bones['upper_arm.R'].pivot, arm.bones['forearm.R'].pivot)
        + distance(arm.bones['forearm.R'].pivot, arm.bones['hand.R'].pivot);
      solveSwordArm(arm.api, key, 1);
      // there, or as near as a straight arm gets
      const shortfall = Math.max(0, distance(arm.api.position('upper_arm.R'), key.wrist) - reach);
      assert.ok(shortfall < 0.03, `strike ${index + 1} at ${key.at}: within reach`);
      assert.ok(distance(arm.api.position('hand.R'), key.wrist) < shortfall + 0.01, `strike ${index + 1} at ${key.at}: the wrist`);
      const blade = arm.api.direction('socket_sword', BLADE);
      assert.ok(dot(blade, normalize(key.blade)) > 0.999, `strike ${index + 1} at ${key.at}: the blade`);
      const edge = arm.api.direction('socket_sword', EDGE);
      const want = normalize(key.edge.map((v, i) => v - blade[i] * dot(key.edge, blade)));
      assert.ok(Math.abs(dot(edge, want)) > 0.99, `strike ${index + 1} at ${key.at}: an edge leads`);
    }
  }
});

test('weight 0 leaves the arm as the clip posed it', () => {
  const arm = toyArm();
  const before = arm.api.position('hand.R');
  solveSwordArm(arm.api, SLASHES[0][1], 0);
  assert.deepEqual(arm.api.position('hand.R'), before);
});

test('the combo cuts right to left, left to right, then down, rising from rest and returning to it', () => {
  const [first, second, third] = SLASHES;
  assert.ok(first[0].wrist[0] > first.at(-1).wrist[0], 'the first cut travels left');
  assert.ok(first.at(-1).blade[0] < -0.5, 'and ends with the blade out to the left');
  assert.ok(second[0].wrist[0] < second.at(-1).wrist[0], 'the second travels right');
  assert.ok(second.at(-1).blade[0] > 0.5);
  assert.ok(third[0].blade[1] > 0.5 && third.at(-1).blade[1] < -0.5, 'the third comes from high to low');
  for (const index of [0, 1, 2]) {
    assert.equal(slashPose(index, 0).weight, 0, 'starts from the resting arm');
    assert.equal(slashPose(index, 0.4).weight, 1, 'held through the cut');
    assert.ok(slashPose(index, 0.999).weight < 0.01, 'back to rest');
    // the cut is quicker through its middle than at its ends
    const early = distance(slashPose(index, 0.24).wrist, slashPose(index, 0.26).wrist);
    const middle = distance(slashPose(index, 0.41).wrist, slashPose(index, 0.43).wrist);
    assert.ok(middle > early, `strike ${index + 1} whips through the middle`);
  }
  assert.equal(slashPose(5, 0.3), null);
  assert.ok(OFF_HAND_CLEAR.every((turn) => turn.bone === 'upper_arm.L'), 'only the magic arm steps aside');
});
