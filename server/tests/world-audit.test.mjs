// The world audit's own footing, and what the bot graph promises every world: the same answer from the near-solids
// broadphase as from testing every solid, and a route that starts only where a bot can actually run to.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getWorld, WORLD_IDS } from '../../shared/worlds/registry.mjs';
import { runClear, routeBetween, NAV } from '../../shared/sim/botNav.mjs';
import { findSwordWorldHit, surfaceHeightAt } from '../../shared/src/collision.mjs';
import { floodWorld, confirmLeak, cluster } from '../../scripts/world-audit.mjs';

// runClear exactly as it was before the broadphase (every ray against every solid)
function bruteRunClear(world, from, to, nav = NAV) {
  const dx = to.x - from.x, dz = to.z - from.z, length = Math.hypot(dx, dz);
  if (length < 1e-6) return true;
  const side = { x: -dz / length, z: dx / length };
  for (const height of nav.heights) for (const offset of [0, -nav.halfWidth, nav.halfWidth]) {
    const origin = [from.x + side.x * offset, from.y + height, from.z + side.z * offset];
    if (findSwordWorldHit(origin, [dx, to.y - from.y, dz], Math.hypot(dx, to.y - from.y, dz), world.solids)) return false;
  }
  const steps = Math.max(1, Math.ceil(length / nav.step));
  let underfoot = from.y;
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const ground = surfaceHeightAt(from.x + dx * t, from.z + dz * t, underfoot, world);
    if (ground === null || ground < underfoot - nav.drop) return false;
    underfoot = ground;
  }
  return Math.abs(underfoot - to.y) <= 0.7;
}

test('the bot graph broadphase answers exactly as testing every solid would, on every world', () => {
  let seed = 7;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (const id of Object.values(WORLD_IDS)) {
    const world = getWorld(id);
    const nodes = world.navigation?.nodes ?? world.spawnPoints;
    for (let i = 0; i < 300; i += 1) {
      const a = nodes[Math.floor(random() * nodes.length)], b = nodes[Math.floor(random() * nodes.length)];
      const to = { x: b.x + (random() - 0.5) * 6, y: b.y ?? 0, z: b.z + (random() - 0.5) * 6 };
      assert.equal(runClear(world, a, to), bruteRunClear(world, a, to), `${id}: ${JSON.stringify(a)} -> ${JSON.stringify(to)}`);
    }
  }
});

test('a route starts only at a waypoint the bot can run to, never one it could only drop from', () => {
  // a ledge 1.3 m up with one waypoint on it and one below by a ramp; a bot under the ledge must not pick the top one
  const world = {
    floors: [{ id: 'ground', center: [0, -0.15, 0], size: [40, 0.3, 40], y: 0 }, { id: 'ledge', center: [0, 1.15, 8], size: [8, 0.3, 6], y: 1.3 }],
    ramps: [{ id: 'up', axis: 'x', minX: 4, maxX: 10, minZ: 5, maxZ: 11, startY: 1.3, endY: 0 }],
    solids: [{ id: 'ledge-face', center: [0, 0.325, 8], size: [8, 0.65, 6] }],
    navigation: { nodes: [{ id: 'top', x: 0, y: 1.3, z: 8 }, { id: 'ramp-foot', x: 11, y: 0, z: 8 }, { id: 'ramp-mid', x: 7, y: 0.65, z: 8 }, { id: 'below', x: 0, y: 0, z: 2 }] },
  };
  const route = routeBetween(world, { x: 0, y: 0, z: 4.2 }, { x: 0, y: 1.3, z: 9 });
  assert.ok(route, 'there is a way up');
  assert.notEqual(world.navigation.nodes[route[0]].id, 'top', 'started on the ledge it cannot climb');
});

test('the audit finds a void a knight can walk into, and the real movement code agrees', () => {
  const world = {
    floors: [{ id: 'deck', center: [0, -0.15, 0], size: [6, 0.3, 6], y: 0 }],
    solids: [{ id: 'rail', center: [0, 0.6, 3.2], size: [6, 1.2, 0.3] }],
    ramps: [], spawnPoints: [{ x: 0, y: 0, z: 0 }],
  };
  const flood = floodWorld(world);
  const leaks = cluster(flood.leaks);
  assert.ok(flood.leaks.some((l) => l.x < -3) && flood.leaks.some((l) => l.x > 3) && flood.leaks.some((l) => l.z < -3), 'three open sides');
  assert.ok(leaks.every((l) => confirmLeak(world, l)?.fell), 'every reported void is one a body falls into');
  // the railed side: a standing body is stopped; nothing reported there
  assert.ok(flood.leaks.every((l) => l.z < 3), 'the rail was reported open');
});
