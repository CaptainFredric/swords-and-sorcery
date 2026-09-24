import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../src/game/Room.mjs';
import { RoomManager, generateRoomCode } from '../src/rooms/RoomManager.mjs';
import { chooseSpawn } from '../src/game/spawns.mjs';
import { SHATTERED_KEEP } from '../../shared/src/map.mjs';

function add(room, id, now = 0) {
  return room.addPlayer({ id, token: `token-${id}`, name: id }, now);
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

test('room caps at eight players and second player waits for the host start button', () => {
  const room = new Room('TEST2');
  add(room, 'a');
  assert.equal(room.state, 'WAITING');
  add(room, 'b');
  assert.equal(room.state, 'WAITING');
  assert.equal(room.requestStart('b', 1), false);
  assert.equal(room.requestStart('a', 1), true);
  assert.equal(room.state, 'COUNTDOWN');
  for (const id of ['c', 'd', 'e', 'f', 'g', 'h']) add(room, id);
  assert.equal(room.players.size, 8);
  assert.throws(() => add(room, 'i'), /full/i);
});


test('players receive one second of spawn protection when a match begins', () => {
  const room = new Room('TEST2');
  add(room, 'a'); add(room, 'b');
  room.requestStart('a', 0); room.tick(3.1);
  assert.equal(room.state, 'PLAYING');
  assert.ok(room.players.get('a').spawnProtectionUntil >= 4.1);
  assert.ok(room.players.get('b').spawnProtectionUntil >= 4.1);
});

test('first to ten kills finishes the match', () => {
  const room = new Room('TEST2');
  add(room, 'a'); add(room, 'b');
  room.requestStart('a', 0); room.tick(3.1);
  assert.equal(room.state, 'PLAYING');
  for (let i = 0; i < 10; i += 1) room.recordKill('a', 'b', 4 + i);
  assert.equal(room.state, 'FINISHED');
  assert.equal(room.winnerId, 'a');
});

test('timer tie enters sudden death and next tied-leader kill wins', () => {
  const room = new Room('TEST2');
  add(room, 'a'); add(room, 'b'); add(room, 'c');
  room.requestStart('a', 0); room.tick(3.1);
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
  add(room, 'a'); add(room, 'b'); room.requestStart('a', 0); room.tick(3.1);
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


test('start requires enough connected humans and transfers to a connected host', () => {
  const room = new Room('TEST2'); add(room, 'a');
  assert.equal(room.requestStart('a', 0), false);
  add(room, 'b'); add(room, 'c');room.disconnectPlayer('a', 1);
  assert.equal(room.hostId(), 'b');
  assert.equal(room.requestStart('a', 1), false);
  assert.equal(room.requestStart('c', 1), false);
  assert.equal(room.requestStart('b', 1), true);
  assert.equal(room.requestStart('b', 1), false);
});
