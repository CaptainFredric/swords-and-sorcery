// Blackbell Foundry held to its own collision: no knight walks, crouches or hops into the void (beside the blast
// portal, under the gantry, out of the trench under the yard), the bot graph is one piece, and the routes
// to both objectives are as long as they were.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getWorld } from '../../shared/worlds/registry.mjs';
import { navGraph } from '../../shared/sim/botNav.mjs';
import { floodWorld, auditWorld } from '../../scripts/world-audit.mjs';

const world = getWorld('blackbell-foundry');

test('no knight can walk, crouch or hop out of Blackbell Foundry, nor stand under a floor', () => {
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
  // running times from the attackers' spawn, as before the portal's flanks and the gantry's base (seconds)
  assert.ok(Math.abs(report.traversal.ATTACKERS['chain-winch'] - 4.0) <= 0.3);
  assert.ok(Math.abs(report.traversal.ATTACKERS['blackbell'] - 7.8) <= 0.3);
});
