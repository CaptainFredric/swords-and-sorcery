import test from 'node:test';
import assert from 'node:assert/strict';
import { projectToScreen } from './screenProjection.mjs';

function createCamera({ x = 0, y = 1.7, z = 0, yaw = 0, pitch = 0, fov = 78, aspect = 16 / 9 } = {}) {
  return {
    position: { x, y, z },
    yaw,
    pitch,
    fov,
    aspect,
  };
}

test('projectToScreen returns on-screen position for targets directly in camera FOV', () => {
  const camera = createCamera({ x: 0, y: 1.7, z: 0, yaw: 0 }); // Facing -Z
  const target = { x: 0, y: 1.7, z: -10 }; // Straight ahead 10m
  const res = projectToScreen(target, camera);

  assert.ok(res !== null);
  assert.equal(res.clamped, false);
  assert.equal(res.isBehind, false);
  assert.ok(Math.abs(res.x - 0.5) < 0.05);
  assert.ok(Math.abs(res.y - 0.5) < 0.05);
});

test('projectToScreen clamps to right edge when target is off-screen to the right', () => {
  const camera = createCamera({ x: 0, y: 1.7, z: 0, yaw: 0 }); // Facing -Z
  const target = { x: 50, y: 1.7, z: -5 }; // Far right
  const res = projectToScreen(target, camera);

  assert.ok(res !== null);
  assert.equal(res.clamped, true);
  assert.equal(res.isBehind, false);
  assert.equal(res.x, 0.92); // clamped at maxX
  assert.ok(Math.abs(res.angle) < 45, 'angle points toward right');
});

test('projectToScreen clamps to screen edge and flags isBehind when target is behind camera', () => {
  const camera = createCamera({ x: 0, y: 1.7, z: 0, yaw: 0 }); // Facing -Z
  const target = { x: 0, y: 1.7, z: 20 }; // Directly behind (+Z)
  const res = projectToScreen(target, camera);

  assert.ok(res !== null);
  assert.equal(res.clamped, true);
  assert.equal(res.isBehind, true);
  assert.equal(res.y, 0.78); // Clamped at bottom edge
  assert.ok(res.angle > 45 && res.angle < 135, 'angle points downward/behind');
});

test('projectToScreen handles null or missing arguments gracefully', () => {
  assert.equal(projectToScreen(null, null), null);
  assert.equal(projectToScreen({ x: 0, z: 0 }, null), null);
});
