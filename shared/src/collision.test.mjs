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

test('oriented machinery permits a close approach outside its actual diagonal footprint', () => {
  const c=Math.SQRT1_2;
  const machine={center:[0,1,0],size:[.8,1,4],axes:[[c,0,-c],[0,1,0],[c,0,c]]};
  const at={x:1.5,y:0,z:-1.5};
  assert.deepEqual(resolvePlayerWorld(at,.45,[machine]),at);
});
test('oriented machinery pushes an overlapping body out along its actual face normal', () => {
  const c=Math.SQRT1_2,box={center:[0,1,0],size:[.8,1,4],axes:[[c,0,-c],[0,1,0],[c,0,c]]};
  const at={x:c*.6,y:0,z:-c*.6},result=resolvePlayerWorld(at,.45,[box]);
  assert.ok(Math.abs((result.x-result.z)*c-.85)<1e-7);
  assert.equal(result.y,0);
});
test('inclined machinery clips its footprint to the body height instead of blocking empty space underneath', () => {
  const c=Math.SQRT1_2,box={center:[0,1,0],size:[1,1,4],axes:[[1,0,0],[0,c,-c],[0,c,c]]};
  const below={x:0,y:-2,z:0};
  assert.deepEqual(resolvePlayerWorld(below,.45,[box],.5),below);
  const on={x:.6,y:0,z:0},moved=resolvePlayerWorld(on,.45,[box]);
  assert.ok(moved.x>=.949999);
});

test('a crouched body cannot stand through a diagonally placed mechanical beam', async () => {
 const {roomToStand}=await import('./body.mjs');const c=Math.SQRT1_2;
 const beam={center:[0,1.6,0],size:[.8,.5,4],axes:[[c,0,-c],[0,1,0],[c,0,c]]};
 assert.equal(roomToStand({x:1,y:0,z:1},.45,{solids:[beam]}),false);
});
