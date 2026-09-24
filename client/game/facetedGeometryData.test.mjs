import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bladeData,
  geometryBounds,
  taperedPrismData,
  validateGeometryData,
  wedgeData,
} from './facetedGeometryData.mjs';

function assertValid(data) {
  assert.ok(data.positions.length >= 9);
  assert.equal(data.positions.length % 3, 0);
  assert.equal(data.indices.length % 3, 0);
  assert.ok(data.positions.every(Number.isFinite));
  assert.ok(data.indices.every(Number.isInteger));
  const vertexCount = data.positions.length / 3;
  assert.ok(data.indices.every((index) => index >= 0 && index < vertexCount));
  assert.doesNotThrow(() => validateGeometryData(data));
}

test('tapered prism narrows from shoulder/chest side toward waist', () => {
  const data = taperedPrismData({
    height: 0.6,
    topWidth: 0.82,
    bottomWidth: 0.55,
    topDepth: 0.46,
    bottomDepth: 0.38,
  });
  assertValid(data);
  const bounds = geometryBounds(data);
  assert.ok(Math.abs(bounds.size.y - 0.6) < 1e-9);
  assert.ok(Math.abs(bounds.size.x - 0.82) < 1e-9);
  assert.ok(Math.abs(bounds.size.z - 0.46) < 1e-9);
});

test('wedge produces a finite sloped low-poly plate', () => {
  const data = wedgeData({ width: 0.48, height: 0.24, depth: 0.44, slope: 0.4 });
  assertValid(data);
  const bounds = geometryBounds(data);
  assert.ok(Math.abs(bounds.size.x - 0.48) < 1e-9);
  assert.ok(Math.abs(bounds.size.y - 0.24) < 1e-9);
  assert.ok(Math.abs(bounds.size.z - 0.44) < 1e-9);
});

test('blade profile is broad, thin and ends at requested length', () => {
  const data = bladeData({ length: 1.3, width: 0.24, thickness: 0.085, tipLength: 0.28 });
  assertValid(data);
  const bounds = geometryBounds(data);
  assert.ok(Math.abs(bounds.size.y - 1.3) < 1e-9);
  assert.ok(Math.abs(bounds.size.x - 0.24) < 1e-9);
  assert.ok(Math.abs(bounds.size.z - 0.085) < 1e-9);
  assert.ok(bounds.size.x > bounds.size.z * 2);
});

test('geometry validation rejects invalid indices and degenerate triangles', () => {
  assert.throws(
    () => validateGeometryData({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 3] }),
    /index/i,
  );
  assert.throws(
    () => validateGeometryData({ positions: [0, 0, 0, 1, 0, 0, 2, 0, 0], indices: [0, 1, 2] }),
    /degenerate/i,
  );
});

test('geometry builders reject zero, non-finite and impossible dimensions', () => {
  assert.throws(() => taperedPrismData({ height: 0, topWidth: 1, bottomWidth: 1, topDepth: 1, bottomDepth: 1 }));
  assert.throws(() => wedgeData({ width: 1, height: 1, depth: 1, slope: 1.2 }));
  assert.throws(() => bladeData({ length: Infinity, width: 1, thickness: 0.1, tipLength: 0.2 }));
  assert.throws(() => bladeData({ length: 1, width: 1, thickness: 0.1, tipLength: 1.1 }));
});
