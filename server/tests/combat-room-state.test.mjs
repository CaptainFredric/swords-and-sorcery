import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../src/game/Room.mjs';
import { beginAttack, endAttack, setGuard, tryCastFireball, tryDash } from '../src/game/combat.mjs';

function roomWithPlayer(state) {
  const room = new Room('STATE');
  const player = room.addPlayer({ id: 'a', token: 'ta', name: 'A' }, 0);
  room.state = state;
  room.events.length = 0;
  player.spawnProtectionUntil = 0;
  return { room, player };
}

for (const state of ['WAITING', 'COUNTDOWN', 'FINISHED', 'REMATCH_COUNTDOWN']) {
  test(`combat initiation is rejected while room is ${state}`, () => {
    const { room, player } = roomWithPlayer(state);

    assert.equal(beginAttack(room, player.id, 10), false);
    assert.equal(setGuard(room, player.id, true, 10), false);
    assert.equal(tryCastFireball(room, player.id, { x: 1, y: 0, z: 0 }, 10), false);
    assert.equal(tryDash(room, player.id, { x: 1, z: 0 }, 10), false);

    assert.equal(player.attackActive, false);
    assert.equal(player.attackHeld, false);
    assert.equal(player.guarding, false);
    assert.equal(player.pendingFireball, null);
    assert.equal(player.fireballReadyAt, 0);
    assert.equal(player.dashReadyAt, 0);
    assert.deepEqual(room.events, []);
  });
}

test('release messages can still lower held combat state outside active play', () => {
  const { room, player } = roomWithPlayer('FINISHED');
  player.attackActive = true;
  player.attackHeld = true;
  player.guarding = true;

  endAttack(room, player.id, 10);
  assert.equal(setGuard(room, player.id, false, 10), true);

  assert.equal(player.attackActive, false);
  assert.equal(player.attackHeld, false);
  assert.equal(player.guarding, false);
});
