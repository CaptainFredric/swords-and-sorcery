import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import { beginAttack, stepRoom, tryCastSpell } from '../../shared/sim/combat.mjs';
import { applyRoomCommand, serializeSnapshot } from '../../shared/sim/wire.mjs';
import { CROUCH, POSTURES, roomToStand } from '../../shared/src/body.mjs';
import { MOVEMENT, createMovementState, movePlayer, resolveSprint } from '../../shared/src/movement.mjs';
import { resolvePlayerWorld } from '../../shared/src/collision.mjs';

// Crouching is a real posture: the body the world and every blow meet is shorter, it cannot stand up under
// something, and it is no dodge: whatever is aimed at it still lands.

const TICK = 1 / 30;
// open ground with a beam across the way at z = -4: its underside 1.4 m up (under a standing knight's crown, over a
// crouched one's)
const beamWorld = {
  floors: [{ id: 'floor', center: [0, -0.1, 0], size: [60, 0.2, 60], y: 0 }],
  ramps: [],
  solids: [{ id: 'beam', center: [0, 1.7, -4], size: [8, 0.6, 1] }],
  spawnPoints: [{ x: 0, y: 0, z: 0, yaw: 0 }, { x: 20, y: 0, z: 0, yaw: 0 }],
  abyssY: -9,
};
const openWorld = { ...beamWorld, solids: [] };

// walk straight ahead (-z) for `seconds`, crouching or not; returns the movement state
function walk(state, { crouch = false, seconds = 2, world = beamWorld, forward = 1 } = {}) {
  let s = state;
  for (let t = 0; t < seconds; t += TICK) s = movePlayer(s, { forward, right: 0, jump: false, sprint: false, crouch, yaw: 0, pitch: 0 }, TICK, t, world);
  return s;
}

test('the crouched body really is shorter: a beam a standing knight walks into, a crouched one passes under', () => {
  const standing = walk(createMovementState({ x: 0, y: 0, z: 0 }));
  assert.ok(standing.position.z > -3.5 + 1e-6 - 0.1, `stopped at the beam (z ${standing.position.z.toFixed(2)})`);
  const crouched = walk(createMovementState({ x: 0, y: 0, z: 0 }), { crouch: true, seconds: 3 });
  assert.ok(crouched.crouched);
  assert.ok(crouched.position.z < -5, `through under it (z ${crouched.position.z.toFixed(2)})`);
  // the same box, the same place: one body meets it, the other does not
  const at = { x: 0, y: 0, z: -3.9 };
  assert.notDeepEqual(resolvePlayerWorld(at, MOVEMENT.playerRadius, beamWorld.solids, POSTURES.standing.height), at);
  assert.deepEqual(resolvePlayerWorld(at, MOVEMENT.playerRadius, beamWorld.solids, POSTURES.crouched.height), at);
});

test('it cannot stand up under the beam: let go there and it stays down, and it rises the moment it is clear', () => {
  let s = walk(createMovementState({ x: 0, y: 0, z: 0 }), { crouch: true, seconds: 1.05 });
  assert.ok(s.position.z < -3.3 && s.position.z > -4.4, `under the beam (z ${s.position.z.toFixed(2)})`);
  assert.equal(roomToStand(s.position, MOVEMENT.playerRadius, beamWorld), false);
  s = walk(s, { crouch: false, seconds: 0.2, forward: 0 });
  assert.equal(s.crouched, true, 'no standing into the beam');
  // on out the far side, still asking to stand: up at once
  s = walk(s, { crouch: false, seconds: 1.5 });
  assert.ok(s.position.z < -4.6);
  assert.equal(s.crouched, false);
});

test('crouching ends a sprint and none begins crouched; it keeps half the run, and it cannot jump', () => {
  assert.equal(resolveSprint({ wantsSprint: true, forward: 1, grounded: true, stamina: 100, sprinting: true, crouched: true }), false);
  assert.equal(resolveSprint({ wantsSprint: true, forward: 1, grounded: true, stamina: 100, sprinting: false, crouched: true }), false);
  const running = createMovementState({ x: 0, y: 0, z: 0 });
  running.sprinting = true;
  const down = movePlayer(running, { forward: 1, right: 0, crouch: true, yaw: 0 }, TICK, 0, openWorld);
  assert.equal(down.sprinting, false, 'crouching ends it');
  const walkSpeed = (crouch) => {
    const s = walk(createMovementState({ x: 0, y: 0, z: 0 }), { crouch, seconds: 1, world: openWorld });
    return Math.hypot(s.velocity.x, s.velocity.z);
  };
  assert.ok(Math.abs(walkSpeed(true) - walkSpeed(false) * CROUCH.speed) < 1e-6);
  const crouched = walk(createMovementState({ x: 0, y: 0, z: 0 }), { crouch: true, seconds: 0.2, world: openWorld, forward: 0 });
  const jumped = movePlayer(crouched, { forward: 0, right: 0, jump: true, crouch: true, yaw: 0 }, TICK, 1, openWorld);
  assert.equal(jumped.grounded, true);
  assert.equal(jumped.velocity.y, 0);
});

