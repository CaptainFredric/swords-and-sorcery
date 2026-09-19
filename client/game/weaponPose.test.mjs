import test from 'node:test';
import assert from 'node:assert/strict';
import { FIRST_PERSON_WEAPON_SCALE, castVisualDuration, resolveWeaponPose } from './weaponPose.mjs';

const base = {
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

function near(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} was not within ${epsilon} of ${expected}`);
}

function assertViewmodelClear(pose, label) {
  assert.ok(pose.group.z <= -0.84, `${label} moved the weapon too close to the camera`);
  assert.ok(Math.abs(pose.group.ry) <= 0.46, `${label} turned the whole weapon broadside to the camera`);
}

test('first-person weapon keeps enough screen clear for arena reads', () => {
  assert.ok(FIRST_PERSON_WEAPON_SCALE >= 0.68, 'weapon should still feel physically substantial');
  assert.ok(FIRST_PERSON_WEAPON_SCALE <= 0.76, 'weapon should leave substantially more of the arena visible');
});

test('guard keeps the blade defensive without filling the center of the screen', () => {
  const pose = resolveWeaponPose({ ...base, guard: true });
  assert.equal(pose.state, 'guard');
  assertViewmodelClear(pose, 'guard');
  assert.ok(pose.group.x >= 0.24, 'guard should remain biased to the weapon side of the screen');
  assert.ok(pose.sword.rx < -0.3, 'guard should raise the blade using the sword pivot');
  assert.ok(Math.abs(pose.sword.ry) < 0.4, 'guard should not show the full broad side of the blade');
  assert.ok(pose.leftHand.y < -0.2, 'off-hand should brace low instead of blocking the crosshair');
});

test('three sword strikes use separate sword choreography without crossing the near plane', () => {
  const first = resolveWeaponPose({ ...base, attackHeld: true, attackStartedAt: 9.64 });
  const second = resolveWeaponPose({ ...base, attackHeld: true, attackStartedAt: 8.92 });
  const third = resolveWeaponPose({ ...base, attackHeld: true, attackStartedAt: 8.24 });

  assert.equal(first.strike, 0);
  assert.equal(second.strike, 1);
  assert.equal(third.strike, 2);
  assertViewmodelClear(first, 'strike one');
  assertViewmodelClear(second, 'strike two');
  assertViewmodelClear(third, 'strike three');
  assert.equal(first.attackPhase, 'cut');
  assert.equal(second.attackPhase, 'cut');
  assert.equal(third.attackPhase, 'cut');
  assert.ok(first.sword.ry < 0, 'first cut should travel right-to-left');
  assert.ok(second.sword.ry > 0, 'second cut should reverse left-to-right');
  assert.ok(third.sword.rx > first.sword.rx + 0.25, 'third cut should read as a heavier descending strike');
});

test('a sword strike has anticipation, cut, and recovery rather than one sinusoidal sweep', () => {
  const windup = resolveWeaponPose({ ...base, timeSec: 9.72, attackHeld: true, attackStartedAt: 9.64 });
  const cut = resolveWeaponPose({ ...base, timeSec: 10, attackHeld: true, attackStartedAt: 9.64 });
  const recover = resolveWeaponPose({ ...base, timeSec: 10.26, attackHeld: true, attackStartedAt: 9.64 });
  assert.equal(windup.attackPhase, 'windup');
  assert.equal(cut.attackPhase, 'cut');
  assert.equal(recover.attackPhase, 'recover');
});

test('casting reads as gather, release, recover and keeps the hand out of the camera', () => {
  const gather = resolveWeaponPose({ ...base, timeSec: 10, castStartedAt: 9.98, castUntil: 10.34 });
  const release = resolveWeaponPose({ ...base, timeSec: 10.18, castStartedAt: 9.98, castUntil: 10.34 });
  const recover = resolveWeaponPose({ ...base, timeSec: 10.31, castStartedAt: 9.98, castUntil: 10.34 });

  assert.equal(gather.castPhase, 'gather');
  assert.equal(release.castPhase, 'release');
  assert.equal(recover.castPhase, 'recover');
  assertViewmodelClear(gather, 'cast gather');
  assertViewmodelClear(release, 'cast release');
  assert.ok(gather.leftHand.z <= -0.72);
  assert.ok(release.leftHand.z < gather.leftHand.z, 'release should thrust the hand forward into the world, not toward the camera');
  assert.ok(release.magicScale > gather.magicScale);
  assert.ok(release.magicScale <= 1.3, 'cast glow should not become a giant camera-filling object');
  assert.ok(recover.leftHand.y < release.leftHand.y, 'cast hand should settle after release');
});

test('dash tucks the weapon without pretending to be a sword swing', () => {
  const pose = resolveWeaponPose({ ...base, dashUntil: 10.1 });
  assert.equal(pose.state, 'dash');
  assert.equal(pose.strike, null);
  assert.ok(pose.group.y < -0.5);
});

test('dash pose outranks held guard, attack, and cast poses', () => {
  const guarded = resolveWeaponPose({ ...base, guard: true, dashUntil: 10.1 });
  const attacking = resolveWeaponPose({ ...base, attackHeld: true, attackStartedAt: 9.8, dashUntil: 10.1 });
  const casting = resolveWeaponPose({ ...base, castStartedAt: 9.9, castUntil: 10.2, dashUntil: 10.1 });
  assert.equal(guarded.state, 'dash');
  assert.equal(attacking.state, 'dash');
  assert.equal(casting.state, 'dash');
});

test('local cast visual duration comes only from an authoritative local cast event', () => {
  near(castVisualDuration({ type: 'fireballCast', playerId: 'me', at: 20, castEndsAt: 20.3 }, 'me', 20.05), 0.31);
  assert.equal(castVisualDuration({ type: 'fireballCast', playerId: 'them', at: 20, castEndsAt: 20.3 }, 'me', 20.05), null);
  assert.equal(castVisualDuration({ type: 'respawn', playerId: 'me', at: 20 }, 'me', 20.05), null);
  assert.equal(castVisualDuration({ type: 'fireballCast', playerId: 'me', at: 20, castEndsAt: 20.3 }, 'me', 20.5), null);
});
