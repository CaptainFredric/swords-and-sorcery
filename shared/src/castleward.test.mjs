import test from 'node:test';
import assert from 'node:assert/strict';
import { createMovementState, movePlayer } from './movement.mjs';
import { CASTLEWARD } from '../worlds/castleward.mjs';

function runForward(start, yaw, frames) {
  let state = createMovementState(start);
  for (let i = 0; i < frames; i += 1) {
    state = movePlayer(
      state,
      { forward: 1, right: 0, jump: false, yaw },
      1 / 60,
      (i + 1) / 60,
      CASTLEWARD,
    );
  }
  return state;
}

test('Castleward exposes the five intended combat zones', () => {
  const ids = new Set(CASTLEWARD.zones.map((zone) => zone.id));
  assert.deepEqual(ids, new Set(['town-green', 'castle-bailey', 'west-village', 'east-meadow', 'south-road']));
});

test('Castleward stays inside the arena size envelope', () => {
  const xs = CASTLEWARD.floors.flatMap((floor) => [
    floor.center[0] - floor.size[0] / 2,
    floor.center[0] + floor.size[0] / 2,
  ]);
  const zs = CASTLEWARD.floors.flatMap((floor) => [
    floor.center[2] - floor.size[2] / 2,
    floor.center[2] + floor.size[2] / 2,
  ]);
  const width = Math.max(...xs) - Math.min(...xs);
  const depth = Math.max(...zs) - Math.min(...zs);
  assert.ok(width >= 45 && width <= 55, `Castleward width out of envelope: ${width}`);
  assert.ok(depth >= 45 && depth <= 55, `Castleward depth out of envelope: ${depth}`);
  assert.ok(CASTLEWARD.spawnPoints.length >= 10);
});

test('Town Green reaches Castle Bailey by normal running without Dash', () => {
  const state = runForward({ x: 0, y: 0, z: 5 }, Math.PI, 150);
  assert.ok(state.position.z > 20, `did not reach Bailey: z=${state.position.z}`);
  assert.ok(state.position.y > 2.2, `did not climb Bailey ramp: y=${state.position.y}`);
  assert.equal(state.grounded, true);
  assert.ok(state.dashReadyAt <= 0, 'route unexpectedly used Dash');
});

test('Town Green reaches East Meadow by normal running without Dash', () => {
  const state = runForward({ x: 6, y: 0, z: 0 }, -Math.PI / 2, 105);
  assert.ok(state.position.x > 18, `did not reach East Meadow: x=${state.position.x}`);
  assert.ok(Math.abs(state.position.y) < 0.01, `East Meadow should remain ground level: y=${state.position.y}`);
  assert.equal(state.grounded, true);
  assert.ok(state.dashReadyAt <= 0, 'route unexpectedly used Dash');
});
