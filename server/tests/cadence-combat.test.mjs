// Cadence combat in the real room: a press on the beat cancels a cut's follow-through into the next (the chain's clock
// jumps), held and early presses keep the old chain to the tick, a Perfect Parry reels the attacker nearly twice as
// long, and timing never adds damage.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import * as combat from '../../shared/sim/combat.mjs';
import { CADENCE, chainCadence } from '../../shared/src/combatFrameData.mjs';
import { GAME, SWORD_CHAIN, SWORD_STRIKE_TIMES } from '../../shared/src/combat.mjs';

const world = { floors: [{ center: [0, -0.1, 0], size: [60, 0.2, 60], y: 0 }], ramps: [], solids: [], abyssY: -9,
  spawnPoints: [{ x: 0, y: 0, z: 0, yaw: 0 }, { x: 0, y: 0, z: -1.8, yaw: Math.PI }] };
const DT = 1 / 30;

function duel() {
  const room = new Room('CADENCE');
  room.world = world;
  const a = room.addPlayer({ id: 'a', name: 'A', token: 'a' }, 0);
  const b = room.addPlayer({ id: 'b', name: 'B', token: 'b' }, 0);
  room.startMatch(3);
  for (const p of [a, b]) { p.spawnProtectionUntil = 0; p.health = 100; }
  a.position = { x: 0, y: 0, z: 0 }; a.yaw = 0; a.input.yaw = 0;
  b.position = { x: 0, y: 0, z: -1.8 }; b.yaw = Math.PI; b.input.yaw = Math.PI;
  room.events.length = 0;
  return { room, a, b };
}
function run(room, from, to, each = () => {}) {
  const events = [];
  for (let t = from; t <= to + 1e-9; t += DT) { each(t); combat.stepRoom(room, DT, t, world); events.push(...room.events.splice(0)); }
  return events;
}
const contacts = (events, id) => events.filter((e) => ['damage', 'parry', 'block', 'guardBreak'].includes(e.type) && (e.attackerId === id));

test('the shared rule: on the beat the next cut begins at the press; in the window, sooner; outside it, as always', () => {
  const startedAt = 10;
  const contact = startedAt + SWORD_STRIKE_TIMES[0];
  const nominal = startedAt + SWORD_CHAIN.starts[1];
  const beat = chainCadence({ startedAt, landed: 1, pressAt: contact + CADENCE.beat });
  assert.equal(beat.grade, 'perfect');
  assert.ok(Math.abs(beat.at - (contact + CADENCE.beat)) < 1e-9);
  assert.ok(Math.abs(beat.shift - (nominal - beat.at)) < 1e-9 && beat.shift > 0.1);
  const good = chainCadence({ startedAt, landed: 1, pressAt: contact + 0.08 });
  assert.equal(good.grade, 'good');
  assert.ok(Math.abs(good.at - (contact + CADENCE.next.good)) < 1e-9);
  // during the swing (before its contact): early, the chain as it always was
  assert.equal(chainCadence({ startedAt, landed: 1, pressAt: contact - 0.1 }).grade, 'early');
  assert.equal(chainCadence({ startedAt, landed: 1, pressAt: contact - 0.1 }).shift, 0);
  // no next cut to bring before the first contact or after the third
  assert.equal(chainCadence({ startedAt, landed: 0, pressAt: contact }), null);
  assert.equal(chainCadence({ startedAt, landed: 3, pressAt: contact }), null);
});

test('held through, the chain lands on exactly the old times (nothing changes for a held button)', () => {
  const { room, a } = duel();
  combat.beginAttack(room, a.id, 10);
  const events = run(room, 10 + DT, 12.2);
  const swings = events.filter((e) => e.type === 'swordSwing' && e.playerId === a.id).map((e) => e.at);
  assert.equal(swings.length, 3);
  // (each strike goes live a tick-quantised moment before its contact, at the old times)
  for (let i = 0; i < 3; i += 1) assert.ok(Math.abs(swings[i] - (10 + SWORD_STRIKE_TIMES[i] - 0.09)) <= DT + 1e-9, `strike ${i} at ${swings[i]}`);
  assert.ok(!events.some((e) => e.type === 'cadence'));
});

test('a press on the beat brings the next cut sooner, by the cancelled follow-through, and says so', () => {
  const held = duel();
  combat.beginAttack(held.room, held.a.id, 10);
  const heldSwings = run(held.room, 10 + DT, 11.2).filter((e) => e.type === 'swordSwing' && e.playerId === 'a').map((e) => e.at);

  const { room, a } = duel();
  combat.beginAttack(room, a.id, 10);
  const contact = 10 + SWORD_STRIKE_TIMES[0];
  const pressAt = contact + CADENCE.beat;
  let pressed = false;
  const events = run(room, 10 + DT, 11.2, (t) => { if (!pressed && t >= pressAt) { pressed = true; combat.beginAttack(room, a.id, pressAt); } });
  const cadence = events.find((e) => e.type === 'cadence');
  assert.equal(cadence?.grade, 'perfect');
  assert.ok(cadence.shift > 0.1);
  const swings = events.filter((e) => e.type === 'swordSwing' && e.playerId === 'a').map((e) => e.at);
  assert.ok(swings[1] < heldSwings[1] - 0.09, `on the beat ${swings[1]} vs held ${heldSwings[1]}`);
});

test('timing never adds damage: an on-beat cut hits for what its aim earns', () => {
  const hits = (onBeat) => {
    const { room, a } = duel();
    combat.beginAttack(room, a.id, 10);
    const contact = 10 + SWORD_STRIKE_TIMES[0];
    let pressed = false;
    const events = run(room, 10 + DT, 11.6, (t) => {
      if (onBeat && !pressed && t >= contact + CADENCE.beat) { pressed = true; combat.beginAttack(room, a.id, contact + CADENCE.beat); }
    });
    return events.filter((e) => e.type === 'damage' && e.attackerId === 'a').map((e) => e.amount);
  };
  const plain = hits(false), beat = hits(true);
  assert.ok(plain.length >= 2 && beat.length >= 2);
  assert.ok(Math.max(...beat) <= GAME.swordDamage, `never above the top of the scale: ${beat}`);
  assert.deepEqual(beat.slice(0, 2), plain.slice(0, 2));
});

test('a guard raised in the last instant is a Perfect Parry: the attacker reels nearly twice as long', () => {
  const reel = (lead) => {
    const { room, a, b } = duel();
    combat.beginAttack(room, b.id, 10);
    const contact = 10 + SWORD_STRIKE_TIMES[0];
    let raised = false;
    const events = run(room, 10 + DT, 10.6, (t) => { if (!raised && t >= contact - lead - 1e-9) { raised = true; combat.setGuard(room, a.id, true, contact - lead); } });
    const parry = events.find((e) => e.type === 'parry' && e.defenderId === 'a');
    return { parry, reel: b.staggerUntil - (parry?.at ?? 0) };
  };
  const perfect = reel(0.04), ordinary = reel(0.15);
  assert.equal(perfect.parry?.perfect, true);
  assert.ok(!ordinary.parry?.perfect);
  assert.ok(Math.abs(perfect.reel - GAME.perfectParryStaggerMs / 1000) < 1e-6);
  assert.ok(Math.abs(ordinary.reel - GAME.parryStaggerMs / 1000) < 1e-6);
});
