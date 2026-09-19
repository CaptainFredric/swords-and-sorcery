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

test('expired resume is wired to leave stale gameplay and return to the menu', async () => {
  const main = await fs.readFile(new URL('../main.mjs', import.meta.url), 'utf8');
  assert.match(main, /socket\.on\('resumeFailed',[\s\S]*?runtime\?\.setPlaying\(false\)[\s\S]*?hud\.hide\(\)[\s\S]*?showOnly\(menu\)/);
});
