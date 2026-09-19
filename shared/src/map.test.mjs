import test from 'node:test';
import assert from 'node:assert/strict';
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
