import test from 'node:test';
import assert from 'node:assert/strict';
import { CLOTH_GRID_SPECS, clothNode, createClothGrid, impulseClothGrid, stepClothGrid } from './clothGrid.mjs';

// a cape hanging from shoulders at the given point: three columns 0.12 m apart, four rows of 0.28 m, behind him (+z)
function drape([x, y, z] = [0, 1.64, 0]) {
  return [-0.12, 0, 0.12].map((dx) => Array.from({ length: 5 }, (_, r) => [x + dx, y - 0.28 * r, z + 0.24]));
}
const cape = CLOTH_GRID_SPECS.cape;
const run = (grid, seconds, frameAt, dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) stepClothGrid(grid, dt, frameAt(t));
  return grid;
};
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test('standing still, the cloth stays on its drape', () => {
  const grid = run(createClothGrid(cape, drape()), 3, () => ({ targets: drape(), colliders: [], ground: 0 }));
  for (let c = 0; c < 3; c += 1) for (let r = 0; r <= 4; r += 1) {
    assert.ok(dist(clothNode(grid, c, r), drape()[c][r]) < 0.03, `node ${c},${r} off its drape`);
  }
});

test('running, the hem trails behind him and stays there at a steady pace; stopping, it swings past and settles', () => {
  const speed = 6;
  const at = (t) => [0, 1.64, -speed * t];   // running toward -z
  const grid = createClothGrid(cape, drape(at(0)));
  run(grid, 2, (t) => ({ targets: drape(at(t)), colliders: [], ground: 0 }));
  const hem = clothNode(grid, 1, 4);
  const pinned = clothNode(grid, 1, 0);
  assert.ok(hem[2] - pinned[2] > 0.34, `hem should trail behind (+z), got ${(hem[2] - pinned[2]).toFixed(3)}`);
  // every column stays the length it is: cloth does not stretch
  for (let c = 0; c < 3; c += 1) for (let r = 1; r <= 4; r += 1) {
    assert.ok(Math.abs(dist(clothNode(grid, c, r), clothNode(grid, c, r - 1)) - 0.28) < 0.02);
  }
  const stopAt = at(2);
  run(grid, 0.25, () => ({ targets: drape(stopAt), colliders: [], ground: 0 }));
  assert.ok(clothNode(grid, 1, 4)[2] - stopAt[2] < 0.3, 'on the stop the hem swings forward');
  run(grid, 4, () => ({ targets: drape(stopAt), colliders: [], ground: 0 }));
  assert.ok(dist(clothNode(grid, 1, 4), drape(stopAt)[1][4]) < 0.04, 'and settles back on its drape');
});

test('a body in the way pushes the cloth out of it', () => {
  // a thigh swung back into the cape: across him, 6 cm in front of where the cape hangs
  const thigh = { a: [-0.3, 0.7, 0.18], b: [0.3, 0.7, 0.18], radius: 0.13 };
  const grid = run(createClothGrid(cape, drape()), 1, () => ({ targets: drape(), colliders: [thigh], ground: 0 }));
  for (let c = 0; c < 3; c += 1) for (let r = 1; r <= 4; r += 1) {
    const p = clothNode(grid, c, r);
    const d = Math.hypot(p[1] - 0.7, p[2] - 0.18);
    assert.ok(d >= 0.13 - 0.01, `node ${c},${r} inside the leg (${d.toFixed(3)})`);
  }
});

test('the cloth never goes through the ground, and a teleport puts it straight back on its drape', () => {
  const low = (t) => drape([0, 0.5, 0]);
  const grid = run(createClothGrid(cape, low(0)), 2, (t) => ({ targets: low(t), colliders: [], ground: 0 }));
  for (let c = 0; c < 3; c += 1) for (let r = 0; r <= 4; r += 1) assert.ok(clothNode(grid, c, r)[1] >= -1e-9);
  stepClothGrid(grid, 1 / 60, { targets: drape([30, 1.64, 0]), colliders: [], ground: 0 });
  assert.ok(dist(clothNode(grid, 1, 4), drape([30, 1.64, 0])[1][4]) < 1e-9);
});

test('a gust flings the hem the way it blows, more than the top, and a long or broken frame stays finite', () => {
  const grid = createClothGrid(cape, drape());
  impulseClothGrid(grid, [4, 0, 0]);
  run(grid, 0.15, () => ({ targets: drape(), colliders: [], ground: 0 }));
  const hem = clothNode(grid, 1, 4)[0];
  const upper = clothNode(grid, 1, 1)[0];
  assert.ok(hem > upper && hem > 0.05, `hem ${hem.toFixed(3)} should fly further than row 1 ${upper.toFixed(3)}`);
  stepClothGrid(grid, 0.5, { targets: drape(), colliders: [], ground: 0 });
  assert.ok(grid.x.every((p) => p.every(Number.isFinite)));
});
