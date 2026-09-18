import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveWeaponPose } from './weaponPose.mjs';

const base = {
  timeSec: 10,
  movingAmount: 0,
  attackHeld: false,
  attackStartedAt: 0,
  guard: false,
  recoilUntil: 0,
  parryUntil: 0,
  castUntil: 0,
  dashUntil: 0,
};

test('guard presents a centered defensive sword silhouette', () => {
  const pose = resolveWeaponPose({ ...base, guard: true });
  assert.equal(pose.state, 'guard');
  assert.ok(pose.group.x < 0.2);
  assert.ok(pose.group.ry < -0.5);
  assert.ok(pose.leftHand.y > -0.5);
});

test('three sword strikes produce distinct readable swing directions', () => {
  const first = resolveWeaponPose({ ...base, attackHeld: true, attackStartedAt: 9.64 });
  const second = resolveWeaponPose({ ...base, attackHeld: true, attackStartedAt: 8.92 });
  const third = resolveWeaponPose({ ...base, attackHeld: true, attackStartedAt: 8.24 });

  assert.equal(first.strike, 0);
  assert.equal(second.strike, 1);
  assert.equal(third.strike, 2);
  assert.ok(first.group.rz < -0.5);
  assert.ok(second.group.rz > 0.4);
  assert.ok(third.group.rx < -0.6);
});

test('casting raises the magic off-hand and tucks the sword aside', () => {
  const pose = resolveWeaponPose({ ...base, castUntil: 10.2 });
  assert.equal(pose.state, 'cast');
  assert.ok(pose.leftHand.y > -0.2);
  assert.ok(pose.magicScale > 1.2);
  assert.ok(pose.group.x > 0.5);
});

test('dash tucks the weapon without pretending to be a sword swing', () => {
  const pose = resolveWeaponPose({ ...base, dashUntil: 10.1 });
  assert.equal(pose.state, 'dash');
  assert.equal(pose.strike, null);
  assert.ok(pose.group.y < -0.5);
});
