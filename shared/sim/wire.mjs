// What a host (the game server, or the browser playing alone when the server cannot be reached) says to its
// Spellblades and does with what they send. The same shapes either way, so the client cannot tell who is hosting
// except by asking.

import { castPreparedSpell, selectPreparedSpell, beginAttack, endAttack, setGuard, tryCastOrGauntlet, tryDash, tryGauntletStrike, tryUltimate } from './combat.mjs';
import { compensatedInputTime } from './history.mjs';
import { readyPracticeUltimate, removePracticeDummy, resetPracticePlayer, setPracticeDummyMode, spawnPracticeDummy } from './practice.mjs';
import { spellFor } from '../src/spells.mjs';
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
      crouched: Boolean(p.crouched),
      attackActive: p.attackActive,
      attackStartedAt: p.attackStartedAt,
      attackNextStrike: p.attackNextStrike,
      // a chain begun Sundering: every strike of it a slam (the heavy strike's shape)
      attackSlam: Boolean(p.attackSlam),
      alive: p.alive,
      kills: p.kills,
      deaths: p.deaths,
      parries: p.parries,
      abyssKills: p.abyssKills,
      spell: p.spell,
      startingSpell: p.startingSpell ?? p.spell,
      preparedSpells: [...(p.preparedSpells ?? [])],
      spellReadyById: { ...(p.spellReadyById ?? {}) },
      chivalryProjectileReadyAt: p.chivalryProjectileReadyAt ?? 0,
      cloth: p.cloth ?? 'crimson',
      spellReadyAt: p.spellReadyAt,
      castingSpell: p.pendingSpell?.spell ?? null,
      castEndsAt: p.castEndsAt ?? 0,
      castStartedAt: p.pendingSpell ? p.castEndsAt - spellFor(p.pendingSpell.spell).gatherSec : 0,
      // afflictions, for your own prediction (the chill slows you) and everyone's effects
      chill: p.chill ? { slow: p.chill.slow, startedAt: p.chill.startedAt, until: p.chill.until } : null,
      burningUntil: p.burn?.until ?? 0,
      // Sheathed in Steel: when it was called and until when it holds full (it wears off evenly from there)
      steel: p.steel ? { calledAt: p.steel.calledAt, fullUntil: p.steel.fullUntil, struck: Boolean(p.steel.struck) } : null,
      dashReadyAt: p.dashReadyAt,
      dashUntil: p.dashUntil,
      // the Practice Yard's recast gates (practiceRecast.mjs): the real cooldowns above are shown as they are
      practiceGate: p.practiceGate ?? null,
      staggerUntil: p.staggerUntil,
      // balance lost (for the view's unsteadiness and the warning near its break), prowess earned, the ultimate
      stagger: p.stagger ? { level: p.stagger.level, recoverUntil: p.stagger.recoverUntil } : null,
      prowess: p.prowess ?? 0,
      ultimate: p.ultimate ?? null,
      ultimateState: p.ultimateState ? {
        id: p.ultimateState.id, phase: p.ultimateState.phase, commitAt: p.ultimateState.commitAt, until: p.ultimateState.until,
        // (a Vortex: where its blade is, how fast it turns, and what the knight has steered it to)
        ...(p.ultimateState.angle !== undefined ? {
          angle: p.ultimateState.angle, angleAt: p.ultimateState.angleAt, rate: p.ultimateState.rate, emphasis: p.ultimateState.emphasis ?? 0,
        } : {}),
      } : null,
      // dizzy from a Vortex just ended (only seen)
      dizzyUntil: p.dizzyUntil ?? -Infinity,
      recoverUntil: p.recoverUntil ?? -Infinity,
      ultimateLockedUntil: p.ultimateLockedUntil ?? -Infinity,
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
        crouch: Boolean(message.crouch),
        // (what is held, beside the presses themselves: a Vortex is steered by it)
        attack: Boolean(message.attack),
        guard: Boolean(message.guard),
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
    // the spell's key: the spell when it is ready; on its cooldown, the gauntlet if a foe is in reach
    case 'cast': tryCastOrGauntlet(room, player.id, message.direction || { x: 0, y: 0, z: -1 }, time, compensatedInputTime(message.clientTime, time)); return {};
    case 'selectPreparedSpell': selectPreparedSpell(room, player.id, message.spell ?? message.id, time); return {};
    case 'castPreparedSpell': {
      // Aim is current input intent. Only finite angles enter the authoritative state.
      const yaw = Number.isFinite(message.yaw) ? message.yaw : player.input?.yaw ?? player.yaw;
      const pitch = Number.isFinite(message.pitch) ? Math.max(-1.45, Math.min(1.45, message.pitch)) : player.input?.pitch ?? player.pitch;
      player.input = { ...player.input, yaw, pitch };
      player.yaw = yaw; player.pitch = pitch;
      castPreparedSpell(room, player.id, message.spell ?? message.id, message.direction || { x: 0, y: 0, z: -1 }, time);
      return {};
    }
    // the gauntlet on its own key: the fist, whether or not the spell is ready
    case 'gauntlet': tryGauntletStrike(room, player.id, time, compensatedInputTime(message.clientTime, time)); return {};
    case 'dash': tryDash(room, player.id, message.direction || { x: 0, z: -1 }, time); return {};
    // the ultimate's key (a full prowess meter): the brace begins
    case 'ultimate': tryUltimate(room, player.id, time); return {};
    case 'rematch': room.requestRematch(player.id, time); return {};
    case 'practiceResetPlayer':
      return room.mode === GAME_MODES.PRACTICE && resetPracticePlayer(room, player.id, time) ? {} : { rejected: PRACTICE_REJECTED };
    case 'practiceSpawnDummy':
      if (room.mode !== GAME_MODES.PRACTICE) return { rejected: PRACTICE_REJECTED };
      return spawnPracticeDummy(room, message.mode, time) ? { lobby: true } : { rejected: PRACTICE_REJECTED };
    case 'practiceRemoveDummy':
      return room.mode === GAME_MODES.PRACTICE && removePracticeDummy(room) ? { lobby: true } : { rejected: PRACTICE_REJECTED };
    case 'practiceReadyUltimate':
      return room.mode === GAME_MODES.PRACTICE && readyPracticeUltimate(room, player.id) ? {} : { rejected: PRACTICE_REJECTED };
    case 'practiceSetDummyMode':
      return room.mode === GAME_MODES.PRACTICE && setPracticeDummyMode(room, message.mode, time) ? { lobby: true } : { rejected: PRACTICE_REJECTED };
    default: return {};
  }
}

const PRACTICE_REJECTED = 'Practice command unavailable';
