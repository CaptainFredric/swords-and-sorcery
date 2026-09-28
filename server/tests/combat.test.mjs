import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import {
  beginAttack,
  endAttack,
  setGuard,
  stepRoom,
  tryCastSpell,
  tryDash,
} from '../../shared/sim/combat.mjs';
import { SPRINT } from '../../shared/src/movement.mjs';
import { SPELLS } from '../../shared/src/spells.mjs';

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
  return room;
}

test('held sword lands 28 damage at 0.40, 1.10 and 1.80 seconds, and the fourth blow fells', () => {
  const room = playingRoom();
  beginAttack(room, 'a', 10);
  stepRoom(room, 0.01, 10.39, openWorld);
  assert.equal(room.players.get('b').health, 100);
  stepRoom(room, 0.01, 10.40, openWorld);
  assert.equal(room.players.get('b').health, 72);
  stepRoom(room, 0.01, 11.10, openWorld);
  assert.equal(room.players.get('b').health, 44);
  stepRoom(room, 0.01, 11.80, openWorld);
  assert.equal(room.players.get('b').health, 16);
  assert.equal(room.players.get('b').alive, true, 'three blows are not enough');
  // still holding: the combo comes round again and its first strike fells them
  stepRoom(room, 0.01, 12.09, openWorld);
  stepRoom(room, 0.01, 12.49, openWorld);
  assert.equal(room.players.get('b').alive, false);
});

test('each committed sword strike emits an authoritative swing cue', () => {
  const room = playingRoom();
  beginAttack(room, 'a', 10);
  room.events.length = 0;

  stepRoom(room, 0.01, 10.39, openWorld);
  assert.deepEqual(room.events.filter((e) => e.type === 'swordSwing'), []);

  stepRoom(room, 0.01, 10.40, openWorld);
  stepRoom(room, 0.01, 11.10, openWorld);
  stepRoom(room, 0.01, 11.80, openWorld);

  const swings = room.events.filter((e) => e.type === 'swordSwing' && e.playerId === 'a');
  assert.deepEqual(swings.map((e) => e.strikeIndex), [0, 1, 2]);
});

