import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSpellbladeAnimationPlan } from './spellbladeAnimationPlan.mjs';

function close(actual, expected, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

test('late attack snapshots select the authoritative slash clip and local clip time', () => {
  const player = { attackStartedAt: 10 };

  let plan = resolveSpellbladeAnimationPlan({ state: 'attack', player, serverNow: 10.9, localTime: 99 });
  assert.equal(plan.clip, 'Slash_2');
  close(plan.time, 0.18);
  assert.equal(plan.loop, false);

  plan = resolveSpellbladeAnimationPlan({ state: 'attack', player, serverNow: 11.7, localTime: 99 });
  assert.equal(plan.clip, 'Slash_3');
  close(plan.time, 0.26);
});

test('cast timing comes from the authoritative cast window start', () => {
  const plan = resolveSpellbladeAnimationPlan({
    state: 'cast',
    player: { castPoseStartAt: 5 },
    serverNow: 5.22,
    localTime: 88,
  });
  assert.equal(plan.clip, 'Cast');
  close(plan.time, 0.22);
  assert.equal(plan.loop, false);
});

test('dash and stagger progress derive from authoritative server deadlines', () => {
  const dash = resolveSpellbladeAnimationPlan({
    state: 'dash',
    player: { dashUntil: 9.18 },
    serverNow: 9.08,
    localTime: 77,
  });
  assert.equal(dash.clip, 'Dash');
  close(dash.time, 0.08);
  assert.equal(dash.loop, false);

  const stagger = resolveSpellbladeAnimationPlan({
    state: 'stagger',
    player: { staggerUntil: 20.7 },
    serverNow: 20.2,
    localTime: 66,
  });
  assert.equal(stagger.clip, 'Stagger');
  close(stagger.time, 0.2);
  assert.equal(stagger.loop, false);
});

test('death derives clip progress from the authoritative respawn deadline', () => {
  const plan = resolveSpellbladeAnimationPlan({
    state: 'dead',
    player: { respawnAt: 33 },
    serverNow: 30.45,
    localTime: 55,
  });
  assert.equal(plan.clip, 'Death');
  close(plan.time, 0.45);
  assert.equal(plan.loop, false);
});

test('guard and air select fixed non-looping poses while locomotion loops locally', () => {
  const guard = resolveSpellbladeAnimationPlan({ state: 'guard', player: {}, serverNow: 1, localTime: 4.25 });
  assert.deepEqual(guard, { clip: 'Guard', time: 0, loop: false, weight: 1 });

  const air = resolveSpellbladeAnimationPlan({ state: 'air', player: {}, serverNow: 1, localTime: 4.25 });
  assert.deepEqual(air, { clip: 'Air', time: 0, loop: false, weight: 1 });

  const run = resolveSpellbladeAnimationPlan({ state: 'run', player: {}, serverNow: 1, localTime: 4.25 });
  assert.equal(run.clip, 'Run');
  assert.equal(run.loop, true);
  close(run.time, 4.25);

  const idle = resolveSpellbladeAnimationPlan({ state: 'idle', player: {}, serverNow: 1, localTime: 7.5 });
  assert.equal(idle.clip, 'Idle');
  assert.equal(idle.loop, true);
  close(idle.time, 7.5);
});
