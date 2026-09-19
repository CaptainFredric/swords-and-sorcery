import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../src/rooms/RoomManager.mjs';

function sequenceRandom(seed = 0.1) {
  let value = seed;
  return () => {
    value = (value + 0.173) % 1;
    return value;
  };
}

test('Bot Duel needs one connected human, not a second browser', () => {
  const manager = new RoomManager({ random: sequenceRandom(0.1) });
  const room = manager.createSoloRoom('BOT_DUEL', 0);
  room.addPlayer({ id: 'human', token: 'token', name: 'Aden' }, 0);
  room.provisionModeActors(0);
  room.armAutoStart(0);

  assert.equal(room.humanCount(), 1);
  assert.equal(room.connectedCount(), 1);
  assert.equal([...room.players.values()].filter((p) => p.actorKind === 'bot').length, 1);
  assert.equal(room.state, 'COUNTDOWN');

  room.tick(3.1);
  assert.equal(room.state, 'PLAYING');
});

test('Practice starts for one human and does not time out', () => {
  const manager = new RoomManager({ random: sequenceRandom(0.2) });
  const room = manager.createSoloRoom('PRACTICE', 0);
  room.addPlayer({ id: 'human', token: 'token', name: 'Aden' }, 0);
  room.armAutoStart(0);

  assert.equal(room.state, 'PLAYING');
  room.tick(9999);
  assert.equal(room.state, 'PLAYING');
});

test('solo reconnect preserves authoritative mode and world identity', () => {
  const manager = new RoomManager({ random: sequenceRandom(0.25) });
  const room = manager.createSoloRoom('PRACTICE', 0);
  room.addPlayer({ id: 'human', token: 'token', name: 'Aden' }, 0);
  room.armAutoStart(0);
  room.disconnectPlayer('human', 1);

  const restored = room.reconnectPlayer('token', 2);
  assert.equal(restored?.id, 'human');
  assert.equal(room.mode, 'PRACTICE');
  assert.equal(room.worldId, 'castleward');
  assert.equal(room.state, 'PLAYING');
});

test('Quick Play never selects a solo room', () => {
  const manager = new RoomManager({ random: sequenceRandom(0.3) });
  const solo = manager.createSoloRoom('BOT_DUEL', 0);
  const quick = manager.quickPlay(0);
  assert.notEqual(quick.code, solo.code);
  assert.equal(quick.mode, 'FFA');
});

test('server actors do not keep an abandoned solo room alive forever', () => {
  const manager = new RoomManager({ random: sequenceRandom(0.4) });
  const room = manager.createSoloRoom('BOT_DUEL', 0);
  room.addPlayer({ id: 'human', token: 'token', name: 'Aden' }, 0);
  room.provisionModeActors(0);
  room.disconnectPlayer('human', 1);
  room.tick(16.1);

  assert.equal([...room.players.values()].some((p) => p.actorKind === 'human'), false);
  assert.equal(room.isCleanupEligible(75), false);
  assert.equal(room.isCleanupEligible(76.2), true);
});
