import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import * as combat from '../../shared/sim/combat.mjs';
import { applyRoomCommand, serializeSnapshot } from '../../shared/sim/wire.mjs';
import { STAGGER } from '../../shared/src/stagger.mjs';

const world = {
  floors: [{ id: 'floor', center: [0, -0.1, 0], size: [60, 0.2, 60], y: 0 }],
  ramps: [], solids: [], abyssY: -9,
  spawnPoints: [{ x: 0, y: 0, z: 0, yaw: -Math.PI / 2 }, { x: 1.8, y: 0, z: 0, yaw: Math.PI / 2 }],
};
const aim = { x: 1, y: 0, z: 0 };
function duel(preparedSpells = ['fireball', 'frostfire', 'gale']) {
  const room = new Room('CHIV'); room.world = world;
  const a = room.addPlayer({ id: 'a', name: 'A', token: 'a', ultimate: 'chivalry', preparedSpells }, 0);
  const b = room.addPlayer({ id: 'b', name: 'B', token: 'b' }, 0);
  room.startMatch(3);
  a.spawnProtectionUntil = b.spawnProtectionUntil = 0;
  room.events.length = 0;
  return { room, a, b };
}
function tick(room, now) { combat.stepRoom(room, 0.01, now, world); }
function active(room, a, at = 10) {
  a.prowess = 100;
  assert.equal(combat.tryUltimate(room, 'a', at), true);
  tick(room, at + 0.65);
  assert.equal(a.ultimateState?.id, 'chivalry');
  assert.equal(a.ultimateState?.phase, 'active');
}
function command(room, a, type, spell, at, extra = {}) {
  return applyRoomCommand(room, a, { type, spell, direction: aim, ...extra }, at);
}
function run(room, from, until) { for (let now = from; now <= until + 1e-8; now += 0.01) tick(room, now); }

test('Chivalry owns startup for 0.65 seconds and opens concurrent actions for nine seconds', () => {
  const { room, a } = duel(); a.prowess = 100;
  combat.beginAttack(room, 'a', 9.8); combat.setGuard(room, 'a', true, 9.9);
  a.input.attack = a.input.guard = true;
  assert.equal(combat.tryUltimate(room, 'a', 10), true);
  assert.equal(a.attackActive, false); assert.equal(a.guarding, false);
  tick(room, 10.64); assert.equal(a.prowess, 100); assert.equal(a.ultimateState.phase, 'startup');
  tick(room, 10.65); assert.equal(a.prowess, 0); assert.equal(a.ultimateState.until, 19.65);
  assert.equal(a.guarding, true); assert.equal(a.attackActive, true);
  tick(room, 19.65); assert.equal(a.ultimateState, null);
});

test('activation cancels a gathering spell and current Dash without consuming extra charge', () => {
  const { room, a } = duel(); combat.tryCastSpell(room, 'a', aim, 10);
  combat.tryDash(room, 'a', { x: 1, z: 0 }, 10); a.prowess = 100;
  assert.equal(combat.tryUltimate(room, 'a', 10.1), true);
  assert.equal(a.pendingSpell, null); assert.equal(a.castEndsAt, 0); assert.ok(a.dashUntil <= 10.1);
});

test('startup allows cooling preselection while refusing every precommit cast', () => {
  const { room, a } = duel(); a.prowess = 100; combat.tryUltimate(room, 'a', 10);
  a.spellReadyById = { frostfire: 30 };
  command(room, a, 'selectPreparedSpell', 'frostfire', 10.2);
  assert.equal(a.spell, 'frostfire'); assert.equal(a.startingSpell, 'fireball');
  command(room, a, 'castPreparedSpell', 'gale', 10.3);
  assert.equal(a.spell, 'gale'); assert.equal(a.pendingSpell, null);
  tick(room, 10.65); assert.equal(a.spell, 'gale');
});

