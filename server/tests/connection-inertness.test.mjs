import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../src/game/Room.mjs';

function add(room, id, now = 0) {
  return room.addPlayer({ id, token: `token-${id}`, name: id }, now);
}

test('disconnect immediately neutralizes stale combat and movement input during reconnect grace', () => {
  const room = new Room('TEST2');
  add(room, 'a');
  add(room, 'b');
  room.tick(3.1);

  const player = room.players.get('a');
  const authoritativeFacing = { yaw: player.yaw, pitch: player.pitch };
  player.input = { forward: 1, right: 1, jump: true, yaw: 1.2, pitch: 0.4 };
  player.attackHeld = true;
  player.attackActive = true;
  player.guarding = true;
  player.pendingFireball = { x: 1, y: 0, z: 0 };
  player.castEndsAt = 5;

  room.disconnectPlayer('a', 4);

  assert.deepEqual(player.input, {
    forward: 0,
    right: 0,
    jump: false,
    yaw: authoritativeFacing.yaw,
    pitch: authoritativeFacing.pitch,
  });
  assert.equal(player.attackHeld, false);
  assert.equal(player.attackActive, false);
  assert.equal(player.guarding, false);
  assert.equal(player.pendingFireball, null);
  assert.equal(player.castEndsAt, 0);
  assert.equal(player.connected, false);
  assert.equal(player.disconnectExpiresAt, 19);
});
