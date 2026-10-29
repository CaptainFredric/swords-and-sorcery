import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import { stepRoom, setGuard } from '../../shared/sim/combat.mjs';
import { SPELLS } from '../../shared/src/spells.mjs';
import { armoryView } from '../../client/menu/armoryView.mjs';

// These tests use Castleward's real Room and combat simulation, not Argon's independent simulator.
const world = {
  floors: [{ id: 'floor', center: [0, -0.1, 0], size: [50, 0.2, 50], y: 0 }],
  ramps: [], solids: [],
  spawnPoints: [{ x: 0, y: 0, z: 0, yaw: -Math.PI / 2 }, { x: 2, y: 0, z: 0, yaw: Math.PI / 2 }],
  abyssY: -9,
};

function duel() {
  const room = new Room('CORETEST');
  room.addPlayer({ id: 'a', token: 'ta', name: 'Caster' }, 0);
  room.addPlayer({ id: 'b', token: 'tb', name: 'Target' }, 0);
  room.setReady('a', true, 0); room.setReady('b', true, 0); room.tick(3.1);
  const a = room.players.get('a'), b = room.players.get('b');
  Object.assign(a.position, { x: 0, y: 0, z: 0 });
  Object.assign(b.position, { x: 2, y: 0, z: 0 });
  a.yaw = -Math.PI / 2; a.input.yaw = a.yaw;
  b.yaw = Math.PI / 2; b.input.yaw = b.yaw;
  a.spawnProtectionUntil = 0; b.spawnProtectionUntil = 0;
  room.events.length = 0;
  return { room, a, b };
}

function projectile(room, position = { x: 1.4, y: 1, z: 0 }, at = 10.2) {
  const p = { id: 'core-test', ownerId: 'a', spell: 'coreflagration',
    position: { ...position }, velocity: { x: 20, y: 0, z: 0 }, bornAt: at };
  room.projectiles.set(p.id, p);
  return p;
}

test('Coreflagration is a native loadout spell, without changing existing spells', () => {
  assert.equal(SPELLS.fireball.speed, 24);
  assert.equal(SPELLS.fireball.radius, 2.6);
  assert.equal(SPELLS.frostfire.speed, 30);
  assert.equal(SPELLS.gale.kind, 'cone');
  assert.equal(SPELLS.coreflagration.speed, 20);
  assert.equal(SPELLS.coreflagration.radius, 3);
  assert.ok(armoryView('coreflagration').spells.some(s => s.id === 'coreflagration'));
});

test('native projectile creates weak first burst and distinct 0.9s delayed detonation', () => {
  const { room, b } = duel();
  projectile(room);
  stepRoom(room, 0.03, 10.3, world);
  const armed = room.events.find(e => e.type === 'coreflagrationArmed');
  assert.ok(armed, 'core must arm on real impact');
  assert.equal(b.health, 95);
  assert.equal(room.projectiles.get('core-test').corePhase, 'armed');
  const deadline = room.projectiles.get('core-test').detonateAt;
  assert.ok(Math.abs(deadline - 11.2) < 1e-8);
  stepRoom(room, 0.03, deadline - 0.03, world);
  assert.equal(b.health, 95, 'no extra damage during fuse');
  stepRoom(room, 0.03, deadline, world);
  assert.equal(b.health, 75, '20 flat damage on detonation');
  assert.equal(room.projectiles.has('core-test'), false);
  assert.equal(room.events.filter(e => e.type === 'projectileImpact' && e.spell === 'coreflagration').length, 1);
});

test('leaving the radius after first burst avoids final blast and burn', () => {
  const { room, b } = duel();
  projectile(room);
  stepRoom(room, 0.03, 10.3, world);
  assert.equal(b.health, 95);
  b.position.x = 9;
  stepRoom(room, 0.03, 11.21, world);
  assert.equal(b.health, 95);
  assert.equal(b.burn, null);
});

test('timed directional Guard deflects without damage or changing the caster', () => {
  const { room, b } = duel();
  projectile(room);
  assert.equal(setGuard(room, 'b', true, 10.21), true);
  stepRoom(room, 0.03, 10.3, world);
  const p = room.projectiles.get('core-test');
  assert.equal(p?.corePhase, 'knocked');
  assert.equal(p.ownerId, 'a');
  assert.equal(b.health, 100);
  assert.ok(b.coreRegenPausedUntil >= 11.8);
  assert.ok(room.events.some(e => e.type === 'coreflagrationParried'));
  stepRoom(room, 0.03, 10.6, world);
  assert.equal(p.corePhase, 'armed');
  assert.equal(p.ownerId, 'a');
});

test('core at outer body edge receives full initial and final damage, not falloff', () => {
  const { room, b } = duel();
  b.position.x = 3.35; // 3m radius + actual 0.4m body allowance
  const p = projectile(room, { x: -3, y: 1, z: 0 });
  p.position = { x: 0, y: 1, z: 0 };
  p.velocity = { x: 0, y: 0, z: 0 };
  p.corePhase = 'armed'; p.armedAt = 10; p.detonateAt = 10.9;
  stepRoom(room, 0.03, 10.9, world);
  assert.equal(b.health, 80, 'outer body edge takes full 20');
});

test('successful parry pauses health regeneration without registering damage', () => {
  const { room, b } = duel();
  b.health = 50; b.lastDamageAt = -100;
  projectile(room);
  assert.ok(setGuard(room, 'b', true, 10.21));
  stepRoom(room, 0.03, 10.3, world);
  assert.equal(b.lastDamageAt, -100);
  const afterContact = b.health; // Regeneration runs before projectile contact within this native tick.
  assert.ok(afterContact >= 50 && afterContact <= 50.61);
  stepRoom(room, 0.1, 11.0, world);
  assert.equal(b.health, afterContact, 'regen remains paused after parry contact');
});
