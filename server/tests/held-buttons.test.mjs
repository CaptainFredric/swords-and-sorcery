import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import { beginAttack, endAttack, killPlayer, setGuard, stepRoom } from '../../shared/sim/combat.mjs';
import { applyRoomCommand } from '../../shared/sim/wire.mjs';
import { GAME } from '../../shared/src/combat.mjs';
import { heldActions } from '../../shared/src/heldActions.mjs';

// Held buttons (heldActions.mjs): an attack or a guard still held comes back by itself as soon as it can.
const openWorld = {
  floors: [{ id: 'floor', center: [0, -0.1, 0], size: [50, 0.2, 50], y: 0 }],
  ramps: [],
  solids: [],
  spawnPoints: [
    { x: 0, y: 0, z: 0, yaw: -Math.PI / 2 },
    { x: 2, y: 0, z: 0, yaw: Math.PI / 2 },
  ],
  abyssY: -9,
};
const DT = 1 / 30;

function playingRoom() {
  const room = new Room('HELD');
  room.addPlayer({ id: 'a', token: 'ta', name: 'A' }, 0);
  room.addPlayer({ id: 'b', token: 'tb', name: 'B' }, 0);
  room.setReady('a', true, 0);
  room.setReady('b', true, 0);
  room.tick(3.1);
  const a = room.players.get('a');
  const b = room.players.get('b');
  Object.assign(a.position, { x: 0, y: 0, z: 0 });
  Object.assign(b.position, { x: 2, y: 0, z: 0 });
  a.yaw = -Math.PI / 2; a.input.yaw = a.yaw;
  b.yaw = Math.PI / 2; b.input.yaw = b.yaw;
  a.spawnProtectionUntil = 0; b.spawnProtectionUntil = 0;
  room.events.length = 0;
  return { room, a, b };
}
// a player's own button, as the client sends it
const press = (room, id, button, down, time) => applyRoomCommand(room, room.players.get(id), { type: button, down, clientTime: time }, time);
// the room run at its own rate from `from` to `to`; `each(now)` is asked every tick
function run(room, from, to, each = () => {}) {
  let now = from;
  while (now < to - 1e-9) { now = Math.min(to, now + DT); stepRoom(room, DT, now, openWorld); each(now); }
  return now;
}

test('the rule: the button pressed last has the hands; in Spells & Chivalry both are had', () => {
  assert.deepEqual(heldActions({ attack: true }), { attack: true, guard: false });
  assert.deepEqual(heldActions({ guard: true }), { attack: false, guard: true });
  assert.deepEqual(heldActions({ attack: true, guard: true, attackPressedAt: 2, guardPressedAt: 1 }), { attack: true, guard: false });
  assert.deepEqual(heldActions({ attack: true, guard: true, attackPressedAt: 1, guardPressedAt: 2 }), { attack: false, guard: true });
  assert.deepEqual(heldActions({ attack: true, guard: true, attackPressedAt: 1, guardPressedAt: 2, concurrent: true }), { attack: true, guard: true });
});

test('Parried while holding Attack: the sword comes round again the moment the reel and the chain allow, unpressed', () => {
  const { room, a, b } = playingRoom();
  setGuard(room, 'b', true, 10.30);
  press(room, 'a', 'attack', true, 10);
  let parriedAt = null, resumedAt = null;
  run(room, 10, 12, (now) => {
    if (parriedAt === null && b.parries === 1) parriedAt = now;
    if (parriedAt !== null && resumedAt === null && a.attackActive) resumedAt = a.attackStartedAt;
  });
  assert.ok(parriedAt !== null, 'parried');
  const legal = Math.max(a.staggerUntil, a.attackRestartAt);
  assert.ok(resumedAt !== null, 'the held sword came round again');
  assert.ok(resumedAt >= parriedAt + GAME.parryStaggerMs / 1000 - 1e-6, 'never inside the reel');
  assert.ok(resumedAt - legal <= DT + 1e-6, `as soon as it could: ${(resumedAt - legal).toFixed(3)} s late`);
});

