import { findSwordWorldHit, surfaceHeightAt } from '../src/collision.mjs';
import { beginAttack, endAttack, setGuard, tryCastSpell, tryDash } from './combat.mjs';
import { spellFor } from '../src/spells.mjs';
import { postureOf } from '../src/body.mjs';
import { steelStrength } from '../src/steel.mjs';
import { botProfile, nextCycledSpell } from './botBehavior.mjs';
import { wayToward } from './botNav.mjs';

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

function considerDefense(room, actor, target, distance, ai, nowSec, random, aggression, profile) {
  if (nowSec < ai.nextDefensiveDecisionAt) return;
  ai.nextDefensiveDecisionAt = nowSec + MIN_REACTION_SEC + random() * REACTION_JITTER_SEC;

  const threatened = distance <= DEFENSE_THREAT_RANGE && target.attackActive;
  if (!threatened || actor.guarding || actor.attackActive || actor.attackHeld) return;

  if (random() < profile.guard * aggression && setGuard(room, actor.id, true, nowSec)) {
    ai.guardUntil = nowSec + 0.24 + random() * 0.28;
  }
}

function chooseCombatIntent(room, actor, target, distance, ai, nowSec, random, aggression, profile) {
  if (actor.guarding || actor.attackActive || actor.attackHeld || actor.pendingSpell) return;
  // going round something to reach its foe: nothing to throw at, nothing to dash at, until it is round
  if (ai.goingRound && !profile.flee) return;

  // a kind that runs (Sir Runs-a-Lot): away and across when pressed, with a dash to the side, never a blow
  if (profile.flee) {
    if (distance < RUNNER.closeCall && random() < profile.dash * aggression) {
      // running (its back to its foe): on along the way it runs; facing them (caught): aside
      const toward = aimDirection(actor, target);
      const facing = { x: -Math.sin(actor.yaw), z: -Math.cos(actor.yaw) };
      if (facing.x * toward.x + facing.z * toward.z < 0) tryDash(room, actor.id, facing, nowSec);
      else dashAside(room, actor, target, ai, nowSec);
    }
    return;
  }

  // a kind that carries a ward (Mr. Melee's Sheathe in Steel) hardens as a fight begins, never at nothing
  if (profile.ward && shouldHarden(room, actor, target, distance, nowSec)) {
    actor.spell = profile.ward;
    if (tryCastSpell(room, actor.id, aimDirection(actor, target), nowSec)) return;
  }

  // a kind that keeps its distance slips aside and away when a foe gets inside it
  if (profile.keepRange && distance < profile.keepRange[0] - 1.5 && random() < profile.dash * aggression) {
    dashAside(room, actor, target, ai, nowSec);
    return;
  }

  // a swordsman lunges in from just beyond reach, to close to the blade
  if (profile.lunge && distance >= profile.lunge[0] && distance <= profile.lunge[1] && random() < 0.45 * aggression) {
    const direction = aimDirection(actor, target);
    if (tryDash(room, actor.id, { x: direction.x, z: direction.z }, nowSec)) return;
  }

  if (profile.sword && distance <= MELEE_RANGE) {
    if (beginAttack(room, actor.id, nowSec)) {
      ai.attackReleaseAt = nowSec + 1.9 + random() * 0.3;
    }
    return;
  }

  if (profile.spells && random() < 0.42 * aggression) {
    // one that turns through its spells casts the next in turn that can reach (a Gale only from close by)
    const spell = profile.spellCycle ? nextCycledSpell(profile.spellCycle, ai.lastSpell, distance, (id) => castRange(spellFor(id))) : actor.spell;
    if (spell && distance <= castRange(spellFor(spell))) {
      const carried = actor.spell;
      actor.spell = spell;
      if (tryCastSpell(room, actor.id, aimDirection(actor, target), nowSec)) {
        ai.lastSpell = spell;
        // and has it back sooner than a knight would
        if (profile.spellCooldown) actor.spellReadyAt = nowSec + (actor.spellReadyAt - nowSec) * profile.spellCooldown;
        return;
      }
      if (!profile.spellCycle) actor.spell = carried;
    }
  }

  // (a kind that keeps its distance dashes in only from well beyond it)
  if (distance > (profile.keepRange ? profile.keepRange[1] + 2 : 5) && random() < profile.dash * aggression) {
    const direction = aimDirection(actor, target);
    tryDash(room, actor.id, { x: direction.x, z: direction.z }, nowSec);
  }
}

