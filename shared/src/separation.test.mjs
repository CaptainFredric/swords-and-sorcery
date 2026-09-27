import test from 'node:test';
import assert from 'node:assert/strict';
import { SEPARATION, separateLocal, separatePlayers, separationPush } from './separation.mjs';
import { GAME } from './combat.mjs';

const flat = { floors: [{ id: 'f', center: [0, -0.1, 0], size: [40, 0.2, 40], y: 0 }], ramps: [], solids: [] };

function body(id, x, z, y = 0) {
  return { id, alive: true, position: { x, y, z } };
}

function gap(a, b) {
  return Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
}

test('overlapping Spellblades are eased apart to arm-brushing distance, half each', () => {
  const a = body('a', 0, 0);
  const b = body('b', 0.3, 0);
  separatePlayers([a, b], flat);
  assert.ok(Math.abs(gap(a, b) - SEPARATION.minDistance) < 1e-9);
  assert.ok(Math.abs(a.position.x + (b.position.x - 0.3)) < 1e-9, 'symmetric');
  assert.ok(SEPARATION.minDistance < GAME.swordRange / 3, 'melee range stays far beyond the spacing');
});

test('bodies at arm-brushing distance or stacked vertically are left alone', () => {
  assert.equal(separationPush({ x: 0, y: 0, z: 0 }, { x: 0.8, y: 0, z: 0 }), null);
  assert.equal(separationPush({ x: 0, y: 0, z: 0 }, { x: 0.1, y: 1.6, z: 0 }), null);
  const push = separationPush({ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 0, y: 0, z: 0 });
  assert.ok(Math.abs(Math.hypot(push.x, push.z) - SEPARATION.minDistance) < 1e-9, 'coincident bodies still part');
});

test('a body at a ledge is never shoved off it: the other gives way', () => {
  const ledge = { floors: [{ id: 'f', center: [-10, -0.1, 0], size: [20, 0.2, 20], y: 0 }], ramps: [], solids: [] };
  const atEdge = body('edge', -0.1, 0);      // floor ends at x = 0
  const inside = body('inside', -0.5, 0);
  separatePlayers([atEdge, inside], ledge);
  assert.equal(atEdge.position.x, -0.1, 'not pushed off');
  assert.ok(Math.abs(gap(atEdge, inside) - SEPARATION.minDistance) < 1e-9);
});

test('the dead and the local prediction follow the same rule', () => {
  const dead = { ...body('d', 0.1, 0), alive: false };
  const alive = body('a', 0, 0);
  separatePlayers([dead, alive], flat);
  assert.equal(alive.position.x, 0);
  const local = { x: 0, y: 0, z: 0 };
  separateLocal(local, [{ id: 'r', x: 0.35, y: 0, z: 0 }], flat);
  assert.ok(Math.abs(local.x + 0.2) < 1e-9, 'moves by its own half of the overlap');
});
