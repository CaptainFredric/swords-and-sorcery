import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCastlewardDecorPlan, insideCastlewardFootprint } from './castlewardDecor.mjs';
import { CASTLEWARD } from '../../shared/worlds/castleward.mjs';

test('Castleward deterministic decor stays performance bounded', () => {
  const plan = buildCastlewardDecorPlan(1337);
  assert.ok(plan.houses.length >= 4 && plan.houses.length <= 10);
  assert.ok(plan.trees.length <= 24);
  assert.ok(plan.torches.length <= 20);
  assert.ok(plan.forest.length <= 120);
  const lights = [...plan.torches, ...plan.braziers].filter((item) => item.light);
  assert.ok(lights.length <= 6, `${lights.length} real torch lights is too many for phones`);
  assert.ok(plan.banners.length > 0);
});

test('Castleward decor is deterministic for a given seed', () => {
  assert.deepEqual(buildCastlewardDecorPlan(1337), buildCastlewardDecorPlan(1337));
});

test('Castleward decor keeps the central combat green and main travel lanes visually open', () => {
  const plan = buildCastlewardDecorPlan(1337);
  for (const house of plan.houses) {
    assert.equal(insideCastlewardFootprint(house.x, house.z, 1), false, `backdrop house ${house.id} stands inside the arena`);
  }
  for (const tree of [...plan.trees, ...plan.forest]) {
    assert.equal(insideCastlewardFootprint(tree.x, tree.z, 0.5), false, `scenery tree ${tree.id} stands inside the arena`);
  }
  for (const tree of plan.trees) {
    const blocksNorthSouthLane = Math.abs(tree.x) < 2.5 && tree.z > -18 && tree.z < 19;
    const blocksEastLane = tree.x > 5 && tree.x < 18 && Math.abs(tree.z) < 2.5;
    assert.equal(blocksNorthSouthLane || blocksEastLane, false, `tree blocks a primary lane at ${tree.x},${tree.z}`);
  }
});

test('braziers and rune stones the decor dresses are real solids in the world', () => {
  const plan = buildCastlewardDecorPlan(1337);
  const ids = new Set(CASTLEWARD.solids.map((solid) => solid.id));
  for (const item of [...plan.braziers, ...plan.runeStones]) assert.ok(ids.has(item.id), `${item.id} has no collision`);
});

test('every small prop inside the arena stands against a wall or post, so nobody runs through one', () => {
  const plan = buildCastlewardDecorPlan(1337);
  const gap = (prop, solid) => {
    const dx = Math.max(0, Math.abs(prop.x - solid.center[0]) - solid.size[0] / 2);
    const dz = Math.max(0, Math.abs(prop.z - solid.center[2]) - solid.size[2] / 2);
    return Math.hypot(dx, dz);
  };
  assert.ok(CASTLEWARD.props.length >= 12, 'a lived-in town');
  for (const prop of CASTLEWARD.props) {
    if (!insideCastlewardFootprint(prop.x, prop.z, -0.6)) continue;
    const nearest = Math.min(...CASTLEWARD.solids.filter((solid) => solid.id !== prop.id).map((solid) => gap(prop, solid)));
    assert.ok(nearest < 0.75, `${prop.kind} ${prop.id} stands ${nearest.toFixed(2)} m out in the open`);
  }
});

test('the furnishings that stand in the way are solid, for bodies and blades alike; the ones that only decorate are not', () => {
  const solids = new Map(CASTLEWARD.solids.map((solid) => [solid.id, solid]));
  for (const prop of CASTLEWARD.props) {
    const solid = solids.get(prop.id);
    if (prop.kind === 'flowers' || prop.kind === 'pennant') assert.equal(solid, undefined, `${prop.kind} is only decoration`);
    else assert.ok(solid && solid.kind === 'prop' && solid.blade !== false, `${prop.kind} ${prop.id} stands`);
  }
});

test('a banner hung on a gate tower\'s upper wall clears the stone course round the tower\'s top (it never hangs through it)', () => {
  const plan = buildCastlewardDecorPlan(1337);
  for (const banner of plan.banners.filter((b) => /gate/.test(b.id))) {
    const tower = CASTLEWARD.solids.find((solid) => /gate-(west|east)$/.test(solid.id) && Math.abs(solid.center[0] - banner.x) < 1.2
      && Math.abs(solid.center[2] - banner.z) < solid.size[2] / 2 + 0.3);
    assert.ok(tower, `${banner.id} hangs on a tower`);
    const course = tower.center[1] + tower.size[1] / 2 + 0.13;
    assert.ok(banner.y - banner.height > course + 0.05, `${banner.id}: its hem at ${(banner.y - banner.height).toFixed(2)}, the course at ${course.toFixed(2)}`);
  }
});
