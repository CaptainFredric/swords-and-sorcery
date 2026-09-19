import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCastlewardDecorPlan } from './castlewardDecor.mjs';

test('Castleward deterministic decor stays performance bounded', () => {
  const plan = buildCastlewardDecorPlan(1337);
  assert.ok(plan.houses.length >= 4 && plan.houses.length <= 10);
  assert.ok(plan.trees.length <= 24);
  assert.ok(plan.torches.length <= 20);
  assert.ok(plan.castlePieces.length > 0);
});

test('Castleward decor is deterministic for a given seed', () => {
  assert.deepEqual(buildCastlewardDecorPlan(1337), buildCastlewardDecorPlan(1337));
});

test('Castleward decor keeps the central combat green and main travel lanes visually open', () => {
  const plan = buildCastlewardDecorPlan(1337);
  for (const house of plan.houses) {
    const insideCentralGreen = Math.abs(house.x) < 7 && Math.abs(house.z) < 7;
    assert.equal(insideCentralGreen, false, `house blocks Town Green at ${house.x},${house.z}`);
  }
  for (const tree of plan.trees) {
    const blocksNorthSouthLane = Math.abs(tree.x) < 2.5 && tree.z > -18 && tree.z < 19;
    const blocksEastLane = tree.x > 5 && tree.x < 18 && Math.abs(tree.z) < 2.5;
    assert.equal(blocksNorthSouthLane || blocksEastLane, false, `tree blocks a primary lane at ${tree.x},${tree.z}`);
  }
});
