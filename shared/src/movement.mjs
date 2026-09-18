import { resolvePlayerWorld, surfaceHeightAt } from './collision.mjs';

export const MOVEMENT = Object.freeze({
  runSpeed: 7.5,
  jumpImpulse: 7.2,
  gravity: 18,
  playerRadius: 0.45,
  dashDistance: 5,
  dashDuration: 0.18,
  dashCooldown: 5,
});

export function createMovementState(position = { x: 0, y: 0, z: 0 }) {
  return {
    position: { ...position },
    velocity: { x: 0, y: 0, z: 0 },
    grounded: true,
    jumpHeld: false,
    dashUntil: -Infinity,
    dashReadyAt: 0,
    dashDir: { x: 0, z: -1 },
  };
}

export function tryStartDash(state, direction, nowSec) {
  if (nowSec < state.dashReadyAt) return false;
  const mag = Math.hypot(direction.x, direction.z) || 1;
  state.dashDir = { x: direction.x / mag, z: direction.z / mag };
  state.dashUntil = nowSec + MOVEMENT.dashDuration;
  state.dashReadyAt = nowSec + MOVEMENT.dashCooldown;
  return true;
}

export function movePlayer(previous, input, dt, nowSec, world) {
  const state = {
    ...previous,
    position: { ...previous.position },
    velocity: { ...previous.velocity },
    dashDir: { ...previous.dashDir },
  };

  const inDash = nowSec < state.dashUntil;
  if (inDash) {
    const dashSpeed = MOVEMENT.dashDistance / MOVEMENT.dashDuration;
    state.velocity.x = state.dashDir.x * dashSpeed;
    state.velocity.z = state.dashDir.z * dashSpeed;
  } else {
    const f = Math.max(-1, Math.min(1, input.forward ?? 0));
    const r = Math.max(-1, Math.min(1, input.right ?? 0));
    const length = Math.hypot(f, r) || 1;
    const nf = f / length;
    const nr = r / length;
    const sin = Math.sin(input.yaw ?? 0);
    const cos = Math.cos(input.yaw ?? 0);
    const fx = -sin;
    const fz = -cos;
    const rx = cos;
    const rz = -sin;
    state.velocity.x = (fx * nf + rx * nr) * MOVEMENT.runSpeed;
    state.velocity.z = (fz * nf + rz * nr) * MOVEMENT.runSpeed;
  }

  const jumpPressed = Boolean(input.jump) && !state.jumpHeld;
  state.jumpHeld = Boolean(input.jump);
  if (jumpPressed && state.grounded) {
    state.velocity.y = MOVEMENT.jumpImpulse;
    state.grounded = false;
  }
  if (!state.grounded) state.velocity.y -= MOVEMENT.gravity * dt;

  const beforeY = state.position.y;
  state.position.x += state.velocity.x * dt;
  state.position.z += state.velocity.z * dt;
  state.position = resolvePlayerWorld(state.position, MOVEMENT.playerRadius, world.solids ?? []);
  state.position.y += state.velocity.y * dt;

  const ground = surfaceHeightAt(state.position.x, state.position.z, Math.max(beforeY, state.position.y), world);
  if (ground !== null && state.position.y <= ground && state.velocity.y <= 0) {
    state.position.y = ground;
    state.velocity.y = 0;
    state.grounded = true;
  } else if (ground === null || state.position.y > ground + 0.001) {
    state.grounded = false;
  }

  return state;
}
