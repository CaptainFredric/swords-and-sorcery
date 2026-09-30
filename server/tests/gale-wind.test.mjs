import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import { stepRoom, tryCastSpell } from '../../shared/sim/combat.mjs';
import { SPELLS } from '../../shared/src/spells.mjs';

// Gale Garner's wind: a gust that keeps carrying whoever stands in it for as long as it blows, and bends the spells
// flying through it (never taking them over).

const openWorld = {
  floors: [{ id: 'floor', center: [0, -0.1, 0], size: [80, 0.2, 80], y: 0 }],
  ramps: [],
  solids: [],
  spawnPoints: [{ x: 0, y: 0, z: 0, yaw: -Math.PI / 2 }, { x: 2, y: 0, z: 0, yaw: Math.PI / 2 }, { x: 0, y: 0, z: 9, yaw: 0 }],
  abyssY: -9,
};
const cone = SPELLS.gale.cone;

// a (the caster) at the origin facing +x; b and c somewhere; nobody protected
function yard() {
  const room = new Room('GALEW', { mode: 'FFA' });
  for (const id of ['a', 'b', 'c']) room.addPlayer({ id, token: `t${id}`, name: id.toUpperCase() }, 0);
  for (const id of ['a', 'b', 'c']) room.setReady(id, true, 0);
  room.tick(3.1);
  const [a, b, c] = ['a', 'b', 'c'].map((id) => room.players.get(id));
  Object.assign(a.position, { x: 0, y: 0, z: 0 });
  a.yaw = -Math.PI / 2; a.input.yaw = a.yaw; a.pitch = 0; a.input.pitch = 0;
  Object.assign(b.position, { x: 30, y: 0, z: 30 });
  Object.assign(c.position, { x: -30, y: 0, z: 30 });
  for (const p of [a, b, c]) { p.spawnProtectionUntil = 0; p.history = []; }
  a.spell = 'gale';
  room.events.length = 0;
  return { room, a, b, c };
}

// a's gale, pressed at 10 (let go at 10 + its breath); stepped on to `until`, `each` called every step
function gale(room, until, each = () => {}) {
  assert.equal(tryCastSpell(room, 'a', { x: 1, y: 0, z: 0 }, 10), true);
  const released = 10 + SPELLS.gale.gatherSec;
  for (let now = 10.02; now <= until + 1e-9; now += 0.02) {
    each(now, released);
    stepRoom(room, 0.02, now, openWorld);
  }
  return released;
}

test('the gust is a windbox: a knight in it is carried on for as long as it blows, not shoved once and let be', () => {
  const { room, b } = yard();
  Object.assign(b.position, { x: 3, y: 0, z: 0 });
  const times = [0.35, 0.65, 0.95, 1.4];
  const marks = [];
  const released = gale(room, 12.2, (now, at) => {
    b.input = { forward: 0, right: 0, jump: false, yaw: b.yaw, pitch: 0 };
    if (marks.length < times.length && now >= at + times[marks.length]) marks.push(b.position.x);
  });
  assert.equal(marks.length, 4);
  // still moving away through the gust's second half (the wind, not the first shove, which the ground has long eaten)
  assert.ok(marks[1] - marks[0] > 0.6, `carried on: ${(marks[1] - marks[0]).toFixed(2)} m between 0.35 and 0.65 s`);
  assert.ok(marks[2] - marks[1] > 0.4, `and on: ${(marks[2] - marks[1]).toFixed(2)} m between 0.65 and 0.95 s`);
  assert.ok(b.position.x - 3 > 6, `thrown well away in all: ${(b.position.x - 3).toFixed(2)} m`);
  assert.ok(released + cone.lastsSec < 12.2);
});

test('the wind holds back a knight charging into it, and gives way the moment the gust is spent', () => {
  const { room, b } = yard();
  Object.assign(b.position, { x: 4, y: 0, z: 0 });
  b.yaw = Math.PI / 2; b.input.yaw = b.yaw;   // facing a (-x)
  let during = null;
  const released = gale(room, 12.0, (now, at) => {
    b.input = { forward: 1, right: 0, jump: false, yaw: b.yaw, pitch: 0 };
    if (during === null && now >= at + cone.lastsSec - cone.fadeSec) during = b.position.x;
  });
  assert.ok(during > 4, `still held off, charging all the while: at ${during.toFixed(2)} m`);
  assert.ok(released + cone.lastsSec < 12.0 && b.position.x < during, 'and once it is spent, the charge goes on');
});

