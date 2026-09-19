import test from 'node:test';
import assert from 'node:assert/strict';
import { segmentAabbHit } from './collision.mjs';
import { SHATTERED_KEEP } from './map.mjs';

function normalized(x, z) {
  const mag = Math.hypot(x, z) || 1;
  return { x: x / mag, z: z / mag };
}

test('Shattered Keep spawns face inward toward playable space instead of out over the abyss', () => {
  for (const spawn of SHATTERED_KEEP.spawnPoints) {
    const towardCenter = normalized(-spawn.x, -spawn.z);
    const facing = { x: -Math.sin(spawn.yaw), z: -Math.cos(spawn.yaw) };
    const inwardDot = facing.x * towardCenter.x + facing.z * towardCenter.z;

    assert.ok(
      inwardDot > 0.7,
      `spawn (${spawn.x}, ${spawn.y}, ${spawn.z}) faces outward: dot=${inwardDot.toFixed(3)}, yaw=${spawn.yaw}`,
    );
  }
});

test('courtyard spawns begin with a clear forward lane instead of staring into nearby pillars', () => {
  for (const spawn of SHATTERED_KEEP.spawnPoints.slice(0, 4)) {
    const facing = { x: -Math.sin(spawn.yaw), z: -Math.cos(spawn.yaw) };
    const start = [spawn.x, spawn.y + 1.58, spawn.z];
    const end = [start[0] + facing.x * 4.5, start[1], start[2] + facing.z * 4.5];
    const blocking = SHATTERED_KEEP.solids
      .map((solid) => segmentAabbHit(start, end, solid))
      .filter(Boolean)
      .sort((a, b) => a.t - b.t)[0];

    assert.equal(
      blocking,
      undefined,
      `courtyard spawn (${spawn.x}, ${spawn.z}) starts behind ${blocking?.box?.id ?? 'solid cover'}`,
    );
  }
});

test('Shattered Keep gives fights a little more breathing room without becoming a long-walk map', () => {
  const courtyard = SHATTERED_KEEP.floors.find((floor) => floor.id === 'courtyard');
  const westHall = SHATTERED_KEEP.floors.find((floor) => floor.id === 'west-hall');
  const southTower = SHATTERED_KEEP.floors.find((floor) => floor.id === 'south-tower');

  assert.ok(courtyard.size[0] >= 19.5 && courtyard.size[0] <= 21.5, `courtyard width is ${courtyard.size[0]}`);
  assert.ok(westHall.center[0] <= -14.5 && westHall.center[0] >= -15.5, `west hall center is ${westHall.center[0]}`);
  assert.ok(Math.abs(southTower.center[2]) >= 24 && Math.abs(southTower.center[2]) <= 26, `south tower distance is ${southTower.center[2]}`);

  const farthestSpawn = Math.max(...SHATTERED_KEEP.spawnPoints.map((spawn) => Math.hypot(spawn.x, spawn.z)));
  assert.ok(farthestSpawn <= 25.5, `farthest spawn is too remote at ${farthestSpawn.toFixed(2)}m`);
});

test('central Arcane Spire remains a landmark instead of a giant courtyard sight blocker', () => {
  const spire = SHATTERED_KEEP.solids.find((solid) => solid.id === 'arcane-spire-base');
  assert.ok(spire.size[0] <= 1.9, `spire width is ${spire.size[0]}`);
  assert.ok(spire.size[2] <= 1.9, `spire depth is ${spire.size[2]}`);
  assert.ok(spire.size[1] <= 2.1, `spire base height is ${spire.size[1]}`);
});
