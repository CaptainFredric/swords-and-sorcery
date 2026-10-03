import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import { spawnPracticeDummy, setPracticeDummyMode, stepPracticeActors, resetPracticePlayer } from '../../shared/sim/practice.mjs';
import { stepRoom, killPlayer } from '../../shared/sim/combat.mjs';
import { observeChallengeFacts, challengeProgressFor } from '../../shared/sim/challenges.mjs';
import { matchReward } from '../src/ProfileStore.mjs';
import { eligibleChallengeParticipant } from '../src/challengeSettlement.mjs';
import { ULTIMATES } from '../../shared/src/ultimates.mjs';

const world = { floors: [{ id: 'floor', center: [0, -0.1, 0], size: [80, 0.2, 80], y: 0 }],
  ramps: [], solids: [], abyssY: -9, spawnPoints: [{ x: 0, y: 0, z: 0, yaw: 0 }, { x: 0, y: 0, z: -4, yaw: Math.PI }] };
function fixture() {
  const room = new Room('KNIGHT', { mode: 'PRACTICE' }); room.world = world;
  const human = room.addPlayer({ id: 'human', token: 'human', name: 'Aden' }, 0);
  room.startMatch(0);
  const knight = spawnPracticeDummy(room, 'ULTIMATE_KNIGHT', 0);
  return { room, human, knight };
}
function frame(f, now, observations = []) {
  const { room, human, knight } = f;
  for (const [actor, z] of [[human, -2], [knight, 0]]) {
    actor.position = { x: 0, y: 0, z }; actor.velocity = { x: 0, y: 0, z: 0 };
    actor.impulse = { x: 0, z: 0 }; actor.grounded = true; actor.health = 100;
    actor.spawnProtectionUntil = 0;
  }
  room.events.length = 0;
  stepPracticeActors(room, now, world, { random: () => 0.5 });
  observations.push({ now, ultimate: knight.ultimateState?.id, phase: knight.ultimateState?.phase,
    sword: knight.attackActive, guard: knight.guarding, spell: knight.pendingSpell?.spell,
    dash: now < knight.dashUntil, selected: knight.spell, prowess: knight.prowess });
  stepRoom(room, 1 / 30, now, world);
  return room.events.slice();
}

test('Ultimate Knight is a single Practice actor with its full name and ready charge', () => {
  const f = fixture(); assert.ok(f.knight);
  assert.equal(f.knight.name, 'The Ultimate Knight'); assert.equal(f.knight.botProfile, 'rival');
  assert.equal(f.knight.prowess, 100); assert.equal(f.knight.ultimate, 'sunder');
  assert.deepEqual(f.knight.preparedSpells, ['fireball', 'frostfire', 'gale']);
  assert.equal(spawnPracticeDummy(f.room, 'ULTIMATE_KNIGHT', 1), f.knight);
  assert.equal([...f.room.players.values()].filter((p) => p.actorKind === 'dummy').length, 1);
  const arena = new Room('ARENA'); assert.equal(spawnPracticeDummy(arena, 'ULTIMATE_KNIGHT', 0), null);
});

test('real commits cycle deterministically with a three second refill after recovery and concurrent demonstrations', () => {
  const f = fixture(); const events = []; const states = [];
  for (let i = 0; i < 1800; i++) events.push(...frame(f, i / 30, states));
  const active = events.filter((e) => e.type === 'ultimateActive');
  assert.deepEqual(active.slice(0, 4).map((e) => e.ultimate), ['sunder', 'vortex', 'chivalry', 'sunder']);
  const ended = events.filter((e) => e.type === 'ultimateEnded');
  const started = events.filter((e) => e.type === 'ultimateStart');
  for (let i = 0; i < 4; i++) {
    assert.ok(active[i].at >= started[i].commitAt - 1e-9);
    assert.ok(Math.abs(started[i].commitAt - started[i].at - ULTIMATES[started[i].ultimate].startupSec) < 1e-9);
  }
  for (let i = 1; i < 4; i++) assert.ok(started[i].at >= ended[i - 1].at + 3 + (ended[i - 1].ultimate === 'vortex' ? 0.5 : 0) - 1e-6);
  for (const state of states.filter((s) => s.phase === 'active')) assert.equal(state.prowess, 0);
  const chiv = states.filter((s) => s.ultimate === 'chivalry' && s.phase === 'active');
  for (const predicate of [(s) => s.guard && s.sword, (s) => s.spell && s.sword,
    (s) => s.dash && s.sword, (s) => s.guard && s.sword && s.spell && s.dash]) assert.ok(chiv.some(predicate));
  assert.deepEqual(new Set(chiv.map((s) => s.selected)), new Set(['fireball', 'frostfire', 'gale']));
  assert.deepEqual(new Set(events.filter((e) => e.type === 'spellCast' && e.playerId === f.knight.id).map((e) => e.spell)),
    new Set(['fireball', 'frostfire', 'gale']));
  assert.ok(events.some((e) => e.type === 'attackStarted' && !states.find((s) => Math.abs(s.now - e.at) < 1e-6)?.ultimate));
});

