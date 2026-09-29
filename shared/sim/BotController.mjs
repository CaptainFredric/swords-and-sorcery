import { findSwordWorldHit } from '../src/collision.mjs';
import { beginAttack, endAttack, setGuard, tryCastSpell, tryDash } from './combat.mjs';
import { spellFor } from '../src/spells.mjs';
import { postureOf } from '../src/body.mjs';

const MELEE_RANGE = 2.25;
const FIREBALL_RANGE = 11;
const DEFENSE_THREAT_RANGE = 3.1;
const THINK_INTERVAL_SEC = 0.18;
const MIN_REACTION_SEC = 0.22;
const REACTION_JITTER_SEC = 0.2;
const AVOID_PROBE_RANGE = 1.65;
const AVOID_DURATION_SEC = 0.62;
const PROGRESS_SAMPLE_SEC = 0.7;
const MIN_PROGRESS_METERS = 0.3;
const ESCAPE_DURATION_SEC = 0.7;

const BOT_SPRINT_DISTANCE = 9;
const BOT_SPRINT_STAMINA_RESERVE = 45;

// When its foe falls, a bot does not keep hacking at the body or rush on as if someone still stood there. It lets
// the attack go (a swing already under way still lands), looks at the fallen a moment to be sure, steps back, then
// turns to find the next foe, or, with nobody to fight, walks the middle of the arena until someone is back. It is
// short: never a long gloat to be punished for, and a foe who comes at it in the meantime is answered at once.
// Each pause over a body is a little different (how long it looks, whether it steps back or aside first, where it
// wanders, which way it looks about), so the pattern reads as behaviour rather than a routine. Current tuning.
export const POST_KILL = Object.freeze({
  confirm: Object.freeze([0.3, 0.65]),     // seconds looking at the body
  settle: Object.freeze([0.45, 0.8]),      // then easing away from it
  // how it first moves as it looks: stands still, steps back, or steps aside (shares of the time, in that order)
  styles: Object.freeze([0.45, 0.3, 0.25]),
  step: 0.55,                              // that step, as much of a run as it asks (a short, quick step)
  threat: 3.5,                             // metres: a live foe this close ends it early
  walk: 0.4,                               // walking away from the body (as much of a run as it asks)
  patrolRadius: 4,                         // metres around the arena's middle it wanders while nobody is there
  patrolWalk: Object.freeze([0.38, 0.52]), // how fast it walks meanwhile
  patrolRest: Object.freeze([0.5, 1.5]),   // and how long it stands and looks about at each spot
});

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
  // (at the middle of the body as it stands or crouches, from the casting hand)
  const dy = (to.position.y + postureOf(to).center) - (from.position.y + postureOf(from).eye - 0.1);
  const dz = to.position.z - from.position.z;
  const magnitude = Math.hypot(dx, dy, dz) || 1;
  return { x: dx / magnitude, y: dy / magnitude, z: dz / magnitude };
}

