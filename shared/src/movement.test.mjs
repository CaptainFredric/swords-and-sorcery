import test from 'node:test';
import assert from 'node:assert/strict';
import { IMPULSE, MOVEMENT, SPRINT, createMovementState, movePlayer, resolveSprint, shoveBody, tryStartDash } from './movement.mjs';
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

test('the input asks for how much of a run it wants: a key is all of it, a stick part-way is part, never more', () => {
  const speedWith = (input) => {
    const state = movePlayer(createMovementState({ x: 0, y: 0, z: 0 }), { forward: 0, right: 0, jump: false, yaw: 0, ...input }, 0.1, 0.1, flatWorld);
    return Math.hypot(state.velocity.x, state.velocity.z);
  };
  assert.ok(Math.abs(speedWith({ forward: 1 }) - 7.5) < 0.001, 'a key: a full run');
  assert.ok(Math.abs(speedWith({ forward: 0.4 }) - 3) < 0.001, 'part-way: a walk');
  assert.ok(Math.abs(speedWith({ forward: 1, right: 1 }) - 7.5) < 0.001, 'two keys: between them, no faster');
  assert.ok(Math.abs(speedWith({ forward: 0.3, right: -0.4 }) - 3.75) < 0.001, 'a diagonal part-way: as much as it asks');
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

function speedOf(state) {
  return Math.hypot(state.velocity.x, state.velocity.z);
}

test('sprint is its own faster locomotion state with a speed hook for modifiers', () => {
  let state = createMovementState({ x: 0, y: 0, z: 0 });
  state.sprinting = true;
  for (let i = 1; i <= 6; i += 1) state = movePlayer(state, { forward: 1, right: 0, jump: false, yaw: 0 }, 0.1, i * 0.1, flatWorld);
  assert.ok(Math.abs(speedOf(state) - SPRINT.speed) < 0.001);
  state.speedScale = 0.5;
  state = movePlayer(state, { forward: 1, right: 0, jump: false, yaw: 0 }, 0.1, 0.7, flatWorld);
  assert.ok(Math.abs(speedOf(state) - SPRINT.speed * 0.5) < 0.001);
  assert.ok(SPRINT.speed > MOVEMENT.runSpeed);
});

test('an armoured body builds up to sprint speed and runs the extra speed off after', () => {
  let state = createMovementState({ x: 0, y: 0, z: 0 });
  state.sprinting = true;
  const input = { forward: 1, right: 0, jump: false, yaw: 0 };
  const speeds = [];
  for (let i = 1; i <= 6; i += 1) {
    state = movePlayer(state, input, 0.1, i * 0.1, flatWorld);
    speeds.push(speedOf(state));
  }
  assert.ok(speeds[0] > MOVEMENT.runSpeed && speeds[0] < SPRINT.speed, `first step ${speeds[0]}`);
  for (let i = 1; i < speeds.length; i += 1) assert.ok(speeds[i] >= speeds[i - 1], 'accelerates');
  assert.ok(Math.abs(speeds[4] - SPRINT.speed) < 0.001, `reaches full speed by ${SPRINT.accelSec}s`);
  // gains most of it early (eased out)
  assert.ok(speeds[1] - MOVEMENT.runSpeed > (SPRINT.speed - MOVEMENT.runSpeed) * 0.6);
  state.sprinting = false;
  state = movePlayer(state, input, 0.1, 0.7, flatWorld);
  assert.ok(speedOf(state) > MOVEMENT.runSpeed && speedOf(state) < SPRINT.speed, 'slows over a moment');
  for (let i = 0; i < 3; i += 1) state = movePlayer(state, input, 0.1, 0.8 + i * 0.1, flatWorld);
  assert.ok(Math.abs(speedOf(state) - MOVEMENT.runSpeed) < 0.001);
  // stopping drops the build-up; a dash does not touch it
  state = movePlayer(state, { ...input, forward: 0 }, 0.1, 1.2, flatWorld);
  assert.equal(state.sprintBlend, 0);
});

test('sprint starts only heading forward on the ground with enough stamina, and keeps going until empty', () => {
  const base = { wantsSprint: true, forward: 1, right: 0, grounded: true, stamina: 100, sprinting: false, blocked: false };
  assert.equal(resolveSprint(base), true);
  assert.equal(resolveSprint({ ...base, wantsSprint: false }), false);
  assert.equal(resolveSprint({ ...base, blocked: true }), false, 'guarding, attacking, casting or stagger stop it');
  assert.equal(resolveSprint({ ...base, forward: -1 }), false, 'no backpedal sprint');
  assert.equal(resolveSprint({ ...base, forward: 0, right: 1 }), false, 'no pure strafe sprint');
  assert.equal(resolveSprint({ ...base, forward: 1, right: 1 }), true, 'forward diagonals sprint');
  assert.equal(resolveSprint({ ...base, forward: 0, right: 0 }), false, 'standing still is not sprinting');
  assert.equal(resolveSprint({ ...base, grounded: false }), false, 'cannot start in the air');
  assert.equal(resolveSprint({ ...base, grounded: false, sprinting: true }), true, 'a sprint carries through a jump');
  assert.equal(resolveSprint({ ...base, stamina: SPRINT.restartStamina - 1 }), false, 'winded: must recover first');
  assert.equal(resolveSprint({ ...base, stamina: 5, sprinting: true }), true, 'an ongoing sprint uses the bar down');
  assert.equal(resolveSprint({ ...base, stamina: 0, sprinting: true }), false, 'empty bar ends it');
});

test('a dash cannot tunnel through a thin wall at the server tick rate', () => {
  const walled = { ...flatWorld, solids: [{ id: 'wall', center: [0, 1, -2], size: [6, 2, 0.3] }] };
  let state = createMovementState({ x: 0, y: 0, z: 0 });
  tryStartDash(state, { x: 0, z: -1 }, 0);
  for (let i = 1; i <= 8; i += 1) state = movePlayer(state, { forward: 0, right: 0, jump: false, yaw: 0 }, 1 / 30, i / 30, walled);
  assert.ok(state.position.z > -2, `dashed through the wall to z=${state.position.z}`);
});

test('a shove carries a body on top of its own steps and dies away: quickly on the ground, slowly in the air', () => {
  const travel = (airborne) => {
    let state = createMovementState({ x: 0, y: airborne ? 20 : 0, z: 0 });
    state.grounded = !airborne;
    shoveBody(state, { x: 8, y: 0, z: 0 });
    for (let i = 0; i < 30; i += 1) state = movePlayer(state, { forward: 0, right: 0, jump: false, yaw: 0 }, 1 / 30, i / 30, airborne ? { floors: [], ramps: [], solids: [] } : flatWorld);
    return { x: state.position.x, left: Math.hypot(state.impulse.x, state.impulse.z) };
  };
  const ground = travel(false);
  const air = travel(true);
  assert.ok(ground.x > 0.5, `pushed along the ground ${ground.x.toFixed(2)} m`);
  assert.ok(air.x > ground.x * 1.5, 'carried further through the air');
  assert.equal(ground.left, 0, 'spent on the ground within a second');
  // on top of its own steps, not instead of them
  let walking = createMovementState({ x: 0, y: 0, z: 0 });
  shoveBody(walking, { x: 0, y: 0, z: -4 });
  walking = movePlayer(walking, { forward: 1, right: 0, jump: false, yaw: 0 }, 1 / 30, 0, flatWorld);
  assert.ok(Math.hypot(walking.velocity.x, walking.velocity.z) > MOVEMENT.runSpeed, 'its run and the shove together');
  // an upward shove takes it off its feet
  const lifted = shoveBody(createMovementState({ x: 0, y: 0, z: 0 }), { x: 0, y: 3, z: 0 });
  assert.equal(lifted.grounded, false);
  assert.ok(IMPULSE.airDecay < IMPULSE.groundDecay);
});

test('a wall takes the shove driven into it', () => {
  const walled = { ...flatWorld, solids: [{ id: 'wall', center: [0.9, 1, 0], size: [0.4, 2, 6] }] };
  let state = createMovementState({ x: 0, y: 0, z: 0 });
  shoveBody(state, { x: 10, y: 0, z: 0 });
  for (let i = 0; i < 6; i += 1) state = movePlayer(state, { forward: 0, right: 0, jump: false, yaw: 0 }, 1 / 30, i / 30, walled);
  assert.ok(state.position.x < 0.7, 'stopped at the wall');
  assert.ok(Math.hypot(state.impulse.x, state.impulse.z) < 2, 'the shove spent against it');
});
