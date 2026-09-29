import test from 'node:test';
import assert from 'node:assert/strict';
import { FIRST_PERSON_OFF_ARM, elbowAngleFor, normalize, rotateVector, solveArm, solveSwordArm } from './swordArmIK.mjs';
import { CHAIN, COMBO, COMBO_CONTACTS, COMBO_CYCLE, OFF_HAND_CLEAR, REST_ARM, comboPose, offHandOnGrip } from './fpSlash.mjs';

// a toy arm with the first-person rig's proportions: each bone a pivot and an orientation (three axes), turning a
// bone carries everything after it in the chain
function toyArm(side = 'R') {
  const bones = side === 'R' ? {
    'upper_arm.R': { pivot: [0.44, -0.49, -0.08] },
    'forearm.R': { pivot: [0.424, -0.4, -0.364] },
    'hand.R': { pivot: [0.395, -0.308, -0.648] },
    socket_sword: { pivot: [0.366, -0.248, -0.715] },
  } : {
    'upper_arm.L': { pivot: [-0.44, -0.49, -0.08] },
    'forearm.L': { pivot: [-0.424, -0.435, -0.373] },
    'hand.L': { pivot: [-0.399, -0.38, -0.667] },
  };
  const order = Object.keys(bones);
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
const sub = (a, b) => a.map((v, i) => v - b[i]);
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

test('the sword arm puts the wrist where it is asked and points the blade, edge leading, all through the chain', () => {
  for (let t = 0; t < COMBO_CYCLE; t += 0.04) {
    const { arm: target } = comboPose(t);
    const arm = toyArm();
    solveSwordArm(arm.api, target, 1);
    // the body brings the shoulder round (the arm alone is too short to reach the middle of the view), and the hand
    // gets there
    assert.ok(distance(arm.api.position('hand.R'), target.wrist) < 0.012, `the wrist at ${t.toFixed(2)} s`);
    const blade = arm.api.direction('socket_sword', BLADE);
    assert.ok(dot(blade, normalize(target.blade)) > 0.999, `the blade at ${t.toFixed(2)} s`);
    const edge = arm.api.direction('socket_sword', EDGE);
    const want = normalize(target.edge.map((v, i) => v - blade[i] * dot(target.edge, blade)));
    assert.ok(Math.abs(dot(edge, want)) > 0.99, `an edge leads at ${t.toFixed(2)} s`);
  }
});

test('for the finisher the magic hand closes on the grip, a hand below the sword hand, and lets go after', () => {
  for (const t of [1.58, 1.7, 1.8, 1.92]) {
    const pose = comboPose(t);
    assert.ok(pose.offHand && pose.offHand.weight > 0.99, `both hands at ${t} s`);
    const sword = toyArm();
    solveSwordArm(sword.api, pose.arm, 1);
    const off = toyArm('L');
    solveArm(off.api, FIRST_PERSON_OFF_ARM, pose.offHand, 1);
    assert.ok(distance(off.api.position('hand.L'), pose.offHand.wrist) < 0.012, `the magic hand reaches the grip at ${t} s`);
    // below the sword hand along the blade (toward the pommel), and close to it
    const along = dot(sub(off.api.position('hand.L'), sword.api.position('hand.R')), normalize(pose.arm.blade));
    assert.ok(along < -0.05 && distance(off.api.position('hand.L'), sword.api.position('hand.R')) < 0.3, `on the grip at ${t} s`);
    assert.ok(dot(off.api.direction('hand.L', [0, 1, 0]), pose.offHand.aim) > 0.999, `its fingers wrap the grip at ${t} s`);
  }
  for (const t of [0.2, 0.4, 0.64, 1.1, 1.22, 2.075]) {
    const pose = comboPose(t);
    assert.ok(!pose.offHand || pose.offHand.weight < 0.05, `the magic hand keeps to itself at ${t} s`);
  }
});

test('weight 0 leaves the arm as the clip posed it', () => {
  const arm = toyArm();
  const before = arm.api.position('hand.R');
  solveSwordArm(arm.api, comboPose(0.4).arm, 0);
  assert.deepEqual(arm.api.position('hand.R'), before);
});

test('the combo is one unbroken chain: fast, fast, heavy, each strike starting where the last one finished', () => {
  // it begins and ends at rest, and the hand never jumps
  assert.ok(distance(comboPose(0).arm.wrist, REST_ARM.wrist) < 1e-9 && distance(comboPose(COMBO_CYCLE - 1e-9).arm.wrist, REST_ARM.wrist) < 1e-3);
  let last = comboPose(0);
  for (let t = 0.01; t < COMBO_CYCLE; t += 0.01) {
    const now = comboPose(t);
    assert.ok(distance(now.arm.wrist, last.arm.wrist) < 0.05, `no jump at ${t.toFixed(2)} s`);
    last = now;
  }
  // each blow lands when the server lands it, through the middle of the view
  for (const [index, at] of COMBO_CONTACTS.entries()) {
    const pose = comboPose(at);
    assert.equal(pose.strike, index);
    assert.ok(Math.abs(pose.arm.wrist[0]) < 0.25 && pose.arm.wrist[1] > -0.32, `strike ${index + 1} lands in the middle`);
  }
  // the first cuts across to the left and stays there; the second rises from there to the high right; the third comes
  // down from above, and they never go back to rest in between
  const at = (t) => comboPose(t).arm;
  assert.ok(at(0.64).wrist[0] < 0.05 && at(0.64).blade[0] < -0.5, 'the forehand finishes low on the left');
  assert.ok(distance(at(0.84).wrist, at(0.64).wrist) < 0.1, 'the backhand starts from there');
  assert.ok(at(1.22).wrist[0] > 0.25 && at(1.22).blade[0] > 0.5, 'and finishes high on the right');
  assert.ok(at(1.58).wrist[1] > at(1.36).wrist[1] - 0.05 && at(1.58).blade[1] > 0.8, 'the finisher chambers high');
  assert.ok(at(1.92).wrist[1] < -0.35, 'and drives down low');
  for (const t of [0.64, 0.84, 1.36]) assert.ok(distance(at(t).wrist, REST_ARM.wrist) > 0.2, `not back to rest at ${t} s`);
  // the finisher is the committed one: its point comes round much faster than the forehand's
  const tip = (t) => { const { wrist, blade } = at(t); return wrist.map((v, i) => v + blade[i] * 0.78); };
  const fastest = (from, to) => { let most = 0; for (let t = from; t < to; t += 0.01) most = Math.max(most, distance(tip(t), tip(t + 0.01)) / 0.01); return most; };
  assert.ok(fastest(1.58, 1.92) > 1.25 * fastest(0.15, 0.5), 'the finisher drives through harder than the forehand');
  // never a slab across the eye: the hand stays out at arm's length and the blade never swings back at the camera
  for (let t = 0; t < COMBO_CYCLE; t += 0.01) {
    const { wrist, blade } = at(t);
    assert.ok(wrist[2] < -0.48, `the hand kept out from the eye at ${t.toFixed(2)} s`);
    assert.ok(blade[2] < 0.3, `the blade not turned back at the camera at ${t.toFixed(2)} s`);
  }
  // the view leans with the body, by a couple of degrees at most
  for (let t = 0; t < COMBO_CYCLE; t += 0.02) {
    for (const lean of Object.values(comboPose(t).look)) assert.ok(Math.abs(lean) < 3 * Math.PI / 180, `a lean at ${t.toFixed(2)} s`);
  }
  assert.equal(comboPose(NaN), null);
  assert.ok(COMBO.every((key, i) => i === 0 || key.t > COMBO[i - 1].t), 'keys in order');
  assert.ok(OFF_HAND_CLEAR.every((turn) => turn.bone === 'upper_arm.L'), 'only the magic arm steps aside');
});

test('the arm whips the blade (body first, hand, then blade), and the magic hand swoops up into the grip', () => {
  assert.ok(CHAIN.body > 0 && CHAIN.blade > 0, 'the body leads and the blade trails');
  // mid-cut the blade is still turning after the hand has moved on: not the same instant of the path
  const now = comboPose(0.36).arm;
  const handOnly = comboPose(0.36 + CHAIN.blade).arm;
  assert.ok(dot(now.blade, handOnly.blade) < 0.9999, 'the blade lags');
  // while it is still taking hold, the magic hand comes up from below the grip, and it falls away the same way
  for (const t of [1.3, 1.38, 2.0]) {
    const pose = comboPose(t);
    if (!pose.offHand || pose.offHand.weight > 0.98) continue;
    assert.ok(pose.offHand.wrist[1] < offHandOnGrip(pose.arm).wrist[1] - 0.01, `from below at ${t} s`);
  }
  assert.ok(Math.abs(comboPose(1.7).offHand.wrist[1] - offHandOnGrip(comboPose(1.7).arm).wrist[1]) < 1e-6, 'on the grip once it holds');
});
