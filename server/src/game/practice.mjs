import { GAME_MODES } from '../../../shared/src/modes.mjs';
import { endAttack, setGuard } from './combat.mjs';
import { recordTransform } from './history.mjs';
import { stepBotControllers } from '../ai/BotController.mjs';

export const PRACTICE_DUMMY_MODES = Object.freeze({
  PASSIVE: 'PASSIVE',
  GUARDING: 'GUARDING',
  FIGHTS_BACK: 'FIGHTS_BACK',
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
  player.grounded = true;
  player.jumpHeld = false;
  player.yaw = spawn.yaw ?? 0;
  player.pitch = 0;
  player.input = { forward: 0, right: 0, jump: false, yaw: player.yaw, pitch: 0 };
  player.health = 100;
  player.guardStamina = 100;
  player.guarding = false;
  player.guardStartedAt = -Infinity;
  player.lastGuardDrainAt = -Infinity;
  player.attackActive = false;
  player.attackHeld = false;
  player.attackStartedAt = -Infinity;
  player.attackNextStrike = 0;
  player.attackRestartAt = -Infinity;
  player.staggerUntil = -Infinity;
  player.fireballReadyAt = nowSec;
  player.castEndsAt = 0;
  player.pendingFireball = null;
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

  if (dummy.attackHeld || dummy.attackActive) endAttack(room, dummy.id, nowSec);
  if (dummy.guarding) setGuard(room, dummy.id, false, nowSec);
  dummy.input = neutralInput(dummy);
  dummy.ai = null;
  dummy.practiceMode = mode;

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
  if (!dummy || !dummy.alive) return;

  if (dummy.practiceMode === PRACTICE_DUMMY_MODES.PASSIVE) {
    if (dummy.attackHeld || dummy.attackActive) endAttack(room, dummy.id, nowSec);
    if (dummy.guarding) setGuard(room, dummy.id, false, nowSec);
    dummy.input = neutralInput(dummy);
    return;
  }

  if (dummy.practiceMode === PRACTICE_DUMMY_MODES.GUARDING) {
    if (dummy.attackHeld || dummy.attackActive) endAttack(room, dummy.id, nowSec);
    dummy.input = neutralInput(dummy);
    if (!dummy.guarding && dummy.guardStamina > 0 && nowSec >= dummy.staggerUntil) {
      if (setGuard(room, dummy.id, true, nowSec)) dummy.guardStartedAt = nowSec - 1;
    }
    return;
  }

  if (dummy.practiceMode === PRACTICE_DUMMY_MODES.FIGHTS_BACK) {
    stepBotControllers(room, nowSec, world, {
      random,
      actorKinds: ['dummy'],
      aggression: 0.55,
    });
  }
}
