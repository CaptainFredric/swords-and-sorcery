import test from 'node:test';
import assert from 'node:assert/strict';
import { edgeInside, edgeLimitPoint } from './edgeBoundary.mjs';
import { edgeRadiusAt, edgeNextStage, edgeSpawnOrder, createEdgeOfVictoryState } from '../sim/edgeOfVictory.mjs';
import { RUINED_KEEP } from '../worlds/ruinedKeep.mjs';

test('radial projection denies retreat without destroying tangential movement', () => {
  const center = { x: 0, z: 0 };
  const target = edgeLimitPoint({ x: 12, y: 0, z: 5 }, center, 10, 0.5);
  assert.ok(edgeInside(target, center, 10, 0.5));
  assert.ok(target.z > 3.5, 'diagonal input must keep its sideways component');
  assert.equal(target.y, 0);
  const inward = edgeLimitPoint({ x: 7, z: 0 }, center, 10, 0.5);
  assert.equal(inward.x, 7);
});

test('high-speed displacement cannot cross boundary without a legal endpoint', () => {
  const center = { x: 0, z: 0 };
  const start = { x: 0, z: 0 };
  const end = edgeLimitPoint({ x: 900, z: -100 }, center, 10, 0.45);
  assert.ok(edgeInside(end, center, 10, 0.45));
  for (let step = 0; step <= 100; step++) {
    const alpha = step / 100;
    assert.ok(edgeInside({ x: start.x + (end.x - start.x) * alpha,
      z: start.z + (end.z - start.z) * alpha }, center, 10, 0.45));
  }
});

test('contraction has a stable final combat radius and explicit next stage', () => {
  assert.equal(edgeRadiusAt(0), 18);
  assert.ok(edgeRadiusAt(100) < 15);
  assert.equal(edgeRadiusAt(9999), 6.5);
  assert.equal(edgeNextStage(0), 75);
  assert.equal(edgeNextStage(290), null);
});

test('initial spawn layout spreads across known real keep spawns', () => {
  const order = edgeSpawnOrder(RUINED_KEEP, 4);
  assert.equal(order.length, 4);
  assert.equal(new Set(order).size, 4);
  for (const p of order) assert.ok(RUINED_KEEP.spawnPoints.includes(p));
  const state = createEdgeOfVictoryState(RUINED_KEEP, 100);
  assert.ok(state.pickups.length >= 3);
  assert.ok(state.pickups.every((p) => p.available));
});