// a spell of c's, flying through a's gust; its velocity once the gust is done with it
function throughTheGust(spell, from, velocity, { run = 11.6 } = {}) {
  const { room } = yard();
  room.projectiles.set('p1', { id: 'p1', ownerId: 'c', spell, position: { ...from }, velocity: { ...velocity }, bornAt: 10.4 });
  const released = 10 + SPELLS.gale.gatherSec;
  let flown = false;
  gale(room, run, (now) => {
    // (it takes wing as the gust leaves the hand)
    if (!flown && now >= released) flown = true;
    if (!flown) room.projectiles.get('p1') && Object.assign(room.projectiles.get('p1').position, from);
  });
  return { room, projectile: room.projectiles.get('p1') ?? null };
}

test('a Fireball met head on by the gust\'s heart is stopped or sent back; its pressure alone only spoils its aim', () => {
  const speed = SPELLS.fireball.speed;
  const headOn = throughTheGust('fireball', { x: 7, y: 1.5, z: 0 }, { x: -speed, y: 0, z: 0 }, { run: 10.9 });
  const back = headOn.projectile;
  assert.ok(back, 'still flying (it met nothing)');
  assert.ok(back.velocity.x > -speed * 0.35, `head on, the heart took most of its way from it: ${back.velocity.x.toFixed(1)} m/s`);
  // out wide, only the pressure: its line bent, not undone
  const wide = throughTheGust('fireball', { x: 9, y: 1.5, z: -7.2 }, { x: -speed, y: 0, z: 0 }, { run: 10.9 }).projectile;
  assert.ok(wide && wide.velocity.x < -speed * 0.55, `the pressure only spoils it: ${wide?.velocity.x.toFixed(1)} m/s`);
});

test('a spell crossing the gust is bent aside, not sent back', () => {
  const speed = SPELLS.fireball.speed;
  const across = throughTheGust('fireball', { x: 3, y: 1.5, z: -5 }, { x: 0, y: 0, z: speed }, { run: 10.9 }).projectile;
  assert.ok(across, 'still flying');
  assert.ok(across.velocity.z > speed * 0.75, `still going its own way: ${across.velocity.z.toFixed(1)} m/s`);
  assert.ok(across.velocity.x > 4, `bent along the gust: ${across.velocity.x.toFixed(1)} m/s`);
});

test('the gust bends a spell by the strongest it met it with, and no more: one lingering in it is not blown into orbit', () => {
  // a spell barely moving, in the heart close to the hand, for the whole of the gust
  const { projectile } = throughTheGust('fireball', { x: 1.2, y: 1.5, z: 0 }, { x: 0.5, y: 0, z: 0 }, { run: 11.6 });
  const most = (cone.deflect.heart + cone.deflect.pressure) / SPELLS.fireball.windResist;
  const speed = projectile ? Math.hypot(projectile.velocity.x, projectile.velocity.y, projectile.velocity.z) : 0;
  assert.ok(!projectile || speed <= most + 0.5 + 1e-6, `bounded: ${speed.toFixed(1)} m/s (at most ${most})`);
  // and a heavier bolt is bent less than a fireball at the same place
  const at = { x: 5, y: 1.5, z: 0 };
  const fire = throughTheGust('fireball', at, { x: 0, y: 0, z: 0.01 }, { run: 10.56 }).projectile;
  const frost = throughTheGust('frostfire', at, { x: 0, y: 0, z: 0.01 }, { run: 10.56 }).projectile;
  assert.ok(SPELLS.frostfire.windResist > SPELLS.fireball.windResist);
  assert.ok(frost.velocity.x > 0 && frost.velocity.x < fire.velocity.x, `${frost.velocity.x.toFixed(1)} < ${fire.velocity.x.toFixed(1)}`);
});

test('a spell blown back is still its caster\'s: whose it is does not change, only where it goes', () => {
  const { room, b } = yard();
  // c's fireball flies at a; the gust sends it back into b, standing behind where it came from
  Object.assign(b.position, { x: 9, y: 0, z: 0 });
  room.projectiles.set('p1', { id: 'p1', ownerId: 'c', spell: 'fireball', position: { x: 5, y: 1.2, z: 0 }, velocity: { x: -SPELLS.fireball.speed, y: 0, z: 0 }, bornAt: 10.4 });
  const released = 10 + SPELLS.gale.gatherSec;
  gale(room, 12, (now) => {
    const p = room.projectiles.get('p1');
    if (p && now < released) Object.assign(p.position, { x: 5, y: 1.2, z: 0 });
  });
  const blast = room.events.find((e) => e.type === 'damage' && e.source === 'fireball');
  assert.ok(blast, 'it burst somewhere');
  assert.equal(blast.attackerId, 'c', 'still c\'s fireball');
  assert.notEqual(blast.victimId, 'c');
});
