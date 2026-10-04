import { GAME_MODES } from '../src/modes.mjs';
import { guardProfile } from '../src/combat.mjs';
import { cancelAttack, setGuard } from './combat.mjs';
import { recordTransform } from './history.mjs';
import { stepBotControllers } from './BotController.mjs';
import { BOT_PROFILES } from './botBehavior.mjs';
import { PROWESS } from '../src/prowess.mjs';
import { freshStagger } from '../src/stagger.mjs';
import { setupUltimateKnight, stepUltimateKnight } from './UltimateKnight.mjs';

export const PRACTICE_DUMMY_MODES = Object.freeze({
  PASSIVE: 'PASSIVE',
  GUARDING: 'GUARDING',
  FIGHTS_BACK: 'FIGHTS_BACK',
  SORCERY: 'SORCERY',
  MELEE: 'MELEE',
  RUNNER: 'RUNNER',
  ULTIMATE_KNIGHT: 'ULTIMATE_KNIGHT',
});

// the modes in which the dummy is a bot, and which kind: one controller plays each from its profile (botBehavior.mjs).
// spell: what it carries (Mr. Melee's Sheathe in Steel; Spells & Sorcery turns through its own); aggression: how
// eagerly the controller acts on its profile. None of it scores: Practice keeps no tally and ends no match, so nothing
// here awards Renown.
export const PRACTICE_OPPONENTS = Object.freeze({
  FIGHTS_BACK: Object.freeze({ profile: 'rival', name: 'Training Dummy', spell: 'fireball', aggression: 0.55 }),
  SORCERY: Object.freeze({ profile: 'caster', name: BOT_PROFILES.caster.name, spell: 'fireball', aggression: 0.7 }),
  MELEE: Object.freeze({ profile: 'melee', name: BOT_PROFILES.melee.name, spell: 'steel', aggression: 0.62 }),
  RUNNER: Object.freeze({ profile: 'runner', name: BOT_PROFILES.runner.name, spell: 'fireball', aggression: 0.7 }),
});

const VALID_DUMMY_MODES = new Set(Object.values(PRACTICE_DUMMY_MODES));

function isPractice(room) {
  return room?.mode === GAME_MODES.PRACTICE;
}

function findPracticeDummy(room) {
  return [...room.players.values()].find((player) => player.actorKind === 'dummy') ?? null;
}

function neutralInput(player) {
  return {
    forward: 0,
    right: 0,
    jump: false,
    yaw: player.yaw,
    pitch: player.pitch,
  };
}

function resetActorAtSpawn(player, spawn, nowSec) {
  player.position = { x: spawn.x, y: spawn.y, z: spawn.z };
  player.velocity = { x: 0, y: 0, z: 0 };
  player.impulse = { x: 0, z: 0 };
  player.grounded = true;
  player.jumpHeld = false;
  player.yaw = spawn.yaw ?? 0;
  player.pitch = 0;
  player.input = { forward: 0, right: 0, jump: false, yaw: player.yaw, pitch: 0 };
  player.health = 100;
  player.guardStamina = guardProfile(player.knightClass).capacity;
  player.guarding = false;
  player.guardHeld = false;
  player.guardStartedAt = -Infinity;
  player.lastGuardDrainAt = -Infinity;
  player.attackActive = false;
  player.attackHeld = false;
  player.attackQueued = false;
  player.attackStartedAt = -Infinity;
  player.attackNextStrike = 0;
  player.attackCommitted = 0;
  player.attackRestartAt = -Infinity;
  player.staggerUntil = -Infinity;
  player.spellReadyAt = nowSec;
  player.spellReadyById = {};
  player.chivalryProjectileReadyAt = 0;
  player.castEndsAt = 0;
  player.pendingSpell = null;
  player.gauntlet = null;
  player.gust = null;
  player.gauntletReadyAt = -Infinity;
  player.crouched = false;
  player.burn = null;
  player.chill = null;
  player.steel = null;
  player.speedScale = 1;
  player.stagger = freshStagger();
  player.ultimateState = null;
  player.practiceGate = null;
  player.ultimateLockedUntil = -Infinity;
  player.recoverUntil = -Infinity;
  player.dizzyUntil = -Infinity;
  player.dashReadyAt = nowSec;
  player.dashUntil = 0;
  player.dashDir = { x: 0, z: 0 };
  player.spawnProtectionUntil = nowSec + 1;
  player.alive = true;
  player.respawnAt = 0;
  player.lastDamageAt = -Infinity;
  player.lastAttackerId = null;
  player.lastKnockbackAt = -Infinity;
  player.history = [];
  recordTransform(player, nowSec);
}

export function resetPracticePlayer(room, playerId, nowSec) {
  if (!isPractice(room)) return false;
  const player = room.players.get(playerId);
  if (!player || player.actorKind !== 'human') return false;
  const spawn = room.world.spawnPoints[0];
  if (!spawn) return false;

  for (const projectile of [...room.projectiles.values()]) {
    if (projectile.ownerId === player.id) room.projectiles.delete(projectile.id);
  }
  resetActorAtSpawn(player, spawn, nowSec);
  room.events.push({ type: 'practicePlayerReset', playerId, at: nowSec });
  return true;
}

