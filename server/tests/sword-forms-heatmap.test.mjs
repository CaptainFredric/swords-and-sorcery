import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import { beginAttack, stepRoom } from '../../shared/sim/combat.mjs';
import { CHAIN_RUN_GRACE, SWORD_CHAIN, SWORD_STRIKE_TIMES, nextChainVariant, strikeKind } from '../../shared/src/combat.mjs';
import { LocalSwordChain } from '../../client/game/localSwordChain.mjs';
import { describeContact } from '../../client/game/swordContactReadout.mjs';
import { strikeAt } from '../../scripts/sword-heatmap-measure.mjs';

const CYCLE = SWORD_STRIKE_TIMES[2] + SWORD_CHAIN.restart;
const world = {
  floors: [{ id: 'floor', center: [0, -0.1, 0], size: [60, 0.2, 60], y: 0 }], ramps: [], solids: [],
  spawnPoints: [{ x: 0, y: 0, z: 0, yaw: 0 }, { x: 0, y: 0, z: -2, yaw: Math.PI }], abyssY: -9,
};

test('the chain forms: the rising chain opens with the backhand and comes back down with the forehand; both end on the chop', () => {
  assert.deepEqual([0, 1, 2].map((s) => strikeKind(0, s)), [0, 1, 2]);
  assert.deepEqual([0, 1, 2].map((s) => strikeKind(1, s)), [1, 0, 2]);
  // straight on from a chain that ran its course: the other form; anything else: the falling one
  assert.equal(nextChainVariant(null, 5), 0);
  assert.equal(nextChainVariant({ variant: 0, restartAt: 5 }, 5), 1);
  assert.equal(nextChainVariant({ variant: 1, restartAt: 5 }, 5 + CHAIN_RUN_GRACE), 0);
  assert.equal(nextChainVariant({ variant: 0, restartAt: 5 }, 5 + CHAIN_RUN_GRACE + 0.01), 0);
});

test('held, the server and the arms alternate the forms in step: what is drawn is what is swung', () => {
  const room = new Room('FORMS');
  room.world = world;
  room.addPlayer({ id: 'a', token: 'ta', name: 'A' }, 0);
  room.addPlayer({ id: 'b', token: 'tb', name: 'B' }, 0);
  room.setReady('a', true, 0); room.setReady('b', true, 0);
  room.tick(3.1);
  const a = room.players.get('a');
  Object.assign(room.players.get('b').position, { x: 18, y: 0, z: 18 });
  const arms = new LocalSwordChain();
  const t0 = 10;
  beginAttack(room, 'a', t0);
  arms.press(t0);
  const server = [], local = [];
  for (let now = t0 + 1 / 60; now < t0 + 6 * CYCLE - 0.05; now += 1 / 60) {
    stepRoom(room, 1 / 60, now, world);
    const chain = arms.step(now);
    if (a.attackActive && server.at(-1)?.at !== a.attackStartedAt) server.push({ at: a.attackStartedAt, variant: a.attackVariant });
    if (chain && local.at(-1)?.at !== chain.startedAt) local.push({ at: chain.startedAt, variant: chain.variant });
  }
  assert.deepEqual(server.map((c) => c.variant), [0, 1, 0, 1, 0, 1]);
  assert.deepEqual(local.map((c) => c.variant), server.map((c) => c.variant));
  server.forEach((c, i) => assert.ok(Math.abs(c.at - local[i].at) < 1 / 60 + 1e-9, 'the same chains, at the same moments'));
  // tapping afresh after a pause: the falling chain again
  const fresh = new LocalSwordChain();
  fresh.press(0); fresh.release(); fresh.step(5);
  fresh.press(5);
  assert.equal(fresh.step(5.01).variant, 0);
});

test('a blow is judged the same whatever the server tick: the blade meets the knight where it does, not where a step fell', () => {
  for (const [distance, angleDeg, form, strike] of [[1.8, 0, 0, 0], [1.5, 12, 0, 0], [2.2, -20, 1, 0], [1.0, 6, 0, 1], [1.8, -6, 0, 2]]) {
    const judged = [1 / 20, 1 / 30, 1 / 60, 1 / 120].map((dt) => strikeAt({ distance, angleDeg, form, strike, dt }));
    assert.ok(judged.every((r) => r.outcome === 'swordHit'));
    const q = judged.map((r) => r.quality);
    assert.ok(Math.max(...q) - Math.min(...q) < 0.004, `${distance} m ${angleDeg}°: quality ${q.map((v) => v.toFixed(3))}`);
    assert.equal(new Set(judged.map((r) => r.damage)).size, 1);
  }
});

test('the top of the 19-30 scale is reachable by every cut, and only by leading it: a centred blow is ordinary', () => {
  // (measured with scripts/sword-heatmap-measure.mjs: the best placements found for each cut)
  assert.equal(strikeAt({ distance: 1.85, angleDeg: 14, pitchDeg: 10, form: 0, strike: 0 }).damage, 30);
  assert.equal(strikeAt({ distance: 1.75, angleDeg: -16, pitchDeg: -20, form: 1, strike: 0 }).damage, 30);
  assert.equal(strikeAt({ distance: 1.8, angleDeg: -6, pitchDeg: 15, form: 0, strike: 2 }).damage, 30);
  const centred = strikeAt({ distance: 1.8, angleDeg: 0, form: 0, strike: 0 });
  assert.ok(centred.damage >= 22 && centred.damage <= 25, `a centred forehand: ${centred.damage}`);
  // the cramped hilt and the tip's graze are glancing
  assert.ok(strikeAt({ distance: 0.8, angleDeg: 0, form: 0, strike: 0 }).damage <= 21);
  assert.ok(strikeAt({ distance: 2.6, angleDeg: 0, form: 0, strike: 0 }).damage <= 21);
});

test('a guarded or parried blow carries the point where the blade met the body', () => {
  const guarded = strikeAt({ distance: 1.8, angleDeg: 0, guard: true, guardAge: 1 });
  const parried = strikeAt({ distance: 1.8, angleDeg: 0, guard: true, guardAge: 0.05 });
  assert.equal(guarded.outcome, 'block');
  assert.equal(parried.outcome, 'parry');
  for (const r of [guarded, parried]) {
    // on the blade's cutting stretch, at the body's surface (its axis is 1.8 m out along the aim, 0.45 m thick)
    assert.ok(r.heat.reach > 0.45 && r.heat.reach < 0.88);
    assert.ok(Math.abs(Math.hypot(r.point.x, r.point.z + 1.8) - 0.53) < 0.05, `on the body: ${JSON.stringify(r.point)}`);
  }
});

test('the F3 debugger reads a contact out as the server judged it', () => {
  const line = describeContact({ strike: 0, kind: 1, variant: 1, outcome: 'hit', damage: 27, quality: 0.74, heat: { reach: 0.7, dt: -0.004, qAngle: 0.8 } });
  assert.match(line, /rising 1:backhand hit +27/);
  assert.match(line, /cutting/);
  assert.match(line, /peak/);
  assert.match(describeContact({ outcome: 'parry', heat: { reach: 0.3, dt: -0.06, qAngle: 0.2 } }), /parry.*hilt.*early/);
});
