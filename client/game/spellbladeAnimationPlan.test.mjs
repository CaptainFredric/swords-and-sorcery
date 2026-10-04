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

test('a chain begun Sundering plays every strike as the heavy slam, each at its own contact', () => {
  const player = { attackStartedAt: 10, attackSlam: true };
  // the heavy strike's contact is 0.36 s into Slash_3, and each strike's contact (0.4, 1.1, 1.8) lands there
  for (const contact of [0.4, 1.1, 1.8]) {
    const plan = resolveSpellbladeAnimationPlan({ state: 'attack', player, serverNow: 10 + contact, localTime: 99 });
    assert.equal(plan.clip, 'Slash_3');
    close(plan.time, 0.36);
  }
  assert.equal(resolveSpellbladeAnimationPlan({ state: 'attack', player: { attackStartedAt: 10 }, serverNow: 10.4 }).clip, 'Slash_1');
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
  assert.deepEqual(air, { clip: 'Air', time: 0.5, loop: false, weight: 1, normalized: true });
  const takeOff = resolveSpellbladeAnimationPlan({ state: 'air', player: { velocity: { y: 7.2 } }, serverNow: 1, localTime: 4.25 });
  const falling = resolveSpellbladeAnimationPlan({ state: 'air', player: { velocity: { y: -7.2 } }, serverNow: 1, localTime: 4.25 });
  assert.equal(takeOff.time, 0, 'take-off starts the air clip');
  assert.equal(falling.time, 1, 'a full-speed fall reaches its end');

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

test('sprint is its own looping clip that falls back to Run on an asset without it', () => {
  const plan = resolveSpellbladeAnimationPlan({ state: 'sprint', player: {}, serverNow: 1, localTime: 2.5 });
  assert.equal(plan.clip, 'Sprint');
  assert.equal(plan.fallback, 'Run');
  assert.equal(plan.loop, true);
  close(plan.time, 2.5);
});

test('the brace into Sunder is the slam\'s own wind-up: it eases up through the startup and the first slam carries on from its last frame', async () => {
  const { resolveSpellbladeState } = await import('./spellbladePose.mjs');
  const { ULTIMATES } = await import('../../shared/src/ultimates.mjs');
  const sunder = ULTIMATES.sunder;
  const pressedAt = 10;
  const commitAt = pressedAt + sunder.startupSec;
  const base = { alive: true, velocity: { x: 0, y: 0, z: 0 } };
  const bracing = { ...base, ultimateState: { id: 'sunder', phase: 'startup', commitAt } };
  // the brace has the body from the moment the key is taken: over an attack in progress, a guard, a cast
  assert.equal(resolveSpellbladeState(bracing, pressedAt), 'brace');
  assert.equal(resolveSpellbladeState({ ...bracing, attackActive: true, attackStartedAt: 9.5 }, pressedAt + 0.1), 'brace', 'an attack under way does not keep the body');
  assert.equal(resolveSpellbladeState({ ...bracing, guarding: true }, pressedAt + 0.1), 'brace');
  assert.equal(resolveSpellbladeState({ ...bracing, staggerUntil: 11 }, pressedAt + 0.1), 'stagger', 'struck out of it, he is staggered');
  assert.notEqual(resolveSpellbladeState({ ...base, ultimateState: { id: 'sunder', phase: 'active', until: 18 } }, commitAt + 0.1), 'brace');
  // the sword goes up without a jump: the clip's time rises smoothly from 0, never backwards, and starts and ends gently
  let last = -1;
  const times = [];
  for (let i = 0; i <= 30; i += 1) {
    const plan = resolveSpellbladeAnimationPlan({ state: 'brace', player: bracing, serverNow: pressedAt + sunder.startupSec * i / 30 });
    assert.equal(plan.clip, 'Slash_3');
    assert.ok(plan.time >= last, 'never backwards');
    last = plan.time;
    times.push(plan.time);
  }
  close(times[0], 0);
  assert.ok(times[1] - times[0] < times[15] - times[14], 'it starts gently');
  assert.ok(times[30] - times[29] < times[15] - times[14], 'and settles at the top');
  // the host begins the first slam's chain `firstSlamLead` before the commit: at the commit, the attack's own plan is at
  // the very frame the brace ended on
  const slamming = { ...base, attackActive: true, attackSlam: true, attackStartedAt: commitAt - sunder.firstSlamLead };
  const first = resolveSpellbladeAnimationPlan({ state: 'attack', player: slamming, serverNow: commitAt });
  assert.equal(first.clip, 'Slash_3');
  close(first.time, times[30], 1e-9);
  // and that slam meets the ground `0.4 - firstSlamLead` after the commit, not a whole swing later
  const contact = resolveSpellbladeAnimationPlan({ state: 'attack', player: slamming, serverNow: slamming.attackStartedAt + 0.4 });
  close(contact.time, 0.36);
});