test('releasing attack prevents later combo strikes', () => {
  const room = playingRoom();
  beginAttack(room, 'a', 10);
  stepRoom(room, 0.01, 10.4, openWorld);
  endAttack(room, 'a', 10.5);
  stepRoom(room, 0.01, 12, openWorld);
  assert.equal(room.players.get('b').health, 72);
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

test('spells and dash reject use during cooldown', () => {
  const room = playingRoom();
  assert.equal(tryCastSpell(room, 'a', { x: 1, y: 0, z: 0 }, 10), true);
  assert.equal(tryCastSpell(room, 'a', { x: 1, y: 0, z: 0 }, 13.9), false);
  assert.equal(tryCastSpell(room, 'a', { x: 1, y: 0, z: 0 }, 14.01), true);
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

test('a direct Fireball hits for 18 once (not direct plus splash), then burns for 10 more in licks', () => {
  const room = playingRoom();
  const a = room.players.get('a');
  const b = room.players.get('b');
  Object.assign(a.position, { x: 0, y: 0, z: 0 });
  Object.assign(b.position, { x: 1.5, y: 0, z: 0 });
  a.yaw = -Math.PI / 2; a.input.yaw = a.yaw;
  b.spawnProtectionUntil = 0;
  assert.equal(tryCastSpell(room, 'a', { x: 1, y: 0, z: 0 }, 10), true);
  stepRoom(room, 0.01, 10.31, openWorld);
  stepRoom(room, 0.02, 10.33, openWorld);
  assert.equal(b.health, 82);
  assert.ok(b.burn, 'it is burning');
  const burnDamage = room.events.filter((e) => e.type === 'damage' && e.source === 'burn');
  assert.equal(burnDamage.length, 0, 'the first lick comes a moment later');
  for (let t = 10.4; t <= 13.01; t += 0.05) stepRoom(room, 0.05, t, openWorld);
  assert.equal(b.health, 72, 'burn total 10: a direct hit is 28 in all');
  assert.equal(b.burn, null);
  const licks = room.events.filter((e) => e.type === 'damage' && e.source === 'burn');
  assert.equal(licks.length, SPELLS.fireball.burn.licks);
  assert.ok(licks.every((e) => e.attackerId === 'a'), 'the burn is credited to the caster');
});

test('a spell thrown at the ground bursts where it lands, and its blast catches whoever stands there', () => {
  const room = playingRoom();
  const a = room.players.get('a');
  const b = room.players.get('b');
  Object.assign(a.position, { x: 0, y: 0, z: 0 });
  Object.assign(b.position, { x: 3, y: 0, z: 0.8 });
  a.yaw = -Math.PI / 2; a.input.yaw = a.yaw;
  // aimed down at the ground just short of b's feet
  const down = { x: Math.cos(0.45), y: -Math.sin(0.45), z: 0 };
  assert.equal(tryCastSpell(room, 'a', down, 10), true);
  for (let t = 10.31; t < 10.8; t += 0.02) stepRoom(room, 0.02, t, openWorld);
  const impact = room.events.find((e) => e.type === 'projectileImpact');
  assert.ok(impact, 'it burst');
  assert.ok(Math.abs(impact.point.y - 0.05) < 0.01, 'on the ground');
  assert.equal(room.projectiles.size, 0);
  assert.ok(b.health < 100, 'the blast reached them');
});

test('Frostfire hits lighter and leaves a chill that is strongest at once and thaws away', () => {
  const room = playingRoom();
  const a = room.players.get('a');
  const b = room.players.get('b');
  a.spell = 'frostfire';
  Object.assign(a.position, { x: 0, y: 0, z: 0 });
  Object.assign(b.position, { x: 1.5, y: 0, z: 0 });
  a.yaw = -Math.PI / 2; a.input.yaw = a.yaw;
  assert.equal(tryCastSpell(room, 'a', { x: 1, y: 0, z: 0 }, 10), true);
  assert.ok(room.events.some((e) => e.type === 'spellCast' && e.spell === 'frostfire'));
  stepRoom(room, 0.01, 10.31, openWorld);
  stepRoom(room, 0.02, 10.33, openWorld);
  assert.equal(b.health, 100 - SPELLS.frostfire.directDamage);
  assert.equal(b.burn, null, 'cold does not burn');
  assert.ok(b.chill);
  stepRoom(room, 0.02, 10.35, openWorld);
  const fresh = b.speedScale;
  assert.ok(fresh < 0.5, `slowed hard at first (${fresh.toFixed(2)})`);
  stepRoom(room, 0.02, 11.9, openWorld);
  assert.ok(b.speedScale > fresh && b.speedScale < 1, 'thawing');
  stepRoom(room, 0.02, 13.4, openWorld);
  assert.equal(b.speedScale, 1);
  assert.equal(b.chill, null);
  // and a chilled body really does cover less ground
  const moved = (player, from, t) => {
    player.input = { forward: 1, right: 0, jump: false, yaw: player.yaw, pitch: 0 };
    stepRoom(room, 0.1, t, openWorld);
    return Math.hypot(player.position.x - from.x, player.position.z - from.z);
  };
  // run away from the caster, so nothing but the cold decides the distance
  b.yaw = -Math.PI / 2;
  b.chill = { slow: 0.5, startedAt: 20, until: 23 };
  const start = { ...b.position };
  const chilledStep = moved(b, start, 20.1);
  b.chill = null;
  const start2 = { ...b.position };
  const freeStep = moved(b, start2, 30);
  assert.ok(chilledStep < freeStep * 0.6, `chilled ${chilledStep.toFixed(2)} vs free ${freeStep.toFixed(2)}`);
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
  assert.equal(b.health, 72);
});

function sprintInput(player, overrides = {}) {
  player.input = { forward: 1, right: 0, jump: false, sprint: true, yaw: player.yaw, pitch: 0, ...overrides };
}

test('sprint is an authoritative state that runs faster and spends the shared stamina bar slowly', () => {
  const room = playingRoom();
  const a = room.players.get('a');
  a.yaw = Math.PI; sprintInput(a);                           // head away from b
  stepRoom(room, 0.05, 10, openWorld);
  assert.equal(a.sprinting, true);
  let t = 10;
  for (let i = 0; i < 20; i += 1) { t += 0.05; stepRoom(room, 0.05, t, openWorld); }
  assert.ok(Math.abs(Math.hypot(a.velocity.x, a.velocity.z) - SPRINT.speed) < 1e-6, 'at full sprint speed once built up');
  // 1.05 s of sprint at 10/s, still far from a block's worth of cost per second
  assert.ok(Math.abs(a.guardStamina - (100 - SPRINT.staminaPerSec * 1.05)) < 1e-6, `stamina ${a.guardStamina}`);
  // stamina does not recover while sprinting, and resumes after the usual delay once the sprint ends
  sprintInput(a, { sprint: false });
  const after = a.guardStamina;
  t += 0.5; stepRoom(room, 0.05, t, openWorld);
  assert.equal(a.sprinting, false);
  assert.equal(a.guardStamina, after, 'regen waits after the last drain');
  t += 1.0; stepRoom(room, 0.05, t, openWorld);
  assert.ok(a.guardStamina > after, 'regen resumes');
});

test('guarding or attacking ends a sprint; blocks and sprint share one bar', () => {
  const room = playingRoom();
  const a = room.players.get('a');
  sprintInput(a, { forward: 1 });
  stepRoom(room, 0.05, 10, openWorld);
  assert.equal(a.sprinting, true);
  setGuard(room, 'a', true, 10.05);
  stepRoom(room, 0.05, 10.1, openWorld);
  assert.equal(a.sprinting, false, 'guard cancels sprint');
  setGuard(room, 'a', false, 10.15);
  stepRoom(room, 0.05, 10.2, openWorld);
  assert.equal(a.sprinting, true);
  beginAttack(room, 'a', 10.25);
  stepRoom(room, 0.05, 10.3, openWorld);
  assert.equal(a.sprinting, false, 'attacking cancels sprint');
});

test('an emptied bar winds the Spellblade: no sprint until it recovers', () => {
  const room = playingRoom();
  const a = room.players.get('a');
  a.yaw = Math.PI; a.guardStamina = 0.3; a.sprinting = true; a.lastGuardDrainAt = 9.99;   // mid-sprint
  sprintInput(a);
  stepRoom(room, 0.05, 10, openWorld);
  assert.equal(a.guardStamina, 0);
  stepRoom(room, 0.05, 10.05, openWorld);
  assert.equal(a.sprinting, false, 'empty bar ends the sprint');
  a.guardStamina = SPRINT.restartStamina - 1;
  a.lastGuardDrainAt = -Infinity;
  stepRoom(room, 0.001, 10.1, openWorld);
  assert.equal(a.sprinting, false, 'still winded below the restart mark');
  a.guardStamina = SPRINT.restartStamina + 1;
  stepRoom(room, 0.05, 10.2, openWorld);
  assert.equal(a.sprinting, true, 'recovered: sprint again');
});
