import { beginAttack, endAttack, setGuard, tryCastFireball, tryDash } from '../game/combat.mjs';

const MELEE_RANGE = 2.25;
const FIREBALL_RANGE = 11;
const DEFENSE_THREAT_RANGE = 3.1;
const THINK_INTERVAL_SEC = 0.18;
const MIN_REACTION_SEC = 0.22;
const REACTION_JITTER_SEC = 0.2;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function humanTargets(room) {
  return [...room.players.values()].filter((player) => (
    player.actorKind === 'human'
    && player.connected
    && player.alive
  ));
}

function distance2d(a, b) {
  return Math.hypot(b.position.x - a.position.x, b.position.z - a.position.z);
}

function nearestHuman(room, bot) {
  let best = null;
  let bestDistance = Infinity;
  for (const human of humanTargets(room)) {
    const distance = distance2d(bot, human);
    if (distance < bestDistance) {
      best = human;
      bestDistance = distance;
    }
  }
  return best;
}

function yawToward(from, to) {
  const dx = to.position.x - from.position.x;
  const dz = to.position.z - from.position.z;
  return Math.atan2(-dx, -dz);
}

function aimDirection(from, to) {
  const dx = to.position.x - from.position.x;
  const dy = (to.position.y + 0.9) - (from.position.y + 1.25);
  const dz = to.position.z - from.position.z;
  const magnitude = Math.hypot(dx, dy, dz) || 1;
  return { x: dx / magnitude, y: dy / magnitude, z: dz / magnitude };
}

function ensureAi(bot, nowSec, random) {
  if (bot.ai) return bot.ai;
  bot.ai = {
    targetId: null,
    nextThinkAt: nowSec,
    nextDefensiveDecisionAt: nowSec + MIN_REACTION_SEC + random() * REACTION_JITTER_SEC,
    guardUntil: -Infinity,
    attackReleaseAt: -Infinity,
    strafeDirection: random() < 0.5 ? -1 : 1,
  };
  return bot.ai;
}

function releaseExpiredActions(room, bot, ai, nowSec) {
  if (bot.attackHeld && nowSec >= ai.attackReleaseAt) endAttack(room, bot.id, nowSec);
  if (bot.guarding && nowSec >= ai.guardUntil) setGuard(room, bot.id, false, nowSec);
}

function considerDefense(room, bot, target, distance, ai, nowSec, random) {
  if (nowSec < ai.nextDefensiveDecisionAt) return;
  ai.nextDefensiveDecisionAt = nowSec + MIN_REACTION_SEC + random() * REACTION_JITTER_SEC;

  const threatened = distance <= DEFENSE_THREAT_RANGE && target.attackActive;
  if (!threatened || bot.guarding || bot.attackActive || bot.attackHeld) return;

  if (random() < 0.58 && setGuard(room, bot.id, true, nowSec)) {
    ai.guardUntil = nowSec + 0.24 + random() * 0.28;
  }
}

function chooseCombatIntent(room, bot, target, distance, ai, nowSec, random) {
  if (bot.guarding || bot.attackActive || bot.attackHeld || bot.pendingFireball) return;

  if (distance <= MELEE_RANGE) {
    if (beginAttack(room, bot.id, nowSec)) {
      ai.attackReleaseAt = nowSec + 1.9 + random() * 0.3;
    }
    return;
  }

  if (distance <= FIREBALL_RANGE && random() < 0.42) {
    tryCastFireball(room, bot.id, aimDirection(bot, target), nowSec);
    return;
  }

  if (distance > 5 && random() < 0.12) {
    const direction = aimDirection(bot, target);
    tryDash(room, bot.id, { x: direction.x, z: direction.z }, nowSec);
  }
}

function updateMovement(bot, target, distance, ai) {
  const yaw = yawToward(bot, target);
  bot.yaw = yaw;
  bot.pitch = 0;

  let forward = distance > MELEE_RANGE * 0.85 ? 1 : 0;
  let right = 0;
  if (distance < 7) right = ai.strafeDirection * (distance <= MELEE_RANGE ? 0.55 : 0.32);
  if (bot.guarding || bot.attackActive) forward = Math.min(forward, 0.28);

  bot.input = {
    forward: clamp(forward, -1, 1),
    right: clamp(right, -1, 1),
    jump: false,
    yaw,
    pitch: 0,
  };
}

export function stepBotControllers(room, nowSec, world = room.world, { random = Math.random } = {}) {
  void world;
  if (room.state !== 'PLAYING') return;

  for (const bot of room.players.values()) {
    if (bot.actorKind !== 'bot' || !bot.alive) continue;
    const ai = ensureAi(bot, nowSec, random);
    releaseExpiredActions(room, bot, ai, nowSec);

    let target = ai.targetId ? room.players.get(ai.targetId) : null;
    if (!target || target.actorKind !== 'human' || !target.connected || !target.alive) {
      target = nearestHuman(room, bot);
      ai.targetId = target?.id ?? null;
    }

    if (!target) {
      bot.input = { forward: 0, right: 0, jump: false, yaw: bot.yaw, pitch: bot.pitch };
      if (bot.attackHeld) endAttack(room, bot.id, nowSec);
      if (bot.guarding) setGuard(room, bot.id, false, nowSec);
      continue;
    }

    const distance = distance2d(bot, target);
    updateMovement(bot, target, distance, ai);
    considerDefense(room, bot, target, distance, ai, nowSec, random);

    if (nowSec < ai.nextThinkAt) continue;
    ai.nextThinkAt = nowSec + THINK_INTERVAL_SEC;
    chooseCombatIntent(room, bot, target, distance, ai, nowSec, random);
  }
}