test('startup interruption retains real charge and retries the same ultimate after lockout', () => {
  const f = fixture(); frame(f, 0);
  assert.equal(f.knight.ultimateState?.phase, 'startup');
  f.knight.staggerUntil = 0.5; stepRoom(f.room, 1 / 30, 0.1, world);
  assert.equal(f.knight.ultimateState, null); assert.equal(f.knight.prowess, 100);
  const lockout = f.knight.ultimateLockedUntil;
  for (let now = 0.2; now < lockout; now += 1 / 30) {
    frame(f, now); assert.equal(f.knight.ultimateState, null);
  }
  for (let now = lockout; now < lockout + 5 && !f.knight.ultimateState; now += 1 / 30) frame(f, now);
  assert.equal(f.knight.ultimateState?.id, 'sunder');
});

test('a committed ultimate followed by death in the same tick advances once', () => {
  const f = fixture(); frame(f, 0);
  const commit = f.knight.ultimateState.commitAt;
  stepRoom(f.room, 1 / 30, commit, world);
  assert.equal(f.knight.ultimateState.phase, 'active');
  killPlayer(f.room, f.knight.id, f.human.id, 'sword', commit);
  assert.equal(f.knight.ultimateState, null); assert.equal(f.knight.alive, false);
  stepPracticeActors(f.room, commit, world); stepPracticeActors(f.room, commit + 0.1, world);
  f.knight.alive = true; f.knight.staggerUntil = -Infinity;
  frame(f, commit + 3.2);
  assert.equal(f.knight.ultimate, 'vortex');
});

test('a Knight spawned during the lobby promptly regains charge when the Practice session starts', () => {
  const f = fixture(); f.room.state = 'WAITING';
  spawnPracticeDummy(f.room, 'ULTIMATE_KNIGHT', 1);
  f.room.startMatch(3); assert.equal(f.knight.prowess, 0);
  frame(f, 3); assert.equal(f.knight.prowess, 100);
  assert.equal(f.knight.ultimateState?.id, 'sunder');
});

test('Practice resets clear held Guard and both spell clocks, and mode changes stop the demonstration', () => {
  const f = fixture(); f.human.guardHeld = true; f.human.spellReadyById = { fireball: 40 };
  f.human.chivalryProjectileReadyAt = 40; f.human.spell = 'gale';
  assert.equal(resetPracticePlayer(f.room, f.human.id, 3), true);
  assert.equal(f.human.guardHeld, false); assert.deepEqual(f.human.spellReadyById, {});
  assert.ok(f.human.chivalryProjectileReadyAt <= 3); assert.equal(f.human.spell, 'gale');
  frame(f, 4); assert.ok(f.knight.ultimateState);
  setPracticeDummyMode(f.room, 'PASSIVE', 4.1);
  frame(f, 5); assert.equal(f.knight.ultimateState, null); assert.equal(f.knight.attackHeld, false);
  assert.equal(f.knight.guardHeld, false); assert.equal(f.knight.pendingSpell, null);
});

test('Ultimate Knight combat cannot progress Challenges, reward Renown, or finish Practice by scoring', () => {
  const f = fixture();
  for (let i = 0; i < 1200; i++) {
    frame(f, i / 30); observeChallengeFacts(f.room);
    if (i % 20 === 0) f.room.recordKill(f.human.id, f.knight.id, i / 30);
  }
  assert.deepEqual(challengeProgressFor(f.room, f.human.id), {});
  assert.equal(f.room.state, 'PLAYING'); assert.equal(matchReward(f.room, f.human, 40), 0);
  assert.equal(eligibleChallengeParticipant(f.room, f.human), false);
});
