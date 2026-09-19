import { createMovementState } from '../../../shared/src/movement.mjs';
import { GAME_MODES, getModePolicy } from '../../../shared/src/modes.mjs';
import { WORLD_IDS, getWorld } from '../../../shared/worlds/registry.mjs';

const COUNTDOWN_SEC = 3;
const MATCH_SEC = 360;
const RECONNECT_GRACE_SEC = 15;
const CLEANUP_SEC = 60;
const SCORE_TO_WIN = 10;

function freshCombatState(spawn, nowSec = 0) {
  const movement = createMovementState({ x: spawn.x, y: spawn.y, z: spawn.z });
  return {
    ...movement,
    yaw: spawn.yaw ?? 0,
    pitch: 0,
    health: 100,
    guardStamina: 100,
    guarding: false,
    guardStartedAt: -Infinity,
    lastGuardDrainAt: -Infinity,
    attackActive: false,
    attackHeld: false,
    attackStartedAt: -Infinity,
    attackNextStrike: 0,
    attackRestartAt: -Infinity,
    staggerUntil: -Infinity,
    fireballReadyAt: 0,
    castEndsAt: 0,
    pendingFireball: null,
    spawnProtectionUntil: nowSec + 1,
    alive: true,
    respawnAt: 0,
    lastDamageAt: -Infinity,
    lastAttackerId: null,
    lastKnockbackAt: -Infinity,
    lastInputSeq: 0,
    history: [],
    input: { forward: 0, right: 0, jump: false, yaw: spawn.yaw ?? 0, pitch: 0 },
  };
}

function scoreFields() {
  return { kills: 0, deaths: 0, parries: 0, abyssKills: 0 };
}

export class Room {
  constructor(code, { isPrivate = true, mode = GAME_MODES.FFA, worldId = WORLD_IDS.SHATTERED_KEEP } = {}) {
    this.code = code;
    this.isPrivate = isPrivate;
    this.mode = mode;
    this.policy = getModePolicy(mode);
    this.worldId = worldId;
    this.world = getWorld(worldId);
    this.state = 'WAITING';
    this.players = new Map();
    this.projectiles = new Map();
    this.events = [];
    this.countdownEndsAt = null;
    this.matchStartedAt = null;
    this.winnerId = null;
    this.suddenDeath = false;
    this.suddenDeathLeaders = [];
    this.rematchVotes = new Set();
    this.emptySince = null;
    this.tickNumber = 0;
    this.recentSpawnUse = new Map();
  }

  addPlayer({ id, token, name }, nowSec) {
    if (this.players.size >= 8) throw new Error('Room is full');
    const spawn = this.world.spawnPoints[this.players.size % this.world.spawnPoints.length];
    const player = {
      id,
      token,
      name: String(name || 'Spellblade').slice(0, 18),
      actorKind: 'human',
      connected: true,
      arenaReady: false,
      disconnectedAt: null,
      disconnectExpiresAt: null,
      ...scoreFields(),
      ...freshCombatState(spawn, nowSec),
    };
    this.players.set(id, player);
    this.emptySince = null;
    this.#armMultiplayerStart(nowSec);
    return player;
  }

  addServerActor({ id, name, actorKind }, nowSec) {
    if (!['bot', 'dummy'].includes(actorKind)) throw new Error('Server actor must be bot or dummy');
    if (this.players.size >= 8) throw new Error('Room is full');
    if (this.players.has(id)) return this.players.get(id);
    const spawn = this.world.spawnPoints[this.players.size % this.world.spawnPoints.length];
    const actor = {
      id,
      token: null,
      name: String(name || (actorKind === 'bot' ? 'Rival Spellblade' : 'Training Dummy')).slice(0, 18),
      actorKind,
      connected: false,
      disconnectedAt: null,
      disconnectExpiresAt: null,
      ...scoreFields(),
      ...freshCombatState(spawn, nowSec),
    };
    this.players.set(id, actor);
    return actor;
  }

  provisionModeActors(nowSec) {
    if (this.mode !== GAME_MODES.BOT_DUEL) return;
    const existingBots = [...this.players.values()].filter((p) => p.actorKind === 'bot');
    for (let i = existingBots.length; i < this.policy.botCount; i += 1) {
      this.addServerActor({
        id: `bot-${this.code}-${i + 1}`,
        name: i === 0 ? 'Rival Spellblade' : `Rival ${i + 1}`,
        actorKind: 'bot',
      }, nowSec);
    }
  }

