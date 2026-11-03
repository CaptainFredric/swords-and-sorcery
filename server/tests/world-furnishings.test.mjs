import test from 'node:test';
import assert from 'node:assert/strict';
import { getWorld, WORLD_IDS } from '../../shared/worlds/registry.mjs';
import { PROP_KINDS, propSolid } from '../../shared/worlds/props.mjs';
import { surfaceHeightAt } from '../../shared/src/collision.mjs';
import { NAV, navGraph } from '../../shared/sim/botNav.mjs';

// The siege grounds' furnishings (tents, carts, stores, stakes, braziers, standards...) are real, collidable things:
// these hold that none of them is where it would spoil a match. Each stands wholly on a floor at its own height; none
// crowds a spawn, sits in a capture ring, on a foundry's console or production pad, or on a siege machine's road; and
// together they cut no straight run the bots' routes rely on.

const DRESSED = [WORLD_IDS.HIGH_GROUNDS, WORLD_IDS.OUTERWORKS, WORLD_IDS.BLACKBELL_FOUNDRY, WORLD_IDS.BASTION_BREACH];
const reachOf = (prop) => {
  const solid = propSolid(prop);
  return solid ? Math.hypot(solid.size[0], solid.size[2]) / 2 : 0.45;
};

for (const id of DRESSED) {
  const world = getWorld(id);
  const props = world.props ?? [];

  test(`${world.name}: furnished, each furnishing a known kind standing as its own solid`, () => {
    assert.ok(props.length >= 25, `${world.name} has ${props.length} furnishings`);
    const solids = new Set(world.solids.map((solid) => solid.id));
    for (const prop of props) {
      assert.ok(prop.kind in PROP_KINDS, `${prop.id}: unknown kind ${prop.kind}`);
      if (propSolid(prop)) assert.ok(solids.has(prop.id), `${prop.id} stands but is not among the world's solids`);
    }
  });

  test(`${world.name}: the furnishings stand wholly on its floors`, () => {
    for (const prop of props) {
      const y = prop.y ?? 0;
      const solid = propSolid(prop);
      const [hx, hz] = solid ? [solid.size[0] / 2, solid.size[2] / 2] : [0.3, 0.3];
      for (const [dx, dz] of [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const ground = surfaceHeightAt(prop.x + dx * hx, prop.z + dz * hz, y + 0.3, world);
        assert.ok(ground !== null && Math.abs(ground - y) < 0.05, `${prop.id} (${prop.kind}) overhangs its floor at ${dx},${dz}`);
      }
    }
  });

  test(`${world.name}: the furnishings keep clear of spawns, capture rings, foundries and siege roads`, () => {
    for (const prop of props) {
      const y = prop.y ?? 0;
      const reach = reachOf(prop);
      for (const spawn of world.spawnPoints) {
        if (Math.abs((spawn.y ?? 0) - y) > 2) continue;
        assert.ok(Math.hypot(spawn.x - prop.x, spawn.z - prop.z) - reach >= 1.6, `${prop.id} crowds the spawn at ${spawn.x},${spawn.z}`);
      }
      for (const site of world.objectives ?? []) {
        if (Math.abs((site.y ?? 0) - y) > 2) continue;
        assert.ok(Math.hypot(site.x - prop.x, site.z - prop.z) - reach >= site.radius + 0.3, `${prop.id} stands in the ${site.id} ring`);
      }
      for (const foundry of world.siegeFoundries ?? []) {
        assert.ok(Math.hypot(foundry.x - prop.x, foundry.z - prop.z) - reach >= 2.6, `${prop.id} on ${foundry.id}'s console`);
        assert.ok(Math.abs(prop.x - foundry.spawnX) >= 6 || Math.abs(prop.z - foundry.spawnZ) >= 8, `${prop.id} on ${foundry.id}'s production pad`);
      }
      for (const site of world.siegeEmplacements ?? []) {
        const [fx, fz] = [-Math.sin(site.heading), -Math.cos(site.heading)];
        const [dx, dz] = [prop.x - site.x, prop.z - site.z];
        const along = dx * fx + dz * fz;
        const across = Math.abs(dx * fz - dz * fx);
        assert.ok(!(along > -6 && along < 40 && across - reach < 5), `${prop.id} on the ${site.type} road from ${site.id}`);
      }
    }
    if (id === WORLD_IDS.HIGH_GROUNDS) {
      // the central siege road between the camps' mouths
      for (const prop of props) assert.ok(!((prop.y ?? 0) === 0 && Math.abs(prop.z) < 84 && Math.abs(prop.x) - reachOf(prop) < 8.5), `${prop.id} on the siege road`);
    }
    if (id === WORLD_IDS.OUTERWORKS) {
      // the ballista's way out of its emplacement and up the esplanade, and the road through breach and bailey
      for (const prop of props) {
        if ((prop.y ?? 0) !== 0) continue;
        const reach = reachOf(prop);
        assert.ok(!(prop.z > -50 && prop.z < -14 && prop.x + reach > -11.5 && prop.x - reach < 4.6), `${prop.id} in the ballista's corridor`);
        assert.ok(!(prop.z > -42 && prop.z < 46 && Math.abs(prop.x) - reach < 4.6), `${prop.id} on the central road`);
      }
    }
  });

  test(`${world.name}: the furnishings cut none of the bots' routes`, () => {
    const ids = new Set(props.map((prop) => prop.id));
    const nodes = world.navigation?.nodes ?? [];
    const bare = navGraph({ ...world, solids: world.solids.filter((solid) => !ids.has(solid.id)), navigation: { nodes } }, NAV);
    const dressed = navGraph({ ...world, navigation: { nodes } }, NAV);
    const lost = [];
    bare.links.forEach((links, from) => links.forEach(({ to }) => {
      if (to > from && !dressed.links[from].some((link) => link.to === to)) lost.push(`${nodes[from].id} -> ${nodes[to].id}`);
    }));
    assert.deepEqual(lost, []);
  });
}
