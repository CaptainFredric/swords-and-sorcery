import test from 'node:test';
import assert from 'node:assert/strict';
import { chunkOf, splitAt } from './tourChunks.mjs';

test('a knight falls into whole pieces of armour, whatever bones move them (and as the glTF loader names them)', () => {
  // the bones of one piece fall together
  assert.equal(chunkOf('head'), 'helm');
  assert.equal(chunkOf('neck'), 'helm');
  for (const bone of ['chest', 'spine', 'clavicle.L', 'clavicleR']) assert.equal(chunkOf(bone), 'cuirass');
  assert.equal(chunkOf('forearm.L'), 'forearmL');
  assert.equal(chunkOf('handL'), 'forearmL');
  assert.equal(chunkOf('socket_sword'), 'forearmR');
  // each side its own
  assert.equal(chunkOf('upper_arm.R'), 'armR');
  assert.equal(chunkOf('upper_armL'), 'armL');
  assert.equal(chunkOf('pauldron.R'), 'pauldronR');
  assert.equal(chunkOf('thigh.L'), 'thighL');
  assert.equal(chunkOf('shinR'), 'greaveR');
  assert.equal(chunkOf('foot.L'), 'bootL');
  // the cloth whole, however many bones it hangs on
  for (const bone of ['cape.C.1', 'capeL4', 'capeR2']) assert.equal(chunkOf(bone), 'cape');
  for (const bone of ['tabard.L.1', 'tabardR3', 'tabard_root', 'tabard_front_01']) assert.equal(chunkOf(bone), 'tabard');
  assert.equal(chunkOf('pelvis'), 'hips');
});

test('a triangle across a cut splits along it: what is below and above it, with nothing lost or overlapping', () => {
  const corner = (x, y) => ({ p: [x, y, 0], uv: [x, y], c: null, a: y });
  const area = (triangles) => triangles.reduce((sum, [a, b, c]) => sum + Math.abs((b.p[0] - a.p[0]) * (c.p[1] - a.p[1]) - (c.p[0] - a.p[0]) * (b.p[1] - a.p[1])) / 2, 0);
  const triangle = [corner(0, 0), corner(1, 0), corner(0, 1)];
  const [below, above] = splitAt(triangle, 0.5);
  assert.ok(Math.abs(area(below) + area(above) - 0.5) < 1e-9, 'the halves make the whole');
  assert.ok(Math.abs(area(above) - 0.125) < 1e-9, 'the tip above the cut is the small triangle there');
  for (const t of below) for (const c of t) assert.ok(c.a <= 0.5 + 1e-9);
  for (const t of above) for (const c of t) assert.ok(c.a >= 0.5 - 1e-9);
  // the new corners carry their attributes along the cut
  const onCut = below.flat().filter((c) => Math.abs(c.a - 0.5) < 1e-9);
  assert.ok(onCut.length >= 2 && onCut.every((c) => Math.abs(c.uv[1] - 0.5) < 1e-9));
  // wholly on one side, it is kept whole
  assert.deepEqual(splitAt(triangle, 2).map((side) => side.length), [1, 0]);
  assert.deepEqual(splitAt(triangle, -1).map((side) => side.length), [0, 1]);
});