  humanCount() {
    let count = 0;
    for (const p of this.players.values()) if (p.actorKind === 'human' && p.connected) count += 1;
    return count;
  }

  readyHumanCount() {
    let count = 0;
    for (const p of this.players.values()) if (p.actorKind === 'human' && p.connected && p.arenaReady) count += 1;
    return count;
  }

  humanActorCount() {
    let count = 0;
    for (const p of this.players.values()) if (p.actorKind === 'human') count += 1;
    return count;
  }

  connectedCount() {
    return this.humanCount();
  }

  armAutoStart(nowSec) {
    if (!this.policy.autoStart || this.state !== 'WAITING' || this.humanCount() < this.policy.minHumansToStart) return false;
    if (this.mode === GAME_MODES.PRACTICE) {
      this.startMatch(nowSec);
      return true;
    }
    this.provisionModeActors(nowSec);
    if (this.mode === GAME_MODES.BOT_DUEL && this.readyHumanCount() < this.policy.minHumansToStart) return false;
    const botCount = [...this.players.values()].filter((p) => p.actorKind === 'bot').length;
    if (botCount < this.policy.botCount) return false;
    this.state = 'COUNTDOWN';
    this.countdownEndsAt = nowSec + COUNTDOWN_SEC;
    return true;
  }

  setArenaReady(playerId, ready, nowSec) {
    if (this.mode !== GAME_MODES.BOT_DUEL || ['PLAYING', 'FINISHED'].includes(this.state)) return false;
    const player = this.players.get(playerId);
    if (!player || player.actorKind !== 'human' || !player.connected) return false;
    player.arenaReady = Boolean(ready);
    if (!player.arenaReady) {
      if (this.state === 'COUNTDOWN') {
        this.state = 'WAITING';
        this.countdownEndsAt = null;
      }
      return true;
    }
    if (this.state === 'WAITING') this.armAutoStart(nowSec);
    return true;
  }

