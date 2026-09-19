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
    const top = piece.y + piece.sy / 2;
    assert.ok(top <= 0.02, `non-collision bridge decoration must stay below the walkable surface: ${piece.id}`);
  }
});

test('west-hall architectural accents stay flush to real collision walls instead of making fake overhead solids', () => {
  const plan = buildKeepDecorPlan(1337);
  const west = plan.wallAccents.filter((piece) => piece.mount === 'westOuterWall');
  assert.ok(west.length >= 4);
  for (const piece of west) {
    assert.ok(Math.abs(piece.x + 17.63) < 0.08, `${piece.id} should sit on the inner face of the west outer wall`);
    assert.ok(piece.sx <= 0.08, `${piece.id} must remain a thin wall treatment`);
    assert.ok(piece.z >= -5.5 && piece.z <= 5.5, `${piece.id} must stay inside the existing west wall span`);
  }
});

test('backdrop and floating ruin counts stay bounded for student-laptop rendering', () => {
  const plan = buildKeepDecorPlan(1337);
  assert.ok(plan.clouds.length <= 24);
  assert.ok(plan.floatingMasonry.length <= 16);
  assert.ok(plan.rubble.length <= 28);
});
