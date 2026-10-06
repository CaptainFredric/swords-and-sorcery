import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import { beginAttack, setGuard, stepRoom, tryCastSpell, tryDash } from '../../shared/sim/combat.mjs';
import { STEEL, callSteel } from '../../shared/src/steel.mjs';
import { STEEL_RAM } from '../../shared/src/steelRam.mjs';
import { GAME } from '../../shared/src/combat.mjs';
import { STAGGER } from '../../shared/src/stagger.mjs';

// The Steel Dash Ram in the room: a dash begun Sheathed in Steel and driven bodily into a knight gives them its
// momentum (a light blow, a hard shove, a part of their balance) and stops dead there; an ordinary dash is unchanged.

const TICK = 1 / 30;
const openWorld = {
  floors: [{ id: 'floor', center: [0, -0.1, 0], size: [80, 0.2, 80], y: 0 }],
  ramps: [],
  solids: [],
  spawnPoints: [{ x: 0, y: 0, z: 0, yaw: 0 }, { x: 30, y: 0, z: 0, yaw: 0 }, { x: -30, y: 0, z: 0, yaw: 0 }],
  abyssY: -9,
};

// A at the origin facing -z; B `gap` metres ahead of A, facing A; C (if asked) further on
function arena({ gap = 3, third = null } = {}) {
  const room = new Room('RAM');
  room.world = openWorld;
  const ids = third === null ? ['a', 'b'] : ['a', 'b', 'c'];
  for (const id of ids) room.addPlayer({ id, token: `t${id}`, name: id.toUpperCase() }, 0);
  for (const id of ids) room.setReady(id, true, 0);
  room.tick(3.1);
  const [a, b, c] = ids.map((id) => room.players.get(id));
  Object.assign(a.position, { x: 0, y: 0, z: 0 });
  Object.assign(b.position, { x: 0, y: 0, z: -gap });
  a.yaw = 0; a.input.yaw = 0;
  b.yaw = Math.PI; b.input.yaw = Math.PI;
  if (c) {
    Object.assign(c.position, { x: 0, y: 0, z: -third });
    c.yaw = Math.PI; c.input.yaw = Math.PI;
  }
  for (const p of [a, b, c].filter(Boolean)) p.spawnProtectionUntil = 0;
  room.events.length = 0;
  return { room, a, b, c };
}

function run(room, from, to, dt = TICK) {
  const events = [];
  for (let now = from; now <= to + 1e-9; now += dt) events.push(...stepRoom(room, dt, now, openWorld).splice(0));
  return events;
}

const ahead = { x: 0, z: -1 };
const RAM_DAMAGE = (events) => events.find((e) => e.type === 'damage' && e.source === 'ram');

test('a dash in full Steel driven into a knight: 12, thrown the way it went, 24 of their balance, and it stops dead there', () => {
  const { room, a, b } = arena();
  a.steel = callSteel(9);
  const bBefore = b.position.z;
  assert.equal(tryDash(room, 'a', ahead, 10), true);
  const events = run(room, 10, 10.6);
  const ram = events.find((e) => e.type === 'steelRam');
  assert.ok(ram, 'it rams');
  assert.equal(ram.playerId, 'a');
  assert.equal(ram.targetId, 'b');
  assert.equal(ram.strength, 1);
  assert.equal(ram.guarded, false);
  const hit = RAM_DAMAGE(events);
  assert.equal(hit.amount, STEEL_RAM.damage);
  assert.ok(Math.hypot(hit.push.x, hit.push.z) > 3.9 && hit.push.z < -3.5, 'a 4 m/s shove, the way the ram went');
  assert.ok(Math.abs(b.stagger.level - STEEL_RAM.stagger) < 3, `their balance ${b.stagger.level}`);
  assert.ok(b.position.z < bBefore - 0.4, `thrown back (${(bBefore - b.position.z).toFixed(2)} m)`);
  // the rammer stopped where the two met (nowhere near the dash's 5 m), set back a little
  assert.ok(a.position.z > bBefore + 0.5, `stopped short of them (${a.position.z.toFixed(2)})`);
  assert.ok(a.dashUntil <= ram.at + 1e-9, 'the dash ends on contact');
  assert.ok(!events.some((e) => e.type === 'staggerBreak'), 'no balance broken by one ram');
});

test('an ordinary dash is unchanged: no ram, no blow', () => {
  const { room } = arena();
  assert.equal(tryDash(room, 'a', ahead, 10), true);
  const events = run(room, 10, 10.6);
  assert.ok(!events.some((e) => e.type === 'steelRam' || e.type === 'damage'));
  const dash = events.find((e) => e.type === 'dash');
  assert.ok(dash && !('ram' in dash) && !('toward' in dash), 'nor does the dash say it was one');
});

