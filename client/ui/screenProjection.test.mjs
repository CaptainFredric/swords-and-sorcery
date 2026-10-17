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

/**
 * Creates a Three.js-compatible PerspectiveCamera mock implementing
 * matrixWorldInverse and projectionMatrix according to Three.js Euler YXZ order.
 */
function createThreePerspectiveCamera({ x = 0, y = 1.7, z = 0, yaw = 0, pitch = 0, fov = 78, aspect = 16 / 9, near = 0.1, far = 1000 } = {}) {
  const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
  const cosP = Math.cos(pitch), sinP = Math.sin(pitch);

  // Three.js inverse view matrix (camera world to view space):
  // R_x(-pitch) * R_y(-yaw) * T(-pos)
  // Column-major order:
  const matrixWorldInverse = {
    elements: new Float32Array([
      cosY, 0, sinY, 0,
      sinP * sinY, cosP, -sinP * cosY, 0,
      -cosP * sinY, sinP, cosP * cosY, 0,
      -(x * cosY - z * sinY), -y, -(x * sinY + z * cosY), 1
    ]),
  };

  const f = 1 / Math.tan((fov * Math.PI / 180) / 2);
  const projectionMatrix = {
    elements: new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, -(far + near) / (far - near), -1,
      0, 0, -2 * far * near / (far - near), 0
    ]),
  };

  return {
    isCamera: true,
    position: { x, y, z },
    rotation: { x: pitch, y: yaw, z: 0, order: 'YXZ' },
    fov,
    aspect,
    matrixWorldInverse,
    projectionMatrix,
    updateMatrixWorld() {},
  };
}

class MockVector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  clone() { return new MockVector3(this.x, this.y, this.z); }
  applyMatrix4(m) {
    const e = m.elements;
    const x = this.x, y = this.y, z = this.z;
    const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
    this.x = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
    this.y = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
    this.z = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
    return this;
  }
  project(camera) {
    return this.applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
  }
}

const mockTHREE = { Vector3: MockVector3 };

test('projectToScreen returns on-screen position for targets directly in camera FOV (yaw=0)', () => {
  const camera = createCamera({ x: 0, y: 1.7, z: 0, yaw: 0 }); // Facing -Z
  const target = { x: 0, y: 1.7, z: -10 }; // Straight ahead 10m
  const res = projectToScreen(target, camera);

  assert.ok(res !== null);
  assert.equal(res.clamped, false);
  assert.equal(res.isBehind, false);
  assert.ok(Math.abs(res.x - 0.5) < 0.05);
  assert.ok(Math.abs(res.y - 0.5) < 0.05);
});

test('projectToScreen correctly projects when camera turns 90° left (yaw=+PI/2, facing -X)', () => {
  const yaw = Math.PI / 2; // Facing -X
  const camera = createCamera({ x: 0, y: 1.7, z: 0, yaw });

  // Object directly in front of camera (down -X):
  const targetFront = { x: -10, y: 1.7, z: 0 };
  const resFront = projectToScreen(targetFront, camera);
  assert.ok(resFront !== null);
  assert.equal(resFront.clamped, false, 'Should be on-screen');
  assert.equal(resFront.isBehind, false, 'Should NOT be classified as behind');
  assert.ok(Math.abs(resFront.x - 0.5) < 0.05, `Expected x ~ 0.5, got ${resFront.x}`);
  assert.ok(Math.abs(resFront.y - 0.5) < 0.05, `Expected y ~ 0.5, got ${resFront.y}`);

  // Object behind camera (down +X):
  const targetBehind = { x: 10, y: 1.7, z: 0 };
  const resBehind = projectToScreen(targetBehind, camera);
  assert.ok(resBehind !== null);
  assert.equal(resBehind.clamped, true, 'Should be clamped');
  assert.equal(resBehind.isBehind, true, 'Should be classified as behind');
});

test('projectToScreen correctly projects when camera turns 90° right (yaw=-PI/2, facing +X)', () => {
  const yaw = -Math.PI / 2; // Facing +X
  const camera = createCamera({ x: 0, y: 1.7, z: 0, yaw });

  // Object directly in front of camera (down +X):
  const targetFront = { x: 10, y: 1.7, z: 0 };
  const resFront = projectToScreen(targetFront, camera);
  assert.ok(resFront !== null);
  assert.equal(resFront.clamped, false);
  assert.equal(resFront.isBehind, false);
  assert.ok(Math.abs(resFront.x - 0.5) < 0.05);

  // Object behind camera (down -X):
  const targetBehind = { x: -10, y: 1.7, z: 0 };
  const resBehind = projectToScreen(targetBehind, camera);
  assert.ok(resBehind !== null);
  assert.equal(resBehind.clamped, true);
  assert.equal(resBehind.isBehind, true);
});

test('projectToScreen correctly projects when camera turns 180° (yaw=PI, facing +Z)', () => {
  const yaw = Math.PI; // Facing +Z
  const camera = createCamera({ x: 0, y: 1.7, z: 0, yaw });

  // Object directly in front of camera (down +Z):
  const targetFront = { x: 0, y: 1.7, z: 10 };
  const resFront = projectToScreen(targetFront, camera);
  assert.ok(resFront !== null);
  assert.equal(resFront.clamped, false);
  assert.equal(resFront.isBehind, false);
  assert.ok(Math.abs(resFront.x - 0.5) < 0.05);

  // Object behind camera (down -Z):
  const targetBehind = { x: 0, y: 1.7, z: -10 };
  const resBehind = projectToScreen(targetBehind, camera);
  assert.ok(resBehind !== null);
  assert.equal(resBehind.clamped, true);
  assert.equal(resBehind.isBehind, true);
});

test('projectToScreen uses Three.js PerspectiveCamera matrix projection when available', () => {
  // Test Three.js camera turned 90° left
  const yaw = Math.PI / 2;
  const threeCam = createThreePerspectiveCamera({ x: 0, y: 1.7, z: 0, yaw });

  // Target directly ahead at (-12, 1.7, 0)
  const targetFront = { x: -12, y: 1.7, z: 0 };
  const res = projectToScreen(targetFront, threeCam, { THREE: mockTHREE });

  assert.ok(res !== null);
  assert.equal(res.clamped, false, 'Three.js projection should place target on-screen');
  assert.equal(res.isBehind, false, 'Target in view should not be behind');
  assert.ok(Math.abs(res.x - 0.5) < 0.05, `Expected x ~ 0.5, got ${res.x}`);
  assert.ok(Math.abs(res.y - 0.5) < 0.05, `Expected y ~ 0.5, got ${res.y}`);

  // Target behind camera at (+15, 1.7, 0)
  const targetBehind = { x: 15, y: 1.7, z: 0 };
  const resBehind = projectToScreen(targetBehind, threeCam, { THREE: mockTHREE });
  assert.ok(resBehind !== null);
  assert.equal(resBehind.clamped, true);
  assert.equal(resBehind.isBehind, true);
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
