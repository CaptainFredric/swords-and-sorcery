import test from 'node:test';
import assert from 'node:assert/strict';
import { buildKeepDecorPlan, KEEP_ROUTE_COLORS } from './worldDecor.mjs';

test('Shattered Keep decor is deterministic for a given seed', () => {
  assert.deepEqual(buildKeepDecorPlan(1337), buildKeepDecorPlan(1337));
  assert.notDeepEqual(buildKeepDecorPlan(1337).clouds, buildKeepDecorPlan(1338).clouds);
});

test('route palette preserves distinct courtyard, west, east, and north identities', () => {
  assert.notEqual(KEEP_ROUTE_COLORS.courtyard, KEEP_ROUTE_COLORS.west);
  assert.notEqual(KEEP_ROUTE_COLORS.west, KEEP_ROUTE_COLORS.east);
  assert.notEqual(KEEP_ROUTE_COLORS.east, KEEP_ROUTE_COLORS.north);
});

test('decor plan emphasizes the actual bridge break without filling its floor gap', () => {
  const plan = buildKeepDecorPlan(1337);
  assert.ok(plan.bridgeEdges.length >= 6);
  assert.ok(plan.bridgeEdges.some((piece) => piece.z > -16));
  assert.ok(plan.bridgeEdges.some((piece) => piece.z < -16));
  for (const piece of plan.bridgeEdges) {
    assert.ok(piece.y <= -0.08, `bridge decoration should not create a fake walkable floor: ${piece.id}`);
  }
});

test('backdrop and floating ruin counts stay bounded for student-laptop rendering', () => {
  const plan = buildKeepDecorPlan(1337);
  assert.ok(plan.clouds.length <= 24);
  assert.ok(plan.floatingMasonry.length <= 16);
  assert.ok(plan.rubble.length <= 28);
});
