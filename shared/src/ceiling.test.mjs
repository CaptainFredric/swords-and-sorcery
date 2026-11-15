// A body rising into the underside of a solid stops under it (a ceiling); before, the next step found it inside the solid
// and threw it out through the nearest side (1.15 m in a 30 Hz tick under Castleward's gate arch, during a Gale Whirl).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMovementState, movePlayer, MOVEMENT } from './movement.mjs';
import { ceilingAbove } from './collision.mjs';
import { Room } from '../sim/Room.mjs';

const still = { forward: 0, right: 0, jump: false, sprint: false, crouch: false, yaw: 0 };
const DT = 1 / 30;
const rise = (world, from, frames, speed = 5 / 0.6, input = still) => {
  let s = createMovementState(from);
  const path = [];
  for (let i = 0; i < frames; i += 1) {
    s.velocity.y = Math.max(s.velocity.y, speed + MOVEMENT.gravity * DT);
    s.grounded = false;
    s = movePlayer(s, input, DT, i * DT, world);
    path.push({ ...s.position });
  }
  return path;
};

test('rising under Castleward\'s gate arch: the head stops at its underside, nothing pushes the knight aside', () => {
  const world = new Room('C1', { mode: 'FFA', worldId: 'castleward' }).world;
  const arch = world.solids.find((s) => s.id === 'castle-gate-arch');
  const underside = arch.center[1] - arch.size[1] / 2;
  const path = rise(world, { x: 0, y: 1.125, z: 15.8 }, 30);
  const top = Math.max(...path.map((p) => p.y));
  assert.ok(Math.abs(top - (underside - 1.8)) < 0.01, `feet reach ${top.toFixed(3)} under a ${underside} m underside`);
  assert.ok(path.every((p) => Math.abs(p.z - 15.8) < 1e-6 && Math.abs(p.x) < 1e-6), 'no sideways push');
});

test('a ceiling stops only what rises into it from below, over its footprint: walls and open sky are as before', () => {
  const wall = { id: 'wall', center: [0, 3, -1], size: [4, 6, 0.4] };
  const slab = { id: 'slab', center: [10, 4, 0], size: [4, 0.4, 4] };
  const world = { floors: [{ id: 'f', center: [0, -0.1, 0], size: [60, 0.2, 60], y: 0 }], ramps: [], solids: [wall, slab] };
  // beside a wall (touching it): rises freely
  const beside = rise(world, { x: 0, y: 0, z: -1 + 0.2 + MOVEMENT.playerRadius }, 40);
  assert.ok(beside.at(-1).y > 10, `beside a wall it rose to ${beside.at(-1).y.toFixed(2)}`);
  // under open sky: rises freely
  assert.ok(rise(world, { x: -10, y: 0, z: 0 }, 40).at(-1).y > 10);
  // under the slab: stopped at its underside (3.8 m) less the body
  const under = rise(world, { x: 10, y: 0, z: 0 }, 20);
  assert.ok(Math.abs(Math.max(...under.map((p) => p.y)) - (3.8 - 1.8)) < 0.01);
  // under its edge (the body overlapping the footprint by less than its radius): still stopped
  assert.ok(Math.max(...rise(world, { x: 12 + MOVEMENT.playerRadius * 0.5, y: 0, z: 0 }, 20).map((p) => p.y)) < 2.01);
  // walking out from under it while rising: free to rise again once clear
  const out = rise(world, { x: 11.5, y: 0, z: 0 }, 40, 5 / 0.6, { ...still, right: 1 });
  assert.ok(out.at(-1).x > 12 + MOVEMENT.playerRadius && out.at(-1).y > 4, `out from under it at x ${out.at(-1).x.toFixed(2)}, y ${out.at(-1).y.toFixed(2)}`);
  // an ordinary jump that never reaches the slab is unchanged
  assert.equal(ceilingAbove({ x: 10, z: 0 }, MOVEMENT.playerRadius, [slab], 1.8, 3.0), null);
});
