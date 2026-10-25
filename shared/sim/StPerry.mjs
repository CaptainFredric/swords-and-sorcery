import { beginAttack, endAttack, setGuard, tryCastSpell, tryDash, tryUltimate, cancelAttack } from './combat.mjs';
import { postureOf } from '../src/body.mjs';
import { segmentAabbHit } from '../src/collision.mjs';
import { activeUltimate } from '../src/ultimates.mjs';
import { PROWESS } from '../src/prowess.mjs';
import { BOT_SKILLS } from './botSkill.mjs';
import { BOT_PROFILES } from './botBehavior.mjs';
import { stepBotControllers, nextContactAt } from './BotController.mjs';
import { wayToward } from './botNav.mjs';

const DEFENSE_THREAT_RANGE = 3.1;
const PARRY_LEAD_SEC = 0.10;
const PARRY_HOLD_SEC = 0.28;
const COUNTERATTACK_DELAY_SEC = 0.22;
const GUARD_CONE_RAD = (115 * Math.PI) / 180;
const GUARD_CONE_COS = Math.cos(GUARD_CONE_RAD / 2);
const PERRY_TURN_RATE = Math.PI * 1.8;

const PREPARED_SPELLS = Object.freeze(['fireball', 'frostfire', 'gale']);

function turnToward(currentYaw, targetYaw, maxStep) {
  const diff = Math.atan2(Math.sin(targetYaw - currentYaw), Math.cos(targetYaw - currentYaw));
  const step = Math.max(-maxStep, Math.min(maxStep, diff));
  return currentYaw + step;
}

export const PERRY_PROFILE = Object.freeze({
  name: 'St. Perry the Prodigious',
  sword: true,
  spells: false,
  guard: 1.0,
  dash: 0,
  keepRange: null,
  flee: false,
  footwork: 0.35,
});

export const PERRY_CANONIZED_PROFILE = Object.freeze({
  name: 'St. Perry the Prodigious',
  sword: true,
  spells: true,
  guard: 1.3,
  dash: 0.35,
  keepRange: null,
  flee: false,
  ward: 'steel',
  lunge: Object.freeze([3.2, 7]),
  footwork: 0.85,
  spellCycle: PREPARED_SPELLS,
});

export const PERRY_CANONIZED_SKILL = Object.freeze({
  ...BOT_SKILLS.spellblade,
  name: 'St. Perry the Prodigious',
  label: 'St. Perry the Prodigious',
  reaction: Object.freeze([0.16, 0.04]),
  think: 0.10,
  guard: 1.3,
  guardFloor: 16,
  parry: 0.88,
  spacing: 0.35,
  punish: 0.95,
  patience: 0.80,
  lead: 1.0,
  aimError: 0.015,
  dodge: 0.70,
  retreat: 28,
  smartUltimate: true,
  edgeGale: 1.0,
  sprintReserve: 45,
  mistakes: 0,
  aggression: 1.0,
  chain: Object.freeze([1.9, 0.3]),
  yields: true,
});

