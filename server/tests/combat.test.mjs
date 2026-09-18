import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../src/game/Room.mjs';
import {
  beginAttack,
  endAttack,
  setGuard,
  stepRoom,
  tryCastFireball,
  tryDash,
} from '../src/game/combat.mjs';

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

function playingRoom() {
  const room = new Room('TEST2');
  room.addPlayer({ id: 'a', token: 'ta', name: 'A' }, 0);
  room.addPlayer({ id: 'b', token: 'tb', name: 'B' }, 0);
  room.tick(3.1);
  const a = room.players.get('a');
  const b = room.players.get('b');
  Object.assign(a.position, { x: 0, y: 0, z: 0 });
  Object.assign(b.position, { x: 2, y: 0, z: 0 });
  a.yaw = -Math.PI / 2; a.input.yaw = a.yaw;
  b.yaw = Math.PI / 2; b.input.yaw = b.yaw;
  a.spawnProtectionUntil = 0; b.spawnProtectionUntil = 0;
  room.events.length = 0;
  return room;
}

test('held sword lands 34 damage at 0.40, 1.10 and 1.80 seconds', () => {
  const room = playingRoom();
  beginAttack(room, 'a', 10);
  stepRoom(room, 0.01, 10.39, openWorld);
  assert.equal(room.players.get('b').health, 100);
  stepRoom(room, 0.01, 10.40, openWorld);
  assert.equal(room.players.get('b').health, 66);
  stepRoom(room, 0.01, 11.10, openWorld);
  assert.equal(room.players.get('b').health, 32);
  stepRoom(room, 0.01, 11.80, openWorld);
  assert.equal(room.players.get('b').alive, false);
});

test('releasing attack prevents later combo strikes', () => {
  const room = playingRoom();
  beginAttack(room, 'a', 10);
  stepRoom(room, 0.01, 10.4, openWorld);
  endAttack(room, 'a', 10.5);
  stepRoom(room, 0.01, 12, openWorld);
  assert.equal(room.players.get('b').health, 66);
});

test('perfect guard parries, damages nobody and staggers attacker 450ms', () => {
  const room = playingRoom();
  setGuard(room, 'b', true, 10.30);
  beginAttack(room, 'a', 10);
  stepRoom(room, 0.01, 10.40, openWorld);
  const a = room.players.get('a');
  const b = room.players.get('b');
  assert.equal(b.health, 100);
  assert.equal(b.parries, 1);
  assert.ok(a.staggerUntil >= 10.85 - 1e-6);
  assert.equal(a.attackActive, false);
});

test('normal guard drains 35 stamina and third block guard-breaks for 700ms', () => {
  const room = playingRoom();
  const b = room.players.get('b');
  setGuard(room, 'b', true, 9);
  for (const now of [10, 10.8, 11.6]) {
    const a = room.players.get('a');
    a.attackActive = false; a.attackHeld = false;
    beginAttack(room, 'a', now - 0.4);
    stepRoom(room, 0.01, now, openWorld);
  }
  assert.equal(b.guardStamina, 0);
  assert.equal(b.guarding, false);
  assert.ok(b.staggerUntil >= 12.3 - 1e-6);
});

test('fireball and dash reject use during cooldown', () => {
  const room = playingRoom();
  assert.equal(tryCastFireball(room, 'a', { x: 1, y: 0, z: 0 }, 10), true);
  assert.equal(tryCastFireball(room, 'a', { x: 1, y: 0, z: 0 }, 13.9), false);
  assert.equal(tryCastFireball(room, 'a', { x: 1, y: 0, z: 0 }, 14.01), true);
  assert.equal(tryDash(room, 'a', { x: 1, z: 0 }, 20), true);
  assert.equal(tryDash(room, 'a', { x: 1, z: 0 }, 24.9), false);
  assert.equal(tryDash(room, 'a', { x: 1, z: 0 }, 25.01), true);
});

test('health regeneration begins after five seconds without damage at 20 hp/s', () => {
  const room = playingRoom();
  const b = room.players.get('b');
  b.health = 50;
  b.lastDamageAt = 10;
  stepRoom(room, 1, 14.99, openWorld);
  assert.equal(b.health, 50);
  stepRoom(room, 1, 15.5, openWorld);
  assert.equal(b.health, 70);
});

test('beginning an attack cancels spawn protection', () => {
  const room = playingRoom();
  const a = room.players.get('a');
  a.spawnProtectionUntil = 20;
  beginAttack(room, 'a', 10);
  assert.equal(a.spawnProtectionUntil, 10);
});

test('sword hitting a wall first cancels the strike, recoils attacker and emits world impact', () => {
  const room = playingRoom();
  const world = {
    ...openWorld,
    solids: [{ id: 'test-wall', center: [1, 1, 0], size: [0.25, 2, 3] }],
  };
  beginAttack(room, 'a', 10);
  stepRoom(room, 0.01, 10.4, world);
  const a = room.players.get('a');
  const b = room.players.get('b');
  assert.equal(b.health, 100);
  assert.equal(a.attackActive, false);
  assert.ok(a.velocity.x < 0);
  assert.ok(room.events.some((e) => e.type === 'swordWorldImpact' && e.playerId === 'a'));
});

test('direct fireball impact deals exactly 28 total damage, not direct plus splash twice', () => {
  const room = playingRoom();
  const a = room.players.get('a');
  const b = room.players.get('b');
  Object.assign(a.position, { x: 0, y: 0, z: 0 });
  Object.assign(b.position, { x: 1.5, y: 0, z: 0 });
  a.yaw = -Math.PI / 2; a.input.yaw = a.yaw;
  b.spawnProtectionUntil = 0;
  assert.equal(tryCastFireball(room, 'a', { x: 1, y: 0, z: 0 }, 10), true);
  stepRoom(room, 0.01, 10.31, openWorld);
  stepRoom(room, 0.02, 10.33, openWorld);
  assert.equal(b.health, 72);
});

test('sword resolution can use recent transform history for latency compensation', () => {
  const room = playingRoom();
  const a = room.players.get('a');
  const b = room.players.get('b');
  Object.assign(a.position, { x: 0, y: 0, z: 0 });
  a.yaw = -Math.PI / 2; a.input.yaw = a.yaw;
  Object.assign(b.position, { x: 8, y: 0, z: 0 });
  b.history = [
    { at: 10.40, position: { x: 2, y: 0, z: 0 }, yaw: Math.PI / 2, pitch: 0 },
    { at: 10.50, position: { x: 8, y: 0, z: 0 }, yaw: Math.PI / 2, pitch: 0 },
  ];
  beginAttack(room, 'a', 10);
  stepRoom(room, 0.01, 10.50, openWorld);
  assert.equal(b.health, 66);
});
