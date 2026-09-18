import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleTrailSegment } from './effectTrail.mjs';

function near(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} was not within ${epsilon} of ${expected}`);
}

test('trail emits by distance instead of once per snapshot', () => {
  const result = sampleTrailSegment(
    { x: 0, y: 0, z: 0 },
    { x: 0.55, y: 0, z: 0 },
    { spacing: 0.2, carry: 0 },
  );

  assert.equal(result.points.length, 2);
  near(result.points[0].x, 0.2);
  near(result.points[1].x, 0.4);
  near(result.carry, 0.15);
});

test('trail carry preserves consistent density across short updates', () => {
  let carry = 0;
  const points = [];
  let from = 0;

  for (let i = 0; i < 10; i += 1) {
    const to = from + 0.1;
    const result = sampleTrailSegment(
      { x: from, y: 0, z: 0 },
      { x: to, y: 0, z: 0 },
      { spacing: 0.2, carry },
    );
    points.push(...result.points);
    carry = result.carry;
    from = to;
  }

  assert.equal(points.length, 5);
  near(carry, 0);
  near(points.at(-1).x, 1);
});

test('trail caps particles per update while preserving the spacing remainder', () => {
  const result = sampleTrailSegment(
    { x: 0, y: 0, z: 0 },
    { x: 2.05, y: 0, z: 0 },
    { spacing: 0.2, carry: 0, maxSamples: 4 },
  );

  assert.equal(result.points.length, 4);
  near(result.carry, 0.05);
});

test('stationary projectiles do not create duplicate trail particles', () => {
  const result = sampleTrailSegment(
    { x: 2, y: 3, z: 4 },
    { x: 2, y: 3, z: 4 },
    { spacing: 0.2, carry: 0.07 },
  );

  assert.deepEqual(result.points, []);
  near(result.carry, 0.07);
});
