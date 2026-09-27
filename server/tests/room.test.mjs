import test from 'node:test';
import assert from 'node:assert/strict';
import { ROOM_RULES, Room } from '../src/game/Room.mjs';
import { RoomManager, generateRoomCode } from '../src/rooms/RoomManager.mjs';
import { chooseSpawn } from '../src/game/spawns.mjs';
import { SHATTERED_KEEP } from '../../shared/src/map.mjs';

function add(room, id, now = 0) {
  return room.addPlayer({ id, token: `token-${id}`, name: id }, now);
}

function readyAll(room, now = 0) {
  for (const player of room.players.values()) if (player.actorKind === 'human' && player.connected) room.setReady(player.id, true, now);
}

test('room codes are short readable uppercase codes', () => {
  const code = generateRoomCode(() => 0.12345);
  assert.match(code, /^[A-Z]{4}[2-9]$/);
});

test('Room stores mode/world identity and marks network players human', () => {
  const room = new Room('ABCDE', { mode: 'FFA', worldId: 'shattered-keep' });
  const player = room.addPlayer({ id: 'p1', token: 't1', name: 'A' }, 0);
  assert.equal(room.mode, 'FFA');
  assert.equal(room.worldId, 'shattered-keep');
  assert.equal(player.actorKind, 'human');
});

test('room caps at eight players; the countdown starts once every Spellblade is ready, not on a host button', () => {
  const room = new Room('TEST2');
  add(room, 'a');
  assert.equal(room.state, 'WAITING');
  add(room, 'b');
  assert.equal(room.state, 'WAITING');
  assert.equal(room.setReady('b', true, 1), true);
  assert.equal(room.state, 'WAITING', 'one of two ready is not enough');
  assert.equal(room.setReady('a', true, 1), true);
  assert.equal(room.state, 'COUNTDOWN');
  for (const id of ['c', 'd', 'e', 'f', 'g', 'h']) add(room, id);
  assert.equal(room.players.size, 8);
  assert.throws(() => add(room, 'i'), /full/i);
});


test('players receive one second of spawn protection when a match begins', () => {
  const room = new Room('TEST2');
  add(room, 'a'); add(room, 'b');
  readyAll(room, 0); room.tick(3.1);
  assert.equal(room.state, 'PLAYING');
  assert.ok(room.players.get('a').spawnProtectionUntil >= 4.1);
  assert.ok(room.players.get('b').spawnProtectionUntil >= 4.1);
});

test('first to ten kills finishes the match', () => {
  const room = new Room('TEST2');
  add(room, 'a'); add(room, 'b');
  readyAll(room, 0); room.tick(3.1);
  assert.equal(room.state, 'PLAYING');
  for (let i = 0; i < 10; i += 1) room.recordKill('a', 'b', 4 + i);
  assert.equal(room.state, 'FINISHED');
  assert.equal(room.winnerId, 'a');
});

test('timer tie enters sudden death and next tied-leader kill wins', () => {
  const room = new Room('TEST2');
  add(room, 'a'); add(room, 'b'); add(room, 'c');
  readyAll(room, 0); room.tick(3.1);
  room.players.get('a').kills = 4;
  room.players.get('b').kills = 4;
  room.players.get('c').kills = 2;
  room.tick(3.1 + 360.01);
  assert.equal(room.state, 'PLAYING');
  assert.equal(room.suddenDeath, true);
  assert.deepEqual(new Set(room.suddenDeathLeaders), new Set(['a', 'b']));
  room.recordKill('b', 'c', 364);
  assert.equal(room.state, 'FINISHED');
  assert.equal(room.winnerId, 'b');
});

test('rematch votes reset scores and start a short rematch countdown', () => {
  const room = new Room('TEST2');
  add(room, 'a'); add(room, 'b'); readyAll(room, 0); room.tick(3.1);
  room.players.get('a').kills = 10;
  room.finish('a', 10);
  assert.equal(room.requestRematch('a', 11), false);
  assert.equal(room.requestRematch('b', 11), true);
  assert.equal(room.state, 'REMATCH_COUNTDOWN');
  assert.equal(room.players.get('a').kills, 0);
  room.tick(14.1);
  assert.equal(room.state, 'PLAYING');
});

test('disconnect retains player for fifteen seconds then removes slot', () => {
  const room = new Room('TEST2');
  add(room, 'a'); add(room, 'b');
  room.disconnectPlayer('a', 5);
  room.tick(19.9);
  assert.ok(room.players.has('a'));
  assert.equal(room.reconnectPlayer('token-a', 19.9)?.id, 'a');
  room.disconnectPlayer('a', 20);
  room.tick(35.01);
  assert.equal(room.players.has('a'), false);
});

test('empty room becomes cleanup eligible after sixty seconds', () => {
  const room = new Room('TEST2');
  add(room, 'a');
  room.disconnectPlayer('a', 0);
  room.tick(15.1);
  assert.equal(room.players.size, 0);
  assert.equal(room.isCleanupEligible(74.9), false);
  assert.equal(room.isCleanupEligible(75.2), true);
});

