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

test('Bot Duel waits for arena readiness, cancels countdown on focus loss, then stays live once playing', () => {
  const manager = new RoomManager({ random: sequenceRandom(0.1) });
  const room = manager.createSoloRoom('BOT_DUEL', 0);
  room.addPlayer({ id: 'human', token: 'token', name: 'Aden' }, 0);
  room.provisionModeActors(0);
  room.armAutoStart(0);

  assert.equal(room.humanCount(), 1);
  assert.equal(room.connectedCount(), 1);
  assert.equal([...room.players.values()].filter((p) => p.actorKind === 'bot').length, 1);
  assert.equal(room.state, 'WAITING');

  room.tick(10);
  assert.equal(room.state, 'WAITING');

  assert.equal(room.setArenaReady('human', true, 10), true);
  assert.equal(room.state, 'COUNTDOWN');
  assert.equal(room.players.get('human').arenaReady, true);

  assert.equal(room.setArenaReady('human', false, 11), true);
  assert.equal(room.state, 'WAITING');
  assert.equal(room.countdownEndsAt, null);
  assert.equal(room.players.get('human').arenaReady, false);

  assert.equal(room.setArenaReady('human', true, 12), true);
  assert.equal(room.state, 'COUNTDOWN');
  room.tick(15.1);
  assert.equal(room.state, 'PLAYING');

  assert.equal(room.setArenaReady('human', false, 15.2), false);
  assert.equal(room.state, 'PLAYING');
});

test('Bot Duel disconnect during countdown withdraws readiness and returns to waiting', () => {
  const manager = new RoomManager({ random: sequenceRandom(0.15) });
  const room = manager.createSoloRoom('BOT_DUEL', 0);
  room.addPlayer({ id: 'human', token: 'token', name: 'Aden' }, 0);
  room.provisionModeActors(0);
  room.armAutoStart(0);
  room.setArenaReady('human', true, 0);

  assert.equal(room.state, 'COUNTDOWN');
  room.disconnectPlayer('human', 1);
  assert.equal(room.state, 'WAITING');
  assert.equal(room.countdownEndsAt, null);
  assert.equal(room.players.get('human').arenaReady, false);

  const restored = room.reconnectPlayer('token', 2);
  assert.equal(restored?.id, 'human');
  assert.equal(restored?.arenaReady, false);
  assert.equal(room.state, 'WAITING');
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