  #armMultiplayerStart(nowSec) {
    if (this.policy.autoStart || this.state !== 'WAITING') return;
    if (this.humanCount() < this.policy.minHumansToStart) return;
    this.state = 'COUNTDOWN';
    this.countdownEndsAt = nowSec + COUNTDOWN_SEC;
  }

  disconnectPlayer(id, nowSec) {
    const player = this.players.get(id);
    if (!player || player.actorKind !== 'human') return;
    player.connected = false;
    player.arenaReady = false;
    player.disconnectedAt = nowSec;
    player.disconnectExpiresAt = nowSec + RECONNECT_GRACE_SEC;
    player.input = {
      forward: 0,
      right: 0,
      jump: false,
      yaw: player.yaw,
      pitch: player.pitch,
    };
    player.attackHeld = false;
    player.attackActive = false;
    player.attackNextStrike = 0;
    player.guarding = false;
    player.pendingFireball = null;
    player.castEndsAt = 0;
    if (this.mode === GAME_MODES.BOT_DUEL && this.state === 'COUNTDOWN') {
      this.state = 'WAITING';
      this.countdownEndsAt = null;
    }
  }

  reconnectPlayer(token, nowSec) {
    for (const player of this.players.values()) {
      if (player.actorKind !== 'human' || player.token !== token) continue;
      if (player.disconnectExpiresAt !== null && nowSec <= player.disconnectExpiresAt) {
        player.connected = true;
        player.disconnectedAt = null;
        player.disconnectExpiresAt = null;
        if (this.mode === GAME_MODES.BOT_DUEL && this.state !== 'PLAYING') player.arenaReady = false;
        this.emptySince = null;
        if (this.policy.autoStart) this.armAutoStart(nowSec);
        else this.#armMultiplayerStart(nowSec);
        return player;
      }
    }
    return null;
  }

  tick(nowSec) {
    for (const [id, player] of this.players) {
      if (player.actorKind === 'human'
        && !player.connected
        && player.disconnectExpiresAt !== null
        && nowSec > player.disconnectExpiresAt) {
        this.players.delete(id);
        this.rematchVotes.delete(id);
      }
    }

    if (this.humanActorCount() === 0) {
      if (this.emptySince === null) this.emptySince = nowSec;
    } else {
      this.emptySince = null;
    }

    const countdownNeedsReadyHuman = this.mode === GAME_MODES.BOT_DUEL
      && this.readyHumanCount() < this.policy.minHumansToStart;
    if (this.state === 'COUNTDOWN' && (this.humanCount() < this.policy.minHumansToStart || countdownNeedsReadyHuman)) {
      this.state = 'WAITING';
      this.countdownEndsAt = null;
    } else if (this.state === 'COUNTDOWN' && nowSec >= this.countdownEndsAt) {
      this.startMatch(nowSec);
    } else if (this.state === 'REMATCH_COUNTDOWN' && nowSec >= this.countdownEndsAt) {
      this.startMatch(nowSec);
    }

    if (this.state === 'PLAYING'
      && this.policy.timed
      && !this.suddenDeath
      && this.matchStartedAt !== null
      && nowSec >= this.matchStartedAt + this.policy.matchSeconds) {
      let max = -1;
      let leaders = [];
      for (const p of this.players.values()) {
        if (p.kills > max) {
          max = p.kills;
          leaders = [p.id];
        } else if (p.kills === max) {
          leaders.push(p.id);
        }
      }
      if (leaders.length === 1) this.finish(leaders[0], nowSec);
      else {
        this.suddenDeath = true;
        this.suddenDeathLeaders = leaders;
      }
    }
  }

  startMatch(nowSec) {
    this.state = 'PLAYING';
    this.matchStartedAt = nowSec;
    this.countdownEndsAt = null;
    this.winnerId = null;
    this.suddenDeath = false;
    this.suddenDeathLeaders = [];
    this.rematchVotes.clear();
    let i = 0;
    for (const player of this.players.values()) {
      const spawn = this.world.spawnPoints[i % this.world.spawnPoints.length];
      Object.assign(player, freshCombatState(spawn, nowSec));
      i += 1;
    }
    this.projectiles.clear();
    this.events.push({ type: 'matchStarted', at: nowSec });
  }

  recordKill(killerId, victimId, nowSec) {
    const killer = this.players.get(killerId);
    const victim = this.players.get(victimId);
    if (!killer || !victim || this.state !== 'PLAYING') return;
    killer.kills += 1;
    victim.deaths += 1;
    if (this.policy.scored && Number.isFinite(this.policy.scoreToWin) && killer.kills >= this.policy.scoreToWin) {
      this.finish(killerId, nowSec);
      return;
    }
    if (this.policy.scored && this.suddenDeath && this.suddenDeathLeaders.includes(killerId)) {
      this.finish(killerId, nowSec);
    }
  }

  finish(winnerId, nowSec) {
    this.state = 'FINISHED';
    this.winnerId = winnerId;
    this.events.push({ type: 'matchEnded', winnerId, at: nowSec });
  }

  requestRematch(playerId, nowSec) {
    if (!this.policy.allowRematchVote || this.state !== 'FINISHED' || !this.players.has(playerId)) return false;
    this.rematchVotes.add(playerId);
    const connectedIds = [...this.players.values()]
      .filter((p) => p.actorKind === 'human' && p.connected)
      .map((p) => p.id);
    const unanimous = connectedIds.length >= 2 && connectedIds.every((id) => this.rematchVotes.has(id));
    if (!unanimous) return false;
    for (const p of this.players.values()) Object.assign(p, scoreFields());
    this.state = 'REMATCH_COUNTDOWN';
    this.countdownEndsAt = nowSec + COUNTDOWN_SEC;
    this.winnerId = null;
    this.suddenDeath = false;
    this.suddenDeathLeaders = [];
    return true;
  }

  isCleanupEligible(nowSec) {
    return this.humanActorCount() === 0 && this.emptySince !== null && nowSec - this.emptySince >= CLEANUP_SEC;
  }
}

export const ROOM_RULES = Object.freeze({ COUNTDOWN_SEC, MATCH_SEC, RECONNECT_GRACE_SEC, CLEANUP_SEC, SCORE_TO_WIN });