test('spawn chooser prefers distance from enemies and recent spawns', () => {
  const chosen = chooseSpawn(SHATTERED_KEEP.spawnPoints, [
    { position: { x: -6.5, y: 0, z: -6.5 } },
  ], new Map([[0, 99]]), 100);
  assert.notEqual(chosen.index, 0);
});

test('room manager creates and finds rooms', () => {
  const manager = new RoomManager({ random: () => 0.321 });
  const room = manager.createPrivateRoom(0);
  assert.equal(manager.findByCode(room.code), room);
});


test('a lone Spellblade cannot start; if the first to arrive leaves, the room simply carries on', () => {
  const room = new Room('TEST2'); add(room, 'a');
  room.setReady('a', true, 0);
  assert.equal(room.state, 'WAITING', 'one ready Spellblade cannot start a match');
  add(room, 'b'); add(room, 'c'); room.disconnectPlayer('a', 1);
  assert.equal(room.hostId(), 'b');
  assert.equal(room.setReady('a', true, 1), false, 'a disconnected Spellblade has no say');
  room.setReady('b', true, 1);
  assert.equal(room.state, 'WAITING');
  room.setReady('c', true, 1);
  assert.equal(room.state, 'COUNTDOWN', 'the connected Spellblades were all ready');
  assert.equal(room.requestStart('b', 1), false, 'readiness is only taken while waiting');
});

test('with two or more Spellblades the match starts on its own after a short wait, even if not all are ready', () => {
  const room = new Room('PUBL2', { isPrivate: false }); add(room, 'a', 0);
  room.tick(30);
  assert.equal(room.state, 'WAITING', 'no auto-start alone');
  add(room, 'b', 31);
  room.tick(31);
  assert.equal(room.autoStartAt, 31 + ROOM_RULES.AUTO_START_PUBLIC_SEC);
  room.tick(31 + ROOM_RULES.AUTO_START_PUBLIC_SEC - 0.1);
  assert.equal(room.state, 'WAITING');
  room.tick(31 + ROOM_RULES.AUTO_START_PUBLIC_SEC);
  assert.equal(room.state, 'COUNTDOWN');
  const privateRoom = new Room('PRIV2', { isPrivate: true }); add(privateRoom, 'a'); add(privateRoom, 'b');
  privateRoom.tick(0);
  assert.equal(privateRoom.autoStartAt, ROOM_RULES.AUTO_START_PRIVATE_SEC, 'friends get longer to gather');
  privateRoom.disconnectPlayer('b', 1);
  privateRoom.tick(2);
  assert.equal(privateRoom.autoStartAt, null, 'the wait resets when it drops back to one');
});

test('arena and score are majority votes; a tie keeps what the room has; they apply when the match starts', () => {
  const room = new Room('VOTE2', { isPrivate: false, worldId: 'castleward' });
  add(room, 'a'); add(room, 'b'); add(room, 'c');
  assert.equal(room.vote('a', 'world', 'shattered-keep'), true);
  assert.equal(room.vote('b', 'world', 'shattered-keep'), true);
  assert.equal(room.vote('c', 'world', 'castleward'), true);
  assert.equal(room.vote('a', 'score', 5), true);
  assert.equal(room.vote('b', 'score', 15), true);
  assert.equal(room.vote('a', 'world', 'the-moon'), false, 'only offered choices count');
  assert.equal(room.vote('a', 'score', 7), false);
  const tally = room.tallyVotes();
  assert.equal(tally.world.chosen, 'shattered-keep');
  assert.equal(tally.score.chosen, 10, 'a 1-1 tie keeps the current score');
  readyAll(room, 0); room.tick(3.1);
  assert.equal(room.state, 'PLAYING');
  assert.equal(room.worldId, 'shattered-keep');
  assert.equal(room.scoreToWin, 10);
  assert.equal(room.vote('a', 'score', 5), false, 'no voting mid-match');
});

test('a matchmade duel counts down five seconds once both duellists are in, and a duellist who leaves forfeits', () => {
  const room = new Room('DUEL2', { mode: 'DUEL' });
  add(room, 'a', 0);
  assert.equal(room.armAutoStart(0), false);
  add(room, 'b', 0);
  assert.equal(room.armAutoStart(0), true);
  assert.equal(room.countdownEndsAt, 5);
  room.tick(5.01);
  assert.equal(room.state, 'PLAYING');
  assert.equal(room.scoreToWin, 5);
  for (let i = 0; i < 5; i += 1) room.recordKill('b', 'a', 6 + i);
  assert.equal(room.state, 'FINISHED');
  assert.equal(room.winnerId, 'b');

  const quitter = new Room('DUEL3', { mode: 'DUEL' });
  add(quitter, 'a'); add(quitter, 'b'); quitter.armAutoStart(0); quitter.tick(5.01);
  quitter.removePlayer('a', 6);
  quitter.tick(6.1);
  assert.equal(quitter.state, 'FINISHED');
  assert.equal(quitter.winnerId, 'b');
  assert.equal(quitter.finishReason, 'forfeit');
});
