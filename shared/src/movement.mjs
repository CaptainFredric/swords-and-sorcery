import { resolvePlayerWorld, surfaceHeightAt } from './collision.mjs';
import { CROUCH, postureOf, roomToStand } from './body.mjs';

export const MOVEMENT = Object.freeze({
  runSpeed: 7.5,
  jumpImpulse: 7.2,
  gravity: 18,
  playerRadius: 0.45,
  dashDistance: 5,
  dashDuration: 0.18,
  dashCooldown: 5,
});

// Shoves from outside the body (a blow, a blast, a gust of wind): they carry it on top of its own steps and die
// away, quickly on the ground (the feet dig in) and slowly in the air (there is nothing to stop it), and a wall takes
// what is driven into it. Current tuning. Server and client share this, so a shove moves a body the same on both.
export const IMPULSE = Object.freeze({ groundDecay: 6, airDecay: 1.1, rest: 0.05 });

/** Shove a body: `push` (m/s) is added to its outside impulse (across the ground) and its velocity (upward). */
export function shoveBody(state, push) {
  if (!state || !push) return state;
  state.impulse = { x: (state.impulse?.x ?? 0) + (push.x ?? 0), z: (state.impulse?.z ?? 0) + (push.z ?? 0) };
  if ((push.y ?? 0) !== 0) {
    state.velocity.y += push.y;
    if (push.y > 0) state.grounded = false;
  }
  return state;
}

/**
 * Throw a body (a Gale driven into the ground under it): as a shove across the ground, but upward it is a launch, not
 * a nudge: a fall under way is caught first, and it leaves the body rising no faster than `maxUp` (m/s).
 */
export function launchBody(state, push, maxUp = Infinity) {
  if (!state || !push) return state;
  state.impulse = { x: (state.impulse?.x ?? 0) + (push.x ?? 0), z: (state.impulse?.z ?? 0) + (push.z ?? 0) };
  const up = push.y ?? 0;
  if (up > 0) {
    state.velocity.y = Math.max(state.velocity.y, Math.min(maxUp, Math.max(0, state.velocity.y) + up));
    state.grounded = false;
  } else if (up < 0) {
    state.velocity.y += up;
  }
  return state;
}

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
  // an armoured body builds up to sprint speed and runs off the extra speed when the sprint ends
  accelSec: 0.5,
  decelSec: 0.3,
});

// longest horizontal move resolved against walls in one go (well under the thinnest wall plus a body radius)
export const MAX_COLLISION_STEP = 0.3;

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
    // 0 = run speed, 1 = full sprint speed; rises while sprinting, falls after
    sprintBlend: 0,
    // multiplier for future slows and hastes; 1 = unmodified
    speedScale: 1,
    // spinning in a Blazing Vortex: { speed, fallGravity, maxFall } (shared/src/ultimates.mjs ultimateWhirl), else null
    whirl: null,
    // shoves from outside, dying away (IMPULSE)
    impulse: { x: 0, z: 0 },
    // the posture (body.mjs): a crouched body is shorter, slower, and stands only when there is room
    crouched: false,
  };
}

/**
 * Whether the Spellblade sprints this tick. Pure, so the server (authoritative, real stamina) and the client
 * (prediction, last known stamina) decide the same way.
 * @param {{wantsSprint:boolean, forward:number, right:number, grounded:boolean, stamina:number,
 *          sprinting:boolean, blocked:boolean, crouched:boolean}} args  blocked: guarding, attacking, casting or
 *          staggered; a crouched knight never sprints (crouching ends one, and none begins crouched)
 */
export function resolveSprint({ wantsSprint, forward = 0, right = 0, grounded = true, stamina = 0, sprinting = false, blocked = false, crouched = false }) {
  if (!wantsSprint || blocked || crouched || !(stamina > 0)) return false;
  const f = Math.max(-1, Math.min(1, forward));
  const r = Math.max(-1, Math.min(1, right));
  const magnitude = Math.hypot(f, r);
  if (magnitude < 0.2 || f < SPRINT.forwardShare * magnitude) return false;
  // already sprinting: keep going (even through a jump) until the bar is empty
  if (sprinting) return true;
  return grounded && stamina >= SPRINT.restartStamina;
}

export function locomotionSpeed(state) {
  const blend = Math.max(0, Math.min(1, Number(state.sprintBlend) || 0));
  // eased out: quick to get going, slower to reach the top end
  const eased = 1 - (1 - blend) * (1 - blend);
  // (spinning in a Blazing Vortex, the pace is the spin's own: state.whirl, shared/src/ultimates.mjs)
  const base = state.whirl ? state.whirl.speed : MOVEMENT.runSpeed + (SPRINT.speed - MOVEMENT.runSpeed) * eased;
  const scale = Number.isFinite(state.speedScale) ? Math.max(0, state.speedScale) : 1;
  return base * scale;
}