test('the ram is as strong as the plate was as the dash began: half-worn for half, and wearing on through it changes nothing', () => {
  const { room, b } = arena();
  const a = room.players.get('a');
  // the plate half worn at 10, still wearing as the dash goes
  a.steel = callSteel(10 - STEEL.fullSec - STEEL.fadeSec / 2);
  tryDash(room, 'a', ahead, 10);
  const events = run(room, 10, 10.6);
  const ram = events.find((e) => e.type === 'steelRam');
  assert.equal(ram.strength, 0.5);
  assert.equal(RAM_DAMAGE(events).amount, 6);
  assert.ok(Math.abs(b.stagger.level - 12) < 2, `half the balance (${b.stagger.level})`);
  assert.equal(events.find((e) => e.type === 'dash').ram, 0.5, 'the dash said it was a ram, and how strong');
  // plate all but worn off: only a dash
  const weak = arena();
  weak.a.steel = callSteel(10 - STEEL.fullSec - STEEL.fadeSec * 0.9);
  tryDash(weak.room, 'a', ahead, 10);
  assert.ok(!run(weak.room, 10, 10.6).some((e) => e.type === 'steelRam'));
});

test('it cannot pass through a knight between ticks, and only the first knight it meets is rammed', () => {
  // a slow host (a tenth of a second a tick: 2.8 m of dash) still meets them
  const slow = arena({ gap: 1.6 });
  slow.a.steel = callSteel(9);
  tryDash(slow.room, 'a', ahead, 10);
  assert.ok(run(slow.room, 10, 10.4, 0.1).some((e) => e.type === 'steelRam' && e.targetId === 'b'));
  // two in line: the nearer takes it, the one behind is untouched
  const line = arena({ gap: 2.2, third: 3.6 });
  line.a.steel = callSteel(9);
  tryDash(line.room, 'a', ahead, 10);
  const events = run(line.room, 10, 10.6);
  assert.deepEqual(events.filter((e) => e.type === 'steelRam').map((e) => e.targetId), ['b']);
  assert.ok(!events.some((e) => e.type === 'damage' && e.victimId === 'c'));
});

test('a guard facing it braces: no harm, 28 of its stamina, a share of the shove and balance, never a parry; the dash still stops', () => {
  const { room, a, b } = arena();
  a.steel = callSteel(9);
  // raised at what would be the perfect moment for a blade
  setGuard(room, 'b', true, 10.05);
  const stamina = b.guardStamina;
  tryDash(room, 'a', ahead, 10.1);
  const events = run(room, 10.1, 10.7);
  const ram = events.find((e) => e.type === 'steelRam');
  assert.equal(ram.guarded, true);
  assert.ok(!RAM_DAMAGE(events), 'no harm');
  assert.equal(b.health, GAME.maxHealth);
  assert.ok(Math.abs(stamina - b.guardStamina - STEEL_RAM.guard.stamina) < 2, `stamina paid ${stamina - b.guardStamina}`);
  assert.ok(Math.abs(Math.hypot(ram.push.x, ram.push.z) - STEEL_RAM.shove * STEEL_RAM.guard.shove) < 0.05, 'a share of the shove');
  assert.ok(Math.abs(b.stagger.level - STEEL_RAM.stagger * STEEL_RAM.guard.stagger) < 2, `a share of the balance (${b.stagger.level})`);
  assert.ok(!events.some((e) => e.type === 'parry'), 'a body check is no blade to parry');
  assert.ok(b.guarding, 'the guard holds');
  assert.ok(a.dashUntil <= ram.at + 1e-9, 'and the dash stops');
  // a guard turned away from it does nothing
  const behind = arena();
  behind.a.steel = callSteel(9);
  behind.b.yaw = 0;
  behind.b.input.yaw = 0;
  setGuard(behind.room, 'b', true, 10);
  tryDash(behind.room, 'a', ahead, 10.1);
  assert.equal(RAM_DAMAGE(run(behind.room, 10.1, 10.7)).amount, STEEL_RAM.damage);
});

test('a guard the ram spends breaks, as any guard does', () => {
  const { room, a, b } = arena();
  a.steel = callSteel(9);
  setGuard(room, 'b', true, 9.5);
  b.guardStamina = 20;
  tryDash(room, 'a', ahead, 10);
  const events = run(room, 10, 10.6);
  const broke = events.find((e) => e.type === 'guardBreak');
  assert.ok(broke && broke.ram && broke.defenderId === 'b');
  assert.equal(b.guarding, false);
  assert.ok(b.staggerUntil > 10, 'the ordinary broken guard: reeling');
  assert.ok(!RAM_DAMAGE(events), 'still no harm through it');
});

