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
  assertNear(castPoseDeadlineFromEvent({ type: 'spellCast', playerId: 'p1', at: 20, castEndsAt: 20.3 }, 19.5), 20.36);

  assert.deepEqual(castPoseWindowFromEvent({ type: 'respawn', playerId: 'p1', at: 20 }), null);
  assert.deepEqual(
    castPoseWindowFromEvent({ type: 'spellCast', playerId: 'p1', at: 20, castEndsAt: 20.3 }),
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

test('a sprinting Spellblade on the move is in the sprint state; airborne or stopped it is not', () => {
  assert.equal(resolveSpellbladeState({ ...base, sprinting: true, velocity: { x: 0, y: 0, z: -11 } }, 10), 'sprint');
  assert.equal(resolveSpellbladeState({ ...base, sprinting: true, velocity: { x: 0, y: 3, z: -11 } }, 10), 'air');
  assert.equal(resolveSpellbladeState({ ...base, sprinting: true, velocity: { x: 0, y: 0, z: 0 } }, 10), 'idle');
  assert.equal(resolveSpellbladeState({ ...base, sprinting: true, guarding: true, velocity: { x: 0, y: 0, z: -3 } }, 10), 'guard');
});

test('a knight in a Blazing Vortex is the spin (lit or spinning), unless felled or staggered', async () => {
  const { resolveSpellbladeAnimationPlan } = await import('./spellbladeAnimationPlan.mjs');
  const lit = { ...base, ultimateState: { id: 'vortex', phase: 'startup', commitAt: 10.9 } };
  const spinning = { ...base, guarding: false, velocity: { x: 6, y: -3, z: 0 }, ultimateState: { id: 'vortex', phase: 'active', commitAt: 10, until: 14.5, spinFrom: 0 } };
  assert.equal(resolveSpellbladeState(lit, 10.1), 'vortex');
  assert.equal(resolveSpellbladeState(spinning, 11), 'vortex', 'whatever it is doing with its feet');
  assert.equal(resolveSpellbladeState({ ...spinning, staggerUntil: 12 }, 11), 'stagger');
  assert.equal(resolveSpellbladeState({ ...spinning, alive: false }, 11), 'dead');
  assert.notEqual(resolveSpellbladeState({ ...base, ultimateState: { id: 'sunder', phase: 'active', until: 18 } }, 11), 'vortex');
  // lit, the sword is raised; then held out level, a held pose (the knight is turned by the spin, not by the clip)
  const raised = resolveSpellbladeAnimationPlan({ state: 'vortex', player: lit, serverNow: 10.1 });
  const level = resolveSpellbladeAnimationPlan({ state: 'vortex', player: spinning, serverNow: 11 });
  const levelLater = resolveSpellbladeAnimationPlan({ state: 'vortex', player: spinning, serverNow: 12.7 });
  assert.equal(raised.clip, 'Slash_3');
  assert.equal(level.clip, 'Slash_1');
  assert.deepEqual(level, levelLater, 'held: the same frame all the way through');
  assert.equal(resolveSpellbladeAnimationPlan({ state: 'vortex', player: lit, serverNow: 10.8 }).clip, 'Slash_1', 'level before the spin takes hold');
});
