import assert from 'node:assert/strict';
import test from 'node:test';
import { effectGround } from './groundEffect.mjs';

test('ground effects follow a ramp in both directions and stay below an overhead deck', () => {
  const origin = { x: 0, y: 2.5, z: 0 };
  const world = {
    ramps: [{ axis: 'z', minX: -6, maxX: 6, minZ: -5, maxZ: 5, startY: 0, endY: 5 }],
    floors: [{ center: [0, 8, 0], size: [20, 1, 20], y: 8 }],
  };
  assert.equal(effectGround(world, origin, 0, 2), 3.5);
  assert.equal(effectGround(world, origin, 0, -2), 1.5);
  assert.equal(effectGround(world, origin, 8, 0), null);
});
