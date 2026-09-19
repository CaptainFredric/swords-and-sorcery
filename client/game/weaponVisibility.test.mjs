import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveWeaponPose } from './weaponPose.mjs';

const idleInput = {
  timeSec: 10,
  movingAmount: 0,
  attackHeld: false,
  attackStartedAt: 0,
  guard: false,
  recoilUntil: 0,
  parryUntil: 0,
  castStartedAt: 0,
  castUntil: 0,
  dashUntil: 0,
};

test('idle sword is angled enough to show a blade silhouette instead of pointing straight down the camera axis', () => {
  const pose = resolveWeaponPose(idleInput);
  const viewAngle = Math.hypot(pose.sword.rx, pose.sword.ry);
  assert.ok(viewAngle >= 0.22, `idle sword angle ${viewAngle} collapses the blade silhouette`);
  assert.ok(Math.abs(pose.sword.ry) <= 0.4, 'idle sword should stay on the weapon side rather than crossing the center broadside');
});
