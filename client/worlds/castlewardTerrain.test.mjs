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

test('overlapping floors never draw the same ground twice: the later one leaves the shared strip out', async () => {
  const { subtractRects } = await import('./kit/rects.mjs');
  const area = (rects) => rects.reduce((sum, r) => sum + (r.xb - r.xa) * (r.zb - r.za), 0);
  // a cover across one side, one in a corner, one through the middle, and none at all
  assert.equal(area(subtractRects({ xa: 0, xb: 2, za: 0, zb: 2 }, [{ minX: 1, maxX: 5, minZ: -1, maxZ: 5 }])), 2);
  assert.equal(area(subtractRects({ xa: 0, xb: 2, za: 0, zb: 2 }, [{ minX: 1, maxX: 5, minZ: 1, maxZ: 5 }])), 3);
  const holed = subtractRects({ xa: 0, xb: 3, za: 0, zb: 3 }, [{ minX: 1, maxX: 2, minZ: 1, maxZ: 2 }]);
  assert.equal(area(holed), 8);
  assert.equal(holed.length, 4);
  assert.deepEqual(subtractRects({ xa: 0, xb: 1, za: 0, zb: 1 }, [{ minX: 5, maxX: 6, minZ: 5, maxZ: 6 }]), [{ xa: 0, xb: 1, za: 0, zb: 1 }]);
  assert.deepEqual(subtractRects({ xa: 0, xb: 1, za: 0, zb: 1 }, [{ minX: -1, maxX: 2, minZ: -1, maxZ: 2 }]), []);
  // Castleward's own floors do overlap at the same height (so the routes run straight), which is why this matters
  const level = CASTLEWARD.floors.filter((floor) => floor.y === 0);
  const rect = (f) => ({ minX: f.center[0] - f.size[0] / 2, maxX: f.center[0] + f.size[0] / 2, minZ: f.center[2] - f.size[2] / 2, maxZ: f.center[2] + f.size[2] / 2 });
  const overlapping = level.some((a, i) => level.slice(i + 1).some((b) => {
    const [ra, rb] = [rect(a), rect(b)];
    return Math.min(ra.maxX, rb.maxX) > Math.max(ra.minX, rb.minX) && Math.min(ra.maxZ, rb.maxZ) > Math.max(ra.minZ, rb.minZ);
  }));
  assert.ok(overlapping);
});
