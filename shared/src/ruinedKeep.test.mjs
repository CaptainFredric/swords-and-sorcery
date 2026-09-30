import test from 'node:test';
import assert from 'node:assert/strict';
import { createMovementState, launchBody, movePlayer } from './movement.mjs';
import { surfaceHeightAt } from './collision.mjs';
import { galeRecoil } from './gale.mjs';
import { spellFor } from './spells.mjs';
import { POSTURES } from './body.mjs';
import { sweepBlade, aimFrame, bladeDirection } from './blade.mjs';
import { KEEP_GALLERY_Y, RUINED_KEEP } from '../worlds/ruinedKeep.mjs';
import { ARENAS, VOTE_OPTIONS } from './modes.mjs';

// The Ruined Keep's contract: its routes run, its levels are reached the way they are meant to be (the stair walked,
// the Gallery gained by a Gale and never by a jump, the Crawl crawled), and the only edge a knight can fall to his
// death from is the one meant for it.

const DT = 1 / 60;
const yawToward = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z));

// run a knight along waypoints (feet), steering at each in turn; where it ended
function run(start, points, { crouch = false, seconds = 12 } = {}) {
  let state = createMovementState(start);
  let target = 0;
  for (let i = 0; i < seconds / DT && target < points.length; i += 1) {
    const at = points[target];
    if (Math.hypot(at.x - state.position.x, at.z - state.position.z) < 0.35) { target += 1; continue; }
    state = movePlayer(state, { forward: 1, right: 0, jump: false, crouch, yaw: yawToward(state.position, at) }, DT, (i + 1) * DT, RUINED_KEEP);
    if (state.position.y < RUINED_KEEP.abyssY) break;
  }
  return { state, reached: target >= points.length };
}

test('the Ruined Keep is an arena: in the vote, and its own', () => {
  assert.ok(ARENAS.includes('ruined-keep'));
  assert.deepEqual(VOTE_OPTIONS.world, ARENAS);
  assert.ok(!ARENAS.includes('shattered-keep'), 'the old greybox is out of the rotation');
  assert.equal(RUINED_KEEP.name, 'The Ruined Keep');
});

test('compact, for one on one: no side longer than thirty metres, and no great empty floor', () => {
  const xs = RUINED_KEEP.floors.flatMap((f) => [f.center[0] - f.size[0] / 2, f.center[0] + f.size[0] / 2]);
  const zs = RUINED_KEEP.floors.flatMap((f) => [f.center[2] - f.size[2] / 2, f.center[2] + f.size[2] / 2]);
  assert.ok(Math.max(...xs) - Math.min(...xs) <= 30);
  assert.ok(Math.max(...zs) - Math.min(...zs) <= 30);
  // the biggest open square anywhere on the ground floor: nothing solid inside it
  const blockers = RUINED_KEEP.solids.filter((s) => s.center[1] - s.size[1] / 2 < 1.5 && s.center[1] + s.size[1] / 2 > 0.4);
  let biggest = 0;
  for (let x = -9; x <= 9; x += 0.5) {
    for (let z = -12.5; z <= 12.5; z += 0.5) {
      let half = 0.5;
      const clear = (h) => !blockers.some((s) => Math.abs(s.center[0] - x) < s.size[0] / 2 + h && Math.abs(s.center[2] - z) < s.size[2] / 2 + h)
        && x - h >= -9.2 && x + h <= 10.2 && z - h >= -13.3 && z + h <= 13.3;
      while (clear(half + 0.5)) half += 0.5;
      biggest = Math.max(biggest, half * 2);
    }
  }
  assert.ok(biggest >= 5, `room to circle (${biggest} m clear)`);
  assert.ok(biggest <= 9, `but no giant empty floor (${biggest} m clear)`);
});

test('the routes run: Ward to Hall through the gap, to the terrace through the Breach, up the stair to the Gallery', () => {
  const hall = run({ x: 0, y: 0, z: -5 }, [{ x: 0, z: 1.2 }, { x: -2, z: 8.5 }]);
  assert.ok(hall.reached && hall.state.grounded, 'into the hall');
  const terrace = run({ x: -4, y: 0, z: -5 }, [{ x: -9.4, z: -6.5 }, { x: -11.2, z: -6.5 }, { x: -11.2, z: -9.5 }, { x: -11.2, z: -3.2 }]);
  assert.ok(terrace.reached && terrace.state.position.y === 0, 'out onto the terrace and along it, safely');
  const gallery = run({ x: 6.5, y: 0, z: -1.5 }, [{ x: 9.25, z: -2.6 }, { x: 9.25, z: -9.2 }, { x: 11.8, z: -10.8 }, { x: 11.8, z: 10 }]);
  assert.ok(gallery.reached, 'up the stair and along the Gallery');
  assert.ok(Math.abs(gallery.state.position.y - KEEP_GALLERY_Y) < 0.01);
  const aisle = run({ x: 9.4, y: 0, z: -1 }, [{ x: 9.4, z: 1.2 }, { x: 9.6, z: 5.5 }, { x: 8, z: 9.5 }, { x: 0, z: 11.8 }]);
  assert.ok(aisle.reached && Math.abs(aisle.state.position.y - 0.6) < 0.01, 'by the side door and the east aisle up onto the dais');
});

