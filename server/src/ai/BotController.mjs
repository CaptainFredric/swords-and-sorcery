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

function nearestHuman(room, actor) {
  let best = null;
  let bestDistance = Infinity;
  for (const human of humanTargets(room)) {
    const distance = distance2d(actor, human);
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

function ensureAi(actor, nowSec, random) {
  if (actor.ai) return actor.ai;
  actor.ai = {
    targetId: null,
    nextThinkAt: nowSec,
    nextDefensiveDecisionAt: nowSec + MIN_REACTION_SEC + random() * REACTION_JITTER_SEC,
    guardUntil: -Infinity,
    attackReleaseAt: -Infinity,
    strafeDirection: random() < 0.5 ? -1 : 1,
  };
  return actor.ai;
}

function releaseExpiredActions(room, actor, ai, nowSec) {
  if (actor.attackHeld && nowSec >= ai.attackReleaseAt) endAttack(room, actor.id, nowSec);
  if (actor.guarding && nowSec >= ai.guardUntil) setGuard(room, actor.id, false, nowSec);
}

function considerDefense(room, actor, target, distance, ai, nowSec, random, aggression) {
  if (nowSec < ai.nextDefensiveDecisionAt) return;
  ai.nextDefensiveDecisionAt = nowSec + MIN_REACTION_SEC + random() * REACTION_JITTER_SEC;

  const threatened = distance <= DEFENSE_THREAT_RANGE && target.attackActive;
  if (!threatened || actor.guarding || actor.attackActive || actor.attackHeld) return;

  if (random() < 0.58 * aggression && setGuard(room, actor.id, true, nowSec)) {
    ai.guardUntil = nowSec + 0.24 + random() * 0.28;
  }
}

function chooseCombatIntent(room, actor, target, distance, ai, nowSec, random, aggression) {
  if (actor.guarding || actor.attackActive || actor.attackHeld || actor.pendingFireball) return;

  if (distance <= MELEE_RANGE) {
    if (beginAttack(room, actor.id, nowSec)) {
      ai.attackReleaseAt = nowSec + 1.9 + random() * 0.3;
    }
    return;
  }

  if (distance <= FIREBALL_RANGE && random() < 0.42 * aggression) {
    tryCastFireball(room, actor.id, aimDirection(actor, target), nowSec);
    return;
  }

  if (distance > 5 && random() < 0.12 * aggression) {
    const direction = aimDirection(actor, target);
    tryDash(room, actor.id, { x: direction.x, z: direction.z }, nowSec);
  }
}

function updateMovement(actor, target, distance, ai, aggression) {
  const yaw = yawToward(actor, target);
  actor.yaw = yaw;
  actor.pitch = 0;

  let forward = distance > MELEE_RANGE * 0.85 ? Math.max(0.45, aggression) : 0;
  let right = 0;
  if (distance < 7) right = ai.strafeDirection * (distance <= MELEE_RANGE ? 0.55 : 0.32) * aggression;
  if (actor.guarding || actor.attackActive) forward = Math.min(forward, 0.28);

  actor.input = {
    forward: clamp(forward, -1, 1),
    right: clamp(right, -1, 1),
    jump: false,
    yaw,
    pitch: 0,
  };
}

export function stepBotControllers(
  room,
  nowSec,
  world = room.world,
  { random = Math.random, actorKinds = ['bot'], aggression = 1 } = {},
) {
  void world;
  if (room.state !== 'PLAYING') return;
  const allowedKinds = new Set(actorKinds);
  const aggressionScale = clamp(aggression, 0.1, 1);

  for (const actor of room.players.values()) {
    if (!allowedKinds.has(actor.actorKind) || !actor.alive) continue;
    const ai = ensureAi(actor, nowSec, random);
    releaseExpiredActions(room, actor, ai, nowSec);

    let target = ai.targetId ? room.players.get(ai.targetId) : null;
    if (!target || target.actorKind !== 'human' || !target.connected || !target.alive) {
      target = nearestHuman(room, actor);
      ai.targetId = target?.id ?? null;
    }

    if (!target) {
      actor.input = { forward: 0, right: 0, jump: false, yaw: actor.yaw, pitch: actor.pitch };
      if (actor.attackHeld) endAttack(room, actor.id, nowSec);
      if (actor.guarding) setGuard(room, actor.id, false, nowSec);
      continue;
    }

    const distance = distance2d(actor, target);
    updateMovement(actor, target, distance, ai, aggressionScale);
    considerDefense(room, actor, target, distance, ai, nowSec, random, aggressionScale);

    if (nowSec < ai.nextThinkAt) continue;
    ai.nextThinkAt = nowSec + THINK_INTERVAL_SEC;
    chooseCombatIntent(room, actor, target, distance, ai, nowSec, random, aggressionScale);
  }
}
