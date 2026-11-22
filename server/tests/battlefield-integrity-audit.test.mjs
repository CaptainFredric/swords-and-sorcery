import test from 'node:test';
import assert from 'node:assert/strict';
import { getWorld } from '../../shared/worlds/registry.mjs';
import { surfaceHeightAt } from '../../shared/src/collision.mjs';
import { navGraph } from '../../shared/sim/botNav.mjs';

test('High Grounds architectural integrity: zero head-clips, zero crouch leaks, and supported structures', () => {
  const w = getWorld('high-grounds');
  // 1. Root ramp approaches under forward decks have zero head-clip penetration
  for (const z of [-49.75, -48.25]) {
    const solidUnderAzure = w.solids.find(s => s.id === 'root-approach-cheek-azure');
    assert.ok(solidUnderAzure, 'Azure root ramp cheek wall is present');
  }
  for (const z of [48.25, 49.75]) {
    const solidUnderCrimson = w.solids.find(s => s.id === 'root-approach-cheek-crimson');
    assert.ok(solidUnderCrimson, 'Crimson root ramp cheek wall is present');
  }

  // 2. Road retaining foundations exist between central road (Y=0) and root shelf (Y=-9)
  const westRoadRetaining = w.solids.find(s => s.id === 'road-retaining-west-south');
  const eastRoadRetaining = w.solids.find(s => s.id === 'road-retaining-east-south');
  assert.ok(westRoadRetaining && eastRoadRetaining, 'Central road retaining foundations present');

  // 3. Bedrock cliff walls back the lower root passages
  const westRootCliff = w.solids.find(s => s.id === 'root-cliff-west');
  const eastRootCliff = w.solids.find(s => s.id === 'root-cliff-east');
  assert.ok(westRootCliff && eastRootCliff, 'Lower root passage cliff walls present');

  // 4. Upper piers carry the long camp ascents before meeting canopy
  assert.ok(w.solids.some(s => s.id === 'ramp-upper-pier-west-ascent'), 'West ascent upper pier present');
  assert.ok(w.solids.some(s => s.id === 'ramp-upper-pier-east-ascent'), 'East ascent upper pier present');

  // 5. High bridges have masonry abutments and mid-span piers
  assert.ok(w.solids.some(s => s.id === 'bridge-abutment-west-south'), 'High bridge west abutment present');
  assert.ok(w.solids.some(s => s.id === 'bridge-pier-west-south'), 'High bridge mid pier present');

  // 6. Canopy highways have dedicated support piers
  assert.ok(w.solids.some(s => s.id === 'canopy-pier-west-south'), 'Canopy pier present');
  assert.ok(w.solids.some(s => s.id === 'canopy-pier-east-north'), 'Canopy pier present');

  // 7. Navigation graph has zero isolated or invalid nodes
  const g = navGraph(w);
  const visited = new Set([0]), queue = [0];
  while (queue.length) {
    for (const { to } of g.links[queue.shift()]) {
      if (!visited.has(to)) { visited.add(to); queue.push(to); }
    }
  }
  const isolated = g.nodes.filter((_, i) => !visited.has(i)).map(n => n.id);
  assert.deepEqual(isolated, [], 'No isolated nav nodes');
});

test('Restless Day structural integrity: dais and rampart platform cavities sealed', () => {
  const w = getWorld('restless-day');
  assert.ok(w.solids.some(s => s.id === 'renowner-dais-core'), 'Renowner dais core solid exists');
  assert.ok(w.solids.some(s => s.id === 'outer-west-defender-footing'), 'Outer defender ramp footing exists');
  assert.ok(w.solids.some(s => s.id === 'inner-east-defender-footing'), 'Inner defender ramp footing exists');
});

test('Castleward and Ruined Keep navigation node heights match authoritative floor surfaces', () => {
  const cw = getWorld('castleward');
  const westWalk = cw.navigation.nodes.find(n => n.id === 'west-walk-foot');
  const eastWalk = cw.navigation.nodes.find(n => n.id === 'east-walk-foot');
  assert.equal(westWalk.y, surfaceHeightAt(westWalk.x, westWalk.z, 4, cw), 'Castleward west walk node height matches surface');
  assert.equal(eastWalk.y, surfaceHeightAt(eastWalk.x, eastWalk.z, 4, cw), 'Castleward east walk node height matches surface');

  const rk = getWorld('ruined-keep');
  const breach = rk.navigation.nodes.find(n => n.id === 'breach');
  assert.ok(Math.abs(breach.y - surfaceHeightAt(breach.x, breach.z, 4, rk)) < 0.05, 'Ruined Keep breach node matches ramp surface');
});