function forwardFromYaw(yaw) {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

function targetFor(room, actor) {
  let target = null;
  let nearest = Infinity;
  for (const player of room.players.values()) {
    if (player.actorKind !== 'human' || !player.alive || !player.connected) continue;
    const distance = Math.hypot(player.position.x - actor.position.x, player.position.z - actor.position.z);
    if (distance < nearest) {
      target = player;
      nearest = distance;
    }
  }
  return target;
}

function targetBlockedByWorld(attackerTransform, targetTransform, world) {
  const start = [attackerTransform.position.x, attackerTransform.position.y + postureOf(attackerTransform).eye, attackerTransform.position.z];
  const end = [targetTransform.position.x, targetTransform.position.y + postureOf(targetTransform).center, targetTransform.position.z];
  for (const box of world.solids ?? []) {
    if (segmentAabbHit(start, end, box)) return true;
  }
  return false;
}

export function isCorrectPerryAnswer(answer) {
  if (!answer || typeof answer !== 'string') return false;
  const normalized = answer.trim().toLowerCase();
  return normalized.includes('parry') || normalized.includes('parrying');
}

export function setupStPerry(actor, nowSec, canonized = false) {
  actor.name = 'St. Perry the Prodigious';
  actor.botProfile = canonized ? PERRY_CANONIZED_PROFILE : PERRY_PROFILE;
  actor.botSkill = canonized ? PERRY_CANONIZED_SKILL : 'knight';
  actor.health = 100;
  actor.guardStamina = 100;
  actor.guarding = false;
  actor.staggerUntil = -Infinity;
  actor.recoverUntil = -Infinity;
  actor.alive = true;
  actor.respawnAt = 0;

  if (canonized) {
    actor.ultimate = actor.startingUltimate = 'chivalry';
    actor.spell = actor.startingSpell = PREPARED_SPELLS[0];
    actor.preparedSpells = [...PREPARED_SPELLS];
    actor.startingPreparedSpells = [...PREPARED_SPELLS];
    actor.prowess = 0;
  } else {
    actor.ultimate = actor.startingUltimate = null;
    actor.spell = actor.startingSpell = 'fireball';
    actor.preparedSpells = ['fireball'];
    actor.startingPreparedSpells = ['fireball'];
    actor.prowess = 0;
  }

  const prev = actor.stPerry;
  actor.stPerry = {
    canonized,
    parries: prev?.parries ?? 0,
    playerCounterParries: prev?.playerCounterParries ?? 0,
    playerHits: prev?.playerHits ?? 0,
    unlocked: Boolean(prev?.unlocked || canonized),
    anchor: { x: actor.position.x, y: actor.position.y, z: actor.position.z },
    guardUntil: -Infinity,
    pendingCounter: false,
    counterattackAt: -Infinity,
    lastCounterAt: -Infinity,
    lastEventCheckedAt: nowSec,
    castSlot: -1,
    dashSlot: -1,
    spellIndex: 0,
    navigation: {},
    dialogue: prev?.dialogue ?? {
      state: 'intro',
      wrongCount: 0,
      solved: false,
      dismissed: false,
      lastLine: 'I am St. Perry, the Prodigious! Any idea why that is my name?',
    },
  };
}

export function cleanupStPerry(room, actor, nowSec) {
  if (actor.guarding) setGuard(room, actor.id, false, nowSec);
  if (actor.attackHeld || actor.attackActive) cancelAttack(room, actor.id, nowSec);
  if (actor.ultimateState) {
    room.events.push({ type: 'ultimateEnded', playerId: actor.id, ultimate: actor.ultimateState.id, at: nowSec });
    actor.ultimateState = null;
  }
  actor.stPerry = null;
}

export function answerPerryDialogue(room, player, answer, nowSec) {
  const dummy = [...room.players.values()].find((p) => p.actorKind === 'dummy' && p.stPerry);
  if (!dummy || !dummy.stPerry) return false;
  const d = dummy.stPerry.dialogue;
  if (isCorrectPerryAnswer(answer)) {
    d.solved = true;
    d.state = 'correct';
    d.lastLine = 'Precisely! The art of the parry, elevated to saintliness. Raise your blade and strike at me!';
    room.events.push({
      type: 'stPerryDialogue',
      text: d.lastLine,
      speaker: 'St. Perry the Prodigious',
      correct: true,
      wrongCount: d.wrongCount,
      at: nowSec,
    });
    return true;
  }

  d.wrongCount += 1;
  d.state = 'wrong';
  if (d.wrongCount === 1) {
    d.lastLine = 'Incorrect! You are lucky I am a St. Try again.';
  } else {
    d.lastLine = 'Have you grown in intellect since we last spoke?';
  }
  room.events.push({
    type: 'stPerryDialogue',
    text: d.lastLine,
    speaker: 'St. Perry the Prodigious',
    correct: false,
    wrongCount: d.wrongCount,
    at: nowSec,
  });
  return true;
}

export function dismissPerryDialogue(room, player, nowSec) {
  const dummy = [...room.players.values()].find((p) => p.actorKind === 'dummy' && p.stPerry);
  if (!dummy || !dummy.stPerry) return false;
  dummy.stPerry.dialogue.dismissed = true;
  return true;
}

export function unlockCanonization(room, actor, nowSec) {
  const perry = actor.stPerry;
  if (!perry) return;
  if (!perry.unlocked) {
    perry.unlocked = true;
    room.events.push({
      type: 'stPerryUnlocked',
      playerId: actor.id,
      at: nowSec,
      message: 'Canonization Unlocked! St. Perry acknowledges your parrying skill.',
    });
  }
}

function processPerryEvents(room, actor, target, nowSec) {
  const perry = actor.stPerry;
  if (!perry) return;

  // 1. Authoritative counter sync: actor.parries directly increments on parry in combat.mjs
  if (actor.parries > perry.parries) {
    perry.parries = actor.parries;
    setGuard(room, actor.id, false, nowSec);
    perry.guardUntil = -Infinity;
    perry.pendingCounter = true;
    perry.counterattackAt = nowSec + COUNTERATTACK_DELAY_SEC;
    room.events.push({
      type: 'stPerryFeedback',
      kind: 'perryParry',
      count: perry.parries,
      at: nowSec,
    });
    if (perry.parries >= 3 && perry.playerCounterParries >= 1) {
      unlockCanonization(room, actor, nowSec);
    }
  }

  // 2. Authoritative counterparry sync: player parries Perry's counterattack
  if (target) {
    const playerParries = target.parries ?? 0;
    if (playerParries > perry.playerCounterParries) {
      perry.playerCounterParries = playerParries;
      perry.counterAttacking = false;
      perry.pendingCounter = false;
      room.events.push({
        type: 'stPerryFeedback',
        kind: 'playerCounterParry',
        count: perry.playerCounterParries,
        at: nowSec,
      });
      if (perry.parries >= 3 && perry.playerCounterParries >= 1) {
        unlockCanonization(room, actor, nowSec);
      }
    }
  }

  // 3. Inspect room.events for additional feedback events (e.g. player hits)
  const lastChecked = perry.lastEventCheckedAt ?? -Infinity;

  for (const event of room.events) {
    if (event.at < lastChecked) continue;

    if (event.type === 'damage' && event.victimId === actor.id && event.attackerId === target?.id) {
      perry.playerHits += 1;
      room.events.push({
        type: 'stPerryFeedback',
        kind: 'playerHit',
        source: event.source,
        at: nowSec,
      });
    }
  }

  if (perry.parries >= 3 && perry.playerCounterParries >= 1) {
    unlockCanonization(room, actor, nowSec);
  }

  perry.lastEventCheckedAt = nowSec;
}

function stepCanonizedChivalry(room, actor, target, nowSec, world) {
  const perry = actor.stPerry;
  const state = actor.ultimateState;
  const dx = target.position.x - actor.position.x;
  const dz = target.position.z - actor.position.z;
  const dy = target.position.y + postureOf(target).center - actor.position.y - postureOf(actor).eye + 0.1;
  const distance = Math.hypot(dx, dz);
  const length = Math.hypot(dx, dy, dz) || 1;
  const direction = { x: dx / length, y: dy / length, z: dz / length };

  actor.yaw = Math.atan2(-dx, -dz);
  actor.pitch = Math.asin(direction.y);

  const age = Math.max(0, nowSec - state.commitAt);
  const loop = Math.floor(age / 2.5);
  const phase = age % 2.5;

  const contact = nextContactAt(target, nowSec);
  const incomingThreat = distance <= DEFENSE_THREAT_RANGE && target.attackActive;
  const inParryWindow = contact !== null && nowSec >= contact - PARRY_LEAD_SEC && nowSec < contact;
  const guard = inParryWindow || phase < 0.6;
  const sword = distance < 3.2 && phase >= 0.5 && phase < 2.2;

  const way = wayToward(world, actor, target, perry.navigation, nowSec);
  const movementYaw = way ? Math.atan2(-(way.x - actor.position.x), -(way.z - actor.position.z)) : actor.yaw;
  const relative = movementYaw - actor.yaw;
  const forward = distance > 2.5 ? 0.75 : distance < 1.3 ? -0.35 : 0;

  actor.input = {
    forward: forward * Math.cos(relative),
    right: -forward * Math.sin(relative),
    jump: false,
    attack: sword,
    guard,
    yaw: actor.yaw,
    pitch: actor.pitch,
  };

  if (guard !== actor.guardHeld || (guard && !actor.guarding)) setGuard(room, actor.id, guard, nowSec);
  if (sword && !actor.attackHeld) beginAttack(room, actor.id, nowSec);
  else if (!sword && actor.attackHeld) endAttack(room, actor.id, nowSec);

  const slot = phase >= 1.5 ? loop * 2 + 1 : phase >= 0.8 ? loop * 2 : -1;
  if (slot >= 0 && slot !== perry.castSlot) {
    perry.castSlot = slot;
    const spell = PREPARED_SPELLS[perry.spellIndex++ % PREPARED_SPELLS.length];
    tryCastSpell(room, actor.id, spell, direction, nowSec);
  }

  if (phase >= 1.6 && perry.dashSlot !== loop && distance > 3.5) {
    perry.dashSlot = loop;
    tryDash(room, actor.id, { x: direction.x, z: direction.z }, nowSec);
  }
}

export function stepStPerry(room, actor, nowSec, world = room.world, { random = Math.random } = {}) {
  if (room.mode !== 'PRACTICE' || room.state !== 'PLAYING') return;
  if (!actor.stPerry) setupStPerry(actor, nowSec, actor.practiceMode === 'CANONIZATION');

  const perry = actor.stPerry;
  if (!actor.alive) {
    if (actor.guarding) setGuard(room, actor.id, false, nowSec);
    if (actor.attackHeld || actor.attackActive) cancelAttack(room, actor.id, nowSec);
    actor.input = { forward: 0, right: 0, jump: false, attack: false, guard: false, yaw: actor.yaw, pitch: 0 };
    return;
  }

  const target = targetFor(room, actor);
  if (!target) {
    if (actor.attackHeld || actor.attackActive) cancelAttack(room, actor.id, nowSec);
    if (actor.guarding) setGuard(room, actor.id, false, nowSec);
    actor.input = { forward: 0, right: 0, jump: false, attack: false, guard: false, yaw: actor.yaw, pitch: 0 };
    return;
  }

  processPerryEvents(room, actor, target, nowSec);

  // CANONIZATION MODE: Full Spellblade duel
  if (perry.canonized || actor.practiceMode === 'CANONIZATION') {
    if (activeUltimate(actor, nowSec)?.id === 'chivalry') {
      stepCanonizedChivalry(room, actor, target, nowSec, world);
      return;
    }

    // Step full bot controllers framework with elite Perry skill
    stepBotControllers(room, nowSec, world, {
      random,
      actorKinds: ['dummy'],
      targetKinds: ['human'],
      aggression: 1.0,
    });

    // Check smart Chivalry invocation if prowess reached full
    const dist = Math.hypot(target.position.x - actor.position.x, target.position.z - actor.position.z);
    if (actor.prowess >= PROWESS.full && dist <= 5.5 && !actor.ultimateState) {
      tryUltimate(room, actor.id, nowSec);
    }
    return;
  }

  // ORDINARY MODE: The Parrying Saint (Defensive training encounter)
  const prevStep = perry.lastStepAt ?? nowSec;
  const dt = Math.max(1 / 120, Math.min(1 / 15, nowSec - prevStep || 1 / 30));
  perry.lastStepAt = nowSec;

  // Release expired guard
  if (actor.guarding && nowSec >= perry.guardUntil) {
    setGuard(room, actor.id, false, nowSec);
  }

  const dx = target.position.x - actor.position.x;
  const dz = target.position.z - actor.position.z;
  const distance = Math.hypot(dx, dz);

  // Turn to face target smoothly (predominantly holds ground)
  const faceYaw = Math.atan2(-dx, -dz);
  const maxTurn = (actor.guarding ? 0.65 : 1.0) * PERRY_TURN_RATE * dt;
  actor.yaw = turnToward(actor.yaw, faceYaw, maxTurn);
  actor.pitch = 0;

  // Stagger check: while staggered, Perry cannot guard or counterattack
  if (nowSec < (actor.staggerUntil ?? -Infinity)) {
    if (actor.guarding) setGuard(room, actor.id, false, nowSec);
    if (actor.attackHeld) cancelAttack(room, actor.id, nowSec);
    perry.pendingCounter = false;
    actor.input = { forward: 0, right: 0, jump: false, attack: false, guard: false, yaw: actor.yaw, pitch: 0 };
    return;
  }

  // Handle pending single measured counterattack
  if (perry.pendingCounter) {
    if (nowSec >= perry.counterattackAt) {
      if (!actor.attackActive && distance <= 2.8) {
        beginAttack(room, actor.id, nowSec);
        endAttack(room, actor.id, nowSec); // strictly single strike: no chain continuation
        perry.pendingCounter = false;
        perry.counterAttacking = true;
        perry.lastCounterAt = nowSec;
      } else if (distance > 2.8 || nowSec >= perry.counterattackAt + 0.8) {
        perry.pendingCounter = false;
        perry.counterAttacking = false;
      }
    }
  }

  if (perry.counterAttacking && nowSec >= (perry.lastCounterAt ?? 0) + 0.8) {
    perry.counterAttacking = false;
  }

  // If currently executing counterattack, maintain strike motion
  if (actor.attackActive) {
    actor.input = { forward: 0, right: 0, jump: false, attack: false, guard: false, yaw: actor.yaw, pitch: 0 };
    return;
  }

  // Modest footwork adjustments: predominantly holds ground
  let forward = 0;
  let right = 0;
  if (distance < 1.4) {
    forward = -0.32;
  } else if (distance > 3.6) {
    const anchorDx = perry.anchor.x - actor.position.x;
    const anchorDz = perry.anchor.z - actor.position.z;
    const anchorDist = Math.hypot(anchorDx, anchorDz);
    if (anchorDist > 1.2) {
      const anchorYaw = Math.atan2(-anchorDx, -anchorDz);
      const relYaw = anchorYaw - actor.yaw;
      forward = 0.28 * Math.cos(relYaw);
      right = -0.28 * Math.sin(relYaw);
    }
  }

  actor.input = { forward, right, jump: false, attack: false, guard: actor.guarding, yaw: actor.yaw, pitch: 0 };

  // Frontal sword recognition:
  const contact = nextContactAt(target, nowSec);
  const inRange = distance <= DEFENSE_THREAT_RANGE;
  const hasLos = !targetBlockedByWorld(actor, target, world);

  // Facing check: Is target in Perry's front view cone (115°)?
  const f = forwardFromYaw(actor.yaw);
  const toTargetX = dx / (distance || 1);
  const toTargetZ = dz / (distance || 1);
  const frontalDot = f.x * toTargetX + f.z * toTargetZ;
  const isFrontal = frontalDot >= GUARD_CONE_COS;

  const canDefend = actor.guardStamina > 0 && !actor.attackActive && inRange && hasLos && isFrontal && target.attackActive;

  if (canDefend && contact !== null) {
    const parryAt = contact - PARRY_LEAD_SEC;
    if (nowSec >= parryAt && nowSec < contact) {
      if (!actor.guarding) {
        setGuard(room, actor.id, true, nowSec);
        perry.guardUntil = contact + 0.12;
      }
    }
  }
}
