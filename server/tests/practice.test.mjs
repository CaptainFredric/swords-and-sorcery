import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import { RoomManager } from '../../shared/sim/RoomManager.mjs';
import {
  PRACTICE_DUMMY_MODES,
  resetPracticePlayer,
  spawnPracticeDummy,
  removePracticeDummy,
  setPracticeDummyMode,
  stepPracticeActors,
} from '../../shared/sim/practice.mjs';
import { stepRoom } from '../../shared/sim/combat.mjs';

function sequenceRandom(values = [0.5]) {
  let i = 0;
  return () => values[(i++) % values.length];
}

function makePracticeRoom() {
  const manager = new RoomManager({ random: sequenceRandom([0.13, 0.29, 0.47, 0.61, 0.79]) });
  const room = manager.createSoloRoom('PRACTICE', 0);
  const human = room.addPlayer({ id: 'human', token: 'token', name: 'Aden' }, 0);
  room.armAutoStart(0);
  human.spawnProtectionUntil = 0;
  return { room, human };
}

test('practice utilities are rejected in FFA', () => {
  const room = new Room('ABCDE', { mode: 'FFA', worldId: 'shattered-keep' });
  assert.equal(resetPracticePlayer(room, 'p1', 1), false);
  assert.equal(spawnPracticeDummy(room, 'PASSIVE', 1), null);
  assert.equal(removePracticeDummy(room), false);
  assert.equal(setPracticeDummyMode(room, 'PASSIVE', 1), false);
});

test('practice reset restores base combat resources and cooldowns', () => {
  const { room, human } = makePracticeRoom();
  human.health = 12;
  human.guardStamina = 9;
  human.spellReadyAt = 99;
  human.dashReadyAt = 99;
  human.guarding = true;
  human.attackHeld = true;
  human.attackActive = true;

  assert.equal(resetPracticePlayer(room, human.id, 5), true);
  assert.equal(human.health, 100);
  assert.equal(human.guardStamina, 100);
  assert.ok(human.spellReadyAt <= 5);
  assert.ok(human.dashReadyAt <= 5);
  assert.equal(human.guarding, false);
  assert.equal(human.attackHeld, false);
  assert.equal(human.attackActive, false);
  assert.equal(human.alive, true);
});

test('practice owns at most one dummy and can switch its mode', () => {
  const { room } = makePracticeRoom();
  const first = spawnPracticeDummy(room, 'PASSIVE', 0);
  const second = spawnPracticeDummy(room, 'GUARDING', 0);
  const dummies = [...room.players.values()].filter((player) => player.actorKind === 'dummy');

  assert.equal(dummies.length, 1);
  assert.equal(first.id, second.id);
  assert.equal(dummies[0].practiceMode, 'GUARDING');
});

test('practice dummy modes are explicit and invalid modes are rejected', () => {
  const { room } = makePracticeRoom();
  assert.deepEqual(new Set(Object.values(PRACTICE_DUMMY_MODES)), new Set(['PASSIVE', 'GUARDING', 'FIGHTS_BACK', 'SORCERY', 'MELEE', 'RUNNER']));
  assert.equal(spawnPracticeDummy(room, 'NOPE', 0), null);
  assert.equal(setPracticeDummyMode(room, 'NOPE', 0), false);
});

test('practice dummy can be removed cleanly', () => {
  const { room } = makePracticeRoom();
  const dummy = spawnPracticeDummy(room, 'PASSIVE', 0);
  assert.ok(dummy);
  assert.equal(removePracticeDummy(room), true);
  assert.equal([...room.players.values()].some((player) => player.actorKind === 'dummy'), false);
  assert.equal(removePracticeDummy(room), false);
});

test('the Practice Yard\'s opponents: each is the one bot controller with a kind, named for it', () => {
  const { room } = makePracticeRoom();
  const dummy = spawnPracticeDummy(room, 'SORCERY', 0);
  assert.equal(dummy.botProfile, 'caster');
  assert.equal(dummy.name, 'Spells & Sorcery');
  setPracticeDummyMode(room, 'MELEE', 0);
  assert.equal(dummy.botProfile, 'melee');
  assert.equal(dummy.name, 'Mr. Melee');
  assert.equal(dummy.spell, 'steel');
  setPracticeDummyMode(room, 'RUNNER', 0);
  assert.equal(dummy.botProfile, 'runner');
  assert.equal(dummy.name, 'Sir Runs-a-Lot');
  // and back to a plain dummy: no kind, no ward
  setPracticeDummyMode(room, 'PASSIVE', 0);
  assert.equal(dummy.botProfile, null);
  assert.equal(dummy.name, 'Training Dummy');
  assert.equal(dummy.spell, 'fireball');
});

test('no Practice opponent ends a match, so none awards Renown, however often it falls or wins', () => {
  for (const mode of ['FIGHTS_BACK', 'SORCERY', 'MELEE', 'RUNNER']) {
    const { room, human } = makePracticeRoom();
    room.tick(4);
    const dummy = spawnPracticeDummy(room, mode, 4);
    dummy.spawnProtectionUntil = 0;
    const ended = [];
    for (let i = 0; i < 400; i += 1) {
      const now = 4 + i / 30;
      stepPracticeActors(room, now, room.world, { random: sequenceRandom([0.1, 0.4, 0.7]) });
      for (const event of stepRoom(room, 1 / 30, now, room.world).splice(0)) if (event.type === 'matchEnded') ended.push(event);
      room.tick(now);
      if (i % 20 === 0) {
        room.recordKill(human.id, dummy.id, now);
        room.recordKill(dummy.id, human.id, now);
      }
    }
    assert.equal(room.state, 'PLAYING', mode);
    assert.deepEqual(ended, [], `${mode}: no match ended, no Renown`);
    assert.ok(human.kills >= 20 && dummy.kills >= 20);
  }
});