/** Advance the sprint build-up: toward 1 while sprinting and moving, back toward 0 otherwise. */
export function stepSprintBlend(blend, sprinting, moving, dt) {
  const current = Math.max(0, Math.min(1, Number(blend) || 0));
  if (!moving) return 0;
  if (sprinting) return Math.min(1, current + dt / SPRINT.accelSec);
  return Math.max(0, current - dt / SPRINT.decelSec);
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
    impulse: { x: previous.impulse?.x ?? 0, z: previous.impulse?.z ?? 0 },
    crouched: Boolean(previous.crouched),
  };

  // the posture: down at once when asked (feet on the ground), up only when asked and there is room over the head
  const wantsCrouch = Boolean(input.crouch);
  if (wantsCrouch && !state.crouched && state.grounded) state.crouched = true;
  else if (!wantsCrouch && state.crouched && roomToStand(state.position, MOVEMENT.playerRadius, world)) state.crouched = false;
  if (state.crouched) state.sprinting = false;

  const inDash = nowSec < state.dashUntil;
  if (inDash) {
    const dashSpeed = MOVEMENT.dashDistance / MOVEMENT.dashDuration;
    state.velocity.x = state.dashDir.x * dashSpeed;
    state.velocity.z = state.dashDir.z * dashSpeed;
  } else {
    const f = Math.max(-1, Math.min(1, input.forward ?? 0));
    const r = Math.max(-1, Math.min(1, input.right ?? 0));
    state.sprintBlend = stepSprintBlend(state.sprintBlend, state.sprinting, Math.hypot(f, r) > 0.01, dt);
    // how much of a run the input asks for: a key or a full stick is all of it, a stick part-way (or a bot easing
    // off) is part of it; two keys at once point the way between them without going any faster
    const length = Math.hypot(f, r);
    const over = Math.max(1, length);
    const nf = f / over;
    const nr = r / over;
    const sin = Math.sin(input.yaw ?? 0);
    const cos = Math.cos(input.yaw ?? 0);
    const fx = -sin;
    const fz = -cos;
    const rx = cos;
    const rz = -sin;
    const speed = locomotionSpeed(state) * (state.crouched ? CROUCH.speed : 1);
    // its own steps, and whatever shoved it on top
    state.velocity.x = (fx * nf + rx * nr) * speed + state.impulse.x;
    state.velocity.z = (fz * nf + rz * nr) * speed + state.impulse.z;
  }
  // the shove dies away: fast with feet on the ground, slowly in the air
  const fade = Math.exp(-dt * (state.grounded ? IMPULSE.groundDecay : IMPULSE.airDecay));
  state.impulse.x *= fade;
  state.impulse.z *= fade;
  if (Math.hypot(state.impulse.x, state.impulse.z) < IMPULSE.rest) state.impulse = { x: 0, z: 0 };

  const jumpPressed = Boolean(input.jump) && !state.jumpHeld;
  state.jumpHeld = Boolean(input.jump);
  // (crouched, there is no jump: the knight stands first)
  if (jumpPressed && state.grounded && !state.crouched) {
    state.velocity.y = MOVEMENT.jumpImpulse;
    state.grounded = false;
  }
  if (!state.grounded) {
    // a spinning knight (state.whirl) falls slowly, and no faster than its `maxFall`; rising is as ever (it is no flight)
    const whirl = state.whirl ?? null;
    state.velocity.y -= MOVEMENT.gravity * (whirl && state.velocity.y <= 0 ? whirl.fallGravity : 1) * dt;
    if (whirl) state.velocity.y = Math.max(state.velocity.y, -whirl.maxFall);
  }

  const beforeY = state.position.y;
  // Sub-step horizontal travel so no single step can carry the body through a thin wall (a dash covers about
  // 0.9 m per 30 Hz server tick; walls and lips are 0.3-0.5 m thick).
  const travelX = state.velocity.x * dt;
  const travelZ = state.velocity.z * dt;
  const substeps = Math.max(1, Math.ceil(Math.hypot(travelX, travelZ) / MAX_COLLISION_STEP));
  const startX = state.position.x;
  const startZ = state.position.z;
  for (let i = 0; i < substeps; i += 1) {
    state.position.x += travelX / substeps;
    state.position.z += travelZ / substeps;
    state.position = resolvePlayerWorld(state.position, MOVEMENT.playerRadius, world.solids ?? [], postureOf(state).height);
  }
  // a wall takes what a shove drives into it
  if (state.impulse.x || state.impulse.z) {
    const wanted = Math.hypot(travelX, travelZ);
    const went = Math.hypot(state.position.x - startX, state.position.z - startZ);
    if (wanted > 1e-6 && went < wanted * 0.5) state.impulse = { x: state.impulse.x * 0.3, z: state.impulse.z * 0.3 };
  }
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