// a dash aside (and a little away) from a foe: the way it is already circling
function dashAside(room, actor, target, ai, nowSec) {
  const direction = aimDirection(actor, target);
  const side = ai.strafeDirection || 1;
  tryDash(room, actor.id, { x: -direction.x * 0.4 - direction.z * side, z: -direction.z * 0.4 + direction.x * side }, nowSec);
}

// Mr. Melee's judgment of when to harden (from what it can see): its Steel ready and not already on, and a fight about
// to begin: a foe close and swinging, or closing fast, or all but in reach; or a spell gathering in a foe's hand close
// by, or one of theirs already on its way to it
const HARDEN = Object.freeze({ near: 3.4, reach: 2.5, closing: 2, spellNear: 8, projectileNear: 7 });

function shouldHarden(room, actor, target, distance, nowSec) {
  if (nowSec < (actor.spellReadyAt ?? 0) || steelStrength(actor.steel, nowSec) > 0.15) return false;
  const dx = target.position.x - actor.position.x;
  const dz = target.position.z - actor.position.z;
  const length = Math.hypot(dx, dz) || 1;
  // how fast the foe is coming (their own motion toward it)
  const closing = -(((target.velocity?.x ?? 0) * dx + (target.velocity?.z ?? 0) * dz) / length);
  if (distance <= HARDEN.near && (target.attackActive || closing > HARDEN.closing || distance <= HARDEN.reach)) return true;
  if (target.pendingSpell && distance <= HARDEN.spellNear) return true;
  for (const projectile of room.projectiles?.values?.() ?? []) {
    if (projectile.ownerId !== target.id) continue;
    const px = actor.position.x - projectile.position.x;
    const pz = actor.position.z - projectile.position.z;
    const away = Math.hypot(px, pz);
    const toward = (projectile.velocity.x * px + projectile.velocity.z * pz) / (away || 1);
    if (away <= HARDEN.projectileNear && toward > 0) return true;
  }
  return false;
}

// how near a foe must be for a spell to be worth it: a Fireball carries; a Gale is felt only near its heart
function castRange(spell) {
  return spell.kind === 'cone' ? spell.cone.reach : FIREBALL_RANGE;
}

// how far a knight could run along a heading before something stops it (m, up to `reach`): a solid at knee or chest
// height, or the ground falling away (a drop of more than a storey, or none at all)
const DROP_TOO_FAR = 2.5;