// A (attacker) faces B (at `gap` ahead, -z); B crouched or not
function duel({ gap = 1.6, crouched = false } = {}) {
  const room = new Room('CROUCH');
  room.world = openWorld;
  room.addPlayer({ id: 'a', token: 'ta', name: 'A' }, 0);
  room.addPlayer({ id: 'b', token: 'tb', name: 'B' }, 0);
  room.setReady('a', true, 0);
  room.setReady('b', true, 0);
  room.tick(3.1);
  const a = room.players.get('a');
  const b = room.players.get('b');
  Object.assign(a.position, { x: 0, y: 0, z: 0 });
  Object.assign(b.position, { x: 0, y: 0, z: -gap });
  a.yaw = 0; a.input.yaw = 0;
  b.yaw = Math.PI; b.input.yaw = Math.PI;
  b.crouched = crouched;
  b.input.crouch = crouched;
  a.spawnProtectionUntil = 0;
  b.spawnProtectionUntil = 0;
  room.events.length = 0;
  return { room, a, b };
}

function run(room, from, to) {
  const events = [];
  for (let now = from; now <= to + 1e-9; now += TICK) events.push(...stepRoom(room, TICK, now, openWorld).splice(0));
  return events;
}

test('the posture is the server\'s: the input asks, the snapshot tells, and a body stays down while asked', () => {
  const { room, b } = duel();
  applyRoomCommand(room, b, { type: 'input', seq: 1, forward: 0, right: 0, crouch: true, yaw: Math.PI, pitch: 0 }, 10);
  run(room, 10, 10.1);
  assert.equal(b.crouched, true);
  assert.equal(serializeSnapshot(room, 10.1).players.find((p) => p.id === 'b').crouched, true);
  applyRoomCommand(room, b, { type: 'input', seq: 2, forward: 0, right: 0, crouch: false, yaw: Math.PI, pitch: 0 }, 10.2);
  run(room, 10.2, 10.3);
  assert.equal(b.crouched, false);
});

test('a sword aimed at a crouched knight lands as on anyone: no crouch is a dodge', () => {
  // aimed level, and aimed down at them
  for (const pitch of [0, -0.3]) {
    const { room, a, b } = duel({ crouched: true });
    a.pitch = pitch; a.input.pitch = pitch;
    beginAttack(room, 'a', 10);
    run(room, 10, 10.5);
    assert.equal(b.health, 72, `hit through a level or lowered swing (pitch ${pitch})`);
  }
});

test('a swing aimed high passes over a crouched knight, and meets a standing one', () => {
  // (aimed 40 degrees up: the blade's band starts a little below the aim, over a crouched crown, not a standing one)
  const high = 0.7;
  const low = duel({ crouched: true });
  low.a.pitch = high; low.a.input.pitch = high;
  beginAttack(low.room, 'a', 10);
  run(low.room, 10, 10.5);
  assert.equal(low.b.health, 100, 'over their head');
  const tall = duel({ crouched: false });
  tall.a.pitch = high; tall.a.input.pitch = high;
  beginAttack(tall.room, 'a', 10);
  run(tall.room, 10, 10.5);
  assert.ok(tall.b.health < 100, 'but not over a standing knight\'s');
});

test('a spell thrown level at chest height flies over a crouched knight, and strikes a standing one', () => {
  for (const crouched of [true, false]) {
    const { room, b } = duel({ gap: 5, crouched });
    tryCastSpell(room, 'a', { x: 0, y: 0, z: -1 }, 10);
    const events = run(room, 10, 11.6);
    const direct = events.find((e) => e.type === 'projectileImpact' && e.directId === 'b') ?? events.find((e) => e.type === 'damage' && e.victimId === 'b' && e.amount >= 20);
    if (crouched) assert.ok(!direct, 'over them');
    else assert.ok(direct || b.health < 100, 'into them');
  }
});
