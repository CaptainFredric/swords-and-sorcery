import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import * as combat from '../../shared/sim/combat.mjs';
import { applyRoomCommand } from '../../shared/sim/wire.mjs';
import { MOVEMENT, SPRINT } from '../../shared/src/movement.mjs';

const world = { floors: [{ center: [0, -.1, 0], size: [200, .2, 200], y: 0 }], ramps: [], solids: [], abyssY: -9,
  spawnPoints: [{ x: 0, y: 0, z: 0, yaw: 0 }, { x: 30, y: 0, z: 0, yaw: Math.PI }] };
const aim = { x: 0, y: 0, z: -1 };
function setup({ active = true, held = false, stamina = 100 } = {}) {
  const room = new Room('CHGS'); room.world = world;
  const p = room.addPlayer({ id: 'p', token: 'p', name: 'Knight', ultimate: 'chivalry' }, 0);
  room.addPlayer({ id: 'q', token: 'q', name: 'Other' }, 0);
  room.startMatch(3); room.events.length = 0;
  p.guardStamina = stamina; p.lastGuardDrainAt = 10;
  if (active) {
    p.prowess = 100;
    combat.tryUltimate(room, p.id, 10);
    if (held) { p.input.guard = true; combat.setGuard(room, p.id, true, 10.2); }
    step(room, 10.65);
  }
  return { room, p };
}
function step(room, now, dt = .01) { combat.stepRoom(room, dt, now, world); }
function forward(p) { p.input = { ...p.input, forward: 1, right: 0, sprint: true }; }
function starts(room) { return room.events.filter(e => e.type === 'guardStarted'); }

for (const held of [false, true]) test(`commit raises Guard once with physical Guard held = ${held}`, () => {
  const { room, p } = setup({ held, stamina: 43 });
  assert.equal(p.guarding, true); assert.equal(p.guardStartedAt, 10.65);
  assert.equal(p.guardStamina, 43, 'activation must preserve the stamina bar');
  assert.equal(starts(room).length, 1);
  for (let i = 1; i < 30; i++) {
    applyRoomCommand(room, p, { type: 'input', guard: held }, 10.65 + i * .01);
    if (held) combat.setGuard(room, p.id, true, 10.65 + i * .01);
    step(room, 10.65 + i * .01);
  }
  assert.equal(p.guardStartedAt, 10.65, 'parry clock stays at the single commit transition');
  assert.equal(starts(room).length, 1);
});

for (const action of ['sword', 'spell:fireball', 'spell:frostfire', 'spell:gale', 'spell:steel', 'sprint', 'dash']) test(`${action} preserves activation Guard`, () => {
  const { room, p } = setup();
  if (action === 'sword') combat.beginAttack(room, p.id, 10.7);
  if (action.startsWith('spell:')) { p.spell = action.split(':')[1]; combat.tryCastSpell(room, p.id, aim, 10.7); }
  if (action === 'sprint') forward(p);
  if (action === 'dash') combat.tryDash(room, p.id, { x: 0, z: -1 }, 10.7);
  step(room, 10.71);
  assert.equal(p.guarding, true); assert.equal(p.guardStartedAt, 10.65); assert.equal(starts(room).length, 1);
});

test('deliberate release stays down until a fresh Guard press', () => {
  const { room, p } = setup();
  combat.setGuard(room, p.id, false, 10.7);
  forward(p); combat.beginAttack(room, p.id, 10.71); combat.tryCastSpell(room, p.id, aim, 10.72);
  for (let now = 10.73; now < 12; now += .01) step(room, now);
  assert.equal(p.guarding, false); assert.equal(starts(room).length, 1);
  combat.setGuard(room, p.id, true, 12);
  assert.equal(p.guarding, true); assert.equal(starts(room).length, 2); assert.equal(p.guardStartedAt, 12);
});

test('Stagger lowers auto Guard and held intent cannot reassert it after recovery', () => {
  const { room, p } = setup({ held: true });
  combat.staggerBy(room, p, 100, 10.8, 'q');
  assert.equal(p.guarding, false);
  for (let now = 10.81; now < 13; now += .01) step(room, now);
  assert.equal(p.guarding, false); assert.equal(starts(room).length, 1);
  combat.setGuard(room, p.id, true, 13);
  assert.equal(p.guarding, true); assert.equal(starts(room).length, 2);
});

for (const combination of ['sword', 'guard', 'spell', 'all']) test(`Chivalry Sprint coexists with ${combination}`, () => {
  const { room, p } = setup(); forward(p);
  if (combination === 'sword' || combination === 'all') combat.beginAttack(room, p.id, 10.7);
  if (combination === 'spell' || combination === 'all') combat.tryCastSpell(room, p.id, aim, 10.7);
  step(room, 10.71);
  assert.equal(p.sprinting, true); assert.equal(p.guarding, true);
  if (combination === 'sword' || combination === 'all') assert.equal(p.attackActive, true);
  if (combination === 'spell' || combination === 'all') assert.ok(p.pendingSpell);
  const since = p.guardStartedAt;
  combat.setGuard(room, p.id, true, 10.72); step(room, 10.73);
  assert.equal(p.sprinting, true); assert.equal(p.guardStartedAt, since);
});

