import { createMovementState } from '../src/movement.mjs';
import { guardProfile } from '../src/combat.mjs';
import { GAME_MODES, VOTE_OPTIONS, getModePolicy } from '../src/modes.mjs';
import { WORLD_IDS, getWorld } from '../worlds/registry.mjs';
import { DEFAULT_SPELL, SPELLS, isSpell } from '../src/spells.mjs';
import { recordChallengeFact, resetChallengeTracking } from './challenges.mjs';
import { normalizePreparedSpells } from '../src/preparedSpells.mjs';
import { freshStagger } from '../src/stagger.mjs';
import { DEFAULT_ULTIMATE, ULTIMATES, isUltimate } from '../src/ultimates.mjs';
import { BOT_SKILLS, botSkillId } from './botSkill.mjs';
import { beginPeace } from './peace.mjs';

const COUNTDOWN_SEC = 3;
const MATCH_SEC = 360;
const RECONNECT_GRACE_SEC = 15;
const CLEANUP_SEC = 60;
const SCORE_TO_WIN = 10;
// a room with two or more Spellblades starts on its own after this long, even if not everyone pressed Ready
const AUTO_START_PUBLIC_SEC = 10;
const AUTO_START_PRIVATE_SEC = 20;

function freshCombatState(spawn, nowSec = 0) {
  const movement = createMovementState({ x: spawn.x, y: spawn.y, z: spawn.z });
  return {
    ...movement,
    dashStartedAt: -Infinity,
    yaw: spawn.yaw ?? 0,
    pitch: 0,
    health: 100,
    guardStamina: guardProfile().capacity,
    guarding: false,
    guardHeld: false,
    guardStartedAt: -Infinity,
    lastGuardDrainAt: -Infinity,
    attackActive: false,
    attackChainSerial: 0,
    attackChainId: null,
    attackHeld: false,
    attackQueued: false,
    attackStartedAt: -Infinity,
    attackSlam: false,
    attackNextStrike: 0,
    attackCommitted: 0,
    attackRestartAt: -Infinity,
    staggerUntil: -Infinity,
    spellReadyAt: 0,
    spellReadyById: {},
    chivalryProjectileReadyAt: 0,
    preparedSpellSelected: false,
    gauntlet: null,
    gust: null,
    gauntletReadyAt: -Infinity,
    crouched: false,
    castEndsAt: 0,
    pendingSpell: null,
    burn: null,
    chill: null,
    steel: null,
    speedScale: 1,
    // balance, prowess and the ultimate start each match fresh (prowess is kept through a death, not past a match)
    stagger: freshStagger(),
    prowess: 0,
    ultimateState: null,
    ultimateLockedUntil: -Infinity,
    recoverUntil: -Infinity,
    dizzyUntil: -Infinity,
    spawnProtectionUntil: nowSec + 1,
    alive: true,
    respawnAt: 0,
    lastDamageAt: -Infinity,
    lastAttackerId: null,
    lastKnockbackAt: -Infinity,
    lastKnockbackSource: null,
    lastKnockbackBy: null,
    lastInputSeq: 0,
    history: [],
    input: { forward: 0, right: 0, jump: false, sprint: false, yaw: spawn.yaw ?? 0, pitch: 0 },
  };
}

function scoreFields() {
  return { kills: 0, deaths: 0, parries: 0, abyssKills: 0 };
}

export class Room {
  constructor(code, { isPrivate = true, mode = GAME_MODES.FFA, worldId = WORLD_IDS.SHATTERED_KEEP } = {}) {
    this.code = code;
    resetChallengeTracking(this);
    this.isPrivate = isPrivate;
    this.mode = mode;
    this.policy = getModePolicy(mode);
    this.worldId = worldId;
    this.world = getWorld(worldId);
    this.state = 'WAITING';
    this.players = new Map();
    this.projectiles = new Map();
    this.ruptures = [];
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
    this.scoreToWin = this.policy.scoreToWin;
    this.autoStartAt = null;
    this.autoStartAfterSec = isPrivate ? AUTO_START_PRIVATE_SEC : AUTO_START_PUBLIC_SEC;
    // how well the mode's bots play (botSkill.mjs), and the peace a match opens in (peace.mjs)
    this.botSkill = botSkillId(null);
    this.peace = null;
  }