test('their own Steel takes from the hurt only: the shove and the balance are the ram\'s', () => {
  const { room, a, b } = arena();
  a.steel = callSteel(9);
  b.steel = callSteel(9);
  tryDash(room, 'a', ahead, 10);
  const events = run(room, 10, 10.6);
  const hit = RAM_DAMAGE(events);
  assert.ok(hit.amount < STEEL_RAM.damage && hit.amount > 0, `turned some of it (${hit.amount})`);
  assert.ok(hit.steel > 0.99, 'met hardened plate');
  assert.ok(Math.hypot(hit.push.x, hit.push.z) > 3.9, 'the full shove');
  assert.ok(Math.abs(b.stagger.level - STEEL_RAM.stagger) < 3, 'the full balance');
  assert.ok(events.find((e) => e.type === 'steelRam').steel > 0.99, 'and the ram knows it met Steel');
});

test('it interrupts nothing but a dash, unless it breaks their balance', () => {
  // a sword chain under way and a spell gathering go on
  const swinging = arena();
  swinging.a.steel = callSteel(9);
  beginAttack(swinging.room, 'b', 9.95);
  tryDash(swinging.room, 'a', ahead, 10);
  run(swinging.room, 10, 10.15);
  assert.ok(swinging.room.players.get('b').attackActive, 'the sword chain goes on');
  const casting = arena();
  casting.a.steel = callSteel(9);
  casting.b.spell = 'fireball';
  casting.b.spellReadyAt = 0;
  tryCastSpell(casting.room, 'b', { x: 0, y: 0, z: 1 }, 10);
  tryDash(casting.room, 'a', ahead, 10.01);
  const cast = run(casting.room, 10.01, 10.5);
  assert.ok(cast.some((e) => e.type === 'steelRam'));
  assert.ok(cast.some((e) => e.type === 'projectileSpawned' && e.projectile?.ownerId === 'b'), 'the spell still leaves the hand');
  // a dash of theirs ends
  const dashing = arena({ gap: 4 });
  dashing.a.steel = callSteel(9);
  tryDash(dashing.room, 'b', { x: 0, z: 1 }, 10);
  tryDash(dashing.room, 'a', ahead, 10);
  run(dashing.room, 10, 10.1);
  assert.ok(dashing.b.dashUntil <= 10.1, 'their dash ended');
  // a knight nearly off balance is broken by it, and that stops everything, as a broken balance always does
  const teetering = arena();
  teetering.a.steel = callSteel(9);
  teetering.b.stagger.level = STAGGER.max - 10;
  teetering.b.stagger.shakenAt = 10;
  beginAttack(teetering.room, 'b', 9.95);
  tryDash(teetering.room, 'a', ahead, 10);
  const broken = run(teetering.room, 10, 10.3);
  assert.ok(broken.some((e) => e.type === 'staggerBreak' && e.playerId === 'b'));
  assert.equal(teetering.b.attackActive, false);
});

test('an unsteady knight is thrown further', () => {
  const thrown = (level) => {
    const { room, a, b } = arena();
    a.steel = callSteel(9);
    b.stagger.level = level;
    b.stagger.shakenAt = 10;
    const start = b.position.z;
    tryDash(room, 'a', ahead, 10);
    run(room, 10, 11);
    return start - b.position.z;
  };
  assert.ok(thrown(60) > thrown(0) * 1.1, `${thrown(60).toFixed(2)} m against ${thrown(0).toFixed(2)} m`);
});

test('a knight just risen, or dead, is not rammed', () => {
  const risen = arena();
  risen.a.steel = callSteel(9);
  risen.b.spawnProtectionUntil = 20;
  tryDash(risen.room, 'a', ahead, 10);
  assert.ok(!run(risen.room, 10, 10.6).some((e) => e.type === 'steelRam'));
  const dead = arena();
  dead.a.steel = callSteel(9);
  dead.b.alive = false;
  tryDash(dead.room, 'a', ahead, 10);
  assert.ok(!run(dead.room, 10, 10.6).some((e) => e.type === 'steelRam'));
});

test('a ram that fells a knight is the rammer\'s kill; the dash says whom it was begun at', () => {
  const { room, a, b } = arena({ gap: 4 });
  a.steel = callSteel(9);
  b.health = 8;
  tryDash(room, 'a', ahead, 10);
  const events = run(room, 10, 10.6);
  assert.equal(events.find((e) => e.type === 'dash').toward, 'b', 'a Steel charge at them');
  const death = events.find((e) => e.type === 'death');
  assert.equal(death.source, 'ram');
  assert.equal(death.killerId, 'a');
  // a Steel dash at nobody in particular says so
  const open = arena({ gap: 4 });
  open.a.steel = callSteel(9);
  tryDash(open.room, 'a', { x: 1, z: 0 }, 10);
  const sideways = run(open.room, 10, 10.1).find((e) => e.type === 'dash');
  assert.ok(sideways.ram === 1 && !sideways.toward);
});
