// The Practice Yard's held Whirl goes on while it is held; a match's keeps its five revolutions and 25 Prowess each.
// Through the real Room, commands and stepRoom.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import { applyRoomCommand } from '../../shared/sim/wire.mjs';
import { stepRoom } from '../../shared/sim/combat.mjs';
import { SWORD_TECHNIQUE_CONTRACTS as TECH } from '../../shared/src/swordTechniqueContracts.mjs';
import { galeLiftPrediction } from '../../client/game/predictMovement.mjs';

const FLAT = { floors: [{ id: 'floor', center: [0, -0.1, 0], size: [120, 0.2, 120], y: 0 }], ramps: [], solids: [], spawnPoints: [{ x: 0, y: 0, z: 0, yaw: 0 }], abyssY: -9 };
const DT = 1 / 30;

function yard(mode = 'PRACTICE', { world = FLAT, prowess = 100, spell = 'fireball', target = null } = {}) {
  const room = new Room('PW1', { mode, worldId: 'castleward' });
  const a = room.addPlayer({ id: 'a', token: 'a', name: 'A', technique: 'whirl_wind' }, 0);
  const b = mode === 'PRACTICE' && !target ? null : room.addPlayer({ id: 'b', token: 'b', name: 'B' }, 0);
  room.startMatch(10);
  let t = 10;
  while (room.state !== 'PLAYING' && t < 30) { t += DT; stepRoom(room, DT, t, room.world); }
  room.world = world;
  Object.assign(a, { position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, grounded: true, spell, prowess, yaw: 0, spawnProtectionUntil: 0 });
  a.input = { ...a.input, yaw: 0, forward: 0, right: 0, jump: false };
  if (b) {
    Object.assign(b, { position: target ?? { x: 0, y: 0, z: -60 }, velocity: { x: 0, y: 0, z: 0 }, grounded: true, spawnProtectionUntil: 0, health: 1e6, maxHealth: 1e6 });
    b.input = { ...b.input, forward: 0, right: 0, jump: false };
  }
  const run = (seconds, each = () => {}) => { for (let i = 0; i < Math.round(seconds / DT); i += 1) { t += DT; each(t); stepRoom(room, DT, t, room.world); } };
  const press = (down) => applyRoomCommand(room, a, { type: 'technique', down }, t);
  return { room, a, b, run, press, now: () => t };
}

test('Practice: a held Whirl goes on and on without Prowess, and ends a recovery after it is let go', () => {
  const y = yard('PRACTICE');
  y.press(true);
  let most = 0;
  y.run(12, () => { most = Math.max(most, y.a.swordTechnique?.revolutions ?? 0); });
  assert.ok(most >= 19, `${most} revolutions in 12 s`);
  assert.ok(y.a.swordTechnique && y.a.swordTechnique.phase !== 'recovery', 'still spinning while held');
  assert.equal(y.a.prowess, 100, 'no Prowess asked or taken in the yard');
  const released = y.now();
  y.press(false);
  y.run(TECH.whirl_wind.revolutionSeconds + TECH.whirl_wind.recovery + 0.1);
  assert.equal(y.a.swordTechnique, null, 'let go: the revolution under way finishes, then the recovery');
  assert.ok(y.a.swordTechniqueReadyAt >= released + TECH.whirl_wind.cooldown - 1e-6, 'the cooldown runs from the end, as ever');
});

test('Practice: death or a stagger ends the endless Whirl at once', () => {
  const y = yard('PRACTICE');
  y.press(true);
  y.run(4);
  assert.ok(y.a.swordTechnique);
  y.a.alive = false;
  y.run(DT * 2);
  assert.equal(y.a.swordTechnique, null, 'dead');
  const s = yard('PRACTICE');
  s.press(true);
  s.run(4);
  s.a.staggerUntil = s.now() + 0.5;
  s.run(DT * 2);
  assert.equal(s.a.swordTechnique, null, 'staggered');
});

test('Practice: the endless Whirl still meets the scene and stops there', () => {
  const wall = { id: 'stone', center: [0, 1, -1.2], size: [4, 2, 0.2] };
  const y = yard('PRACTICE', { world: { ...FLAT, solids: [wall] } });
  y.press(true);
  y.run(3);
  assert.equal(y.a.swordTechnique, null, 'the wall finishes the commitment');
});

test('Practice: one hit per victim per revolution, however long it is held', () => {
  const y = yard('PRACTICE', { target: { x: 0, y: 0, z: -1.7 } });
  const hits = [];
  y.press(true);
  y.run(9, (t) => { for (const e of y.room.events.splice(0)) if (e.type === 'swordTechniqueHit' && (e.targetId ?? e.target ?? e.victimId) === 'b') hits.push(t); });
  const revolutions = y.a.swordTechnique?.revolutions ?? 0;
  assert.ok(revolutions >= 14, `${revolutions} revolutions`);
  assert.ok(Math.abs(hits.length - revolutions) <= 1, `${hits.length} hits over ${revolutions} revolutions`);
  for (let i = 1; i < hits.length; i += 1) assert.ok(hits[i] - hits[i - 1] > 0.5, `struck twice ${(hits[i] - hits[i - 1]).toFixed(3)} s apart`);
});

test('a match keeps the limit and the cost: five revolutions, 25 Prowess each, exactly as before', () => {
  for (const [prowess, revolutions] of [[0, 1], [25, 2], [50, 3], [75, 4], [100, 5]]) {
    const y = yard('FFA', { prowess });
    y.press(true);
    let most = 0;
    y.run(6, () => { most = Math.max(most, y.a.swordTechnique?.revolutions ?? 0); });
    assert.equal(most, revolutions, `${prowess} Prowess`);
    assert.equal(y.a.prowess, 0, `${prowess} Prowess all spent`);
    assert.equal(y.a.swordTechnique, null);
  }
});

test('the owner predicts the climb on past the fifth revolution in Practice only, and only while held', () => {
  const auth = (revolutions, prowess = 0) => ({ spell: 'gale', prowess, swordTechnique: { id: 'whirl_wind', phase: 'active', startedAt: 20, revolutions } });
  const end = 20 + TECH.whirl_wind.activeUntil;
  assert.equal(galeLiftPrediction({ auth: auth(7), held: true, practice: true, serverNow: 20.1 }).until, Infinity);
  assert.equal(galeLiftPrediction({ auth: auth(7), held: false, practice: true, serverNow: 20.1 }).until, end);
  assert.equal(galeLiftPrediction({ auth: auth(5, 100), held: true, practice: false, serverNow: 20.1 }).until, end, 'a match: the fifth is the last');
  assert.equal(galeLiftPrediction({ auth: auth(2, 25), held: true, practice: false, serverNow: 20.1 }).until, Infinity);
  assert.equal(galeLiftPrediction({ auth: auth(2, 0), held: true, practice: false, serverNow: 20.1 }).until, end, 'a match: no Prowess, no more');
});
