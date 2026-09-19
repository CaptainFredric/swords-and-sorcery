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
