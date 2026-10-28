import { beginAttack, endAttack, setGuard, tryCastSpell, castPreparedSpell, tryDash, tryUltimate, cancelAttack } from './combat.mjs';
import { postureOf } from '../src/body.mjs';
import { segmentAabbHit } from '../src/collision.mjs';
import { activeUltimate, sundering, vortexing } from '../src/ultimates.mjs';
import { PROWESS } from '../src/prowess.mjs';
import { BOT_SKILLS } from './botSkill.mjs';
import { BOT_PROFILES } from './botBehavior.mjs';
import { stepBotControllers, nextContactAt } from './BotController.mjs';
import { wayToward } from './botNav.mjs';

function normalize3(v) {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

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

export const PERRY_CORRECT_ANSWER = 'Because you parry?';

export const PERRY_INCORRECT_ANSWERS = Object.freeze([
  'Because of a clerical error?',
  'I do not know! But I know it does not suit you.',
  'There is a Street named Perry?',
  "It was the fault of perry's parents?",
  'You acquired it from a different, better, St. Perry?',
  "Because 'Perry' was not long enough?",
  "'Twas a dare to reclaim your renown?",
  'May I have it?',
  'You borrowed it just for me?',
  'So you could ask that question?',
  'I am a knight.',
  'Who are you?',
  'I, am St. Perry!',
  'You were waiting for the rightful owner to arrive, who is now here.',
  'I remember wishing for a St. Perry one day',
  'Aha! A rhetorical question, you are Squire!',
  "'the Prodigious... what? It was cut off and not meant for you",
  'You wanted to decorate my tally with a nice name!',
  'An impossible question. Next.',
  'Not even you know the answer, do you?',
  "I'm uncertain, it should be 'Defeated'",
  'This is the correct answer',
  'You would not understand...',
]);

export const PERRY_CONDITIONAL_ANSWERS = Object.freeze([
  {
    text: "Because 'St. Perry the Plain' was too accurate?",
    requiredHerald: 'st-perry-the-plain',
  },
]);

export function normalizeDialogueGuess(str) {
  if (typeof str !== 'string') return '';
  return str
    .trim()
    .toLowerCase()
    .replace(/['"’“”]/g, '')
    .replace(/[?!.,;:]/g, '')
    .replace(/\s+/g, ' ');
}

export const SPECIAL_PLAIN_ANSWER_NORMALIZED = normalizeDialogueGuess("Because 'St. Perry the Plain' was too accurate?");

export function isHeraldEarned(player, heraldId) {
  if (!player || !heraldId) return false;
  const challenges = player.challenges?.completed ?? {};
  const normalizedKey = heraldId.replace(/-/g, '_');
  if (challenges[normalizedKey] || challenges[heraldId]) return true;
  if (player.emblems && Array.isArray(player.emblems)) {
    if (player.emblems.includes(normalizedKey) || player.emblems.includes(heraldId)) return true;
  }
  if (player.unlockedHeralds && typeof player.unlockedHeralds.has === 'function') {
    return player.unlockedHeralds.has(heraldId) || player.unlockedHeralds.has(normalizedKey);
  }
  if (Array.isArray(player.unlockedHeralds)) {
    return player.unlockedHeralds.includes(heraldId) || player.unlockedHeralds.includes(normalizedKey);
  }
  return false;
}

export function resetPerryVisitBag(owner = null) {
  if (owner) {
    owner.rotationBag = [];
    owner.lastPoolKey = null;
  }
}

export function selectPerryDialogueChoices({
  player = null,
  prog = null,
  seed = undefined,
  pool = null,
  wrongCount = 0,
  includeCorrect = undefined,
  allowOmit = false,
} = {}) {
  const candidatePool = pool ? [...pool] : [...PERRY_INCORRECT_ANSWERS];
  let earnedConditionals = [];
  if (!pool) {
    for (const cond of PERRY_CONDITIONAL_ANSWERS) {
      if (isHeraldEarned(player, cond.requiredHerald)) {
        candidatePool.push(cond.text);
        earnedConditionals.push(cond.text);
      }
    }
  }

  let showCorrect = true;
  if (includeCorrect !== undefined) {
    showCorrect = Boolean(includeCorrect);
  } else if (wrongCount > 0) {
    // Once the player has received a wrong answer, the correct answer appears in the mix
    showCorrect = true;
  } else if (allowOmit) {
    if (seed !== undefined && seed !== null) {
      const sVal = (Math.abs(Number(seed)) >>> 0) || 1;
      showCorrect = (sVal % 2) === 0;
    } else {
      // At first, sometimes the right answer doesn't appear (~50% chance)
      showCorrect = Math.random() < 0.5;
    }
  }

  const count = showCorrect ? Math.min(3, candidatePool.length) : Math.min(4, candidatePool.length);

  if (seed !== undefined && seed !== null) {
    let s = (Math.abs(Number(seed)) >>> 0) || 1;
    const rnd = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const indices = Array.from({ length: candidatePool.length }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const selectedIncorrect = indices.slice(0, count).map((idx) => candidatePool[idx]);

    const choices = showCorrect ? [PERRY_CORRECT_ANSWER, ...selectedIncorrect] : [...selectedIncorrect];
    for (let i = choices.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [choices[i], choices[j]] = [choices[j], choices[i]];
    }
    return choices;
  }

  const rotationOwner = prog || player || {};
  let bag = rotationOwner.rotationBag;
  const poolKey = candidatePool.join('|||');

  if (!Array.isArray(bag) || rotationOwner.lastPoolKey !== poolKey || bag.length < count) {
    bag = [...candidatePool];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    if (earnedConditionals.length > 0 && !rotationOwner.hasSeenEarnedConditionals) {
      for (const special of earnedConditionals) {
        const idx = bag.indexOf(special);
        if (idx >= count) {
          [bag[0], bag[idx]] = [bag[idx], bag[0]];
        }
      }
      rotationOwner.hasSeenEarnedConditionals = true;
    }
    rotationOwner.lastPoolKey = poolKey;
  }

  const selectedIncorrect = bag.splice(0, count);
  rotationOwner.rotationBag = bag;

  const choices = showCorrect ? [PERRY_CORRECT_ANSWER, ...selectedIncorrect] : [...selectedIncorrect];
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return choices;
}

export const PERRY_PROFILE = Object.freeze({
  name: 'St. Perry the Prodigious',
  sword: true,
  spells: true,
  guard: 1.0,
  dash: 0.35,
  keepRange: null,
  flee: false,
  footwork: 0.65,
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
      dialogue: null,
      rotationBag: null,
      lastPoolKey: null,
    };
    roomState.byPlayer.set(playerId, prog);
  }
  return prog;
}

export function getPlayerPerryDialogue(room, playerId = null) {
  if (!room) return null;
  let targetId = playerId;
  if (!targetId && room.players) {
    const humans = [...room.players.values()].filter((p) => p.actorKind === 'human');
    if (humans.length === 1) targetId = humans[0].id;
  }
  if (!targetId) {
    const dummy = [...(room.players?.values() ?? [])].find((p) => p.actorKind === 'dummy' && p.stPerry);
    return dummy?.stPerry?.dialogue ?? null;
  }

  const prog = getPlayerPerryProgress(room, targetId);
  if (!prog) return null;
  const player = room.players?.get?.(targetId);

  if (!prog.dialogue) {
    const choices = selectPerryDialogueChoices({ player, prog, wrongCount: 0, allowOmit: true });
    prog.dialogue = {
      state: 'intro',
      wrongCount: 0,
      solved: false,
      dismissed: false,
      lastLine: 'I am St. Perry, the Prodigious! Any idea why that is my name?',
      choices,
    };
  }
  return prog.dialogue;
}

export function isCanonizationUnlocked(room, playerId = null) {
  if (!room?.stPerryState) return false;
  if (playerId) {
    const prog = room.stPerryState.byPlayer?.get(playerId);
    return Boolean(prog?.unlocked);
  }
  // Singleplayer fallback or test fixture:
  const humans = [...(room.players?.values() ?? [])].filter((p) => p.actorKind === 'human');
  if (humans.length === 1) {
    const prog = room.stPerryState.byPlayer?.get(humans[0].id);
    return Boolean(prog?.unlocked || room.stPerryState.unlocked);
  }
  return Boolean(room.stPerryState.unlocked);
}

export function setupStPerry(actor, nowSec, canonized = false, room = null, playerId = null) {
  const roomState = getPerryRoomState(room);
  const isUnlocked = isCanonizationUnlocked(room, playerId);
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

  for (const p of roomState?.byPlayer?.values() ?? []) {
    p.perryFightStartHealth = undefined;
    p.damageDealtToPerry = 0;
  }

  const prev = actor.stPerry;
  const humanPlayer = room ? [...(room.players?.values() ?? [])].find((p) => p.actorKind === 'human') : null;
  const targetId = playerId || humanPlayer?.id;
  const activeDialogue = targetId ? getPlayerPerryDialogue(room, targetId) : prev?.dialogue;
  if (activeDialogue && (activeDialogue.solved || activeDialogue.dismissed)) {
    activeDialogue.dismissed = true;
    activeDialogue.state = 'completed';
    activeDialogue.lastLine = '';
  }

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
    dialogue: activeDialogue ?? {
      state: 'intro',
      wrongCount: 0,
      solved: false,
      dismissed: false,
      lastLine: 'I am St. Perry, the Prodigious! Any idea why that is my name?',
      choices: selectPerryDialogueChoices({ player: humanPlayer, wrongCount: 0, allowOmit: true }),
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
    for (const prog of roomState.byPlayer?.values() ?? []) {
      prog.perryParries = 0;
      prog.playerCounterParries = 0;
    }
  }
  actor.stPerry = null;
}

export function answerPerryDialogue(room, player, answer, nowSec) {
  const dummy = [...room.players.values()].find((p) => p.actorKind === 'dummy' && p.stPerry);
  if (!dummy || !dummy.stPerry) return false;
  const d = getPlayerPerryDialogue(room, player?.id);
  if (!d) return false;

  if (isCorrectPerryAnswer(answer)) {
    d.solved = true;
    d.state = 'correct';
    d.lastLine = 'Finally!.. I meant, that was the least you could do. Your reward?... Enjoy this brief acknowledgement.';
    room.events.push({
      type: 'stPerryDialogue',
      playerId: player.id,
      text: d.lastLine,
      speaker: 'St. Perry the Prodigious',
      correct: true,
      wrongCount: d.wrongCount,
      at: nowSec,
    });
    return true;
  }

  const normalizedAnswer = normalizeDialogueGuess(answer);
  const isPlainGuess = normalizedAnswer === SPECIAL_PLAIN_ANSWER_NORMALIZED;

  if (isPlainGuess && isHeraldEarned(player, 'st-perry-the-plain')) {
    d.wrongCount += 1;
    d.state = 'heraldReaction';
    d.lastLine = "NO! HOW DID YOU GET THAT! I musn't allow you to revoke my sainthood! Prepare for the Perry!";
    const prog = getPlayerPerryProgress(room, player?.id);
    d.choices = selectPerryDialogueChoices({
      player,
      prog,
      wrongCount: d.wrongCount,
    });
    if (dummy?.stPerry?.dialogue) {
      dummy.stPerry.dialogue.choices = d.choices;
    }
    room.events.push({
      type: 'stPerryDialogue',
      playerId: player.id,
      text: d.lastLine,
      speaker: 'St. Perry the Prodigious',
      correct: false,
      special: 'stPerryThePlain',
      wrongCount: d.wrongCount,
      choices: d.choices ? [...d.choices] : [],
      at: nowSec,
    });
    return true;
  }

  d.wrongCount += 1;
  d.state = 'wrong';
  if (d.wrongCount === 1) {
    d.lastLine = 'Incorrect! You are lucky I am a St. Try again.';
  } else if (d.wrongCount === 2) {
    d.lastLine = 'Have you grown in intellect since we last spoke?';
  } else {
    d.lastLine = "That's ENOUGH! I shall no longer listen to any answer I do not like! Even if you force me to prove my name!!";
  }
  const prog = getPlayerPerryProgress(room, player?.id);
  d.choices = selectPerryDialogueChoices({
    player,
    prog,
    wrongCount: d.wrongCount,
  });
  if (dummy?.stPerry?.dialogue) {
    dummy.stPerry.dialogue.choices = d.choices;
  }

  room.events.push({
    type: 'stPerryDialogue',
    playerId: player.id,
    text: d.lastLine,
    speaker: 'St. Perry the Prodigious',
    correct: false,
    wrongCount: d.wrongCount,
    choices: d.choices ? [...d.choices] : [],
    at: nowSec,
  });
  return true;
}

export function dismissPerryDialogue(room, player, nowSec) {
  const dummy = [...room.players.values()].find((p) => p.actorKind === 'dummy' && p.stPerry);
  if (!dummy || !dummy.stPerry) return false;
  const d = getPlayerPerryDialogue(room, player?.id);
  if (!d) return false;
  d.dismissed = true;
  return true;
}

export function unlockCanonization(room, actor, nowSec, playerId = null) {
  const roomState = getPerryRoomState(room);
  if (playerId && roomState?.byPlayer) {
    const prog = getPlayerPerryProgress(room, playerId);
    if (prog?.unlocked) return; // Prevent repeated Canonization unlock announcements for this player!
    if (prog) prog.unlocked = true;
  } else {
    if (roomState?.unlocked) return;
    if (roomState) roomState.unlocked = true;
  }
  if (actor?.stPerry) actor.stPerry.unlocked = true;
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

export function recordPerryDamage(room, attackerId, victimId, source, nowSec, amount = 0, healthBefore = undefined) {
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
    const attacker = room.players.get(attackerId);
    if (attacker?.actorKind === 'human') {
      const prog = getPlayerPerryProgress(room, attackerId);
      if (prog) {
        if (prog.perryFightStartHealth === undefined) {
          prog.perryFightStartHealth = healthBefore !== undefined ? healthBefore : dummy.health + amount;
        }
        prog.damageDealtToPerry = (prog.damageDealtToPerry || 0) + amount;
      }
    }
    room.events.push({
      type: 'stPerryFeedback',
      kind: 'playerHit',
      source,
      at: nowSec,
    });
  }
}

export function assessPerryDefeat(room, dummy, killerId, nowSec) {
  if (!dummy?.stPerry || dummy.practiceMode !== 'CANONIZATION') return;
  const killer = room.players.get(killerId);
  if (!killer || killer.actorKind !== 'human') return;
  const prog = getPlayerPerryProgress(room, killerId);
  if (!prog || prog.plainHeraldQualified) return;

  // Has killer already earned this herald? If already owned in persisted profile, no duplicate qualification
  const alreadyEarned = isHeraldEarned(killer, 'st-perry-the-plain');
  const killerFlawless = (killer.damageTakenThisLife || 0) === 0 && (killer.health || 0) === 100;
  const perryBeganFull = (prog.perryFightStartHealth || 0) >= 100;
  const dealtFullDefeat = (prog.damageDealtToPerry || 0) >= 100;

  if (alreadyEarned) return;

  if (killerFlawless && perryBeganFull && dealtFullDefeat) {
    prog.plainHeraldQualified = true;
    room.events.push({
      type: 'prestigeChallengeCompleted',
      playerId: killer.id,
      challengeId: 'st_perry_the_plain',
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

  // Stagger check: while staggered, Perry cannot guard or counterattack
  if (nowSec < (actor.staggerUntil ?? -Infinity)) {
    if (actor.guarding) setGuard(room, actor.id, false, nowSec);
    if (actor.attackHeld) cancelAttack(room, actor.id, nowSec);
    perry.pendingCounter = false;
    perry.counterAttacking = false;
    actor.input = { forward: 0, right: 0, jump: false, attack: false, guard: false, yaw: actor.yaw, pitch: 0 };
    return;
  }

  // Release expired guard
  if (actor.guarding && nowSec >= perry.guardUntil) {
    setGuard(room, actor.id, false, nowSec);
  }

  const dx = target.position.x - actor.position.x;
  const dz = target.position.z - actor.position.z;
  const distance = Math.hypot(dx, dz) || 1;

  // 1. ULTIMATES FLEE: Intelligent evasion from Sunder or Vortex
  const targetSunder = sundering(target, nowSec) || target.ultimateState?.id === 'sunder';
  const targetVortex = Boolean(vortexing(target, nowSec)) || target.ultimateState?.id === 'vortex';
  const threatUltimate = targetSunder || targetVortex;

  if (threatUltimate) {
    // Intelligent flee: Drop guard (blocking Sunder or Vortex breaks guard/inflicts fatal stagger),
    // cancel any attack or counter, turn away, and sprint/dash to safety.
    if (actor.guarding) setGuard(room, actor.id, false, nowSec);
    if (actor.attackHeld || actor.attackActive) cancelAttack(room, actor.id, nowSec);
    perry.pendingCounter = false;
    perry.counterAttacking = false;

    const dxAway = actor.position.x - target.position.x;
    const dzAway = actor.position.z - target.position.z;
    const distAway = Math.hypot(dxAway, dzAway) || 1;
    const awayYaw = Math.atan2(-dxAway, -dzAway);

    actor.yaw = turnToward(actor.yaw, awayYaw, PERRY_TURN_RATE * 1.5 * dt);

    if (distAway < 6.0) {
      tryDash(room, actor.id, { x: dxAway / distAway, z: dzAway / distAway }, nowSec);
    }

    actor.input = {
      forward: 1.0,
      right: 0,
      jump: false,
      attack: false,
      guard: false,
      sprint: true,
      yaw: actor.yaw,
      pitch: 0,
    };
    return;
  }

  // Turn to face target smoothly (predominantly holds ground)
  const faceYaw = Math.atan2(-dx, -dz);
  const f = forwardFromYaw(actor.yaw);
  const toTargetX = dx / distance;
  const toTargetZ = dz / distance;
  const isTargetInFov = (f.x * toTargetX + f.z * toTargetZ) >= 0;
  const baseTurnRate = isTargetInFov ? PERRY_TURN_RATE : Math.PI * 0.85;
  const maxTurn = (actor.guarding ? 0.65 : 1.0) * baseTurnRate * dt;
  actor.yaw = turnToward(actor.yaw, faceYaw, maxTurn);
  actor.pitch = 0;

  // 2. PROJECTILE EVASION & RETALIATION
  let threateningProj = null;
  let minProjT = Infinity;
  for (const p of room.projectiles?.values() ?? []) {
    if (p.ownerId === actor.id) continue;
    const rx = actor.position.x - p.position.x;
    const rz = actor.position.z - p.position.z;
    const vx = p.velocity?.x || 0;
    const vz = p.velocity?.z || 0;
    const vSq = vx * vx + vz * vz;
    if (vSq < 0.1) continue;
    const dot = rx * vx + rz * vz;
    if (dot > 0) {
      const t = dot / vSq;
      if (t > 0 && t <= 1.5) {
        const closestX = p.position.x + vx * t;
        const closestZ = p.position.z + vz * t;
        const miss = Math.hypot(actor.position.x - closestX, actor.position.z - closestZ);
        if (miss <= 3.2 && t < minProjT) {
          minProjT = t;
          threateningProj = p;
        }
      }
    }
  }

  if (threateningProj) {
    const vx = threateningProj.velocity.x;
    const vz = threateningProj.velocity.z;
    const vLen = Math.hypot(vx, vz) || 1;
    const perpX = -vz / vLen;
    const perpZ = vx / vLen;
    const side = ((actor.position.x - threateningProj.position.x) * perpX + (actor.position.z - threateningProj.position.z) * perpZ) >= 0 ? 1 : -1;
    const dashDir = { x: perpX * side, z: perpZ * side };

    const dashed = tryDash(room, actor.id, dashDir, nowSec);
    if (dashed) {
      perry.retaliateSpell = true;
      perry.retaliateAt = nowSec + 0.35;
    }
  }

  // Handle retaliatory spell launch
  if (perry.retaliateSpell && nowSec >= perry.retaliateAt) {
    if (distance <= 16 && !actor.pendingSpell && !actor.attackActive) {
      const dy = (target.position.y + postureOf(target).center) - (actor.position.y + postureOf(actor).eye);
      const castDir = normalize3({ x: dx, y: dy, z: dz });
      if (tryCastSpell(room, actor.id, castDir, nowSec)) {
        perry.retaliateSpell = false;
      }
    } else if (distance > 16 || nowSec >= perry.retaliateAt + 2.0) {
      perry.retaliateSpell = false;
    }
  }

  // 3. DEFEND AGAINST SPELLS (e.g. Gale)
  const facingAfterTurn = forwardFromYaw(actor.yaw);
  const frontalDot = facingAfterTurn.x * toTargetX + facingAfterTurn.z * toTargetZ;
  const isFrontal = frontalDot >= GUARD_CONE_COS;
  const targetGale = target.pendingSpell?.spell === 'gale' || Boolean(target.gust);
  if (targetGale && isFrontal && actor.guardStamina > 10) {
    if (!actor.guarding) {
      setGuard(room, actor.id, true, nowSec);
    }
    perry.guardUntil = Math.max(perry.guardUntil, nowSec + 0.5);
  }

  // 4. CONSECUTIVE STRIKE AVOIDANCE:
  // Detect if player is attacking in melee and Perry's parry won't deflect the hit
  // (e.g. player attacking Perry while Perry counterattacks/recovers, or chaining consecutive strikes)
  const contact = nextContactAt(target, nowSec);
  const targetSwinging = target.attackActive || target.attackHeld || (contact !== null && nowSec < contact);
  const inMeleeRange = distance <= DEFENSE_THREAT_RANGE;
  const isConsecutiveStrike = (target.attackNextStrike ?? 0) > 0 || (target.chainCount ?? 0) > 0;
  const inCounterOrRecovery = actor.attackActive || actor.attackHeld || perry.counterAttacking || perry.pendingCounter || nowSec < (perry.lastCounterAt ?? 0) + 0.6;
  const cannotDeflect = inCounterOrRecovery || (isConsecutiveStrike && (actor.guardStamina <= 15 || nowSec < (actor.recoverUntil ?? -Infinity)));

  if (targetSwinging && inMeleeRange && cannotDeflect && isFrontal) {
    if (actor.attackHeld || actor.attackActive) {
      cancelAttack(room, actor.id, nowSec);
    }
    perry.pendingCounter = false;
    perry.counterAttacking = false;

    // Dash or backpedal backward out of range of consecutive strikes
    const awayDir = { x: -toTargetX, z: -toTargetZ };
    tryDash(room, actor.id, awayDir, nowSec);

    actor.input = {
      forward: -1.0,
      right: 0,
      jump: false,
      attack: false,
      guard: false,
      sprint: true,
      yaw: actor.yaw,
      pitch: 0,
    };
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
  const inRange = distance <= DEFENSE_THREAT_RANGE;
  const hasLos = !targetBlockedByWorld(actor, target, world);

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
