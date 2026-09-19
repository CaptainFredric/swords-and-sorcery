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
      disconnectedAt: null,
      disconnectExpiresAt: null,
      kills: 0,
      deaths: 0,
      parries: 0,
      abyssKills: 0,
      ...freshCombatState(spawn, nowSec),
    };
    this.players.set(id, player);
    this.emptySince = null;
    if (this.connectedCount() >= 2 && this.state === 'WAITING') {
      this.state = 'COUNTDOWN';
      this.countdownEndsAt = nowSec + COUNTDOWN_SEC;
    }
    return player;
  }

  connectedCount() {
    let count = 0;
    for (const p of this.players.values()) if (p.connected) count += 1;
    return count;
  }

  disconnectPlayer(id, nowSec) {
    const player = this.players.get(id);
    if (!player) return;
    player.connected = false;
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
  }

  reconnectPlayer(token, nowSec) {
    for (const player of this.players.values()) {
      if (player.token !== token) continue;
      if (player.disconnectExpiresAt !== null && nowSec <= player.disconnectExpiresAt) {
        player.connected = true;
        player.disconnectedAt = null;
        player.disconnectExpiresAt = null;
        this.emptySince = null;
        return player;
      }
    }
    return null;
  }

  tick(nowSec) {
    for (const [id, player] of this.players) {
      if (!player.connected && player.disconnectExpiresAt !== null && nowSec > player.disconnectExpiresAt) {
        this.players.delete(id);
        this.rematchVotes.delete(id);
      }
    }

    if (this.players.size === 0) {
      if (this.emptySince === null) this.emptySince = nowSec;
    } else {
      this.emptySince = null;
    }

    if (this.state === 'COUNTDOWN' && this.connectedCount() < 2) {
      this.state = 'WAITING';
      this.countdownEndsAt = null;
    } else if (this.state === 'COUNTDOWN' && nowSec >= this.countdownEndsAt) {
      this.startMatch(nowSec);
    } else if (this.state === 'REMATCH_COUNTDOWN' && nowSec >= this.countdownEndsAt) {
      this.startMatch(nowSec);
    }

    if (this.state === 'PLAYING' && !this.suddenDeath && this.matchStartedAt !== null && nowSec >= this.matchStartedAt + MATCH_SEC) {
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
    if (killer.kills >= SCORE_TO_WIN) {
      this.finish(killerId, nowSec);
      return;
    }
    if (this.suddenDeath && this.suddenDeathLeaders.includes(killerId)) {
      this.finish(killerId, nowSec);
    }
  }

  finish(winnerId, nowSec) {
    this.state = 'FINISHED';
    this.winnerId = winnerId;
    this.events.push({ type: 'matchEnded', winnerId, at: nowSec });
  }

  requestRematch(playerId, nowSec) {
    if (this.state !== 'FINISHED' || !this.players.has(playerId)) return false;
    this.rematchVotes.add(playerId);
    const connectedIds = [...this.players.values()].filter((p) => p.connected).map((p) => p.id);
    const unanimous = connectedIds.length >= 2 && connectedIds.every((id) => this.rematchVotes.has(id));
    if (!unanimous) return false;
    for (const p of this.players.values()) {
      p.kills = 0;
      p.deaths = 0;
      p.parries = 0;
      p.abyssKills = 0;
    }
    this.state = 'REMATCH_COUNTDOWN';
    this.countdownEndsAt = nowSec + COUNTDOWN_SEC;
    this.winnerId = null;
    this.suddenDeath = false;
    this.suddenDeathLeaders = [];
    return true;
  }

  isCleanupEligible(nowSec) {
    return this.players.size === 0 && this.emptySince !== null && nowSec - this.emptySince >= CLEANUP_SEC;
  }
}

export const ROOM_RULES = Object.freeze({ COUNTDOWN_SEC, MATCH_SEC, RECONNECT_GRACE_SEC, CLEANUP_SEC, SCORE_TO_WIN });
