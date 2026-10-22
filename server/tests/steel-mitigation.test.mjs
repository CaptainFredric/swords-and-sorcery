import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import { RoomManager } from '../../shared/sim/RoomManager.mjs';
import {
  applyDamage,
  stepRoom,
  tryCastSpell,
} from '../../shared/sim/combat.mjs';
import {
  callSteel,
  steelStrength,
  steelMitigate,
  STEEL,
  STEEL_DAMAGE_RANGES,
} from '../../shared/src/steel.mjs';
import { GAME } from '../../shared/src/combat.mjs';
import { SPELLS, blastDamage } from '../../shared/src/spells.mjs';

function makeRoom() {
  const room = new Room('TEST1', { mode: 'FFA', worldId: 'castleward' });
  const a = room.addPlayer({ id: 'a', token: 'tok-a', name: 'Attacker' }, 0);
  const b = room.addPlayer({ id: 'b', token: 'tok-b', name: 'Defender' }, 0);
  room.armAutoStart(0);
  a.spawnProtectionUntil = 0;
  b.spawnProtectionUntil = 0;
  return { room, a, b };
}

test('steelMitigate: reduces damage to minimum of legitimate range proportional to strength', () => {
  const steel = callSteel(10); // full at 10s

  // Full steel (strength = 1.0)
  const fullSword = steelMitigate(steel, 30, 'sword', 10);
  assert.equal(fullSword.amount, 19, '30 dmg sword mitigated to min 19');
  assert.equal(fullSword.turned, 11);
  assert.equal(fullSword.strength, 1);

  // Half-decayed steel (strength = 0.5)
  const halfTime = 10 + STEEL.fullSec + STEEL.fadeSec / 2; // 10 + 5 + 2.5 = 17.5s
  const halfSword = steelMitigate(steel, 30, 'sword', halfTime);
  assert.equal(halfSword.amount, 25, '30 dmg sword mitigated to 25 at half strength');
  assert.equal(halfSword.turned, 5);
  assert.equal(halfSword.strength, 0.5);

  // Expired steel (strength = 0)
  const expiredTime = 10 + STEEL.fullSec + STEEL.fadeSec + 1;
  const expSword = steelMitigate(steel, 30, 'sword', expiredTime);
  assert.equal(expSword.amount, 30, 'full damage when steel has expired');
  assert.equal(expSword.turned, 0);

  // Hit already at minimum
  const minHit = steelMitigate(steel, 19, 'sword', 10);
  assert.equal(minHit.amount, 19, 'damage already at min is unchanged');
  assert.equal(minHit.turned, 0);

  // Miss / zero damage
  const miss = steelMitigate(steel, 0, 'sword', 10);
  assert.equal(miss.amount, 0, 'miss remains 0');
  assert.equal(miss.turned, 0);
});

test('steelMitigate across all defined combat sources at full Steel', () => {
  const steel = callSteel(10);

  // Spells
  const fb = steelMitigate(steel, 18, 'fireball', 10);
  assert.equal(fb.amount, 13, 'fireball 18 -> 13');
  assert.equal(fb.turned, 5);

  const ff = steelMitigate(steel, 16, 'frostfire', 10);
  assert.equal(ff.amount, 11, 'frostfire 16 -> 11');
  assert.equal(ff.turned, 5);

  const gale = steelMitigate(steel, 8, 'gale', 10);
  assert.equal(gale.amount, 1, 'gale 8 -> 1');

  // DoT: Burn
  const burn = steelMitigate(steel, 2, 'burn', 10);
  assert.equal(burn.amount, 1, 'burn lick 2 -> 1');

  // Melee & physical
  const gauntlet = steelMitigate(steel, 9, 'gauntlet', 10);
  assert.equal(gauntlet.amount, 6, 'gauntlet 9 -> 6');

  const ram = steelMitigate(steel, 12, 'ram', 10);
  assert.equal(ram.amount, 6, 'ram 12 -> 6');

  const vortex = steelMitigate(steel, 30, 'vortex', 10);
  assert.equal(vortex.amount, 20, 'vortex 30 -> 20');

  const rupture = steelMitigate(steel, 12, 'rupture', 10);
  assert.equal(rupture.amount, 5, 'rupture 12 -> 5');

  // Bi-Bye-llista bolts
  const bibyeCond = steelMitigate(steel, 18, 'bibye-conditioning', 10);
  assert.equal(bibyeCond.amount, 12, 'bibye conditioning 18 -> 12');

  const bibyeSiege = steelMitigate(steel, 85, 'bibye-siege', 10);
  assert.equal(bibyeSiege.amount, 55, 'bibye siege 85 -> 55');

  const bibyeShock = steelMitigate(steel, 35, 'bibye-shockwave', 10);
  assert.equal(bibyeShock.amount, 10, 'bibye shockwave 35 -> 10');
});

test('applyDamage: centralized Steel mitigation in live combat', () => {
  const { room, a, b } = makeRoom();

  b.steel = callSteel(10);
  b.health = 100;

  // Apply raw Fireball blast damage of 18 through applyDamage
  applyDamage(room, a.id, b.id, 18, 'fireball', 10, { x: 1, y: 0, z: 0 });
  assert.equal(b.health, 87, 'takes 13 damage (100 - 13 = 87)');

  const dmgEvent = room.events.find((e) => e.type === 'damage');
  assert.ok(dmgEvent);
  assert.equal(dmgEvent.amount, 13);
  assert.equal(dmgEvent.steel, 1);
  assert.equal(dmgEvent.turned, 5);

  // Knockback is preserved
  assert.ok(b.impulse.x > 0, 'knockback is preserved');
  assert.equal(b.steel.struck, true, 'first blow held steel clock');
});

test('applyDamage: prevents double reduction when steel strength is already recorded', () => {
  const { room, a, b } = makeRoom();

  b.steel = callSteel(10);
  b.health = 100;

  // Caller already mitigated and passes steel: 1, turned: 11, amount: 19
  applyDamage(room, a.id, b.id, 19, 'sword', 10, null, { steel: 1, turned: 11, skipSteel: true });
  assert.equal(b.health, 81, 'takes exactly 19 damage; not double reduced to something below 19');
});
