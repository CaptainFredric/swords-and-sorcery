import test from 'node:test';
import assert from 'node:assert/strict';
import { CLOTH_COLLIDERS, CLOTH_GRID_SPECS, TWIST_FULL, clothNode, clothSegmentTurn, createClothGrid, impulseClothGrid, loadedBoneName, stepClothGrid } from './clothGrid.mjs';

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

test('cloth bones are looked up by the names the glTF loader gives them (dots dropped)', () => {
  assert.equal(loadedBoneName('cape.C.1'), 'capeC1');
  assert.equal(loadedBoneName('thigh.L'), 'thighL');
  assert.equal(loadedBoneName('tabard_root'), 'tabard_root');
  assert.equal(loadedBoneName('a b[c]:d/e'), 'a_bcde');
  // every grid bone and collider joint has a distinct loaded name
  const names = [];
  for (const spec of Object.values(CLOTH_GRID_SPECS)) {
    for (const column of spec.columns) for (let r = 1; r <= spec.rows; r += 1) names.push(`${spec.prefix}.${column}.${r}`);
  }
  for (const c of Object.values(CLOTH_COLLIDERS)) names.push(c.from, c.to);
  const loaded = new Set(names.map(loadedBoneName));
  assert.equal(loaded.size, new Set(names).size);
});

// --- the cloth on its own side of him, carried by part of his motion -----------------------------------------------