test('starting sword and spell while already Sprinting keeps the gait and action clocks', () => {
  const { room, p } = setup(); forward(p);
  for (let now = 10.7; now <= 11; now += .01) step(room, now);
  assert.equal(p.sprinting, true); const blend = p.sprintBlend;
  combat.beginAttack(room, p.id, 11.01); combat.tryCastSpell(room, p.id, aim, 11.02);
  const attack = p.attackStartedAt, release = p.castEndsAt;
  step(room, 11.03);
  assert.equal(p.sprinting, true); assert.ok(p.sprintBlend >= blend);
  assert.equal(p.attackStartedAt, attack); assert.equal(p.castEndsAt, release);
});

test('Dash from Sprint plus Guard sword and spell retains Sprint request and resumes the same pace', () => {
  const { room, p } = setup(); forward(p);
  for (let now = 10.7; now <= 11.1; now += .01) step(room, now);
  combat.beginAttack(room, p.id, 11.11); combat.tryCastSpell(room, p.id, aim, 11.12);
  const blend = p.sprintBlend, stamina = p.guardStamina;
  assert.equal(combat.tryDash(room, p.id, { x: 0, z: -1 }, 11.13), true);
  step(room, 11.14);
  assert.equal(p.sprinting, true); assert.equal(p.guarding, true); assert.equal(p.attackActive, true); assert.ok(p.pendingSpell);
  assert.equal(p.sprintBlend, blend, 'Dash pauses rather than resets Sprint build up');
  assert.equal(Math.abs(p.velocity.z), MOVEMENT.dashDistance / MOVEMENT.dashDuration);
  step(room, p.dashUntil + .01);
  assert.equal(p.sprinting, true); assert.equal(p.input.sprint, true); assert.equal(p.guarding, true);
  assert.ok(Math.abs(p.velocity.z) > 10.8 && Math.abs(p.velocity.z) <= SPRINT.speed, 'resume the existing Sprint build up');
  assert.ok(p.guardStamina < stamina, 'Sprint still drains real Guard stamina');
});

for (const action of ['sword', 'guard', 'spell']) test(`ordinary ${action} still stops Sprint outside Chivalry`, () => {
  const { room, p } = setup({ active: false }); forward(p); step(room, 10);
  assert.equal(p.sprinting, true);
  if (action === 'sword') combat.beginAttack(room, p.id, 10.01);
  if (action === 'guard') combat.setGuard(room, p.id, true, 10.01);
  if (action === 'spell') combat.tryCastSpell(room, p.id, aim, 10.01);
  step(room, 10.02); assert.equal(p.sprinting, false);
});

test('Sprint speed and stamina cost equal ordinary Sprint with no combat bonus', () => {
  const ordinary = setup({ active: false }), chivalry = setup();
  for (const { p } of [ordinary, chivalry]) { forward(p); p.guardStamina = 100; p.lastGuardDrainAt = 10.65; }
  combat.beginAttack(chivalry.room, 'p', 10.7); combat.tryCastSpell(chivalry.room, 'p', aim, 10.7);
  for (let now = 10.71; now < 11.2; now += .01) {
    step(ordinary.room, now); step(chivalry.room, now);
    assert.equal(chivalry.p.guardStamina, ordinary.p.guardStamina);
    assert.equal(chivalry.p.velocity.z, ordinary.p.velocity.z);
  }
  assert.equal(Math.abs(chivalry.p.velocity.z), SPRINT.speed);
});

test('activation cannot refill an empty Guard bar or bypass ordinary Sprint eligibility', () => {
  const empty = setup({ stamina: 0 });
  assert.equal(empty.p.guardStamina, 0); assert.equal(empty.p.guarding, false); assert.equal(starts(empty.room).length, 0);
  for (const limitation of ['winded', 'crouched', 'backward', 'airborne']) {
    const { room, p } = setup(); forward(p);
    if (limitation === 'winded') p.guardStamina = SPRINT.restartStamina - 1;
    if (limitation === 'crouched') { p.crouched = true; p.input.crouch = true; }
    if (limitation === 'backward') p.input.forward = -1;
    if (limitation === 'airborne') p.grounded = false;
    step(room, 10.7); assert.equal(p.sprinting, false, limitation);
  }
});

test('a fresh Guard raise during Sprint keeps the sword and spell already underway', () => {
  const { room, p } = setup(); combat.setGuard(room, p.id, false, 10.7); forward(p); step(room, 10.71);
  combat.beginAttack(room, p.id, 10.72); combat.tryCastSpell(room, p.id, aim, 10.73);
  const attack = p.attackStartedAt, release = p.castEndsAt;
  combat.setGuard(room, p.id, true, 10.74); step(room, 10.75);
  assert.equal(p.sprinting, true); assert.equal(p.guarding, true); assert.equal(p.attackActive, true); assert.ok(p.pendingSpell);
  assert.equal(p.attackStartedAt, attack); assert.equal(p.castEndsAt, release);
});
