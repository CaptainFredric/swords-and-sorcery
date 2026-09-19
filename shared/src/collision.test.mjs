import test from 'node:test';
import assert from 'node:assert/strict';
import { segmentAabbHit, resolvePlayerWorld, findSwordWorldHit, surfaceHeightAt } from './collision.mjs';
import { SHATTERED_KEEP } from './map.mjs';

test('segment intersects a wall and returns nearest normalized time', () => {
  const box = { id: 'wall', center: [2, 1, 0], size: [1, 2, 4] };
  const hit = segmentAabbHit([0, 1, 0], [4, 1, 0], box);
  assert.ok(hit);
  assert.ok(Math.abs(hit.t - 0.375) < 0.001);
  assert.deepEqual(hit.normal, [-1, 0, 0]);
});

test('segment through open space does not report a wall hit', () => {
  const box = { id: 'wall', center: [2, 1, 5], size: [1, 2, 1] };
  assert.equal(segmentAabbHit([0, 1, 0], [4, 1, 0], box), null);
});

test('player circle is pushed out of a wall instead of walking through it', () => {
  const wall = { id: 'wall', center: [1, 1, 0], size: [1, 2, 4] };
  const result = resolvePlayerWorld({ x: 0.8, y: 0, z: 0 }, 0.45, [wall]);
  assert.ok(result.x <= 0.050001);
});

test('sword world hit selects a nearer wall before full melee range', () => {
  const wall = { id: 'wall', center: [1.25, 1.2, 0], size: [0.5, 2.4, 2] };
  const hit = findSwordWorldHit([0, 1.2, 0], [1, 0, 0], 2.75, [wall]);
  assert.ok(hit);
  assert.ok(hit.distance < 2);
  assert.equal(hit.box.id, 'wall');
});

test('Shattered Keep broken bridge has a real traversable floor gap', () => {
  const north = SHATTERED_KEEP.floors.find((floor) => floor.id === 'broken-bridge-north');
  const south = SHATTERED_KEEP.floors.find((floor) => floor.id === 'broken-bridge-south');
  assert.ok(north && south);

  const northSouthEdge = north.center[2] - north.size[2] / 2;
  const southNorthEdge = south.center[2] + south.size[2] / 2;
  const gapCenterZ = (northSouthEdge + southNorthEdge) / 2;

  assert.ok(northSouthEdge > southNorthEdge, 'bridge floor sections must leave a physical gap between them');
  assert.equal(surfaceHeightAt(0, north.center[2], 0.5, SHATTERED_KEEP), 0);
  assert.equal(surfaceHeightAt(0, gapCenterZ, 0.5, SHATTERED_KEEP), null);
  assert.equal(surfaceHeightAt(0, south.center[2], 0.5, SHATTERED_KEEP), 0);
});
