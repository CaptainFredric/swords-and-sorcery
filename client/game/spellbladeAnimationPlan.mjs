import { MOVEMENT, SPRINT } from '../../shared/src/movement.mjs';
import { GAME, SWORD_CHAIN, SWORD_STRIKE_TIMES } from '../../shared/src/combat.mjs';

const SLASH_DURATIONS = Object.freeze([0.72, 0.72, 0.64]);
const ATTACK_CYCLE = SLASH_DURATIONS.reduce((sum, value) => sum + value, 0);
const RESPAWN_SEC = 3;
// Guard: frames 1-8 raise the guard, frames 8-56 are a breathing hold that loops (30 fps)
export const GUARD_HOLD_START = 7 / 30;
export const GUARD_HOLD_SECONDS = 48 / 30;
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

// the heavy strike's contact, this far into Slash_3 (its slot begins at the chain's third start)
const SLAM_CONTACT = SWORD_STRIKE_TIMES[2] - SWORD_CHAIN.starts[2];

// a Blazing Vortex's held poses: Slash_3 with the sword raised (as it is lit), Slash_1 at its contact (the blade level
// along the aim); it comes down level this long before the spin takes hold
const VORTEX_HELD = Object.freeze({ raised: Math.max(0, SLAM_CONTACT - 0.16), level: SWORD_STRIKE_TIMES[0], levelBefore: 0.5 });

function attackPlan(player, serverNow) {
  const startedAt = finite(player?.attackStartedAt, serverNow);
  const elapsed = nonNegative(serverNow - startedAt);
  const cycle = elapsed % ATTACK_CYCLE;

  // a chain begun Sundering: every strike is the heavy one's slam, each timed to its own contact
  if (player?.attackSlam) {
    const slot = cycle < SLASH_DURATIONS[0] ? 0 : cycle < SLASH_DURATIONS[0] + SLASH_DURATIONS[1] ? 1 : 2;
    return fixed('Slash_3', cycle - SWORD_STRIKE_TIMES[slot] + SLAM_CONTACT);
  }

  if (cycle < SLASH_DURATIONS[0]) return fixed('Slash_1', cycle);
  if (cycle < SLASH_DURATIONS[0] + SLASH_DURATIONS[1]) {
    return fixed('Slash_2', cycle - SLASH_DURATIONS[0]);
  }
  return fixed('Slash_3', cycle - SLASH_DURATIONS[0] - SLASH_DURATIONS[1]);
}

export function resolveSpellbladeAnimationPlan({ state, player = {}, serverNow = 0, localTime = 0 }) {
  if (state === 'attack') return attackPlan(player, serverNow);

  // a Blazing Vortex: the sword held out level in both hands, where the forehand's blade crosses the aim (the whole
  // knight is turned round by the spin: RemotePlayers); as it is lit, raised first (the heavy strike's raise)
  if (state === 'vortex') {
    const vortex = player.ultimateState ?? {};
    const lighting = vortex.phase === 'startup' && serverNow < finite(vortex.commitAt, serverNow) - VORTEX_HELD.levelBefore;
    return lighting ? fixed('Slash_3', VORTEX_HELD.raised) : fixed('Slash_1', VORTEX_HELD.level);
  }

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

  // The guard stays raised but breathes: loop the hold section on the local clock.
  if (state === 'guard') return fixed('Guard', guardHoldTime(localTime));
  // the air pose follows the jump: take-off at the start of the clip, falling toward its end
  if (state === 'air') return { ...fixed('Air', airPhase(player.velocity?.y)), normalized: true };
  if (state === 'sprint') return { ...fixed('Sprint', localTime, true), fallback: 'Run', rate: strideRate(player, SPRINT.speed) };
  if (state === 'run') return { ...fixed('Run', localTime, true), rate: strideRate(player, MOVEMENT.runSpeed) };
  return fixed('Idle', localTime, true);
}

// stride cadence follows ground speed (the sprint builds up), so feet do not skate
function strideRate(player, clipSpeed) {
  const velocity = player?.velocity;
  if (!velocity) return 1;
  const speed = Math.hypot(finite(velocity.x), finite(velocity.z));
  // (down to a walk: a bot easing off, a chilled knight)
  return Math.max(0.4, Math.min(1.2, speed / clipSpeed));
}

function airPhase(verticalVelocity) {
  const v = finite(verticalVelocity);
  return Math.max(0, Math.min(1, (MOVEMENT.jumpImpulse - v) / (2 * MOVEMENT.jumpImpulse)));
}

function guardHoldTime(clock) {
  const t = finite(clock);
  return GUARD_HOLD_START + (((t % GUARD_HOLD_SECONDS) + GUARD_HOLD_SECONDS) % GUARD_HOLD_SECONDS);
}

export function resolveFirstPersonAnimationPlan(pose, view, timeSec) {
  if (pose.state === 'attack') return attackPlan(view, timeSec);
  if (pose.state === 'guard') return { clip: 'Guard', loop: false, time: guardHoldTime(timeSec) };
  if (pose.state === 'cast') return { clip: 'Cast', loop: false, time: Math.max(0, timeSec - view.castStartedAt) };
  if (pose.state === 'dash') return { clip: 'Dash', loop: false, time: Math.max(0, timeSec - (view.dashUntil - 0.18)) };
  return { clip: 'Idle', loop: true, time: timeSec };
}