test('let go during the reel, the sword stays down', () => {
  const { room, a, b } = playingRoom();
  setGuard(room, 'b', true, 10.30);
  press(room, 'a', 'attack', true, 10);
  run(room, 10, 10.5);
  assert.equal(b.parries, 1);
  press(room, 'a', 'attack', false, 10.5);
  run(room, 10.5, 12, () => assert.equal(a.attackActive, false));
});

test('Guard held through a broken guard comes back up by itself, as a held guard: it blocks, it cannot Parry', () => {
  const { room, a, b } = playingRoom();
  press(room, 'b', 'guard', true, 9);
  for (const now of [10, 10.8, 11.6, 12.4, 13.2]) {
    a.attackActive = false; a.attackHeld = false; a.attackRestartAt = -Infinity;
    beginAttack(room, 'a', now - 0.4);
    stepRoom(room, 0.01, now, openWorld);
  }
  assert.equal(b.guarding, false, 'broken');
  // (the attacker lets go: nothing more comes at it)
  endAttack(room, 'a', 13.2);
  const reel = b.staggerUntil;
  let raisedAt = null;
  run(room, 13.2, 16, (now) => { if (raisedAt === null && b.guarding) raisedAt = now; });
  assert.ok(raisedAt !== null, 'the held guard came back up');
  assert.ok(raisedAt >= reel, 'not before the reel was over');
  assert.ok(raisedAt - Math.max(reel, b.lastGuardDrainAt + 1) <= 2 * DT + 1e-6, 'as soon as it had stamina again');
  assert.equal(b.guardStartedAt, -Infinity, 'a held guard, not a timed one');
  // a blow that meets it at once, as a fresh raise would Parry: no Parry
  const parries = b.parries;
  a.attackActive = false; a.attackHeld = false; a.attackRestartAt = -Infinity; a.staggerUntil = -Infinity;
  room.events.length = 0;
  beginAttack(room, 'a', 16 - 0.35);
  run(room, 16, 16.2);
  assert.equal(b.parries, parries);
  assert.equal(room.events.some(event => event.type === 'parry'), false);
});

test('both held: the one pressed last has the hands; let it go and the other comes back', () => {
  const { room, a } = playingRoom();
  press(room, 'a', 'attack', true, 10);
  run(room, 10, 10.2);
  assert.equal(a.attackActive, true);
  press(room, 'a', 'guard', true, 10.2);
  run(room, 10.2, 11.5, () => { assert.equal(a.guarding, true); assert.equal(a.attackActive, false); });
  press(room, 'a', 'guard', false, 11.5);
  let swungAt = null;
  run(room, 11.5, 12.5, () => { if (swungAt === null && a.attackActive) swungAt = a.attackStartedAt; });
  assert.ok(swungAt !== null && swungAt - Math.max(11.5, a.attackRestartAt) <= DT + 1e-6, 'the held sword again');
  assert.equal(a.guarding, false);
  // and the other way round: swinging, Guard still held from before, the guard comes back when the sword is let go
  press(room, 'a', 'guard', true, 12.5);
  press(room, 'a', 'attack', true, 12.6);
  run(room, 12.6, 13, () => assert.equal(a.guarding, false));
  press(room, 'a', 'attack', false, 13);
  let raised = false;
  run(room, 13, 15, () => { raised ||= a.guarding; });
  assert.ok(raised, 'the held guard back up once the sword was let go and its swing done');
});

test('a knight pressing for itself (a bot) is not pressed again by this rule', () => {
  const { room, a, b } = playingRoom();
  setGuard(room, 'b', true, 10.30);
  beginAttack(room, 'a', 10);
  run(room, 10, 10.5);
  assert.equal(b.parries, 1);
  run(room, 10.5, 12, () => assert.equal(a.attackActive, false));
});

test('death lets go of the buttons: nothing held comes back after the respawn', () => {
  const { room, a } = playingRoom();
  press(room, 'a', 'guard', true, 10);
  press(room, 'a', 'attack', true, 10.1);
  assert.equal(a.attackButton && a.guardButton, true);
  killPlayer(room, 'a', 'b', 'sword', 10.2);
  assert.equal(a.attackButton || a.guardButton, false);
});