test('all four coexist and further actions preserve the accepted strike and gather clocks', () => {
  const { room, a, b } = duel(); b.position.x = 15; active(room, a);
  combat.setGuard(room, 'a', true, 10.7);
  combat.beginAttack(room, 'a', 10.71);
  command(room, a, 'castPreparedSpell', 'frostfire', 10.72);
  const began = a.attackStartedAt; const ends = a.castEndsAt; const pending = a.pendingSpell;
  assert.equal(combat.tryDash(room, 'a', { x: 0, z: 1 }, 10.73), true);
  combat.setGuard(room, 'a', true, 10.74);
  combat.beginAttack(room, 'a', 10.75);
  command(room, a, 'castPreparedSpell', 'fireball', 10.76);
  assert.equal(a.guarding, true); assert.equal(a.attackActive, true); assert.ok(a.dashUntil > 10.73);
  assert.equal(a.attackStartedAt, began); assert.equal(a.castEndsAt, ends); assert.equal(a.pendingSpell, pending);
  assert.equal(a.spell, 'fireball'); assert.equal(a.pendingSpell.spell, 'frostfire'); assert.equal(a.guardStartedAt, 10.7);
  tick(room, ends); tick(room, ends + 0.01);
  assert.equal(room.events.filter((e) => e.type === 'projectileSpawned').length, 1);
});

test('atomic cast validates membership and casts the requested identity with current authoritative aim', () => {
  const { room, a, b } = duel(); b.position.x = 20; active(room, a);
  command(room, a, 'castPreparedSpell', 'steel', 10.7); assert.equal(a.spell, 'fireball'); assert.equal(a.steel, null);
  command(room, a, 'castPreparedSpell', 'frostfire', 10.71, { yaw: 0, pitch: 0.4 });
  assert.equal(a.spell, 'frostfire'); assert.equal(a.pendingSpell.spell, 'frostfire');
  tick(room, 11.02);
  const p = room.events.find((e) => e.type === 'projectileSpawned').projectile;
  assert.equal(p.spell, 'frostfire'); assert.ok(p.velocity.y > 0); assert.ok(p.velocity.z < 0);
  assert.ok(Math.abs(p.velocity.x) < 1e-9);
});

test('projectile gate survives identity swaps and full identity cooldown survives expiry', () => {
  const { room, a, b } = duel(); b.position.x = 20; active(room, a);
  command(room, a, 'castPreparedSpell', 'fireball', 10.7); tick(room, 11);
  command(room, a, 'selectPreparedSpell', 'frostfire', 11.1);
  command(room, a, 'castPreparedSpell', 'frostfire', 11.41); assert.equal(a.pendingSpell, null);
  command(room, a, 'castPreparedSpell', 'frostfire', 11.42); assert.equal(a.pendingSpell.spell, 'frostfire');
  assert.equal(a.spellReadyById.fireball, 14.7); assert.equal(a.spellReadyById.frostfire, 15.92);
  tick(room, 11.73); command(room, a, 'castPreparedSpell', 'fireball', 12.15);
  assert.equal(a.pendingSpell.spell, 'fireball'); assert.equal(a.spellReadyById.fireball, 16.15);
  a.ultimateState.until = 12.2; tick(room, 12.2);
  tick(room, 12.46); assert.equal(combat.tryCastSpell(room, 'a', aim, 12.47), false);
  assert.equal(a.spell, 'fireball');
});

test('Gale and Steel keep ordinary identity cooldowns and cooling Q creates no gauntlet', () => {
  for (const spell of ['gale', 'steel']) {
    const { room, a, b } = duel(['fireball', 'gale', 'steel']); b.position.x = 20; active(room, a);
    command(room, a, 'castPreparedSpell', spell, 10.7); tick(room, 11.21);
    command(room, a, 'selectPreparedSpell', 'fireball', 11.22);
    command(room, a, 'selectPreparedSpell', spell, 11.23);
    const casts = room.events.filter((e) => e.type === 'spellCast' || e.type === 'steelOn').length;
    assert.equal(combat.tryCastOrGauntlet(room, 'a', aim, 11.5), false);
    assert.equal(a.gauntlet, null);
    assert.equal(room.events.filter((e) => e.type === 'spellCast' || e.type === 'steelOn').length, casts);
    assert.ok(a.spellReadyById[spell] > 11.5);
  }
});

