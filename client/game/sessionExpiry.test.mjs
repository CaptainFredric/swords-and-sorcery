import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { clearExpiredSession } from '../network/sessionState.mjs';

test('expired resume clears stale room/player identity and snapshot clocks', () => {
  const removed = [];
  const storage = { removeItem: (key) => removed.push(key) };
  const socketState = {
    playerId: 'old-player',
    token: 'old-token',
    roomCode: 'ABCDE',
    latestSnapshot: { roomCode: 'ABCDE', serverTime: 42 },
    snapshotReceivedAt: 1234,
  };

  clearExpiredSession(socketState, storage);

  assert.equal(socketState.playerId, null);
  assert.equal(socketState.token, null);
  assert.equal(socketState.roomCode, null);
  assert.equal(socketState.latestSnapshot, null);
  assert.equal(socketState.snapshotReceivedAt, 0);
  assert.deepEqual(removed.sort(), ['ss-room-code', 'ss-session-token']);
});

test('expired resume is wired to leave stale gameplay and route back through the front door', async () => {
  const main = await fs.readFile(new URL('../main.mjs', import.meta.url), 'utf8');
  const start = main.indexOf("socket.on('resumeFailed'");
  const end = main.indexOf("socket.on('error'", start);
  assert.ok(start >= 0 && end > start, 'resumeFailed handler is missing');
  const handler = main.slice(start, end);

  assert.match(handler, /runtime\?\.setPlaying\(false\)/);
  assert.match(handler, /runtime\?\.setPlayerId\(null\)/);
  assert.match(handler, /hud\.hide\(\)/);
  assert.match(handler, /setPracticeVisible\(false\)/);
  assert.match(handler, /route\(invitedRoom \? SCREEN_IDS\.PRIVATE_MENU : SCREEN_IDS\.MAIN_MENU\)/);
});
