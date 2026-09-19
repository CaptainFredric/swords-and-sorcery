import test from 'node:test';
import assert from 'node:assert/strict';
import { createMovementState, movePlayer, tryStartDash } from './movement.mjs';
import { SHATTERED_KEEP } from './map.mjs';

const flatWorld = {
  floors: [{ id: 'floor', center: [0, -0.1, 0], size: [100, 0.2, 100], y: 0 }],
  ramps: [],
  solids: [],
};

test('run velocity caps at 7.5 m/s', () => {
  let state = createMovementState({ x: 0, y: 0, z: 0 });
  state = movePlayer(state, { forward: 1, right: 0, jump: false, yaw: 0 }, 0.1, 0.1, flatWorld);
  const speed = Math.hypot(state.velocity.x, state.velocity.z);
  assert.ok(Math.abs(speed - 7.5) < 0.001);
});

test('jump begins only while grounded and gravity returns player to floor', () => {
  let state = createMovementState({ x: 0, y: 0, z: 0 });
  state = movePlayer(state, { forward: 0, right: 0, jump: true, yaw: 0 }, 0.016, 0.016, flatWorld);
  assert.ok(state.velocity.y > 0);
  assert.equal(state.grounded, false);
  const firstVy = state.velocity.y;
  state = movePlayer(state, { forward: 0, right: 0, jump: true, yaw: 0 }, 0.016, 0.032, flatWorld);
  assert.ok(state.velocity.y < firstVy);
  for (let i = 0; i < 180; i += 1) {
    state = movePlayer(state, { forward: 0, right: 0, jump: false, yaw: 0 }, 1 / 60, 0.05 + i / 60, flatWorld);
  }
  assert.equal(state.grounded, true);
  assert.ok(Math.abs(state.position.y) < 0.001);
});

test('dash covers about five meters over 180ms and enters five-second cooldown', () => {
  let state = createMovementState({ x: 0, y: 0, z: 0 });
  assert.equal(tryStartDash(state, { x: 1, z: 0 }, 0), true);
  for (let i = 0; i < 6; i += 1) {
    state = movePlayer(state, { forward: 0, right: 0, jump: false, yaw: 0 }, 0.03, i * 0.03, flatWorld);
  }
  assert.ok(state.position.x > 4.8 && state.position.x < 5.2);
  assert.equal(tryStartDash(state, { x: 1, z: 0 }, 1), false);
  assert.equal(tryStartDash(state, { x: 1, z: 0 }, 5.001), true);
});

test('a normal running jump clears the Shattered Keep bridge gap', () => {
  let state = createMovementState({ x: 0, y: 0, z: -14.6 });
  let lowestOverGap = Infinity;

  for (let i = 0; i < 58; i += 1) {
    const input = { forward: 1, right: 0, jump: i === 0, yaw: 0 };
    state = movePlayer(state, input, 1 / 60, (i + 1) / 60, SHATTERED_KEEP);
    if (state.position.z < -15.4 && state.position.z > -16.6) lowestOverGap = Math.min(lowestOverGap, state.position.y);
  }

  assert.ok(lowestOverGap > 0.1, `player dipped too low over bridge gap: ${lowestOverGap}`);
  assert.ok(state.position.z < -20, `player did not clear the bridge: ${state.position.z}`);
  assert.equal(state.grounded, true);
  assert.ok(Math.abs(state.position.y) < 0.001);
});
