import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bufferedServerTime,
  castPoseDeadlineFromEvent,
  castPoseWindowFromEvent,
  resolveSpellbladeState,
} from './spellbladePose.mjs';

const base = {
  alive: true,
  guarding: false,
  attackActive: false,
  staggerUntil: 0,
  dashUntil: 0,
  velocity: { x: 0, y: 0, z: 0 },
};

function assertNear(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} was not within ${epsilon} of ${expected}`);
}

test('remote spellblade state prioritizes incapacitating and combat states', () => {
  assert.equal(resolveSpellbladeState({ ...base, alive: false }, 10), 'dead');
  assert.equal(resolveSpellbladeState({ ...base, staggerUntil: 11, dashUntil: 11, guarding: true, attackActive: true }, 10), 'stagger');
  assert.equal(resolveSpellbladeState({ ...base, dashUntil: 11, guarding: true, attackActive: true }, 10), 'dash');
  assert.equal(resolveSpellbladeState({ ...base, guarding: true, attackActive: true }, 10), 'guard');
  assert.equal(resolveSpellbladeState({ ...base, attackActive: true }, 10), 'attack');
});

test('cast pose outranks locomotion but not active combat states', () => {
  const moving = { ...base, velocity: { x: 5, y: 0, z: 0 } };
  assert.equal(resolveSpellbladeState(moving, 10.1, 10.2, 10.0), 'cast');
  assert.equal(resolveSpellbladeState({ ...moving, guarding: true }, 10.1, 10.2, 10.0), 'guard');
});

test('cast pose waits for the buffered cast start instead of appearing early', () => {
  const moving = { ...base, velocity: { x: 5, y: 0, z: 0 } };
  assert.equal(resolveSpellbladeState(moving, 9.99, 10.36, 10.0), 'run');
  assert.equal(resolveSpellbladeState(moving, 10.0, 10.36, 10.0), 'cast');
  assert.equal(resolveSpellbladeState(moving, 10.36, 10.36, 10.0), 'run');
});

test('locomotion distinguishes air, run and idle', () => {
  assert.equal(resolveSpellbladeState({ ...base, velocity: { x: 0, y: 2, z: 0 } }, 10), 'air');
  assert.equal(resolveSpellbladeState({ ...base, velocity: { x: 2, y: 0, z: 2 } }, 10), 'run');
  assert.equal(resolveSpellbladeState(base, 10), 'idle');
});

test('cast pose is driven only by authoritative fireball cast events', () => {
  assert.equal(castPoseDeadlineFromEvent({ type: 'respawn', playerId: 'p1', at: 20 }, 19.5), 19.5);
  assertNear(castPoseDeadlineFromEvent({ type: 'fireballCast', playerId: 'p1', at: 20, castEndsAt: 20.3 }, 19.5), 20.36);

  assert.deepEqual(castPoseWindowFromEvent({ type: 'respawn', playerId: 'p1', at: 20 }), null);
  assert.deepEqual(
    castPoseWindowFromEvent({ type: 'fireballCast', playerId: 'p1', at: 20, castEndsAt: 20.3 }),
    { startAt: 20, endAt: 20.36 },
  );
});

test('timed states use the buffered render clock instead of current wall clock', () => {
  const a = { at: 1000, serverTime: 5.0 };
  const b = { at: 1033, serverTime: 5.033 };
  assertNear(bufferedServerTime(a, b, 1016.5), 5.0165);

  const latest = { at: 1033, serverTime: 5.033 };
  assertNear(bufferedServerTime(latest, latest, 1066), 5.066);
});