test('the Crawl: too low to stand in, and a crouching knight goes through it', () => {
  const standing = run({ x: -8.5, y: 0, z: -1.5 }, [{ x: -8.5, z: 6 }], { seconds: 4 });
  assert.ok(standing.state.position.z < 1, `a standing knight is stopped at its mouth (z ${standing.state.position.z.toFixed(2)})`);
  const crouched = run({ x: -8.5, y: 0, z: -1.5 }, [{ x: -8.5, z: 6 }], { crouch: true, seconds: 8 });
  assert.ok(crouched.reached, `a crouching one comes out in the hall (z ${crouched.state.position.z.toFixed(2)})`);
  const roof = RUINED_KEEP.solids.find((s) => s.id === 'crawl-roof');
  const under = roof.center[1] - roof.size[1] / 2;
  assert.ok(under > POSTURES.crouched.height && under < POSTURES.standing.height);
});

test('the Gallery: no jump reaches it, and a Gale driven into the ground at its foot throws a knight up onto it', () => {
  const foot = { x: 9.4, y: 0, z: 1.5 };
  let state = createMovementState(foot);
  let highest = 0;
  for (let i = 0; i < 90; i += 1) {
    state = movePlayer(state, { forward: 1, right: 0, jump: i < 3, yaw: -Math.PI / 2 }, DT, (i + 1) * DT, RUINED_KEEP);
    highest = Math.max(highest, state.position.y);
  }
  assert.ok(state.position.y < 0.01, `a jump falls back (reached ${highest.toFixed(2)} m)`);
  // the gust aimed down and a little behind (the knight faces the Gallery: east)
  state = createMovementState(foot);
  const eye = { x: foot.x, y: foot.y + POSTURES.standing.eye, z: foot.z };
  const direction = { x: -0.35, y: -0.94, z: 0 };
  const recoil = galeRecoil(spellFor('gale'), eye, direction, RUINED_KEEP);
  assert.ok(recoil, 'the gust meets the ground');
  launchBody(state, recoil, recoil.maxUp);
  for (let i = 0; i < 120; i += 1) {
    state = movePlayer(state, { forward: 1, right: 0, jump: false, yaw: -Math.PI / 2 }, DT, (i + 1) * DT, RUINED_KEEP);
  }
  assert.ok(Math.abs(state.position.y - KEEP_GALLERY_Y) < 0.01 && state.position.x > 10.2, `landed on the Gallery (at ${state.position.x.toFixed(2)}, ${state.position.y.toFixed(2)})`);
});

test('one lethal edge, meant: the terrace\'s crumbled lip. Every other open edge drops onto floor', () => {
  const lethal = [];
  for (const floor of RUINED_KEEP.floors) {
    if (floor.draw === false) continue;
    const x0 = floor.center[0] - floor.size[0] / 2;
    const x1 = floor.center[0] + floor.size[0] / 2;
    const z0 = floor.center[2] - floor.size[2] / 2;
    const z1 = floor.center[2] + floor.size[2] / 2;
    const edge = [];
    for (let x = x0; x <= x1; x += 0.25) edge.push([x, z0 - 0.3], [x, z1 + 0.3]);
    for (let z = z0; z <= z1; z += 0.25) edge.push([x0 - 0.3, z], [x1 + 0.3, z]);
    for (const [x, z] of edge) {
      // a wall stands there (a body cannot reach the point)
      const walled = RUINED_KEEP.solids.some((s) => s.center[1] - s.size[1] / 2 < floor.y + 0.5 && s.center[1] + s.size[1] / 2 > floor.y + 0.2
        && Math.abs(x - s.center[0]) < s.size[0] / 2 + 0.3 && Math.abs(z - s.center[2]) < s.size[2] / 2 + 0.3);
      if (walled) continue;
      const below = surfaceHeightAt(x, z, floor.y + 0.1, RUINED_KEEP);
      if (below === null) lethal.push([x, z]);
    }
  }
  assert.ok(lethal.length > 0, 'there is a way over');
  for (const [x, z] of lethal) {
    assert.ok(x < -13 && z > -7.5 && z < -5.5, `an edge nobody meant at (${x.toFixed(2)}, ${z.toFixed(2)})`);
  }
  // and it is deadly: a knight who walks off it falls into the abyss
  const over = run({ x: -11, y: 0, z: -6.5 }, [{ x: -60, z: -6.5 }], { seconds: 3 });
  assert.ok(over.state.position.y < RUINED_KEEP.abyssY);
  // while along the lip a knight walking straight at the drop is stopped
  const lip = run({ x: -11, y: 0, z: -9 }, [{ x: -16, z: -9 }], { seconds: 2 });
  assert.equal(lip.state.position.y, 0);
});

test('the heaps a knight can stand on are within a jump, and only those', () => {
  for (const id of ['gate-rubble-top', 'hall-rubble-top', 'scaffold-top']) {
    const top = RUINED_KEEP.floors.find((f) => f.id === id);
    assert.ok(top.y > 0.65 && top.y < 1.44, `${id} at ${top.y} m: a jump, not a step`);
  }
});

test('substantial masonry stops a blade: a forehand swung at a pillar meets the pillar', () => {
  const eye = { x: 3.4, y: 1.35, z: 7.6 };
  const frame = aimFrame(-Math.PI / 2, 0);   // facing +x, at the pillar at x 5.3..6.3
  const from = bladeDirection(0, -0.09, frame);
  const to = bladeDirection(0, 0.11, frame);
  const met = sweepBlade(eye, from, to, [], RUINED_KEEP.solids);
  assert.equal(met?.kind, 'solid');
  assert.equal(met.solid.id, 'pillar-east-mid');
});
