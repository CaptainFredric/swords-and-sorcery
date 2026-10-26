import { beginAttack, endAttack, setGuard, tryCastSpell, castPreparedSpell, tryDash, tryUltimate, cancelAttack } from './combat.mjs';
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

export function getPerryRoomState(room) {
  if (!room) return null;
  if (!room.stPerryState) {
    room.stPerryState = {
      unlocked: false,
      byPlayer: new Map(),
      introCompleted: false,
      introSolved: false,
    };
  }
  return room.stPerryState;
}

export function getPlayerPerryProgress(room, playerId) {
  const roomState = getPerryRoomState(room);
  if (!roomState) return null;
  if (!roomState.byPlayer) roomState.byPlayer = new Map();
  let prog = roomState.byPlayer.get(playerId);
  if (!prog) {
    prog = {
      perryParries: 0,
      playerCounterParries: 0,
      unlocked: false,
    };
    roomState.byPlayer.set(playerId, prog);
  }
  return prog;
}

export function isCanonizationUnlocked(room) {
  return Boolean(room?.stPerryState?.unlocked);
}

export function setupStPerry(actor, nowSec, canonized = false, room = null) {
  const roomState = getPerryRoomState(room);
  const isUnlocked = Boolean(roomState?.unlocked);
  const actuallyCanonized = Boolean(canonized && isUnlocked);

  actor.name = 'St. Perry the Prodigious';
  actor.botProfile = actuallyCanonized ? PERRY_CANONIZED_PROFILE : PERRY_PROFILE;
  actor.botSkill = actuallyCanonized ? PERRY_CANONIZED_SKILL : 'knight';
  actor.health = 100;
  actor.guardStamina = 100;
  actor.guarding = false;
  actor.staggerUntil = -Infinity;
  actor.recoverUntil = -Infinity;
  actor.alive = true;
  actor.respawnAt = 0;

  if (actuallyCanonized) {
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
  const introDone = Boolean(roomState?.introCompleted || prev?.dialogue?.dismissed || prev?.dialogue?.solved);
  actor.stPerry = {
    canonized: actuallyCanonized,
    parries: roomState?.perryParries ?? prev?.parries ?? 0,
    playerCounterParries: roomState?.playerCounterParries ?? prev?.playerCounterParries ?? 0,
    playerHits: prev?.playerHits ?? 0,
    unlocked: isUnlocked,
    anchor: { x: actor.position.x, y: actor.position.y, z: actor.position.z },
    guardUntil: -Infinity,
    pendingCounter: false,
    counterattackAt: -Infinity,
    lastCounterAt: -Infinity,
    lastStepAt: nowSec,
    castSlot: -1,
    dashSlot: -1,
    spellIndex: 0,
    navigation: {},
    dialogue: prev?.dialogue ?? {
      state: introDone ? 'completed' : 'intro',
      wrongCount: 0,
      solved: Boolean(roomState?.introSolved),
      dismissed: introDone,
      lastLine: introDone ? '' : 'I am St. Perry, the Prodigious! Any idea why that is my name?',
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
  const roomState = getPerryRoomState(room);
  if (roomState && !roomState.unlocked) {
    roomState.byPlayer?.clear();
  }
  actor.stPerry = null;
}

export function answerPerryDialogue(room, player, answer, nowSec) {
  const dummy = [...room.players.values()].find((p) => p.actorKind === 'dummy' && p.stPerry);
  if (!dummy || !dummy.stPerry) return false;
  const d = dummy.stPerry.dialogue;
  const state = getPerryRoomState(room);
  if (isCorrectPerryAnswer(answer)) {
    d.solved = true;
    if (state) {
      state.introSolved = true;
      state.introCompleted = true;
    }
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
  const state = getPerryRoomState(room);
  if (state) state.introCompleted = true;
  return true;
}

export function unlockCanonization(room, actor, nowSec, playerId = null) {
  const roomState = getPerryRoomState(room);
  if (roomState?.unlocked) return; // Prevent repeated Canonization unlock announcements!
  if (roomState) roomState.unlocked = true;
  if (actor?.stPerry) actor.stPerry.unlocked = true;
  if (playerId && roomState?.byPlayer) {
    const prog = getPlayerPerryProgress(room, playerId);
    if (prog) prog.unlocked = true;
  }
  room.events.push({
    type: 'stPerryUnlocked',
    playerId: playerId ?? actor?.id ?? null,
    at: nowSec,
    message: 'Canonization Unlocked! St. Perry acknowledges your parrying skill.',
  });
}

export function recordPerryParry(room, attacker, defender, nowSec) {
  if (room?.mode !== 'PRACTICE') return;
  const dummy = [...(room.players?.values() ?? [])].find((p) => p.actorKind === 'dummy');
  if (!dummy || !dummy.stPerry) return;

  // Case 1: St. Perry (defender) legitimately parried a human player's strike (attacker)
  if (defender.id === dummy.id && attacker.actorKind === 'human') {
    const prog = getPlayerPerryProgress(room, attacker.id);
    prog.perryParries += 1;
    dummy.stPerry.parries = prog.perryParries;
    setGuard(room, dummy.id, false, nowSec);
    dummy.stPerry.guardUntil = -Infinity;
    dummy.stPerry.pendingCounter = true;
    dummy.stPerry.counterattackAt = nowSec + COUNTERATTACK_DELAY_SEC;
    room.events.push({
      type: 'stPerryFeedback',
      kind: 'perryParry',
      playerId: attacker.id,
      count: prog.perryParries,
      at: nowSec,
    });
    if (prog.perryParries >= 3 && prog.playerCounterParries >= 1) {
      unlockCanonization(room, dummy, nowSec, attacker.id);
    }
  }
  // Case 2: Human player (defender) legitimately counterparried St. Perry's counterattack (attacker)
  else if (attacker.id === dummy.id && defender.actorKind === 'human') {
    const prog = getPlayerPerryProgress(room, defender.id);
    prog.playerCounterParries += 1;
    dummy.stPerry.playerCounterParries = prog.playerCounterParries;
    dummy.stPerry.counterAttacking = false;
    dummy.stPerry.pendingCounter = false;
    room.events.push({
      type: 'stPerryFeedback',
      kind: 'playerCounterParry',
      playerId: defender.id,
      count: prog.playerCounterParries,
      at: nowSec,
    });
    if (prog.perryParries >= 3 && prog.playerCounterParries >= 1) {
      unlockCanonization(room, dummy, nowSec, defender.id);
    }
  }
}

export function recordPerryDamage(room, attackerId, victimId, source, nowSec) {
  if (room?.mode !== 'PRACTICE') return;
  const dummy = [...(room.players?.values() ?? [])].find((p) => p.actorKind === 'dummy');
  if (!dummy || !dummy.stPerry) return;

  if (victimId === dummy.id) {
    dummy.stPerry.playerHits += 1;
    if (!dummy.stPerry.dialogue.dismissed) {
      dummy.stPerry.dialogue.dismissed = true;
      const state = getPerryRoomState(room);
      if (state) state.introCompleted = true;
    }
    room.events.push({
      type: 'stPerryFeedback',
      kind: 'playerHit',
      source,
      at: nowSec,
    });
  }
}

function stepCanonizedChivalry(room, actor, target, nowSec, world) {
  const perry = actor.stPerry;
  const state = actor.ultimateState;
  const prevStep = perry.lastStepAt ?? nowSec;
  const dt = Math.max(1 / 120, Math.min(1 / 15, nowSec - prevStep || 1 / 30));
  perry.lastStepAt = nowSec;

  const dx = target.position.x - actor.position.x;
  const dz = target.position.z - actor.position.z;
  const dy = (target.position.y + postureOf(target).center) - (actor.position.y + postureOf(actor).eye) + 0.1;
  const distance = Math.hypot(dx, dz);
  const length = Math.hypot(dx, dy, dz) || 1;

  // Turn toward target yaw smoothly (no instantaneous snapping)
  const faceYaw = Math.atan2(-dx, -dz);
  const f = forwardFromYaw(actor.yaw);
  const toTargetX = dx / (distance || 1);
  const toTargetZ = dz / (distance || 1);
  const isFrontal = (f.x * toTargetX + f.z * toTargetZ) >= GUARD_CONE_COS;
  const isTargetInFov = (f.x * toTargetX + f.z * toTargetZ) >= 0;

  const baseTurnRate = isTargetInFov ? PERRY_TURN_RATE * 1.1 : Math.PI * 0.95;
  const turnRate = actor.guarding ? baseTurnRate * 0.75 : baseTurnRate;
  actor.yaw = turnToward(actor.yaw, faceYaw, turnRate * dt);

  const targetPitch = Math.asin(dy / length);
  actor.pitch = turnToward(actor.pitch, targetPitch, Math.PI * 1.5 * dt);

  // Cast direction is derived from Perry's actual forward facing and pitch
  const cosPitch = Math.cos(actor.pitch);
  const castDirection = {
    x: -Math.sin(actor.yaw) * cosPitch,
    y: Math.sin(actor.pitch),
    z: -Math.cos(actor.yaw) * cosPitch,
  };

  const age = Math.max(0, nowSec - state.commitAt);
  const loop = Math.floor(age / 2.5);
  const phase = age % 2.5;

  const contact = nextContactAt(target, nowSec);
  const incomingThreat = distance <= DEFENSE_THREAT_RANGE && target.attackActive && isFrontal;
  const inParryWindow = incomingThreat && contact !== null && nowSec >= contact - PARRY_LEAD_SEC && nowSec < contact;
  const guard = inParryWindow || (phase < 0.6 && isFrontal);
  const sword = distance < 3.2 && phase >= 0.5 && phase < 2.2 && isFrontal;

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

  // Cast prepared spells in rotation (Fireball, Frostfire, Gale) using authentic prepared-spell API
  const slot = phase >= 1.5 ? loop * 2 + 1 : phase >= 0.8 ? loop * 2 : -1;
  if (slot >= 0 && slot !== perry.castSlot) {
    const spell = PREPARED_SPELLS[perry.spellIndex % PREPARED_SPELLS.length];
    if (castPreparedSpell(room, actor.id, spell, castDirection, nowSec)) {
      perry.castSlot = slot;
      perry.spellIndex += 1;
    }
  }

  // Dash toward player if spaced out
  if (phase >= 1.6 && perry.dashSlot !== loop && distance > 3.5) {
    const dashLen = Math.hypot(castDirection.x, castDirection.z) || 1;
    if (tryDash(room, actor.id, { x: castDirection.x / dashLen, z: castDirection.z / dashLen }, nowSec)) {
      perry.dashSlot = loop;
    }
  }
}

export function stepStPerry(room, actor, nowSec, world = room.world, { random = Math.random } = {}) {
  if (room.mode !== 'PRACTICE' || room.state !== 'PLAYING') return;
  if (!actor.stPerry) setupStPerry(actor, nowSec, actor.practiceMode === 'CANONIZATION', room);

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

  // CANONIZATION MODE: Full Spellblade duel
  if (perry.canonized || actor.practiceMode === 'CANONIZATION') {
    if (actor.ultimateState?.id === 'chivalry') {
      if (activeUltimate(actor, nowSec)?.id === 'chivalry') {
        stepCanonizedChivalry(room, actor, target, nowSec, world);
        return;
      }
      // Startup phase: smooth turn towards target, no instantaneous snap
      const prevStep = perry.lastStepAt ?? nowSec;
      const dt = Math.max(1 / 120, Math.min(1 / 15, nowSec - prevStep || 1 / 30));
      perry.lastStepAt = nowSec;
      const dx = target.position.x - actor.position.x;
      const dz = target.position.z - actor.position.z;
      const dist = Math.hypot(dx, dz);
      const faceYaw = Math.atan2(-dx, -dz);
      const f = forwardFromYaw(actor.yaw);
      const toX = dx / (dist || 1);
      const toZ = dz / (dist || 1);
      const isTargetInFov = (f.x * toX + f.z * toZ) >= 0;
      const turnRate = isTargetInFov ? PERRY_TURN_RATE : Math.PI * 0.95;
      actor.yaw = turnToward(actor.yaw, faceYaw, turnRate * dt);
      actor.input = { forward: 0, right: 0, jump: false, attack: false, guard: false, yaw: actor.yaw, pitch: 0 };
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
  const f = forwardFromYaw(actor.yaw);
  const toTargetX = dx / (distance || 1);
  const toTargetZ = dz / (distance || 1);
  const isTargetInFov = (f.x * toTargetX + f.z * toTargetZ) >= 0;
  const baseTurnRate = isTargetInFov ? PERRY_TURN_RATE : Math.PI * 0.85;
  const maxTurn = (actor.guarding ? 0.65 : 1.0) * baseTurnRate * dt;
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
  const facingAfterTurn = forwardFromYaw(actor.yaw);
  const frontalDot = facingAfterTurn.x * toTargetX + facingAfterTurn.z * toTargetZ;
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