test('ordinary parry defeats contact but permits action while a real Balance break stops all actions', () => {
  for (const balance of [0, STAGGER.max - 1]) {
    const { room, a, b } = duel(); active(room, a); a.stagger.level = balance;
    combat.beginAttack(room, 'a', 10.7); combat.setGuard(room, 'a', true, 10.71);
    combat.tryCastSpell(room, 'a', { x: 0, y: 0, z: -1 }, 10.99);
    combat.setGuard(room, 'b', true, 11.02);
    run(room, 11.02, 11.12);
    assert.ok(room.events.some((e) => e.type === 'parry')); assert.equal(b.health, 100);
    assert.equal(a.ultimateState.phase, 'active');
    if (balance === 0) { assert.ok(a.staggerUntil < 11.1); assert.equal(a.guarding, true); assert.ok(a.pendingSpell); }
    else { assert.ok(a.staggerUntil > 11.1); assert.equal(a.attackActive, false); assert.equal(a.guarding, false); assert.equal(a.pendingSpell, null); }
  }
});

test('expiry keeps committed gather and Dash tails but new actions follow ordinary exclusivity', () => {
  const { room, a, b } = duel(); b.position.x = 20; active(room, a); a.ultimateState.until = 11;
  combat.beginAttack(room, 'a', 10.8); combat.setGuard(room, 'a', true, 10.81);
  combat.tryCastSpell(room, 'a', aim, 10.85); combat.tryDash(room, 'a', { x: 0, z: 1 }, 10.9);
  tick(room, 11); assert.equal(a.ultimateState, null); assert.ok(a.pendingSpell); assert.ok(a.dashUntil > 11);
  tick(room, 11.16); assert.ok(room.events.some((e) => e.type === 'projectileSpawned'));
  combat.setGuard(room, 'a', false, 11.17); combat.setGuard(room, 'a', true, 11.18);
  assert.equal(a.attackActive, false); combat.beginAttack(room, 'a', 11.19); assert.equal(a.guarding, false);
});

test('death clears concurrent actions and temporary gate, respawn preserves current, new match restores starting', () => {
  const { room, a } = duel(); active(room, a); command(room, a, 'castPreparedSpell', 'frostfire', 10.7);
  combat.beginAttack(room, 'a', 10.71); combat.setGuard(room, 'a', true, 10.72); combat.tryDash(room, 'a', { x: 1, z: 0 }, 10.73);
  combat.killPlayer(room, 'a', null, 'test', 10.74);
  assert.equal(a.ultimateState, null); assert.equal(a.pendingSpell, null); assert.equal(a.guarding, false);
  assert.equal(a.attackActive, false); assert.ok(a.dashUntil <= 10.74); assert.equal(a.chivalryProjectileReadyAt, 0);
  tick(room, 13.75); assert.equal(a.alive, true); assert.equal(a.spell, 'frostfire');
  room.startMatch(20); assert.equal(a.spell, 'fireball'); assert.deepEqual(a.spellReadyById, {});
});

test('startup death and true Stagger retain Prowess and apply a 2.5 second retry lockout', () => {
  for (const death of [false, true]) {
    const { room, a } = duel(); a.prowess = 100; combat.tryUltimate(room, 'a', 10);
    if (death) combat.killPlayer(room, 'a', null, 'test', 10.2);
    else { combat.staggerBy(room, a, 100, 10.2); tick(room, 10.2); }
    assert.equal(a.ultimateState, null); assert.equal(a.prowess, 100); assert.equal(a.ultimateLockedUntil, 12.7);
  }
});

test('snapshot exposes saved, prepared, current and identity availability without aliasing server state', () => {
  const { room, a } = duel(); active(room, a); command(room, a, 'castPreparedSpell', 'frostfire', 10.7);
  const snapshot = serializeSnapshot(room, 10.71).players.find((p) => p.id === 'a');
  assert.equal(snapshot.startingSpell, 'fireball'); assert.equal(snapshot.spell, 'frostfire');
  assert.deepEqual(snapshot.preparedSpells, ['fireball', 'frostfire', 'gale']);
  assert.equal(snapshot.spellReadyById.frostfire, 15.2); assert.equal(snapshot.chivalryProjectileReadyAt, 11.42);
  snapshot.preparedSpells.push('steel'); snapshot.spellReadyById.fireball = 99;
  assert.equal(a.preparedSpells.length, 3); assert.equal(a.spellReadyById.fireball, 0);
});


