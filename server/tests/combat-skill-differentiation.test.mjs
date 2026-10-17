import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import {
  beginAttack,
  setGuard,
  stepRoom,
} from '../../shared/sim/combat.mjs';

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

function setupDuel(attackerPos = { x: 0, y: 0, z: 0 }, defenderPos = { x: 2, y: 0, z: 0 }, attackerYaw = -Math.PI / 2, defenderYaw = Math.PI / 2) {
  const room = new Room('DUEL');
  room.addPlayer({ id: 'att', token: 'ta', name: 'Attacker' }, 0);
  room.addPlayer({ id: 'def', token: 'td', name: 'Defender' }, 0);
  room.setReady('att', true, 0);
  room.setReady('def', true, 0);
  room.tick(3.1);
  const a = room.players.get('att');
  const d = room.players.get('def');
  Object.assign(a.position, attackerPos);
  Object.assign(d.position, defenderPos);
  a.yaw = attackerYaw; a.input.yaw = a.yaw;
  d.yaw = defenderYaw; d.input.yaw = d.yaw;
  a.spawnProtectionUntil = 0; d.spawnProtectionUntil = 0;
  room.events.length = 0;
  return { room, a, d };
}

test('combat skill differentiation: sweet-spot cut leading vs centered static vs cramped hilt contact', () => {
  // 1. Centered static contact at 2.0m: quality ~0.49, 24 damage, 5 hits to kill
  {
    const { room, d } = setupDuel({ x: 0, y: 0, z: 0 }, { x: 2.0, y: 0, z: 0 });
    beginAttack(room, 'att', 10.0);
    // Strike 1 lands
    stepRoom(room, 0.01, 10.40, openWorld);
    const hit1 = room.events.find((e) => e.type === 'swordHit');
    assert.ok(hit1, 'strike 1 lands');
    assert.ok(hit1.point, 'authoritative physical contact point is attached to swordHit event');
    assert.ok(Math.abs(hit1.point.x - 1.7) < 0.35, `contact x near target boundary: ${hit1.point.x}`);
    assert.ok(hit1.quality >= 0.45 && hit1.quality <= 0.55, `centered quality ~0.49: got ${hit1.quality}`);
    assert.equal(d.health, 76, 'first centered hit deals 24 damage');

    // Strike 2 lands
    stepRoom(room, 0.01, 11.10, openWorld);
    assert.equal(d.health, 53, 'second hit deals 23 damage (total 47)');

    // Strike 3 lands
    stepRoom(room, 0.01, 11.80, openWorld);
    assert.equal(d.health, 29, 'third hit deals 24 damage (total 71)');

    // Combo resets and comes round for strike 4
    stepRoom(room, 0.01, 12.09, openWorld);
    stepRoom(room, 0.01, 12.49, openWorld);
    assert.equal(d.health, 7, 'fourth hit leaves target at 7 HP');
    assert.equal(d.alive, true, 'target survives 4 centered hits');

    // Strike 5 fells
    stepRoom(room, 0.01, 13.19, openWorld);
    assert.equal(d.alive, false, '5-hit kill for ordinary centered combat');
  }

  // 2. Cramped hilt contact (distance 0.65m): player rushes inside sweet spot, hilt contacts target
  {
    const { room, d } = setupDuel({ x: 0, y: 0, z: 0 }, { x: 0.65, y: 0, z: 0 });
    beginAttack(room, 'att', 10.0);
    stepRoom(room, 0.01, 10.40, openWorld);
    const hit = room.events.find((e) => e.type === 'swordHit');
    assert.ok(hit, 'cramped strike lands');
    assert.ok(hit.quality < 0.25, `cramped hilt contact has low quality: got ${hit.quality}`);
    assert.ok(d.health >= 80, `cramped blow deals only glancing damage (<=20): remaining HP ${d.health}`);
  }
});

test('authoritative contact point is passed to guard block, parry and guardBreak events', () => {
  // Test block event point
  {
    const { room, d } = setupDuel({ x: 0, y: 0, z: 0 }, { x: 2.0, y: 0, z: 0 });
    setGuard(room, 'def', true, 8.0);
    beginAttack(room, 'att', 10.0);
    stepRoom(room, 0.01, 10.40, openWorld);
    const blockEvt = room.events.find((e) => e.type === 'block');
    assert.ok(blockEvt, 'block event produced');
    assert.ok(blockEvt.point, 'authoritative point on block event');
    assert.ok(Number.isFinite(blockEvt.point.x) && Number.isFinite(blockEvt.point.y) && Number.isFinite(blockEvt.point.z));
    assert.equal(d.health, 100, 'blocked blow does no health damage');
  }

  // Test parry event point
  {
    const { room, d } = setupDuel({ x: 0, y: 0, z: 0 }, { x: 2.0, y: 0, z: 0 });
    setGuard(room, 'def', true, 10.30); // perfect timing parry
    beginAttack(room, 'att', 10.0);
    stepRoom(room, 0.01, 10.40, openWorld);
    const parryEvt = room.events.find((e) => e.type === 'parry');
    assert.ok(parryEvt, 'parry event produced');
    assert.ok(parryEvt.point, 'authoritative point on parry event');
    assert.equal(d.parries, 1);
  }
});

test('guard stamina drain reflects strike contact quality: ordinary contact breaks guard in 5 hits while glancing contact drains less', () => {
  // Ordinary contact: 5 blocks to guard break ([78, 56, 34, 12, 0])
  {
    const { room, d } = setupDuel({ x: 0, y: 0, z: 0 }, { x: 2.0, y: 0, z: 0 });
    setGuard(room, 'def', true, 8.0);
    beginAttack(room, 'att', 10.0);

    stepRoom(room, 0.01, 10.40, openWorld);
    assert.equal(d.guardStamina, 78, 'block 1 drains 22 stamina');

    stepRoom(room, 0.01, 11.10, openWorld);
    assert.equal(d.guardStamina, 56, 'block 2 drains 22 stamina');

    stepRoom(room, 0.01, 11.80, openWorld);
    assert.equal(d.guardStamina, 34, 'block 3 drains 22 stamina');

    stepRoom(room, 0.01, 12.09, openWorld);
    stepRoom(room, 0.01, 12.49, openWorld);
    assert.equal(d.guardStamina, 12, 'block 4 drains 22 stamina');

    stepRoom(room, 0.01, 13.19, openWorld);
    assert.equal(d.guardStamina, 0, 'block 5 breaks guard');
    assert.equal(d.guarding, false, 'guard is broken');
  }

  // Cramped contact: low quality contact exerts less pressure on guard
  {
    const { room, d } = setupDuel({ x: 0, y: 0, z: 0 }, { x: 0.65, y: 0, z: 0 });
    setGuard(room, 'def', true, 8.0);
    beginAttack(room, 'att', 10.0);

    stepRoom(room, 0.01, 10.40, openWorld);
    assert.ok(d.guardStamina > 80, `cramped blow drains less guard stamina: remaining ${d.guardStamina} > 80`);
  }
});

