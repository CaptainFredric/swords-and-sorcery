import test from 'node:test';
import assert from 'node:assert/strict';
import { SHATTERED_KEEP } from '../../shared/src/map.mjs';
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
  const northBridge = SHATTERED_KEEP.floors.find((floor) => floor.id === 'broken-bridge-north');
  const southBridge = SHATTERED_KEEP.floors.find((floor) => floor.id === 'broken-bridge-south');
  const breakCenter = (northBridge.center[2] + southBridge.center[2]) / 2;
  assert.ok(plan.bridgeEdges.some((piece) => piece.z > breakCenter));
  assert.ok(plan.bridgeEdges.some((piece) => piece.z < breakCenter));
  for (const piece of plan.bridgeEdges) {
    const top = piece.y + piece.sy / 2;
    assert.ok(top <= 0.02, `non-collision bridge decoration must stay below the walkable surface: ${piece.id}`);
  }
});

test('west-hall architectural accents stay flush to the expanded real collision wall', () => {
  const plan = buildKeepDecorPlan(1337);
  const outerWall = SHATTERED_KEEP.solids.find((solid) => solid.id === 'west-outer-wall');
  const innerFaceX = outerWall.center[0] + outerWall.size[0] / 2;
  const west = plan.wallAccents.filter((piece) => piece.mount === 'westOuterWall');
  assert.ok(west.length >= 4);
  for (const piece of west) {
    assert.ok(Math.abs(piece.x - innerFaceX) < 0.12, `${piece.id} should sit on the inner face of the west outer wall`);
    assert.ok(piece.sx <= 0.08, `${piece.id} must remain a thin wall treatment`);
    assert.ok(Math.abs(piece.z) <= outerWall.size[2] / 2 - 0.35, `${piece.id} must stay inside the west wall span`);
  }
});

test('backdrop and floating ruin counts stay bounded for student-laptop rendering', () => {
  const plan = buildKeepDecorPlan(1337);
  assert.ok(plan.clouds.length <= 24);
  assert.ok(plan.floatingMasonry.length <= 16);
  assert.ok(plan.rubble.length <= 28);
});
