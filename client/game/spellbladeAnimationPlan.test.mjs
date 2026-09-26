import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GUARD_HOLD_SECONDS,
  GUARD_HOLD_START,
  resolveFirstPersonAnimationPlan,
  resolveSpellbladeAnimationPlan,
} from './spellbladeAnimationPlan.mjs';

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

test('guard loops its breathing hold section on the local clock', () => {
  const at = (localTime) => resolveSpellbladeAnimationPlan({ state: 'guard', player: {}, serverNow: 1, localTime });
  const guard = at(4.25);
  assert.equal(guard.clip, 'Guard');
  assert.equal(guard.loop, false);
  close(guard.time, GUARD_HOLD_START + (4.25 % GUARD_HOLD_SECONDS));
  for (const clock of [0, 0.3, 1.1, 1.59, 1.6, 7.77, -2.5]) {
    const time = at(clock).time;
    assert.ok(time >= GUARD_HOLD_START && time < GUARD_HOLD_START + GUARD_HOLD_SECONDS, `guard time ${time} leaves the hold`);
  }
  assert.notEqual(at(0.2).time, at(0.9).time, 'the guard hold must move over time');
  close(at(0).time, at(GUARD_HOLD_SECONDS).time);

  const fp = resolveFirstPersonAnimationPlan({ state: 'guard' }, {}, 2.0);
  assert.equal(fp.clip, 'Guard');
  close(fp.time, GUARD_HOLD_START + (2.0 % GUARD_HOLD_SECONDS));
});

test('air selects a fixed pose while locomotion loops locally', () => {

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


test('first person held combos restart each slash timeline across repeated cycles', () => {
  const view = { attackStartedAt: 10 };
  for (const [elapsed, clip, time] of [[0.4, 'Slash_1', 0.4], [0.9, 'Slash_2', 0.18], [1.7, 'Slash_3', 0.26], [2.48, 'Slash_1', 0.4], [3.78, 'Slash_3', 0.26]]) {
    const plan = resolveFirstPersonAnimationPlan({ state: 'attack', strike: Number(clip.slice(-1)) - 1 }, view, 10 + elapsed);
    assert.equal(plan.clip, clip);
    close(plan.time, time);
    assert.equal(plan.loop, false);
  }
});

test('first person guard, cast and dash retain their own animation clocks', () => {
  const view = { castStartedAt: 20, dashUntil: 30.18 };
  close(resolveFirstPersonAnimationPlan({ state: 'guard' }, view, 99).time, GUARD_HOLD_START + (99 % GUARD_HOLD_SECONDS));
  close(resolveFirstPersonAnimationPlan({ state: 'cast' }, view, 20.2).time, 0.2);
  close(resolveFirstPersonAnimationPlan({ state: 'dash' }, view, 30.1).time, 0.1);
});