  /** How well this room's bots play (a Bot Duel's rival): one of BOT_SKILLS, the Knight's otherwise. */
  setBotSkill(skill) {
    this.botSkill = botSkillId(skill);
    for (const actor of this.players.values()) if (actor.actorKind === 'bot') this.#skilled(actor);
  }

  // a bot given the room's skill, and the name that goes with it (its first rival only: a second keeps its number)
  #skilled(actor) {
    actor.botSkill = this.botSkill;
    if (actor.rivalIndex === 0) actor.name = BOT_SKILLS[this.botSkill].name;
  }

  addPlayer({ id, token, name, spell = DEFAULT_SPELL, ultimate = DEFAULT_ULTIMATE, preparedSpells = [] }, nowSec) {
    if (this.players.size >= 8) throw new Error('Room is full');
    const spawn = this.world.spawnPoints[this.players.size % this.world.spawnPoints.length];
    const player = {
      id,
      token,
      name: String(name || 'Spellblade').slice(0, 18),
      // the spell carried from the Armory
      spell: isSpell(spell) ? spell : DEFAULT_SPELL,
      // and the ultimate chosen there
      ultimate: isUltimate(ultimate) ? ultimate : DEFAULT_ULTIMATE,
      actorKind: 'human',
      connected: true,
      arenaReady: false,
      lobbyReady: false,
      votes: {},
      disconnectedAt: null,
      disconnectExpiresAt: null,
      ...scoreFields(),
      ...freshCombatState(spawn, nowSec),
    };
    player.startingSpell = player.spell;
    player.preparedSpells = normalizePreparedSpells(player.startingSpell, preparedSpells);
    player.startingPreparedSpells = [...player.preparedSpells];
    player.startingUltimate = player.ultimate;
    this.players.set(id, player);
    this.emptySince = null;
    return player;
  }

  addServerActor({ id, name, actorKind, spell = null, ultimate = null }, nowSec) {
    if (!['bot', 'dummy'].includes(actorKind)) throw new Error('Server actor must be bot or dummy');
    if (this.players.size >= 8) throw new Error('Room is full');
    if (this.players.has(id)) return this.players.get(id);
    const spawn = this.world.spawnPoints[this.players.size % this.world.spawnPoints.length];
    // (a bot brings a spell it throws, never a ward)
    const spells = Object.values(SPELLS).filter((s) => s.kind !== 'ward').map((s) => s.id);
    const ultimates = Object.keys(ULTIMATES);
    const actor = {
      id,
      token: null,
      name: String(name || (actorKind === 'bot' ? 'Rival Spellblade' : 'Training Dummy')).slice(0, 18),
      // a bot brings either spell, so both turn up in a fight
      spell: isSpell(spell) ? spell : spells[Math.floor(Math.random() * spells.length)],
      // (and either ultimate; a practice dummy, which earns none, the default)
      ultimate: isUltimate(ultimate) ? ultimate : actorKind === 'bot' ? ultimates[Math.floor(Math.random() * ultimates.length)] : DEFAULT_ULTIMATE,
      actorKind,
      connected: false,
      disconnectedAt: null,
      disconnectExpiresAt: null,
      ...scoreFields(),
      ...freshCombatState(spawn, nowSec),
    };
    actor.startingSpell = actor.spell;
    actor.preparedSpells = normalizePreparedSpells(actor.startingSpell, []);
    actor.startingPreparedSpells = [...actor.preparedSpells];
    actor.startingUltimate = actor.ultimate;
    this.players.set(id, actor);
    return actor;
  }

  provisionModeActors(nowSec) {
    if (this.mode !== GAME_MODES.BOT_DUEL) return;
    const existingBots = [...this.players.values()].filter((p) => p.actorKind === 'bot');
    for (let i = existingBots.length; i < this.policy.botCount; i += 1) {
      const actor = this.addServerActor({
        id: `bot-${this.code}-${i + 1}`,
        name: i === 0 ? BOT_SKILLS[this.botSkill].name : `Rival ${i + 1}`,
        actorKind: 'bot',
      }, nowSec);
      actor.rivalIndex = i;
      this.#skilled(actor);
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
    this.#beginCountdown(nowSec);
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

  // the longest-standing connected Spellblade (shown in the lobby; it grants no powers)
  hostId() {
    return [...this.players.values()].find(p => p.actorKind === 'human' && p.connected)?.id ?? null;
  }

  #beginCountdown(nowSec) {
    this.state = 'COUNTDOWN';
    this.countdownEndsAt = nowSec + (this.policy.countdownSec ?? COUNTDOWN_SEC);
    this.autoStartAt = null;
  }

  /** Ready check: when every connected Spellblade (at least two) is ready, the countdown begins. */
  setReady(playerId, ready, nowSec) {
    if (!this.policy.readyCheck || this.state !== 'WAITING') return false;
    const player = this.players.get(playerId);
    if (!player || player.actorKind !== 'human' || !player.connected) return false;
    player.lobbyReady = Boolean(ready);
    const humans = [...this.players.values()].filter((p) => p.actorKind === 'human' && p.connected);
    if (humans.length >= this.policy.minHumansToStart && humans.every((p) => p.lobbyReady)) this.#beginCountdown(nowSec);
    return true;
  }

  // older clients sent startMatch: it now just marks the sender ready
  requestStart(playerId, nowSec) {
    return this.setReady(playerId, true, nowSec);
  }

  /** A vote on the next match's arena or score (majority of connected Spellblades decides at the start). */
  vote(playerId, key, value) {
    if (!this.policy.votes || ['PLAYING', 'COUNTDOWN', 'REMATCH_COUNTDOWN'].includes(this.state)) return false;
    const player = this.players.get(playerId);
    const options = VOTE_OPTIONS[key];
    if (!player || player.actorKind !== 'human' || !options) return false;
    const choice = key === 'score' ? Number(value) : String(value);
    if (!options.includes(choice)) return false;
    player.votes = { ...(player.votes ?? {}), [key]: choice };
    return true;
  }

  /** Counts per option and the choice that would apply now. */
  tallyVotes() {
    const result = {};
    const current = { world: this.worldId, score: this.scoreToWin };
    for (const [key, options] of Object.entries(VOTE_OPTIONS)) {
      const counts = Object.fromEntries(options.map((option) => [option, 0]));
      for (const p of this.players.values()) {
        if (p.actorKind !== 'human' || !p.connected) continue;
        const choice = p.votes?.[key];
        if (choice !== undefined && choice in counts) counts[choice] += 1;
      }
      const best = Math.max(0, ...Object.values(counts));
      const leaders = Object.keys(counts).filter((option) => counts[option] === best && best > 0);
      // a tie (or no votes) keeps what the room has now
      const chosen = leaders.length === 1 ? leaders[0] : String(current[key]);
      result[key] = { counts, chosen: key === 'score' ? Number(chosen) : chosen };
    }
    return result;
  }

  #applyVotes() {
    if (!this.policy.votes) return;
    const tally = this.tallyVotes();
    if (tally.world.chosen !== this.worldId) {
      try {
        this.world = getWorld(tally.world.chosen);
        this.worldId = tally.world.chosen;
      } catch { /* unknown world: keep the current one */ }
    }
    if (Number.isFinite(tally.score.chosen)) this.scoreToWin = tally.score.chosen;
  }

  /** A Spellblade leaves for good (to seek a duel, for instance): their slot is freed at once. */
  removePlayer(id, nowSec) {
    const player = this.players.get(id);
    if (!player || player.actorKind !== 'human') return false;
    this.players.delete(id);
    this.rematchVotes.delete(id);
    if (this.humanActorCount() === 0 && this.emptySince === null) this.emptySince = nowSec;
    return true;
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
      sprint: false,
      yaw: player.yaw,
      pitch: player.pitch,
    };
    player.sprinting = false;
    player.attackHeld = false;
    player.attackActive = false;
    player.attackQueued = false;
    player.attackNextStrike = 0;
    player.attackCommitted = 0;
    player.guarding = false;
    player.guardHeld = false;
    player.pendingSpell = null;
    player.gauntlet = null;
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

    // ready check rooms start on their own a little after a second Spellblade arrives
    if (this.policy.readyCheck && this.state === 'WAITING') {
      if (this.humanCount() >= this.policy.minHumansToStart) {
        if (this.autoStartAt === null) this.autoStartAt = nowSec + this.autoStartAfterSec;
        else if (nowSec >= this.autoStartAt) this.#beginCountdown(nowSec);
      } else {
        this.autoStartAt = null;
      }
    }

    // a duellist who is gone for good forfeits
    if (this.policy.forfeit && this.state === 'PLAYING' && this.humanActorCount() < this.policy.minHumansToStart) {
      const remaining = [...this.players.values()].find((p) => p.actorKind === 'human');
      this.finish(remaining?.id ?? null, nowSec, 'forfeit');
    }

    const countdownNeedsReadyHuman = this.mode === GAME_MODES.BOT_DUEL
      && this.readyHumanCount() < this.policy.minHumansToStart;
    if (this.state === 'COUNTDOWN' && (this.humanCount() < this.policy.minHumansToStart || countdownNeedsReadyHuman)) {
      this.state = 'WAITING';
      this.countdownEndsAt = null;
    } else if (this.state === 'COUNTDOWN' && this.policy.readyCheck && this.humanCount() < this.policy.minHumansToStart) {
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
    resetChallengeTracking(this);
    this.#applyVotes();
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
      player.spell = isSpell(player.startingSpell) ? player.startingSpell : player.spell;
      player.preparedSpells = normalizePreparedSpells(player.spell, player.startingPreparedSpells ?? player.preparedSpells);
      player.ultimate = isUltimate(player.startingUltimate) ? player.startingUltimate : player.ultimate;
      Object.assign(player, freshCombatState(spawn, nowSec));
      i += 1;
    }
    this.projectiles.clear();
    this.ruptures = [];
    for (const player of this.players.values()) player.lobbyReady = false;
    // (a mode that asks for it opens in peace: its bots start nothing for a few seconds, or until a player does)
    beginPeace(this, nowSec, this.policy.openingPeaceSec ?? 0);
    this.events.push({ type: 'matchStarted', at: nowSec });
  }

  recordKill(killerId, victimId, nowSec) {
    const killer = this.players.get(killerId);
    const victim = this.players.get(victimId);
    if (!killer || !victim || this.state !== 'PLAYING') return;
    killer.kills += 1;
    victim.deaths += 1;
    if (this.policy.scored && Number.isFinite(this.scoreToWin) && killer.kills >= this.scoreToWin) {
      this.finish(killerId, nowSec);
      return;
    }
    if (this.policy.scored && this.suddenDeath && this.suddenDeathLeaders.includes(killerId)) {
      this.finish(killerId, nowSec);
    }
  }

  finish(winnerId, nowSec, reason = 'score') {
    this.state = 'FINISHED';
    this.winnerId = winnerId;
    this.finishReason = reason;
    this.events.push({ type: 'matchEnded', winnerId, reason, at: nowSec });
    recordChallengeFact(this, { type: 'matchFinished', winnerId, reason, at: nowSec });
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
    this.countdownEndsAt = nowSec + (this.policy.countdownSec ?? COUNTDOWN_SEC);
    this.winnerId = null;
    this.suddenDeath = false;
    this.suddenDeathLeaders = [];
    return true;
  }

  isCleanupEligible(nowSec) {
    return this.humanActorCount() === 0 && this.emptySince !== null && nowSec - this.emptySince >= CLEANUP_SEC;
  }
}

export const ROOM_RULES = Object.freeze({
  COUNTDOWN_SEC, MATCH_SEC, RECONNECT_GRACE_SEC, CLEANUP_SEC, SCORE_TO_WIN, AUTO_START_PUBLIC_SEC, AUTO_START_PRIVATE_SEC,
});