function openRun(actor, yaw, world, reach = 8) {
  const dx = -Math.sin(yaw);
  const dz = -Math.cos(yaw);
  let clear = reach;
  for (const height of [0.4, 0.9]) {
    const hit = world?.solids?.length
      ? findSwordWorldHit([actor.position.x, actor.position.y + height, actor.position.z], [dx, 0, dz], reach, world.solids)
      : null;
    if (hit) clear = Math.min(clear, hit.distance);
  }
  if (world?.floors?.length) {
    for (let d = 1; d < clear; d += 1) {
      const ground = surfaceHeightAt(actor.position.x + dx * d, actor.position.z + dz * d, actor.position.y + 0.1, world);
      if (ground === null || ground < actor.position.y - DROP_TOO_FAR) return d - 0.5;
    }
  }
  return clear;
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

// Sir Runs-a-Lot, pressed: it turns and runs this far off straight away from its foe, to one side and then the other,
// at a sprint while it has the breath (at 35 degrees a sprint still outruns a knight at a run, not one at a sprint);
// inside `caught` it faces its foe instead, so its guard is up where the blow is
// (lines: the angles off straight away it weighs; farFromMiddle: this far out from the arena's middle, it bends fully
// back toward it; within nearMiddle it pays the middle no mind; closeCall: inside this it spends its dash, along the
// way it is running)
const RUNNER = Object.freeze({
  fleeOffDeg: 35, caught: 2.2, zigSec: [1.6, 3.4], lines: Object.freeze([35, 60, 90, 115]), nearMiddle: 7, farFromMiddle: 16,
  closeCall: 3.2,
});

// the open middle of an arena: the middle of where knights spawn (worked out once per world)
const MIDDLES = new WeakMap();
function arenaMiddle(world) {
  if (!world?.spawnPoints?.length) return { x: 0, z: 0 };
  let middle = MIDDLES.get(world);
  if (!middle) {
    const n = world.spawnPoints.length;
    middle = {
      x: world.spawnPoints.reduce((sum, p) => sum + p.x, 0) / n,
      z: world.spawnPoints.reduce((sum, p) => sum + p.z, 0) / n,
    };
    MIDDLES.set(world, middle);
  }
  return middle;
}

function updateMovement(actor, target, distance, ai, aggression, world, nowSec, profile, way = null) {
  let yaw = yawToward(actor, way ? { position: way } : target);
  actor.yaw = yaw;
  actor.pitch = 0;
  let fleeing = false;

  let forward = distance > MELEE_RANGE * 0.85 ? Math.max(0.45, aggression) : 0;
  let right = 0;
  if (distance < 7) right = ai.strafeDirection * (distance <= MELEE_RANGE ? profile.footwork ?? 0.55 : 0.32) * aggression;
  if (way) {
    // no straight way to its foe: round by the waypoints, at a run
    forward = 1;
    right = 0;
  } else if (profile.keepRange) {
    // a kind that keeps its distance: in when too far, out when too near, across in between (a runner runs across)
    const [near, far] = profile.keepRange;
    if (profile.flee) {
      // a runner makes you chase: it circles across your line at a distance, and when you press it, it turns and runs
      // off at an angle, cutting back the other way every few seconds (a zig-zag, never a straight retreat)
      if (!(nowSec < (ai.zigUntil ?? -Infinity))) {
        ai.strafeDirection = -(ai.strafeDirection || 1);
        const [shortest, longest] = RUNNER.zigSec;
        ai.zigUntil = nowSec + shortest + ((Math.abs(Math.sin(nowSec * 12.9898)) * 43758.5453) % 1) * (longest - shortest);
      }
      // caught: a foe in reach and swinging; it turns to face the blow (and guards: considerDefense)
      const caught = distance <= RUNNER.caught && target.attackActive;
      if (distance < near && !caught) {
        // away from the foe (yaw + half a turn), bent off to the side it is cutting toward; a wall or a drop that way,
        // and it cuts back the other way at once (and if both are shut, straight across its foe's line)
        // (it looks for open ground ahead, not just the next step, and the further it is from the open middle of the
        // arena the more it bends back toward it: it runs loops round its foe rather than into a corner)
        const heading = (side, off) => yaw + Math.PI - side * off * (Math.PI / 180);
        const side = ai.strafeDirection || 1;
        const middle = arenaMiddle(world);
        const outX = middle.x - actor.position.x;
        const outZ = middle.z - actor.position.z;
        const out = Math.hypot(outX, outZ) || 1;
        const pull = Math.max(0, Math.min(1, (out - RUNNER.nearMiddle) / (RUNNER.farFromMiddle - RUNNER.nearMiddle)));
        let chosen = [side, RUNNER.fleeOffDeg];
        let best = -Infinity;
        for (const off of RUNNER.lines) {
          for (const way of [side, -side]) {
            const h = heading(way, off);
            const room = openRun(actor, h, world);
            const inward = (-Math.sin(h) * outX - Math.cos(h) * outZ) / out;
            const score = Math.min(room, 8) / 8 * 2 - (room < 3 ? 3 : 0) + inward * pull * 1.5
              + (way === side ? 0.3 : 0) - (off - RUNNER.fleeOffDeg) / 100;
            if (score > best) { best = score; chosen = [way, off]; }
          }
        }
        if (chosen[0] !== side) {
          ai.strafeDirection = chosen[0];
          ai.zigUntil = nowSec + RUNNER.zigSec[0];
        }
        yaw = heading(...chosen);
        actor.yaw = yaw;
        forward = 1;
        right = 0;
        fleeing = true;
      } else {
        forward = distance > far ? 0.6 : caught ? -0.6 : 0;
        right = ai.strafeDirection;
      }
    } else {
      forward = distance > far ? 0.75 : distance < near ? -0.8 : 0;
      right = ai.strafeDirection * 0.6;
    }
  }
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
    && (distance > BOT_SPRINT_DISTANCE || fleeing)
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

    const profile = botProfile(actor);
    const distance = distance2d(actor, target);
    // (a runner pressed runs its own way; any other kind that cannot run straight at its foe goes round)
    const pressed = profile.flee && distance < (profile.keepRange?.[0] ?? 0);
    const way = pressed ? null : wayToward(world, actor, target, ai, nowSec);
    ai.goingRound = Boolean(way);
    updateMovement(actor, target, distance, ai, aggressionScale, world, nowSec, profile, way);
    considerDefense(room, actor, target, distance, ai, nowSec, random, aggressionScale, profile);

    if (nowSec < ai.nextThinkAt) continue;
    ai.nextThinkAt = nowSec + THINK_INTERVAL_SEC;
    chooseCombatIntent(room, actor, target, distance, ai, nowSec, random, aggressionScale, profile);
  }
}
