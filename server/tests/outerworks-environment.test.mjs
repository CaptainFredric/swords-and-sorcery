// Outerworks held to its own collision: no knight walks, crouches or hops into the void (west of the bailey,
// behind the inner curtain, under and beside the terrace and parapet, round the sally trench), the routes
// to both objectives are as long as they were.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getWorld } from '../../shared/worlds/registry.mjs';
import { navGraph } from '../../shared/sim/botNav.mjs';
import { floodWorld, auditWorld } from '../../scripts/world-audit.mjs';

const world = getWorld('outerworks');

test('no knight can walk, crouch or hop out of Outerworks, nor stand under a floor', () => {
  for (const height of [1.8, 1.2]) {
    const flood = floodWorld(world, { height });
    assert.deepEqual(flood.leaks, [], `${height} m body found the void at ${JSON.stringify(flood.leaks.slice(0, 3))}`);
    assert.equal(flood.headClips.length, 0);
  }
});

test('the bot graph is whole and every waypoint stands on its floor; objective routes keep their length', () => {
  const graph = navGraph(world);
  assert.ok(graph.links.every((l) => l.length > 0), 'an isolated waypoint');
  const report = auditWorld(world);
  assert.equal(report.nav.components, 1);
  assert.deepEqual(report.nav.invalid, []);
  // running times from the attackers' spawn, as before the closures (seconds)
  assert.ok(Math.abs(report.traversal.ATTACKERS['forward-redoubt'] - 5.2) <= 0.3);
  assert.ok(Math.abs(report.traversal.ATTACKERS['barbican-gate'] - 11.3) <= 0.3);
});