/** The yard earns no prowess (prowess.mjs); its tools ready a knight's ultimate to try instead. */
export function readyPracticeUltimate(room, playerId) {
  if (!isPractice(room)) return false;
  const player = room.players.get(playerId);
  if (!player || player.actorKind !== 'human') return false;
  player.prowess = PROWESS.full;
  return true;
}

export function spawnPracticeDummy(room, mode = PRACTICE_DUMMY_MODES.PASSIVE, nowSec = 0) {
  if (!isPractice(room) || !VALID_DUMMY_MODES.has(mode)) return null;
  const existing = findPracticeDummy(room);
  if (existing) {
    setPracticeDummyMode(room, mode, nowSec);
    return existing;
  }

  const dummy = room.addServerActor({
    id: `practice-dummy-${room.code}`,
    name: 'Training Dummy',
    actorKind: 'dummy',
  }, nowSec);
  dummy.practiceMode = PRACTICE_DUMMY_MODES.PASSIVE;
  dummy.ai = null;
  setPracticeDummyMode(room, mode, nowSec);
  room.events.push({ type: 'practiceDummySpawned', playerId: dummy.id, mode: dummy.practiceMode, at: nowSec });
  return dummy;
}

export function removePracticeDummy(room) {
  if (!isPractice(room)) return false;
  const dummy = findPracticeDummy(room);
  if (!dummy) return false;

  for (const projectile of [...room.projectiles.values()]) {
    if (projectile.ownerId === dummy.id) room.projectiles.delete(projectile.id);
  }
  room.players.delete(dummy.id);
  room.events.push({ type: 'practiceDummyRemoved', playerId: dummy.id });
  return true;
}

export function setPracticeDummyMode(room, mode, nowSec = 0) {
  if (!isPractice(room) || !VALID_DUMMY_MODES.has(mode)) return false;
  const dummy = findPracticeDummy(room);
  if (!dummy) return false;

  if (dummy.attackHeld || dummy.attackActive) cancelAttack(room, dummy.id, nowSec);
  if (dummy.guarding) setGuard(room, dummy.id, false, nowSec);
  dummy.guardHeld = false;
  if (dummy.ultimateKnight) {
    if (dummy.ultimateState) room.events.push({ type: 'ultimateEnded', playerId: dummy.id, ultimate: dummy.ultimateState.id, at: nowSec });
    dummy.ultimateState = null;
    dummy.pendingSpell = null;
    dummy.castEndsAt = 0;
    dummy.chivalryProjectileReadyAt = 0;
    dummy.dashUntil = Math.min(dummy.dashUntil, nowSec);
    dummy.ultimateKnight = null;
  }
  dummy.input = neutralInput(dummy);
  dummy.ai = null;
  dummy.practiceMode = mode;
  const opponent = PRACTICE_OPPONENTS[mode];
  dummy.botProfile = opponent?.profile ?? null;
  dummy.name = opponent?.name ?? 'Training Dummy';
  dummy.spell = opponent?.spell ?? 'fireball';
  dummy.steel = null;
  if (mode === PRACTICE_DUMMY_MODES.ULTIMATE_KNIGHT) setupUltimateKnight(dummy, nowSec);

  if (mode === PRACTICE_DUMMY_MODES.GUARDING && dummy.alive && dummy.guardStamina > 0) {
    if (setGuard(room, dummy.id, true, nowSec)) {
      // Guarding mode is a steady block, not a manufactured perfect-parry window.
      dummy.guardStartedAt = nowSec - 1;
    }
  }

  room.events.push({ type: 'practiceDummyMode', playerId: dummy.id, mode, at: nowSec });
  return true;
}

export function stepPracticeActors(room, nowSec, world = room.world, { random = Math.random } = {}) {
  if (!isPractice(room) || room.state !== 'PLAYING') return;
  const dummy = findPracticeDummy(room);
  if (!dummy) return;
  if (dummy.practiceMode === PRACTICE_DUMMY_MODES.ULTIMATE_KNIGHT) {
    stepUltimateKnight(room, dummy, nowSec, world, { random });
    return;
  }
  if (!dummy.alive) return;

  if (dummy.practiceMode === PRACTICE_DUMMY_MODES.PASSIVE) {
    if (dummy.attackHeld || dummy.attackActive) cancelAttack(room, dummy.id, nowSec);
    if (dummy.guarding) setGuard(room, dummy.id, false, nowSec);
    dummy.input = neutralInput(dummy);
    return;
  }

  if (dummy.practiceMode === PRACTICE_DUMMY_MODES.GUARDING) {
    if (dummy.attackHeld || dummy.attackActive) cancelAttack(room, dummy.id, nowSec);
    dummy.input = neutralInput(dummy);
    if (!dummy.guarding && dummy.guardStamina > 0 && nowSec >= dummy.staggerUntil) {
      if (setGuard(room, dummy.id, true, nowSec)) dummy.guardStartedAt = nowSec - 1;
    }
    return;
  }

  const opponent = PRACTICE_OPPONENTS[dummy.practiceMode];
  if (opponent) {
    stepBotControllers(room, nowSec, world, {
      random,
      actorKinds: ['dummy'],
      aggression: opponent.aggression,
    });
  }
}
