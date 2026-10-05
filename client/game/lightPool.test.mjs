import test from 'node:test';
import assert from 'node:assert/strict';
import { LightPool } from './lightPool.mjs';

// The fight's brief lights come from a fixed few (lightPool.mjs): the number of lights never changes.

function fakeLight() {
  return { intensity: 1, distance: 0, color: { set(c) { this.value = c; } }, position: { set(x, y, z) { Object.assign(this, { x, y, z }); }, copy(p) { Object.assign(this, p); } } };
}

test('flashes are lit from the pool and die away; the pool never grows or shrinks', () => {
  const made = [];
  const pool = new LightPool(3, () => { const l = fakeLight(); made.push(l); return l; });
  assert.equal(made.length, 3);
  assert.ok(made.every((l) => l.intensity === 0), 'dark until asked');
  const slot = pool.flash({ x: 1, y: 2, z: 3 }, 0xff0000, 10, 0.2, 4);
  assert.equal(slot.light.intensity, 10);
  assert.deepEqual([slot.light.position.x, slot.light.position.y, slot.light.position.z], [1, 2, 3]);
  pool.update(0.1);
  assert.ok(slot.light.intensity > 0 && slot.light.intensity < 10);
  pool.update(0.2);
  assert.equal(slot.light.intensity, 0, 'out, and free again');
  assert.equal(slot.flash, null);
  assert.equal(made.length, 3);
});

test('a held light is kept until released; with every light busy the faintest flash gives way, a held one never', () => {
  const pool = new LightPool(2, fakeLight);
  const held = pool.hold(0x00ff00, 5);
  assert.ok(held && held.held);
  const bright = pool.flash({ x: 0, y: 0, z: 0 }, 0xffffff, 20, 1, 3);
  // a third: the faintest flash gives way (here the only flash), never the held light
  pool.update(0.5);
  const next = pool.flash({ x: 9, y: 0, z: 0 }, 0xffffff, 5, 1, 3);
  assert.equal(next, bright);
  assert.ok(held.held);
  // nothing to spare for another held light: it goes unlit
  pool.hold(0x0000ff, 5);
  assert.equal(pool.hold(0x0000ff, 5), null);
  pool.release(held);
  assert.equal(held.light.intensity, 0);
  assert.ok(pool.hold(0x0000ff, 5));
});