// a body facing -z at [x, 0, z], turned by yaw about +y: the cape's drape behind him (+z), his up +y
const turnY = (yaw) => [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
const rotY = ([x, y, z], yaw) => [x * Math.cos(yaw) + z * Math.sin(yaw), y, -x * Math.sin(yaw) + z * Math.cos(yaw)];
function bodyFrame([x, , z], yaw = 0) {
  const at = (p) => { const q = rotY(p, yaw); return [q[0] + x, q[1], q[2] + z]; };
  return {
    targets: drape([0, 1.64, 0]).map((column) => column.map(at)),
    body: { position: [x, 0, z], quaternion: turnY(yaw) },
    outward: rotY([0, 0, 1], yaw),
    up: [0, 1, 0],
    colliders: [],
    ground: 0,
  };
}
const nearest = (grid, frame) => {
  // how far each node has come toward his body from its own drape point, beyond its reach (m; > 0 is too near)
  let worst = -Infinity;
  for (let c = 0; c < 3; c += 1) for (let r = 1; r <= 4; r += 1) {
    const p = clothNode(grid, c, r);
    const toward = -((p[0] - frame.targets[c][r][0]) * frame.outward[0] + (p[1] - frame.targets[c][r][1]) * frame.outward[1] + (p[2] - frame.targets[c][r][2]) * frame.outward[2]);
    worst = Math.max(worst, toward - cape.reach[r]);
  }
  return worst;
};

test('carried with him, a steady run still trails the cape fully (the air is the world\'s)', () => {
  const at = (t) => bodyFrame([0, 0, -6 * t]);
  const grid = createClothGrid(cape, at(0).targets);
  run(grid, 2, at);
  const trail = clothNode(grid, 1, 4)[2] - clothNode(grid, 1, 0)[2];
  assert.ok(trail > 0.3, `hem should trail behind, got ${trail.toFixed(3)}`);
});

test('on a hard stop the cape swings forward against him but never comes through him', () => {
  let z = 0;
  const grid = createClothGrid(cape, bodyFrame([0, 0, 0]).targets);
  let worst = -Infinity;
  for (let t = 0; t < 3; t += 1 / 60) {
    if (t < 1.5) z -= 8 / 60;   // a sprint, then stopped dead
    const frame = bodyFrame([0, 0, z]);
    stepClothGrid(grid, 1 / 60, frame);
    if (t > 1.5) worst = Math.max(worst, nearest(grid, frame));
  }
  assert.ok(worst < 0.005, `the cape came ${(worst * 100).toFixed(1)} cm past its reach`);
});

test('a half turn in a fifth of a second carries the cape round with him, never through him, and it settles', () => {
  const grid = createClothGrid(cape, bodyFrame([0, 0, 0]).targets);
  let worst = -Infinity;
  for (let t = 0; t < 3; t += 1 / 60) {
    const yaw = Math.PI * Math.max(0, Math.min(1, (t - 0.5) / 0.2));
    const frame = bodyFrame([0, 0, 0], yaw);
    stepClothGrid(grid, 1 / 60, frame);
    worst = Math.max(worst, nearest(grid, frame));
  }
  assert.ok(worst < 0.005, `the cape came ${(worst * 100).toFixed(1)} cm past its reach`);
  const end = bodyFrame([0, 0, 0], Math.PI);
  assert.ok(dist(clothNode(grid, 1, 4), end.targets[1][4]) < 0.05, 'and hangs behind him again');
});

test('flung upward, the cape rises no higher than where it hangs from (it never flips over his head)', () => {
  const grid = createClothGrid(cape, bodyFrame([0, 0, 0]).targets);
  impulseClothGrid(grid, [0, 30, -10]);
  let highest = -Infinity;
  for (let t = 0; t < 1; t += 1 / 60) {
    const frame = bodyFrame([0, 0, 0]);
    stepClothGrid(grid, 1 / 60, frame);
    for (let c = 0; c < 3; c += 1) for (let r = 1; r <= 4; r += 1) highest = Math.max(highest, clothNode(grid, c, r)[1] - frame.targets[c][0][1]);
  }
  assert.ok(highest <= cape.rise + 0.005, `a node rose ${highest.toFixed(3)} m above where it hangs from`);
});

test('a leg swung into the cloth\'s edge, beyond its outer column, pushes the cloth away', () => {
  // a shin-thick capsule well out past the right column (it never reaches the column itself), but inside the cloth's
  // span, moving back into it
  const grid = createClothGrid(cape, drape());
  const leg = (z) => ({ a: [0.3, 0.4, z], b: [0.3, 1.0, z], radius: 0.11 });
  for (let t = 0; t < 0.6; t += 1 / 60) stepClothGrid(grid, 1 / 60, { targets: drape(), colliders: [leg(0.1 + 0.25 * t)], ground: 0 });
  const p = clothNode(grid, 2, 3);
  assert.ok(p[2] > 0.24 + 0.02, `the right column should be pushed back by the leg at its edge, z ${p[2].toFixed(3)}`);
});

// --- the cloth's own thickness and its side of a limb ----------------------------------------------------------------

const axisGap = (p, capsule) => {
  const ab = capsule.b.map((x, k) => x - capsule.a[k]);
  const t = Math.max(0, Math.min(1, ab.reduce((s, x, k) => s + (p[k] - capsule.a[k]) * x, 0) / ab.reduce((s, x) => s + x * x, 0)));
  return dist(p, capsule.a.map((x, k) => x + ab[k] * t));
};

test('a leg swung back into the cape lifts it clear by its lining too: the inner face never enters the leg', () => {
  // the cape behind him (+z); a thigh behind his hips swung back into its lower half
  const grid = createClothGrid(cape, drape());
  const thigh = (z) => ({ a: [-0.1, 1.0, z], b: [-0.1, 0.5, z + 0.1], radius: 0.13 });
  let worst = Infinity;
  for (let t = 0; t < 1; t += 1 / 60) {
    const leg = thigh(Math.min(0.12, 0.25 * t));
    stepClothGrid(grid, 1 / 60, { targets: drape(), colliders: [leg], ground: 0, outward: [0, 0, 1], up: [0, 1, 0] });
    for (let c = 0; c < 3; c += 1) for (let r = 1; r <= 4; r += 1) {
      const p = clothNode(grid, c, r);
      worst = Math.min(worst, axisGap([p[0], p[1], p[2] - cape.thickness], leg) - leg.radius);
    }
  }
  assert.ok(worst > -0.01, `the cape's inner face went ${(-worst * 100).toFixed(1)} cm into the leg`);
});

test('cloth caught at the edge of a leg leaves it over the leg\'s front (its own side), not squeezed out sideways', () => {
  // the tabard in front of him (-z); a leg grazing its right column from the side, its axis level with the cloth
  const tabard = CLOTH_GRID_SPECS.tabard;
  const hang = () => [-0.065, 0.065].map((x) => Array.from({ length: 4 }, (_, r) => [x, 1.05 - 0.18 * r, -0.2]));
  const grid = createClothGrid(tabard, hang());
  const leg = { a: [0.185, 0.9, -0.2], b: [0.185, 0.4, -0.2], radius: 0.13 };
  stepClothGrid(grid, 1 / 60, { targets: hang(), colliders: [leg], ground: 0, outward: [0, 0, -1], up: [0, 1, 0] });
  const p = clothNode(grid, 1, 2);
  assert.ok(p[2] < -0.2 - 0.03, `the cloth should go out over the leg (forward), z ${p[2].toFixed(3)}`);
  assert.ok(axisGap(p, leg) >= leg.radius - 0.005, 'and be clear of it');
});

test('a segment\'s turn carries the drape onto the cloth: straight down it is no turn; twisted, it follows the width', () => {
  const grid = createClothGrid(cape, drape());
  assert.ok(Math.abs(clothSegmentTurn(grid, 0, 2)[3]) > 1 - 1e-9, 'on its drape the cloth is not turned');
  // the right column swung 0.12 m back: the cloth's width turns about the left column's length
  for (let r = 1; r <= 4; r += 1) grid.x[2 * 5 + r][2] += 0.12 * r / 4;
  for (let r = 0; r <= 4; r += 1) grid.x[1 * 5 + r][2] += 0.06 * r / 4;
  const q = clothSegmentTurn(grid, 1, 4);
  const angle = 2 * Math.acos(Math.min(1, Math.abs(q[3])));
  assert.ok(angle > 0.1 && angle <= TWIST_FULL + 0.2, `the middle column turns with its width (${angle.toFixed(2)} rad)`);
});