function ensureAi(actor, nowSec, random) {
  if (actor.ai) {
    actor.ai.avoidUntil ??= -Infinity;
    actor.ai.avoidDirection ??= actor.ai.strafeDirection ?? 1;
    actor.ai.progressSampleAt ??= nowSec;
    actor.ai.progressSamplePosition ??= { x: actor.position.x, z: actor.position.z };
    actor.ai.escapeUntil ??= -Infinity;
    return actor.ai;
  }
  actor.ai = {
    targetId: null,
    postKill: null,
    patrol: null,
    nextThinkAt: nowSec,
    nextDefensiveDecisionAt: nowSec + MIN_REACTION_SEC + random() * REACTION_JITTER_SEC,
    guardUntil: -Infinity,
    attackReleaseAt: -Infinity,
    strafeDirection: random() < 0.5 ? -1 : 1,
    avoidDirection: random() < 0.5 ? -1 : 1,
    avoidUntil: -Infinity,
    progressSampleAt: nowSec,
    progressSamplePosition: { x: actor.position.x, z: actor.position.z },
    escapeUntil: -Infinity,
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
  if (actor.guarding || actor.attackActive || actor.attackHeld || actor.pendingSpell) return;

  if (distance <= MELEE_RANGE) {
    if (beginAttack(room, actor.id, nowSec)) {
      ai.attackReleaseAt = nowSec + 1.9 + random() * 0.3;
    }
    return;
  }

  if (distance <= castRange(spellFor(actor.spell)) && random() < 0.42 * aggression) {
    tryCastSpell(room, actor.id, aimDirection(actor, target), nowSec);
    return;
  }

  if (distance > 5 && random() < 0.12 * aggression) {
    const direction = aimDirection(actor, target);
    tryDash(room, actor.id, { x: direction.x, z: direction.z }, nowSec);
  }
}

// how near a foe must be for a spell to be worth it: a Fireball carries; a Gale is felt only near its heart
function castRange(spell) {
  return spell.kind === 'cone' ? spell.cone.reach : FIREBALL_RANGE;
}

function forwardLaneBlocked(actor, yaw, world) {
  if (!world?.solids?.length) return false;
  const direction = [-Math.sin(yaw), 0, -Math.cos(yaw)];
  const origin = [actor.position.x, actor.position.y + 0.9, actor.position.z];
  return Boolean(findSwordWorldHit(origin, direction, AVOID_PROBE_RANGE, world.solids));
}

function resetProgressSample(actor, ai, nowSec) {
  ai.progressSampleAt = nowSec;
  ai.progressSamplePosition = { x: actor.position.x, z: actor.position.z };
}

function detectStuckMovement(actor, ai, nowSec, wantsMeaningfulMovement) {
  if (nowSec < ai.escapeUntil) return;
  if (!wantsMeaningfulMovement) {
    resetProgressSample(actor, ai, nowSec);
    return;
  }
  if (nowSec - ai.progressSampleAt < PROGRESS_SAMPLE_SEC) return;

  const progress = Math.hypot(
    actor.position.x - ai.progressSamplePosition.x,
    actor.position.z - ai.progressSamplePosition.z,
  );
  resetProgressSample(actor, ai, nowSec);
  if (progress >= MIN_PROGRESS_METERS) return;

  ai.strafeDirection *= -1;
  ai.avoidDirection = ai.strafeDirection;
  ai.avoidUntil = -Infinity;
  ai.escapeUntil = nowSec + ESCAPE_DURATION_SEC;
}

function updateMovement(actor, target, distance, ai, aggression, world, nowSec) {
  const yaw = yawToward(actor, target);
  actor.yaw = yaw;
  actor.pitch = 0;

  let forward = distance > MELEE_RANGE * 0.85 ? Math.max(0.45, aggression) : 0;
  let right = 0;
  if (distance < 7) right = ai.strafeDirection * (distance <= MELEE_RANGE ? 0.55 : 0.32) * aggression;
  if (actor.guarding || actor.attackActive) forward = Math.min(forward, 0.28);

  const escapeExpired = ai.escapeUntil !== -Infinity && nowSec >= ai.escapeUntil;
  if (escapeExpired) {
    ai.escapeUntil = -Infinity;
    resetProgressSample(actor, ai, nowSec);
  }

  const priorInput = actor.input ?? { forward: 0, right: 0 };
  const wantsMeaningfulMovement = distance > MELEE_RANGE * 0.85
    && (priorInput.forward > 0.4 || Math.abs(priorInput.right) > 0.4);
  if (!escapeExpired) detectStuckMovement(actor, ai, nowSec, wantsMeaningfulMovement);

  if (nowSec < ai.escapeUntil) {
    forward = actor.guarding || actor.attackActive ? 0 : -0.18;
    right = ai.strafeDirection * 0.92;
  } else {
    const blocked = forward > 0 && forwardLaneBlocked(actor, yaw, world);
    if (blocked && nowSec >= ai.avoidUntil) {
      ai.avoidDirection = ai.strafeDirection || ai.avoidDirection || 1;
      ai.avoidUntil = nowSec + AVOID_DURATION_SEC;
    }
    if (nowSec < ai.avoidUntil) {
      forward = Math.min(forward, 0.24);
      right = ai.avoidDirection * 0.88;
    }
  }

  // close long gaps at a sprint, but keep enough stamina in reserve to block when the fight starts
  const sprint = forward > 0.4
    && distance > BOT_SPRINT_DISTANCE
    && (actor.guardStamina ?? 0) > BOT_SPRINT_STAMINA_RESERVE
    && nowSec >= ai.escapeUntil
    && nowSec >= ai.avoidUntil;

  actor.input = {
    forward: clamp(forward, -1, 1),
    right: clamp(right, -1, 1),
    jump: false,
    sprint,
    yaw,
    pitch: 0,
  };
}

// the fallen foe's body, and how long the bot takes over it (see POST_KILL)
function beginPostKill(room, actor, fallen, ai, nowSec, random) {
  const confirm = POST_KILL.confirm[0] + random() * (POST_KILL.confirm[1] - POST_KILL.confirm[0]);
  const settle = POST_KILL.settle[0] + random() * (POST_KILL.settle[1] - POST_KILL.settle[0]);
  const roll = random();
  const style = roll < POST_KILL.styles[0] ? 'still' : roll < POST_KILL.styles[0] + POST_KILL.styles[1] ? 'back' : 'aside';
  ai.postKill = {
    body: { x: fallen.position.x, z: fallen.position.z },
    confirmUntil: nowSec + confirm,
    until: nowSec + confirm + settle,
    style,
    // a step lasts a moment at the start of the look; aside goes left or right
    stepUntil: nowSec + 0.18 + random() * 0.12,
    side: random() < 0.5 ? -1 : 1,
    walk: POST_KILL.walk * (0.9 + random() * 0.25),
  };
  ai.targetId = null;
  ai.patrol = null;
  // no more pressure on the body: the button is let go (a swing already under way still lands)
  if (actor.attackHeld) endAttack(room, actor.id, nowSec);
  ai.attackReleaseAt = -Infinity;
  if (actor.guarding) setGuard(room, actor.id, false, nowSec);
}

// a live foe close enough to matter (it ends the pause over a body at once)
function threatNear(room, actor) {
  const foe = nearestHuman(room, actor);
  return foe && distance2d(actor, foe) <= POST_KILL.threat ? foe : null;
}

// over the body: a look at it, then a step back and a turn toward whoever is left (or the arena's middle)
function postKillMovement(room, actor, ai, nowSec) {
  const body = { position: { x: ai.postKill.body.x, z: ai.postKill.body.z } };
  const next = nearestHuman(room, actor);
  const pk = ai.postKill;
  if (nowSec < pk.confirmUntil) {
    // looking down at it: from where it stands, or after a quick step back or aside
    const stepping = nowSec < pk.stepUntil && pk.style !== 'still';
    const forward = stepping && pk.style === 'back' ? -POST_KILL.step : 0;
    const right = stepping && pk.style === 'aside' ? pk.side * POST_KILL.step : 0;
    actor.input = { forward, right, jump: false, sprint: false, yaw: yawToward(actor, body), pitch: -0.25 };
    return;
  }
  // then a walk away from it, toward whoever is left (or the arena's middle)
  const toward = next ?? { position: { x: 0, z: 0 } };
  actor.input = { forward: pk.walk, right: 0, jump: false, sprint: false, yaw: yawToward(actor, toward), pitch: 0 };
}

// nobody to fight (the foe is down and not back yet): walk the middle of the arena, not the body or a spawn
function patrol(actor, ai, nowSec, random, world) {
  const here = actor.position;
  // at a spot: stand a moment and look about, then on to the next
  if (ai.patrol?.restUntil > nowSec) {
    const { lookFrom, restFrom, scan, scanRate } = ai.patrol;
    const look = lookFrom + Math.sin((nowSec - restFrom) * scanRate) * scan;
    actor.input = { forward: 0, right: 0, jump: false, sprint: false, yaw: look, pitch: 0 };
    actor.yaw = look;
    return;
  }
  const arrived = ai.patrol && Math.hypot(ai.patrol.x - here.x, ai.patrol.z - here.z) < 1.2;
  if (arrived && !ai.patrol.rested) {
    const rest = POST_KILL.patrolRest[0] + random() * (POST_KILL.patrolRest[1] - POST_KILL.patrolRest[0]);
    // it looks about one way or the other, more or less widely
    const scan = (random() < 0.5 ? -1 : 1) * (0.45 + random() * 0.5);
    Object.assign(ai.patrol, { rested: true, restFrom: nowSec, restUntil: nowSec + rest, lookFrom: actor.yaw, scan, scanRate: 1.2 + random() * 0.8 });
    actor.input = { forward: 0, right: 0, jump: false, sprint: false, yaw: actor.yaw, pitch: 0 };
    return;
  }
  const stale = !ai.patrol || arrived || nowSec > ai.patrol.until
    || forwardLaneBlocked(actor, yawToward(actor, { position: ai.patrol }), world);
  if (stale) {
    const angle = random() * Math.PI * 2;
    const reach = POST_KILL.patrolRadius * (0.35 + 0.65 * random());
    const walk = POST_KILL.patrolWalk[0] + random() * (POST_KILL.patrolWalk[1] - POST_KILL.patrolWalk[0]);
    ai.patrol = { x: Math.cos(angle) * reach, z: Math.sin(angle) * reach, until: nowSec + 6, walk };
  }
  const yaw = yawToward(actor, { position: ai.patrol });
  actor.input = { forward: ai.patrol.walk, right: 0, jump: false, sprint: false, yaw, pitch: 0 };
  actor.yaw = yaw;
}

export function stepBotControllers(
  room,
  nowSec,
  world = room.world,
  { random = Math.random, actorKinds = ['bot'], aggression = 1 } = {},
) {
  if (room.state !== 'PLAYING') return;
  const allowedKinds = new Set(actorKinds);
  const aggressionScale = clamp(aggression, 0.1, 1);

  for (const actor of room.players.values()) {
    if (!allowedKinds.has(actor.actorKind) || !actor.alive) continue;
    const ai = ensureAi(actor, nowSec, random);
    releaseExpiredActions(room, actor, ai, nowSec);

    let target = ai.targetId ? room.players.get(ai.targetId) : null;
    // its foe has just fallen: stop, be sure, and move on (POST_KILL)
    if (target && !target.alive && !ai.postKill) beginPostKill(room, actor, target, ai, nowSec, random);
    if (ai.postKill) {
      const threat = threatNear(room, actor);
      if (nowSec >= ai.postKill.until || threat) {
        ai.postKill = null;
        ai.nextThinkAt = Math.max(ai.nextThinkAt, nowSec + (threat ? 0 : THINK_INTERVAL_SEC));
      } else {
        if (actor.attackHeld) endAttack(room, actor.id, nowSec);
        postKillMovement(room, actor, ai, nowSec);
        actor.yaw = actor.input.yaw;
        continue;
      }
    }
    if (!target || target.actorKind !== 'human' || !target.connected || !target.alive) {
      target = nearestHuman(room, actor);
      ai.targetId = target?.id ?? null;
    }

    if (!target) {
      patrol(actor, ai, nowSec, random, world);
      ai.avoidUntil = -Infinity;
      ai.escapeUntil = -Infinity;
      resetProgressSample(actor, ai, nowSec);
      if (actor.attackHeld) endAttack(room, actor.id, nowSec);
      if (actor.guarding) setGuard(room, actor.id, false, nowSec);
      continue;
    }
    ai.patrol = null;

    const distance = distance2d(actor, target);
    updateMovement(actor, target, distance, ai, aggressionScale, world, nowSec);
    considerDefense(room, actor, target, distance, ai, nowSec, random, aggressionScale);

    if (nowSec < ai.nextThinkAt) continue;
    ai.nextThinkAt = nowSec + THINK_INTERVAL_SEC;
    chooseCombatIntent(room, actor, target, distance, ai, nowSec, random, aggressionScale);
  }
}
