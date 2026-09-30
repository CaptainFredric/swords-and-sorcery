import test from 'node:test';
import assert from 'node:assert/strict';
import { BLADE_CLEARANCE, bladeInside, nextRetraction } from './bladeClearance.mjs';

const wall = { center: [0, 1.5, -1], size: [4, 3, 0.4] };   // its near face at z -0.8
const grip = { x: 0, y: 1.2, z: -0.3 };
const forward = { x: 0, y: 0, z: -1 };

test('how much of the blade lies inside a wall: from its first entry to the point', () => {
  const inside = bladeInside(grip, { x: 0, y: 1.2, z: -1.3 }, [wall], 0);
  assert.ok(Math.abs(inside - 0.5) < 1e-9, `${inside}`);
  assert.equal(bladeInside(grip, { x: 0, y: 1.2, z: -0.7 }, [wall], 0), 0, 'short of it: clear');
  assert.equal(bladeInside(grip, { x: 0, y: 1.2, z: -1.3 }, [{ ...wall, blade: false }], 0), 0, 'cloth is no wall');
});

test('the arms draw back quickly by as much as the blade would sink, up to a limit, and ease out slowly', () => {
  const args = { grip, axis: forward, reach: 1, solids: [wall] };
  let r = 0;
  for (let i = 0; i < 10; i += 1) r = nextRetraction({ ...args, current: r, dt: 1 / 60 });
  assert.ok(Math.abs(r - BLADE_CLEARANCE.maxRetract) < 1e-9, 'fully drawn back within a few frames');
  const eased = nextRetraction({ ...args, solids: [], current: r, dt: 1 / 60 });
  assert.ok(eased < r && eased > r - 0.2, 'and out again gently once clear');
});
