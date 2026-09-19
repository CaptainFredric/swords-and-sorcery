import test from 'node:test';
import assert from 'node:assert/strict';
import { CASTLEWARD } from '../../shared/worlds/castleward.mjs';
import { buildCastlewardTerrainSkirts } from './castlewardTerrain.mjs';

test('every authoritative Castleward floor has a visual terrain skirt so edges do not expose sky immediately underneath', () => {
  const skirts = buildCastlewardTerrainSkirts(CASTLEWARD);
  assert.equal(skirts.length, CASTLEWARD.floors.length);
  const ids = new Set(skirts.map((item) => item.floorId));
  for (const floor of CASTLEWARD.floors) assert.ok(ids.has(floor.id), `missing terrain skirt for ${floor.id}`);
});

test('terrain skirts start below the playable surface and descend near the lethal fall plane', () => {
  const skirts = buildCastlewardTerrainSkirts(CASTLEWARD);
  for (const skirt of skirts) {
    assert.ok(skirt.topY <= skirt.floorY + 0.001, `${skirt.floorId} skirt rises above its floor`);
    assert.ok(skirt.bottomY <= CASTLEWARD.abyssY + 1.5, `${skirt.floorId} leaves a large sky-colored void below its edge`);
    assert.ok(skirt.size[1] > 4, `${skirt.floorId} skirt is too shallow to read as terrain mass`);
  }
});

test('terrain skirts do not expand horizontally into non-authoritative walkable-looking land', () => {
  const skirts = buildCastlewardTerrainSkirts(CASTLEWARD);
  for (const skirt of skirts) {
    const floor = CASTLEWARD.floors.find((item) => item.id === skirt.floorId);
    assert.deepEqual([skirt.size[0], skirt.size[2]], [floor.size[0], floor.size[2]]);
    assert.equal(skirt.center[0], floor.center[0]);
    assert.equal(skirt.center[2], floor.center[2]);
  }
});
