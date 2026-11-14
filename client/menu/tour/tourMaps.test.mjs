import test from 'node:test';
import assert from 'node:assert/strict';
import { surfaceHeightAt } from '../../../shared/src/collision.mjs';
import { FIGHT_POOL } from './tourFights.mjs';
import { fightPair, placeFight } from './tourCamera.mjs';
import { STOP_SPACING, TOUR_MAPS, TOUR_MAP_IDS, mapPlan, mapVariants, nextLeg, routeIssues, stopsFit } from './tourMaps.mjs';
import { roundRandom } from './tourSchedule.mjs';

// The round's maps: every route, every way round it and from every start it may take, on standable ground all the way;
// every stop with room for the round's fights; and the carousel moving on, never to the same map twice running.

const PLANS = TOUR_MAP_IDS.flatMap((id) => mapVariants(id).map((variant) => mapPlan(id, variant)));
const SET_PIECES = ['slush', 'skyBait', 'skyBaitPayoff', 'galeLiftoff'];
const CLASSICS = ['fireball', 'whirlwind', 'whiteFlag'];

test('every map the round visits is a world of the game, with routes and three stops on each', () => {
  assert.ok(TOUR_MAP_IDS.length >= 3, 'Castleward and at least two more');
  assert.equal(TOUR_MAP_IDS[0], 'castleward');
  for (const id of TOUR_MAP_IDS) {
    const map = TOUR_MAPS[id];
    assert.equal(map.world.id, id, `${id}: the game's own world`);
    assert.ok(map.routes.length >= 1);
    for (const route of map.routes) assert.equal((route.anchors ?? route.stops).length, 3, `${id}/${route.id}: three stops`);
    assert.ok(mapVariants(id).length >= 6, `${id}: several ways round (starts, directions)`);
  }
  // (and Castleward's first way round is the round as it has always been)
  assert.deepEqual(mapPlan('castleward').stops, [20.5, 34.5, 70.5]);
});

test('every metre of every route, every way round, is on standable level ground and clear of anything solid', () => {
  for (const plan of PLANS) {
    const issues = routeIssues(plan);
    assert.deepEqual(issues.slice(0, 3), [], `${plan.key}: ${issues.length} problems`);
  }
});

test('the world\'s own movement rules agree: a knight stepped along each route never leaves the floor or meets a wall', () => {
  // (surfaceHeightAt is what bodies stand on in the game; a step up of more than 0.65 m is a wall)
  for (const plan of PLANS) {
    let y = 0;
    for (let d = 0; d < plan.path.length; d += 0.1) {
      const { x, z } = plan.path.at(d);
      const floor = surfaceHeightAt(x, z, y + 0.65, plan.world);
      assert.ok(floor !== null, `${plan.key}: a drop at ${d.toFixed(1)} m (${x.toFixed(1)}, ${z.toFixed(1)})`);
      assert.ok(Math.abs(floor - y) < 0.05, `${plan.key}: a step of ${(floor - y).toFixed(2)} m at ${d.toFixed(1)} m`);
      y = floor;
    }
  }
});

test('every way round has its stops where the round can run: room to set off, to finish each fight, and to go on', () => {
  for (const plan of PLANS) {
    assert.ok(stopsFit(plan.stops, plan.path.length), `${plan.key}: ${plan.stops.map((d) => d.toFixed(1))}`);
    assert.ok(plan.stops[0] >= STOP_SPACING.first && plan.path.length - plan.stops[2] >= STOP_SPACING.last);
  }
});

test('every stop stages fights in room and in clear view: each set piece somewhere on every way round, the classics nearly everywhere', () => {
  const random = roundRandom(3);
  for (const plan of PLANS) {
    const fits = plan.stops.map((distance) => Object.fromEntries([...CLASSICS, ...SET_PIECES].map((name) => [
      name, FIGHT_POOL[name](random).some((fight) => placeFight(plan.path, fight, distance, plan.blockers, plan.world, plan.footprint)),
    ])));
    // the round's fallbacks: every stop has at least two of the classics
    fits.forEach((stop, slot) => assert.ok(CLASSICS.filter((name) => stop[name]).length >= 2, `${plan.key} stop ${slot + 1}`));
    for (const name of SET_PIECES) assert.ok(fits.some((stop) => stop[name]), `${plan.key}: ${name} has a stop`);
    // and the Gale Lift-Off Handover, the round changing hands, has every stop
    fits.forEach((stop, slot) => assert.ok(stop.galeLiftoff, `${plan.key} stop ${slot + 1}: the lift-off`));
  }
});

test('the lift-off\'s two knights keep to the map\'s ground, the one taking over the round walking back to the path', () => {
  const random = roundRandom(0);
  for (const plan of PLANS) {
    plan.stops.forEach((distance) => {
      const placed = FIGHT_POOL.galeLiftoff(random).map((fight) => placeFight(plan.path, fight, distance, plan.blockers, plan.world, plan.footprint)).find(Boolean);
      for (let t = 0; t <= placed.fight.duration; t += 0.1) {
        const { hero, rival, rivalHere } = fightPair(placed.fight, placed.frame, t);
        assert.ok(plan.footprint(hero[0], hero[1], -0.6), `${plan.key}: the traveller off the ground at ${t.toFixed(1)}`);
        if (rivalHere) assert.ok(plan.footprint(rival[0], rival[1], -0.6), `${plan.key}: the rival off the ground at ${t.toFixed(1)}`);
      }
    });
  }
});

test('the carousel moves on: never to the map it is on, every map before any twice, one round or two on each', () => {
  const random = roundRandom(11);
  let from = 'castleward';
  let seen = ['castleward'];
  const visits = [];
  for (let leg = 0; leg < 24; leg += 1) {
    const next = nextLeg(random, { from, seen });
    assert.notEqual(next.id, from, 'never the same map twice running');
    assert.ok([1, 2].includes(next.rounds));
    assert.ok(mapPlan(next.id, next), `${next.id}: a way round that runs`);
    visits.push(next);
    seen = seen.length + 1 >= TOUR_MAP_IDS.length ? [next.id] : [...seen, next.id];
    from = next.id;
  }
  // every map comes round, from more than one start and both ways
  for (const id of TOUR_MAP_IDS) assert.ok(visits.some((leg) => leg.id === id), id);
  assert.ok(new Set(visits.map((leg) => `${leg.id}:${leg.start}`)).size > TOUR_MAP_IDS.length, 'several starts');
  assert.ok(visits.some((leg) => leg.reverse) && visits.some((leg) => !leg.reverse), 'both ways round');
  assert.ok(new Set(visits.map((leg) => leg.rounds)).size === 2, 'stays of one round and of two');
});