test('a Guard Break interrupts simultaneous actions even when Balance has room left', () => {
  const { room, a, b } = duel(); active(room, a);
  combat.beginAttack(room, 'b', 10.7);
  combat.beginAttack(room, 'a', 10.9);
  combat.setGuard(room, 'a', true, 10.91); a.guardStartedAt = 9; a.guardStamina = 1;
  combat.tryCastSpell(room, 'a', { x: 0, y: 0, z: -1 }, 10.99);
  run(room, 11.01, 11.12);
  assert.ok(room.events.some((e) => e.type === 'guardBreak' && e.defenderId === 'a'));
  assert.equal(a.attackActive, false); assert.equal(a.pendingSpell, null); assert.equal(a.castEndsAt, 0);
  assert.equal(a.guarding, false); assert.equal(a.ultimateState?.phase, 'active'); assert.equal(a.prowess, 0);
});

test('a Sunder body hit cuts the concurrent kit while committed Chivalry stays spent and active', () => {
  const { room, a, b } = duel(); active(room, a);
  b.ultimateState = { id: 'sunder', phase: 'active', until: 20 };
  combat.beginAttack(room, 'b', 10.7);
  combat.beginAttack(room, 'a', 10.95);
  combat.setGuard(room, 'a', true, 10.96); a.yaw = 0; a.input.yaw = 0;
  combat.tryCastSpell(room, 'a', aim, 10.98);
  run(room, 11, 11.16);
  assert.ok(room.events.some((e) => e.type === 'actionInterrupted' && e.playerId === 'a'));
  assert.equal(a.attackActive, false); assert.equal(a.pendingSpell, null); assert.equal(a.guarding, false);
  assert.equal(a.ultimateState?.phase, 'active'); assert.ok(a.prowess < 100);
});

test('spell selection is rejected outside startup or active, on death, and for malformed identities', () => {
  const { room, a } = duel();
  for (const id of ['frostfire', '__proto__', {}, 1, null]) {
    command(room, a, 'selectPreparedSpell', id, 10);
    command(room, a, 'castPreparedSpell', id, 10);
    assert.equal(a.spell, 'fireball'); assert.equal(a.pendingSpell, null);
  }
  active(room, a); a.alive = false;
  command(room, a, 'selectPreparedSpell', 'frostfire', 10.7);
  command(room, a, 'castPreparedSpell', 'frostfire', 10.7);
  assert.equal(a.spell, 'fireball'); assert.equal(a.pendingSpell, null);
});

test('explicit gauntlet keeps ordinary sword commitment and recovery constraints', () => {
  const { room, a, b } = duel(); b.position.x = 15; active(room, a);
  combat.beginAttack(room, 'a', 10.7);
  assert.equal(combat.tryGauntletStrike(room, 'a', 10.71), false);
  combat.cancelAttack(room, 'a', 10.72);
  assert.equal(combat.tryGauntletStrike(room, 'a', 10.73), true);
  const ready = a.gauntletReadyAt;
  assert.equal(combat.tryGauntletStrike(room, 'a', 10.74), false);
  assert.equal(a.gauntletReadyAt, ready);
});

test('concurrent sword contacts keep ordinary damage and cadence and earn no next charge', () => {
  const { room, a, b } = duel(); active(room, a); combat.beginAttack(room, 'a', 10.7);
  combat.setGuard(room, 'a', true, 10.8);
  run(room, 10.8, 11.15);
  const hits = room.events.filter((e) => e.type === 'damage' && e.source === 'sword');
  assert.equal(hits.length, 1); assert.equal(hits[0].amount, 30); assert.equal(hits[0].ultimate, true);
  assert.equal(a.prowess, 0); assert.ok(b.prowess > 0);
  assert.equal(room.events.filter((e) => e.type === 'swordSwing').length, 1);
});

