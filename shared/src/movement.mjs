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

// Sprint is a locomotion state of its own (not just a faster run) so later modifiers, debuffs and animation can
// key off it. It spends the same stamina pool the guard uses, slowly, so sprinting in costs blocking power.
export const SPRINT = Object.freeze({
  speed: 11,
  // stamina per second while sprinting: a full bar lasts 10 s of sprint (a block costs 35)
  staminaPerSec: 10,
  // a winded Spellblade can sprint again once the bar has recovered this far
  restartStamina: 25,
  // sprinting means heading forward: at least this share of the stick pointing ahead (diagonals allowed)
  forwardShare: 0.3,
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
    sprinting: false,
    // multiplier for future slows and hastes; 1 = unmodified
    speedScale: 1,
  };
}

/**
 * Whether the Spellblade sprints this tick. Pure, so the server (authoritative, real stamina) and the client
 * (prediction, last known stamina) decide the same way.
 * @param {{wantsSprint:boolean, forward:number, right:number, grounded:boolean, stamina:number,
 *          sprinting:boolean, blocked:boolean}} args  blocked: guarding, attacking, casting or staggered
 */
export function resolveSprint({ wantsSprint, forward = 0, right = 0, grounded = true, stamina = 0, sprinting = false, blocked = false }) {
  if (!wantsSprint || blocked || !(stamina > 0)) return false;
  const f = Math.max(-1, Math.min(1, forward));
  const r = Math.max(-1, Math.min(1, right));
  const magnitude = Math.hypot(f, r);
  if (magnitude < 0.2 || f < SPRINT.forwardShare * magnitude) return false;
  // already sprinting: keep going (even through a jump) until the bar is empty
  if (sprinting) return true;
  return grounded && stamina >= SPRINT.restartStamina;
}

export function locomotionSpeed(state) {
  const base = state.sprinting ? SPRINT.speed : MOVEMENT.runSpeed;
  const scale = Number.isFinite(state.speedScale) ? Math.max(0, state.speedScale) : 1;
  return base * scale;
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
    const speed = locomotionSpeed(state);
    state.velocity.x = (fx * nf + rx * nr) * speed;
    state.velocity.z = (fz * nf + rz * nr) * speed;
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
