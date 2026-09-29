import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import {
  beginAttack,
  endAttack,
  setGuard,
  stepRoom,
  tryActivateSteel,
  tryCastSpell,
  tryDash,
} from '../../shared/sim/combat.mjs';
import { STEEL, steelStrength } from '../../shared/src/steel.mjs';
import { SPRINT } from '../../shared/src/movement.mjs';
import { GAME } from '../../shared/src/combat.mjs';
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

test('each committed sword strike emits one authoritative swing cue as it goes live, before its contact', () => {
  const room = playingRoom();
  beginAttack(room, 'a', 10);
  room.events.length = 0;
  const swings = () => room.events.filter((e) => e.type === 'swordSwing' && e.playerId === 'a').map((e) => e.strikeIndex);

  stepRoom(room, 0.01, 10.2, openWorld);
  assert.deepEqual(swings(), [], 'not yet');
  stepRoom(room, 0.01, 10.36, openWorld);
  assert.deepEqual(swings(), [0], 'live just before its contact');
  for (const now of [10.40, 11.10, 11.80, 12]) stepRoom(room, 0.01, now, openWorld);
  assert.deepEqual(swings(), [0, 1, 2], 'once each');
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

test('a normal guard drains 22 stamina a blow and the fifth block guard-breaks for 700ms', () => {
  const room = playingRoom();
  const b = room.players.get('b');
  setGuard(room, 'b', true, 9);
  const left = [];
  for (const now of [10, 10.8, 11.6, 12.4, 13.2]) {
    const a = room.players.get('a');
    a.attackActive = false; a.attackHeld = false; a.attackRestartAt = -Infinity;
    beginAttack(room, 'a', now - 0.4);
    stepRoom(room, 0.01, now, openWorld);
    // (the guard does not get its breath back between blows this close together)
    left.push(Math.round(b.guardStamina));
  }
  assert.deepEqual(left, [78, 56, 34, 12, 0]);
  assert.equal(b.guarding, false);
  assert.ok(b.staggerUntil >= 13.9 - 1e-6);
});

test('a tap is exactly one strike: let go before it lands and it still lands, then nothing more', () => {
  const room = playingRoom();
  const a = room.players.get('a');
  beginAttack(room, 'a', 10);
  endAttack(room, 'a', 10.1);
  stepRoom(room, 0.01, 10.4, openWorld);
  assert.equal(room.players.get('b').health, 72, 'the committed swing lands');
  assert.equal(a.attackActive, true, 'its follow-through is still under way');
  stepRoom(room, 0.01, 10.72, openWorld);
  assert.equal(a.attackActive, false, 'the chain ends where the next swing would have begun');
  for (const now of [11.1, 11.8, 12.5, 13.2]) stepRoom(room, 0.01, now, openWorld);
  assert.equal(room.players.get('b').health, 72);
  assert.deepEqual(room.events.filter((e) => e.type === 'swordSwing').map((e) => e.strikeIndex), [0]);
});

test('holding chains each strike as it becomes due; letting go mid-swing finishes that swing only', () => {
  const room = playingRoom();
  beginAttack(room, 'a', 10);
  stepRoom(room, 0.01, 10.4, openWorld);
  stepRoom(room, 0.01, 10.8, openWorld);          // still held as the second swing begins: committed
  endAttack(room, 'a', 10.9);                      // let go in the middle of it
  stepRoom(room, 0.01, 11.1, openWorld);
  assert.equal(room.players.get('b').health, 44, 'the second strike still lands');
  stepRoom(room, 0.01, 11.5, openWorld);
  stepRoom(room, 0.01, 11.9, openWorld);
  assert.equal(room.players.get('b').health, 44, 'no third');
  assert.equal(room.players.get('a').attackActive, false);
});

test('quick taps chain the combo too: a press during a swing asks for the next strike', () => {
  const room = playingRoom();
  beginAttack(room, 'a', 10);
  endAttack(room, 'a', 10.08);
  beginAttack(room, 'a', 10.5);                    // pressed again while the first is in its follow-through
  endAttack(room, 'a', 10.58);                     // and let go before the second would begin
  for (const now of [10.4, 10.72, 11.1, 11.44, 11.8, 12.5]) stepRoom(room, 0.01, now, openWorld);
  assert.deepEqual(room.events.filter((e) => e.type === 'swordSwing').map((e) => e.strikeIndex), [0, 1]);
  assert.equal(room.players.get('b').health, 44);
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
  b.impulse = { x: 0, z: 0 };
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

test('let go just before the next swing, but the word arrives after it began: that swing is taken back, not landed', () => {
  const room = playingRoom();
  beginAttack(room, 'a', 10);
  stepRoom(room, 0.01, 10.4, openWorld);            // the first lands
  stepRoom(room, 0.01, 10.74, openWorld);           // the button still seems held as the second begins: committed
  assert.equal(room.players.get('a').attackCommitted, 2);
  endAttack(room, 'a', 10.8, 10.69);                 // it was let go at 10.69, before the second began
  for (const now of [11.1, 11.5, 12.2]) stepRoom(room, 0.01, now, openWorld);
  assert.equal(room.players.get('b').health, 72, 'only the first landed');
  assert.equal(room.players.get('a').attackActive, false);
});

test('but a second swing asked for by a fresh press stands, whenever the button was let go', () => {
  const room = playingRoom();
  beginAttack(room, 'a', 10);
  endAttack(room, 'a', 10.1, 10.1);
  beginAttack(room, 'a', 10.5);                      // tapped again during the first
  stepRoom(room, 0.01, 10.4, openWorld);
  stepRoom(room, 0.01, 10.74, openWorld);            // committed by the tap
  endAttack(room, 'a', 10.8, 10.6);                  // that tap let go before the second began
  for (const now of [11.1, 11.5]) stepRoom(room, 0.01, now, openWorld);
  assert.equal(room.players.get('b').health, 44, 'the second lands');
});

// b placed at `angle` (radians, + to a's left) and `distance` from a, who faces +x
function placeB(room, angle, distance) {
  const b = room.players.get('b');
  Object.assign(b.position, { x: Math.cos(angle) * distance, y: 0, z: -Math.sin(angle) * distance });
  b.history = [];
  return b;
}

test('a sword caught cleanly does its full damage; one at the fringe of the arc glances, weaker but real', () => {
  const clean = playingRoom();
  placeB(clean, 0, 1.6);
  beginAttack(clean, 'a', 10);
  for (const now of [10.3, 10.4, 10.5, 10.6]) stepRoom(clean, 0.01, now, openWorld);
  assert.equal(clean.players.get('b').health, 100 - GAME.swordDamage);

  const fringe = playingRoom();
  placeB(fringe, -50 * Math.PI / 180, 1.6);
  beginAttack(fringe, 'a', 10);
  for (const now of [10.3, 10.4, 10.5, 10.6]) stepRoom(fringe, 0.01, now, openWorld);
  const lost = 100 - fringe.players.get('b').health;
  assert.ok(lost > 0 && lost < GAME.swordDamage, `a glancing blow: ${lost}`);
  const hit = fringe.events.find((e) => e.type === 'swordHit');
  assert.ok(hit.quality < 1 && hit.quality > 0);

  const outside = playingRoom();
  placeB(outside, 80 * Math.PI / 180, 1.6);
  beginAttack(outside, 'a', 10);
  for (const now of [10.3, 10.4, 10.5, 10.6]) stepRoom(outside, 0.01, now, openWorld);
  assert.equal(outside.players.get('b').health, 100, 'outside the arc: a miss');
});

test('the forehand meets a body on its incoming side sooner than one on the far side', () => {
  const when = (angle) => {
    const room = playingRoom();
    placeB(room, angle, 1.6);
    beginAttack(room, 'a', 10);
    for (let now = 10.25; now <= 10.6; now += 0.01) {
      stepRoom(room, 0.01, now, openWorld);
      if (room.players.get('b').health < 100) return now;
    }
    return Infinity;
  };
  // the forehand comes across from a's right (negative angles) to the left
  assert.ok(when(-30 * Math.PI / 180) < when(0) && when(0) < when(30 * Math.PI / 180));
});

test('running into each other shoves harder; it barely changes the damage', () => {
  const measure = (closing) => {
    const room = playingRoom();
    const b = placeB(room, 0, 1.6);
    const a = room.players.get('a');
    beginAttack(room, 'a', 10);
    stepRoom(room, 0.01, 10.39, openWorld);
    a.velocity.x = closing / 2;
    b.velocity.x = -closing / 2;
    const before = Math.hypot(b.velocity.x, b.velocity.z);
    stepRoom(room, 0.01, 10.40, openWorld);
    const hit = room.events.find((e) => e.type === 'swordHit');
    return { damage: 100 - b.health, shove: b.velocity.x - (-closing / 2), impact: hit.impact, before };
  };
  const standing = measure(0);
  const collision = measure(12);
  assert.ok(collision.impact > standing.impact);
  assert.ok(collision.shove > standing.shove * 1.3, 'a much bigger shove');
  assert.ok(Math.abs(collision.damage - standing.damage) <= GAME.swordDamage * 0.1, 'about the same damage');
});

test('a glancing blow bears less on a guard than a clean one', () => {
  const cost = (angle) => {
    const room = playingRoom();
    const b = placeB(room, angle, 1.6);
    // b faces a, guarding for a while (no parry)
    b.yaw = Math.atan2(b.position.x, b.position.z); b.input.yaw = b.yaw;
    setGuard(room, 'b', true, 9);
    beginAttack(room, 'a', 10);
    for (const now of [10.3, 10.4, 10.5, 10.6]) stepRoom(room, 0.01, now, openWorld);
    return 100 - b.guardStamina;
  };
  const clean = cost(0);
  const glancing = cost(-50 * Math.PI / 180);
  assert.ok(clean > 0 && glancing > 0 && glancing < clean, `clean ${clean}, glancing ${glancing}`);
});

// a Fireball straight into b (who stands 2 m in front of a), resolved; returns what it did to b
function fireballInto(room, { steel = false } = {}) {
  const b = room.players.get('b');
  if (steel) assert.equal(tryActivateSteel(room, 'b', 10), true);
  tryCastSpell(room, 'a', { x: 1, y: 0, z: 0 }, 10);
  let now = 10;
  while (now < 10.8 && !room.events.some((e) => e.type === 'projectileImpact')) { now += 0.02; stepRoom(room, 0.02, now, openWorld); }
  const damage = room.events.filter((e) => e.type === 'damage' && e.victimId === 'b' && e.source === 'fireball').reduce((sum, e) => sum + e.amount, 0);
  return { damage, burn: b.burn, push: b.velocity.x, b };
}

test('Sheathed in Steel: a square Fireball lands like a glancing one (less damage, less or no burn), the shove the same', () => {
  const bare = fireballInto(playingRoom());
  const steeled = fireballInto(playingRoom(), { steel: true });
  assert.ok(steeled.damage < bare.damage, `${steeled.damage} < ${bare.damage}`);
  assert.ok((steeled.burn?.licksLeft ?? 0) < (bare.burn?.licksLeft ?? 0), 'the fire clings less');
  assert.ok(Math.abs(steeled.push - bare.push) < 1e-6, 'momentum is untouched');
  // turning it aside wore the armour
  assert.ok(steelStrength(steeled.b.steel, 10.2) < steelStrength({ at: 10, base: 1 }, 10.2));
});

test('the steel does not soften a sword, but each blow wears it; and it waits out its cooldown', () => {
  const room = playingRoom();
  const b = room.players.get('b');
  assert.equal(tryActivateSteel(room, 'b', 10), true);
  assert.equal(tryActivateSteel(room, 'b', 10 + STEEL.cooldownSec - 0.1), false, 'not again yet');
  beginAttack(room, 'a', 10);
  for (const now of [10.3, 10.4, 10.5]) stepRoom(room, 0.01, now, openWorld);
  assert.equal(b.health, 72, 'the sword bites as ever');
  assert.ok(steelStrength(b.steel, 10.5) < steelStrength({ at: 10, base: 1 }, 10.5), 'but it chipped the steel');
  assert.equal(tryActivateSteel(room, 'b', 10 + STEEL.cooldownSec + 0.01), true, 'ready again after its cooldown');
});

test('the magic hand cannot clench while it gathers a spell', () => {
  const room = playingRoom();
  tryCastSpell(room, 'b', { x: -1, y: 0, z: 0 }, 10);
  assert.equal(tryActivateSteel(room, 'b', 10.1), false);
});

// a Gale from a (facing +x); returns b's state after the gust has done its work
function galeAt(room, bAt, { guard = false, steel = false, wall = null, direction = { x: 1, y: 0, z: 0 } } = {}) {
  const a = room.players.get('a');
  const b = room.players.get('b');
  a.spell = 'gale';
  Object.assign(b.position, bAt);
  b.history = [];
  if (guard) { b.yaw = Math.atan2(b.position.x - a.position.x, b.position.z - a.position.z); b.input.yaw = b.yaw; setGuard(room, 'b', true, 9); }
  if (steel) tryActivateSteel(room, 'b', 10);
  const world = wall ? { ...openWorld, solids: [wall] } : openWorld;
  assert.equal(tryCastSpell(room, 'a', direction, 10), true);
  const before = { ...b.position };
  stepRoom(room, 0.02, 10.2, world);
  const early = { health: b.health, x: b.position.x };
  for (let now = 10.22; now < 11.2; now += 0.02) {
    b.input = { forward: 0, right: 0, jump: false, yaw: b.yaw, pitch: 0 };
    stepRoom(room, 0.02, now, world);
  }
  const blast = room.events.find((e) => e.type === 'galeBlast');
  return { b, moved: b.position.x - before.x, damage: 100 - b.health, early, blast, before };
}

test('Gale Garner: after its breath, the gust shoves a knight in its heart well away and stings a little', () => {
  const heart = galeAt(playingRoom(), { x: 2, y: 0, z: 0 });
  assert.equal(heart.early.health, 100, 'nothing before the breath is let go');
  assert.ok(heart.moved > 1, `shoved ${heart.moved.toFixed(2)} m`);
  assert.ok(heart.damage > 0 && heart.damage < GAME.swordDamage / 2, `stung for ${heart.damage}`);
  // further out, in its pressure only: shoved, not stung
  const pressure = galeAt(playingRoom(), { x: SPELLS.gale.cone.reach + 1.2, y: 0, z: 0 });
  assert.ok(pressure.moved > 0.1 && pressure.moved < heart.moved);
  assert.equal(pressure.damage, 0);
  // behind the caster, untouched; behind a wall, sheltered
  assert.equal(galeAt(playingRoom(), { x: -2, y: 0, z: 0 }).moved, 0);
  const sheltered = galeAt(playingRoom(), { x: 3, y: 0, z: 0 }, { wall: { id: 'w', center: [1.5, 1, 0], size: [0.3, 3, 4] } });
  assert.equal(sheltered.damage, 0);
  assert.ok(Math.abs(sheltered.moved) < 0.05);
});

test('a guard facing the gust keeps its footing better, but pays for it like a blow; steel turns the sting, not the shove', () => {
  const open = galeAt(playingRoom(), { x: 2, y: 0, z: 0 });
  const guarded = galeAt(playingRoom(), { x: 2, y: 0, z: 0 }, { guard: true });
  assert.ok(guarded.moved < open.moved * 0.6, 'held its ground better');
  assert.equal(guarded.damage, 0);
  assert.ok(guarded.b.guardStamina < 100, 'the guard paid');
  assert.ok(guarded.b.lastGuardDrainAt >= 10.49, 'and its breath waits again, as after a blow');
  const steeled = galeAt(playingRoom(), { x: 2, y: 0, z: 0 }, { steel: true });
  assert.ok(steeled.damage < open.damage, 'less of a sting');
  assert.ok(Math.abs(steeled.moved - open.moved) < 0.05, 'the same shove');
});

test('a gust driven into the ground close by throws its caster up off it', () => {
  const room = playingRoom();
  const a = room.players.get('a');
  a.spell = 'gale';
  tryCastSpell(room, 'a', { x: 0, y: -1, z: 0 }, 10);
  stepRoom(room, 0.02, 10.5, openWorld);
  const blast = room.events.find((e) => e.type === 'galeBlast');
  assert.ok(blast.recoil && blast.recoil.y > 0);
  stepRoom(room, 0.02, 10.52, openWorld);
  assert.ok(a.position.y > 0.05 && a.grounded === false, 'off its feet');
});
