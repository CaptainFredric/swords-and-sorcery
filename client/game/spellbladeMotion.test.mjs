import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REACTIONS, airborneLegFlex, gaitTime, landingStrength, localPushDirection, pruneReactions, reactionEnvelope, reactionPose,
  sorceryLevel,
} from './spellbladeMotion.mjs';

function close(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

function find(pose, bone) {
  return pose.rotations.filter((rotation) => rotation.bone === bone);
}

test('a reaction rises fast, holds briefly and eases out to nothing', () => {
  const spec = REACTIONS.hit;
  assert.equal(reactionEnvelope(-0.01, spec), 0);
  assert.ok(reactionEnvelope(spec.rise * 0.5, spec) > 0.3);
  close(reactionEnvelope(spec.rise + spec.hold * 0.5, spec), 1);
  assert.equal(reactionEnvelope(spec.rise + spec.hold + spec.fall + 0.01, spec), 0);
  // short: every reaction is over well inside half a second, so none reads as a stagger
  for (const each of Object.values(REACTIONS)) assert.ok(each.rise + each.hold + each.fall <= 0.4);
});

test('push directions are measured in the body frame (the model faces -z)', () => {
  const back = localPushDirection({ x: 0, z: 1 }, 0);
  close(back.x, 0); close(back.z, 1);
  // turned to face +x (yaw = -pi/2): a push along +x drives the body forward (-z), one along -x backward
  const forward = localPushDirection({ x: 1, z: 0 }, -Math.PI / 2);
  close(forward.x, 0, 1e-9); close(forward.z, -1, 1e-9);
  const backward = localPushDirection({ x: -1, z: 0 }, -Math.PI / 2);
  close(backward.z, 1, 1e-9);
  // facing +x, the body's right is world +z
  const right = localPushDirection({ x: 0, z: 1 }, -Math.PI / 2);
  close(right.x, 1, 1e-9);
  assert.deepEqual(localPushDirection(null, 0), { x: 0, z: 1 });
});

test('a hit from the front folds the torso backwards and the head snaps a beat later', () => {
  const at = 10;
  const pose = reactionPose([{ kind: 'hit', at, push: { x: 0, z: 1 } }], at + 0.06, 0);
  const [spine] = find(pose, 'spine');
  // axis up x back = +x; a positive turn about +x tips the top of the spine toward +z (back)
  assert.deepEqual(spine.axis, [1, 0, 0]);
  assert.ok(spine.angle > 0);
  const [head] = find(pose, 'head');
  assert.ok(head.angle < spine.angle / REACTIONS.hit.spine * REACTIONS.hit.head + 1e-9, 'head lags');
  assert.ok(pose.pelvis[2] > 0, 'the hips give a little in the push direction');
});

test('a hit from the side turns the shoulders away from the blow', () => {
  const at = 0;
  const fromLeft = reactionPose([{ kind: 'hit', at, push: { x: 1, z: 0 } }], 0.07, 0);
  const twist = find(fromLeft, 'chest').find((rotation) => rotation.axis[1] === 1);
  assert.ok(twist.angle < 0);
});

test('a blocked blow rings the sword arm; a parry sweeps it outward', () => {
  const blocked = reactionPose([{ kind: 'block', at: 0, push: { x: 0, z: 1 } }], 0.03, 0);
  assert.ok(find(blocked, 'hand.R').length > 0);
  const parried = reactionPose([{ kind: 'parry', at: 0, push: { x: 0, z: 1 } }], 0.04, 0);
  const [sweep] = find(parried, 'hand.R');
  assert.ok(sweep.angle < 0);
});

test('landings flex the legs by impact; a step down barely registers', () => {
  assert.equal(landingStrength(1), 0);
  assert.ok(landingStrength(7) > 0.5);
  const soft = reactionPose([{ kind: 'land', at: 0, strength: landingStrength(3) }], 0.06);
  const hard = reactionPose([{ kind: 'land', at: 0, strength: landingStrength(9) }], 0.06);
  assert.ok(hard.legFlex > soft.legFlex && soft.legFlex > 0);
});

test('finished reactions drop out; the air tuck fades by the apex', () => {
  const list = [{ kind: 'hit', at: 0 }, { kind: 'hit', at: 1 }];
  assert.deepEqual(pruneReactions(list, 1.1).map((reaction) => reaction.at), [1]);
  assert.ok(airborneLegFlex(7.2) > airborneLegFlex(2));
  assert.equal(airborneLegFlex(0), 0);
  assert.equal(airborneLegFlex(-6), 0);
});

test('run and sprint read the same stride phase at their own lengths', () => {
  close(gaitTime(0.25, 0.7), 0.175);
  close(gaitTime(0.25, 0.567), 0.14175);
  close(gaitTime(1.25, 0.7), 0.175);
  close(gaitTime(-0.75, 0.7), 0.175);
});

test('palm sorcery is a small ember at rest and only swells while a cast gathers and releases', () => {
  assert.equal(sorceryLevel('Idle', 0.3, 1), 0);
  assert.equal(sorceryLevel('Run', 0.3, 1), 0);
  const charge = [0.05, 0.2, 0.4].map((t) => sorceryLevel('Cast', t, 1));
  assert.ok(charge[0] < charge[1] && charge[1] < charge[2], 'the charge gathers');
  assert.ok(sorceryLevel('Cast', 0.58, 1) > 0.95, 'flares at the release');
  assert.ok(sorceryLevel('Cast', 0.99, 1) < 0.05, 'settles back to the ember');
});
