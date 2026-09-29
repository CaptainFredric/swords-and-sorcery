// What a host (the game server, or the browser playing alone when the server cannot be reached) says to its
// Spellblades and does with what they send. The same shapes either way, so the client cannot tell who is hosting
// except by asking.

import { beginAttack, endAttack, setGuard, tryActivateSteel, tryCastSpell, tryDash } from './combat.mjs';
import { compensatedInputTime } from './history.mjs';
import { removePracticeDummy, resetPracticePlayer, setPracticeDummyMode, spawnPracticeDummy } from './practice.mjs';
import { GAME_MODES } from '../src/modes.mjs';

export function serializeLobby(room) {
  return {
    type: 'lobby',
    roomCode: room.code,
    hostId: room.hostId(),
    roomState: room.state,
    mode: room.mode,
    worldId: room.worldId,
    isPrivate: room.isPrivate,
    countdownEndsAt: room.countdownEndsAt,
    autoStartAt: room.autoStartAt,
    scoreToWin: room.scoreToWin,
    votes: room.policy.votes ? room.tallyVotes() : null,
    players: [...room.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      actorKind: p.actorKind,
      practiceMode: p.practiceMode ?? null,
      connected: p.connected,
      arenaReady: Boolean(p.arenaReady),
      lobbyReady: Boolean(p.lobbyReady),
      kills: p.kills,
      deaths: p.deaths,
    })),
  };
}

export function serializeSnapshot(room, nowSec) {
  return {
    type: 'snapshot',
    tick: room.tickNumber,
    serverTime: nowSec,
    roomCode: room.code,
    hostId: room.hostId(),
    roomState: room.state,
    mode: room.mode,
    worldId: room.worldId,
    countdownEndsAt: room.countdownEndsAt,
    matchStartedAt: room.matchStartedAt,
    scoreToWin: room.scoreToWin,
    matchSeconds: room.policy.matchSeconds,
    finishReason: room.finishReason ?? null,
    winnerId: room.winnerId,
    rewardMatchId: room.rewardMatchId ?? null,
    suddenDeath: room.suddenDeath,
    players: [...room.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      actorKind: p.actorKind,
      practiceMode: p.practiceMode ?? null,
      connected: p.connected,
      arenaReady: Boolean(p.arenaReady),
      position: p.position,
      velocity: p.velocity,
      impulse: p.impulse ?? { x: 0, z: 0 },
      yaw: p.yaw,
      pitch: p.pitch,
      health: p.health,
      guardStamina: p.guardStamina,
      guarding: p.guarding,
      sprinting: Boolean(p.sprinting),
      attackActive: p.attackActive,
      attackStartedAt: p.attackStartedAt,
      attackNextStrike: p.attackNextStrike,
      alive: p.alive,
      kills: p.kills,
      deaths: p.deaths,
      parries: p.parries,
      abyssKills: p.abyssKills,
      spell: p.spell,
      cloth: p.cloth ?? 'crimson',
      spellReadyAt: p.spellReadyAt,
      // afflictions, for your own prediction (the chill slows you) and everyone's effects
      chill: p.chill ? { slow: p.chill.slow, startedAt: p.chill.startedAt, until: p.chill.until } : null,
      burningUntil: p.burn?.until ?? 0,
      // Sheathed in Steel: when its strength was last set, and to what (it wears off evenly from there)
      steel: p.steel ? { at: p.steel.at, base: p.steel.base, calledAt: p.steel.calledAt } : null,
      steelReadyAt: p.steelReadyAt ?? 0,
      dashReadyAt: p.dashReadyAt,
      dashUntil: p.dashUntil,
      staggerUntil: p.staggerUntil,
      spawnProtectionUntil: p.spawnProtectionUntil,
      respawnAt: p.respawnAt,
      lastInputSeq: p.lastInputSeq,
    })),
    projectiles: [...room.projectiles.values()].map((p) => ({ id: p.id, ownerId: p.ownerId, spell: p.spell, position: p.position, velocity: p.velocity })),
  };
}

/**
 * A Spellblade's command inside their room (moving, fighting, readying, the practice yard's controls). Returns what
 * the host should do next: { lobby: true } when everyone's lobby view changed, { rejected: message } when the
 * command is not allowed here, or {} for nothing more.
 */
export function applyRoomCommand(room, player, message, time) {
  switch (message.type) {
    case 'startMatch':
    case 'ready': {
      const ready = message.type === 'startMatch' ? true : Boolean(message.ready);
      return { lobby: room.setReady(player.id, ready, time) };
    }
    case 'vote': return { lobby: room.vote(player.id, message.key, message.value) };
    case 'arenaReady': return { lobby: room.setArenaReady(player.id, Boolean(message.ready), time) };
    case 'input': {
      player.lastInputSeq = Number.isFinite(message.seq) ? message.seq : player.lastInputSeq;
      player.input = {
        forward: Math.max(-1, Math.min(1, Number(message.forward) || 0)),
        right: Math.max(-1, Math.min(1, Number(message.right) || 0)),
        jump: Boolean(message.jump),
        sprint: Boolean(message.sprint),
        yaw: Number.isFinite(message.yaw) ? message.yaw : player.yaw,
        pitch: Number.isFinite(message.pitch) ? Math.max(-1.45, Math.min(1.45, message.pitch)) : player.pitch,
      };
      return {};
    }
    case 'attack': {
      const inputTime = compensatedInputTime(message.clientTime, time);
      if (message.down) beginAttack(room, player.id, inputTime);
      else endAttack(room, player.id, time, inputTime);
      return {};
    }
    case 'guard': setGuard(room, player.id, Boolean(message.down), compensatedInputTime(message.clientTime, time)); return {};
    case 'cast': tryCastSpell(room, player.id, message.direction || { x: 0, y: 0, z: -1 }, time); return {};
    case 'dash': tryDash(room, player.id, message.direction || { x: 0, z: -1 }, time); return {};
    case 'steel': tryActivateSteel(room, player.id, time); return {};
    case 'rematch': room.requestRematch(player.id, time); return {};
    case 'practiceResetPlayer':
      return room.mode === GAME_MODES.PRACTICE && resetPracticePlayer(room, player.id, time) ? {} : { rejected: PRACTICE_REJECTED };
    case 'practiceSpawnDummy':
      if (room.mode !== GAME_MODES.PRACTICE) return { rejected: PRACTICE_REJECTED };
      return spawnPracticeDummy(room, message.mode, time) ? { lobby: true } : { rejected: PRACTICE_REJECTED };
    case 'practiceRemoveDummy':
      return room.mode === GAME_MODES.PRACTICE && removePracticeDummy(room) ? { lobby: true } : { rejected: PRACTICE_REJECTED };
    case 'practiceSetDummyMode':
      return room.mode === GAME_MODES.PRACTICE && setPracticeDummyMode(room, message.mode, time) ? { lobby: true } : { rejected: PRACTICE_REJECTED };
    default: return {};
  }
}

const PRACTICE_REJECTED = 'Practice command unavailable';