test('Chivalry projectile and burn tails cannot fund a new charge after expiry', () => {
  const { room, a, b } = duel(); b.position.x = 5; active(room, a); a.ultimateState.until = 11;
  combat.tryCastSpell(room, 'a', aim, 10.85);
  run(room, 10.86, 13.1);
  assert.ok(room.events.some((e) => e.type === 'damage' && e.source === 'fireball'));
  assert.ok(room.events.some((e) => e.type === 'damage' && e.source === 'burn'));
  assert.equal(a.ultimateState, null); assert.equal(a.prowess, 0); assert.ok(b.prowess > 0);
});


test('valid atomic selection remains current while its ordinary ability cooldown refuses cast', () => {
  const { room, a } = duel(); active(room, a); a.spellReadyById.gale = 30;
  command(room, a, 'castPreparedSpell', 'gale', 10.7);
  assert.equal(a.spell, 'gale'); assert.equal(a.pendingSpell, null); assert.equal(a.spellReadyAt, 30);
});

test('snapshot carries an accepted gather independently from later selected spell', () => {
  const { room, a } = duel(); active(room, a); command(room, a, 'castPreparedSpell', 'frostfire', 10.7);
  command(room, a, 'selectPreparedSpell', 'gale', 10.8);
  const snapshot = serializeSnapshot(room, 10.8).players.find((p) => p.id === 'a');
  assert.equal(snapshot.spell, 'gale'); assert.equal(snapshot.castingSpell, 'frostfire');
  assert.equal(snapshot.castEndsAt, 11); assert.equal(snapshot.castStartedAt, 10.7);
});

test('release Guard during startup wins over an earlier held input snapshot', () => {
  const { room, a } = duel(); a.input.guard = true; combat.setGuard(room, 'a', true, 9.9);
  a.prowess = 100; combat.tryUltimate(room, 'a', 10); combat.setGuard(room, 'a', false, 10.2);
  tick(room, 10.65); assert.equal(a.guarding, false);
});

test('a fresh physical Guard and attack press held during startup become real at commit', () => {
  const { room, a, b } = duel(); b.position.x = 15;
  a.prowess = 100; combat.tryUltimate(room, 'a', 10);
  assert.equal(combat.setGuard(room, 'a', true, 10.3), false);
  assert.equal(combat.beginAttack(room, 'a', 10.4), false);
  tick(room, 10.65);
  assert.equal(a.guarding, true); assert.equal(a.attackActive, true); assert.equal(a.attackStartedAt, 10.65);
  assert.equal(room.events.filter((e) => e.type === 'guardStarted').length, 1);
});

test('the real sword sweeps during Dash and its contact is spent exactly once', () => {
  const { room, a, b } = duel(); active(room, a); combat.beginAttack(room, 'a', 10.7);
  run(room, 10.71, 11.01);
  assert.equal(combat.tryDash(room, 'a', { x: 1, z: 0 }, 11.02), true);
  run(room, 11.03, 11.12);
  const hits = room.events.filter((e) => e.type === 'damage' && e.source === 'sword');
  assert.equal(hits.length, 1); assert.ok(hits[0].at < a.dashUntil); assert.equal(hits[0].amount, 30);
  assert.equal(b.health, 70);
});

test('the Gale concurrency opportunity earns no damage or displacement charge', () => {
  const { room, a } = duel(); active(room, a);
  command(room, a, 'castPreparedSpell', 'gale', 10.7); run(room, 10.71, 11.4);
  assert.ok(room.events.some((e) => e.type === 'damage' && e.source === 'gale'));
  assert.equal(a.prowess, 0);
});

test('parry carries its authoritative reel decision through a later expiry snapshot', () => {
  for (const chivalry of [false, true]) {
    const { room, a, b } = duel();
    if (chivalry) { active(room, a); a.ultimateState.until = 11.13; }
    combat.beginAttack(room, 'a', 10.7);
    combat.setGuard(room, 'b', true, 11.02);
    run(room, 11.02, 11.12);
    const parry = room.events.find((e) => e.type === 'parry');
    assert.ok(parry); assert.equal(parry.suppressParryReel, chivalry);
    assert.equal(a.stagger.level, 14);
    tick(room, 11.14);
    assert.equal(a.ultimateState, null);
    assert.equal(parry.suppressParryReel, chivalry);
  }
});
