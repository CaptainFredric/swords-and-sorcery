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
