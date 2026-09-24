import { MOVEMENT } from '../../shared/src/movement.mjs';
import { GAME } from '../../shared/src/combat.mjs';

const SLASH_DURATIONS = Object.freeze([0.72, 0.72, 0.64]);
const ATTACK_CYCLE = SLASH_DURATIONS.reduce((sum, value) => sum + value, 0);
const RESPAWN_SEC = 3;
const MAX_STAGGER_SEC = Math.max(GAME.parryStaggerMs, GAME.guardBreakStaggerMs) / 1000;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function nonNegative(value) {
  return Math.max(0, finite(value));
}

function fixed(clip, time = 0, loop = false) {
  return { clip, time: nonNegative(time), loop, weight: 1 };
}

function attackPlan(player, serverNow) {
  const startedAt = finite(player?.attackStartedAt, serverNow);
  const elapsed = nonNegative(serverNow - startedAt);
  const cycle = elapsed % ATTACK_CYCLE;

  if (cycle < SLASH_DURATIONS[0]) return fixed('Slash_1', cycle);
  if (cycle < SLASH_DURATIONS[0] + SLASH_DURATIONS[1]) {
    return fixed('Slash_2', cycle - SLASH_DURATIONS[0]);
  }
  return fixed('Slash_3', cycle - SLASH_DURATIONS[0] - SLASH_DURATIONS[1]);
}

export function resolveSpellbladeAnimationPlan({ state, player = {}, serverNow = 0, localTime = 0 }) {
  if (state === 'attack') return attackPlan(player, serverNow);

  if (state === 'cast') {
    return fixed('Cast', serverNow - finite(player.castPoseStartAt, serverNow));
  }

  if (state === 'dash') {
    const startAt = finite(player.dashUntil, serverNow) - MOVEMENT.dashDuration;
    return fixed('Dash', serverNow - startAt);
  }

  if (state === 'stagger') {
    const remaining = Math.max(0, finite(player.staggerUntil, serverNow) - serverNow);
    return fixed('Stagger', MAX_STAGGER_SEC - remaining);
  }

  if (state === 'dead') {
    const deathAt = finite(player.respawnAt, serverNow + RESPAWN_SEC) - RESPAWN_SEC;
    return fixed('Death', serverNow - deathAt);
  }

  // Frame 8 holds the raised guard; frame 1 is the neutral entry pose.
  if (state === 'guard') return fixed('Guard', 7 / 30);
  if (state === 'air') return fixed('Air');
  if (state === 'run') return fixed('Run', localTime, true);
  return fixed('Idle', localTime, true);
}

export function resolveFirstPersonAnimationPlan(pose, view, timeSec) {
  if (pose.state === 'attack') return attackPlan(view, timeSec);
  if (pose.state === 'guard') return { clip: 'Guard', loop: false, time: 7 / 30 };
  if (pose.state === 'cast') return { clip: 'Cast', loop: false, time: Math.max(0, timeSec - view.castStartedAt) };
  if (pose.state === 'dash') return { clip: 'Dash', loop: false, time: Math.max(0, timeSec - (view.dashUntil - 0.18)) };
  return { clip: 'Idle', loop: true, time: timeSec };
}
