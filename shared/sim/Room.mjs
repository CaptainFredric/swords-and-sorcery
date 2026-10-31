import {normalizeSiegeLoadout} from '../src/siegeLoadout.mjs';
import { roomSettings, validRoomNumber } from '../src/roomSettings.mjs';
import { createStructureState } from './structures.mjs';
import { dismountFightFlight } from './fightFlight.mjs';
import { createSoFistication, dismountSoFistication, soFistTerrainPose, soFistClear } from './soFistication.mjs';
import { createMovementState } from '../src/movement.mjs';
import { guardProfile } from '../src/combat.mjs';
import { GAME_MODES, VOTE_OPTIONS, getModePolicy } from '../src/modes.mjs';
import { WORLD_IDS, getWorld } from '../worlds/registry.mjs';
import { bastionBreachForObjective } from '../worlds/bastionBreach.mjs';
import { DEFAULT_SPELL, SPELLS, isSpell } from '../src/spells.mjs';
import { recordChallengeFact, resetChallengeTracking } from './challenges.mjs';
import { normalizePreparedSpells } from '../src/preparedSpells.mjs';
import { freshStagger } from '../src/stagger.mjs';
import { DEFAULT_ULTIMATE, ULTIMATES, isUltimate } from '../src/ultimates.mjs';
import { BOT_SKILLS, botSkillId } from './botSkill.mjs';
import { beginPeace } from './peace.mjs';
import { TEAMS, areAllies, assignTeam } from '../src/teams.mjs';
import { createObjectiveState } from './objectives.mjs';
import { createHighGroundsState, availableHighGroundsSpawns, finishHighGroundsOnTime } from './highGroundsMode.mjs';
import { createBiByeLlista, dismountBiByeLlista } from './biByeLlista.mjs';

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
    operatingFightFlightId: null,
    dashStartedAt: -Infinity,
    yaw: spawn.yaw ?? 0,
    pitch: 0,
    health: 100,
    guardStamina: guardProfile().capacity,
    guarding: false,
    guardHeld: false,
    // the player's own buttons, held or not, and when each was last pressed (heldActions.mjs)
    guardButton: false,
    guardPressedAt: -Infinity,
    attackButton: false,
    attackPressedAt: -Infinity,
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
    damageTakenThisLife: 0,
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
  constructor(code, { isPrivate = true, mode = GAME_MODES.FFA, worldId = WORLD_IDS.SHATTERED_KEEP, teamSize = null } = {}) {
    this.code = code;
    resetChallengeTracking(this);
    this.isPrivate = isPrivate;
    this.sharedPractice=false;
    this.sharedPracticeHostId=null;
    this.mode = mode;
    this.policy = { ...getModePolicy(mode) };
    if (this.policy.teamMode && (teamSize === 2 || teamSize === 3)) {
      this.policy.teamSize = teamSize;
      this.policy.botCount = teamSize * 2 - 1;
    }
    this.worldId = worldId;
    this.world = getWorld(worldId);
    this.structures = createStructureState(this.world);
    this.soFistication = null;
    this.soFistRevision = 0;
    this.fightFlight = null;
    this.fightFlightRevision = 0;
    this.fightFlightProjectiles = new Map();
    this.flightBurnZones=[];
    if (this.world.ballistaEmplacement) {
      this.biByeLlista = createBiByeLlista(this.world.ballistaEmplacement);
      this.biByeRevision = 0;
      this.bibyeProjectiles = new Map();
    } else if (this.mode === GAME_MODES.PRACTICE) {
      this.biByeLlista = null;
      this.biByeRevision = 0;
      this.bibyeProjectiles = new Map();
    } else {
      this.biByeLlista = null;
      this.bibyeProjectiles = null;
    }
    this.state = 'WAITING';
    this.players = new Map();
    this.projectiles = new Map();
    this.ruptures = [];
    this.events = [];
    this.countdownEndsAt = null;
    this.matchStartedAt = null;
    this.winnerId = null;
    this.winnerTeam = null;
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
    this.botsProvisioned = false;
    this.teamMarks = [];
    this.overtime = false;
    this.overtimeStartedAt = null;
    this.overtimeClearedAt = null;
    this.highGrounds = this.mode === GAME_MODES.HIGH_GROUNDS ? createHighGroundsState(this.world) : null;
    if (this.policy.teamMode && this.mode !== GAME_MODES.HIGH_GROUNDS) {
      this.objectiveState = createObjectiveState(this.world.objectives ?? []);
      const template = getWorld(this.worldId);
      if (typeof template?.forObjective === 'function')
        this.world = template.forObjective(this.objectiveState);
      else if (this.worldId === WORLD_IDS.BASTION_BREACH)
        this.world = bastionBreachForObjective(this.objectiveState);
    }
  }

  /** How well this room's bots play (a Bot Duel's rival): one of BOT_SKILLS, the Knight's otherwise. */
  setBotSkill(skill) {
    this.botSkill = botSkillId(skill);
    for (const actor of this.players.values()) if (actor.actorKind === 'bot') this.#skilled(actor);
  }

  // a bot given the room's skill, and the name that goes with it (its first rival only: a second keeps its number)
  #skilled(actor) {
    actor.botSkill = this.botSkill;
    if (actor.rivalIndex === 0 && !this.policy.teamMode) actor.name = BOT_SKILLS[this.botSkill].name;
  }

  initialSpawnFor(player, index = 0, nowSec = 0) {
    if (!this.world?.spawnPoints?.length) return { x: 0, y: 0, z: 0, yaw: 0 };
    if (this.policy.teamMode && player?.team) {
      if (this.mode === GAME_MODES.HIGH_GROUNDS) {
        const candidates = availableHighGroundsSpawns(this, player, this.world.spawnPoints);
        if (candidates.length) return candidates[index % candidates.length];
      }
      const currentPhase = this.objectiveState?.phase ?? 0;
      const phaseMatching = this.world.spawnPoints.filter((s) => s.team === player.team && s.phase === currentPhase);
      if (phaseMatching.length) {
        return phaseMatching[index % phaseMatching.length];
      }
      const matching = this.world.spawnPoints.filter((s) => s.team === player.team && (s.phase === undefined || s.phase === 0));
      if (matching.length) {
        return matching[index % matching.length];
      }
    }
    return this.world.spawnPoints[index % this.world.spawnPoints.length];
  }

  addPlayer({ id, token, name, spell = DEFAULT_SPELL, ultimate = DEFAULT_ULTIMATE, preparedSpells = [], siegeLoadout = null, team = null }, nowSec) {
    let assigned = null;
    if (this.policy.teamMode) {
      const teamSize = this.policy.teamSize ?? 3;
      if (this.humanActorCount() >= 2 * teamSize) {
        throw new Error('Room is full');
      }
      assigned = assignTeam(this, team, true);
      const humansOnAssigned = [...this.players.values()].filter((p) => p.actorKind === 'human' && p.team === assigned).length;
      if (humansOnAssigned >= teamSize) {
        throw new Error('Room is full');
      }
      const targetTotal = teamSize * 2;
      if (this.players.size >= targetTotal || this.botsProvisioned) {
        const replaceableBot = [...this.players.values()].find((p) => p.actorKind === 'bot' && p.team === assigned);
        if (replaceableBot) this.players.delete(replaceableBot.id);
      }
    } else {
      if (this.players.size >= 8) {
        throw new Error('Room is full');
      }
    }
    const spawn = this.initialSpawnFor(assigned ? { team: assigned } : {}, this.players.size, nowSec);
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
      ...(this.policy.teamMode ? { team: assigned } : {}),
      ...scoreFields(),
      ...freshCombatState(spawn, nowSec),
    };
    player.startingSpell = player.spell;
    player.preparedSpells = normalizePreparedSpells(player.startingSpell, preparedSpells);
    player.startingPreparedSpells = [...player.preparedSpells];
    player.startingUltimate = player.ultimate;
    player.siegeLoadout=normalizeSiegeLoadout(siegeLoadout);
    this.players.set(id, player);
    if(this.sharedPractice&&!this.sharedPracticeHostId)this.sharedPracticeHostId=id;
    this.emptySince = null;
    return player;
  }

  addServerActor({ id, name, actorKind, spell = null, ultimate = null, team = null }, nowSec) {
    if (!['bot', 'dummy'].includes(actorKind)) throw new Error('Server actor must be bot or dummy');
    if (this.players.size >= 8) throw new Error('Room is full');
    if (this.players.has(id)) return this.players.get(id);
    const assigned = this.policy.teamMode ? assignTeam(this, team) : null;
    const spawn = this.initialSpawnFor({ team: assigned }, this.players.size, nowSec);
    // (a bot brings a spell it throws, never a ward)
    const spells = Object.values(SPELLS).filter((s) => s.kind !== 'ward').map((s) => s.id);
    const ultimates = Object.keys(ULTIMATES);
    const actor = {
      id,
      token: null,
      name: String(name || (actorKind === 'bot' ? 'Rival Spellblade' : 'Training Dummy')).slice(0, 32),
      // a bot brings either spell, so both turn up in a fight
      spell: isSpell(spell) ? spell : spells[Math.floor(Math.random() * spells.length)],
      // (and either ultimate; a practice dummy, which earns none, the default)
      ultimate: isUltimate(ultimate) ? ultimate : actorKind === 'bot' ? ultimates[Math.floor(Math.random() * ultimates.length)] : DEFAULT_ULTIMATE,
      actorKind,
      connected: false,
      disconnectedAt: null,
      disconnectExpiresAt: null,
      ...(this.policy.teamMode ? { team: assigned } : {}),
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
    if (this.mode === GAME_MODES.BOT_DUEL) {
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
      return;
    }

    if (this.policy.teamMode) {
      this.botsProvisioned = true;
      const teamSize = this.policy.teamSize ?? 3;
      const attackers = [...this.players.values()].filter((p) => p.team === TEAMS.ATTACKERS);
      const defenders = [...this.players.values()].filter((p) => p.team === TEAMS.DEFENDERS);

      while (attackers.length > teamSize) {
        const extraBot = attackers.find((p) => p.actorKind === 'bot');
        if (!extraBot) break;
        this.players.delete(extraBot.id);
        const idx = attackers.indexOf(extraBot);
        if (idx >= 0) attackers.splice(idx, 1);
      }
      while (defenders.length > teamSize) {
        const extraBot = defenders.find((p) => p.actorKind === 'bot');
        if (!extraBot) break;
        this.players.delete(extraBot.id);
        const idx = defenders.indexOf(extraBot);
        if (idx >= 0) defenders.splice(idx, 1);
      }

      let serial = 1;
      while (attackers.length < teamSize) {
        while (this.players.has(`bot-att-${this.code}-${serial}`)) serial += 1;
        const slotIndex = attackers.length;
        const actor = this.addServerActor({
          id: `bot-att-${this.code}-${serial}`,
          name: `Squire ${['Vance', 'Rowan', 'Garrick', 'Thorne'][(serial - 1) % 4]}`,
          actorKind: 'bot',
          team: TEAMS.ATTACKERS,
        }, nowSec);
        actor.team = TEAMS.ATTACKERS;
        actor.rivalIndex = slotIndex;
        this.#skilled(actor);
        attackers.push(actor);
        serial += 1;
      }

      serial = 1;
      while (defenders.length < teamSize) {
        while (this.players.has(`bot-def-${this.code}-${serial}`)) serial += 1;
        const slotIndex = defenders.length;
        const actor = this.addServerActor({
          id: `bot-def-${this.code}-${serial}`,
          name: `Warden ${['Alden', 'Kaelen', 'Bryce', 'Merrick'][(serial - 1) % 4]}`,
          actorKind: 'bot',
          team: TEAMS.DEFENDERS,
        }, nowSec);
        actor.team = TEAMS.DEFENDERS;
        actor.rivalIndex = slotIndex;
        this.#skilled(actor);
        defenders.push(actor);
        serial += 1;
      }
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
    if (this.policy.teamMode) {
      const targetTotal = (this.policy.teamSize ?? 3) * 2;
      if (this.players.size < targetTotal) return false;
    } else {
      const botCount = [...this.players.values()].filter((p) => p.actorKind === 'bot').length;
      if (botCount < this.policy.botCount) return false;
    }
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

  /** Ready check: when every connected Spellblade is ready, the countdown begins. */
  setReady(playerId, ready, nowSec) {
    if ((!this.policy.readyCheck && !this.policy.teamMode) || this.state !== 'WAITING') return false;
    const player = this.players.get(playerId);
    if (!player || player.actorKind !== 'human' || !player.connected) return false;
    player.lobbyReady = Boolean(ready);
    const humans = [...this.players.values()].filter((p) => p.actorKind === 'human' && p.connected);
    if (humans.length >= this.policy.minHumansToStart && humans.every((p) => p.lobbyReady)) {
      if (this.policy.teamMode) this.provisionModeActors(nowSec);
      this.#beginCountdown(nowSec);
    }
    return true;
  }

  /** Private waiting rooms belong to their longest-standing connected human. */
  configureRoom(playerId, patch, nowSec) {
    if (!this.isPrivate || this.state !== 'WAITING' || playerId !== this.hostId()) return 'Only the room host may change settings before the countdown.';
    const settings = roomSettings(this, patch);
    if (settings.error) return settings.error;
    if (this.humanActorCount() > (['BREAKTHROUGH', 'HIGH_GROUNDS'].includes(settings.mode) ? settings.teamSize * 2 : 8)) return 'Too many Spellblades for that team size.';
    const world = getWorld(settings.worldId);
    const previousMode=this.mode;
    // Everything is validated before actors or geometry change.
    for (const [id, actor] of this.players) if (actor.actorKind !== 'human') this.players.delete(id);
    this.mode = settings.mode;
    this.policy = { ...getModePolicy(settings.mode), matchSeconds: settings.matchSeconds,
      ...(settings.teamSize ? {teamSize:settings.teamSize,botCount:settings.teamSize*2-1} : {}) };
    this.scoreToWin = settings.scoreToWin;
    this.worldId = settings.worldId; this.world = world;
    this.highGrounds = settings.mode === GAME_MODES.HIGH_GROUNDS ? createHighGroundsState(world) : null;
    this.objectiveState = this.policy.teamMode && settings.mode !== GAME_MODES.HIGH_GROUNDS ? createObjectiveState(world.objectives ?? []) : null;
    if (this.objectiveState && typeof world.forObjective === 'function') this.world = world.forObjective(this.objectiveState);
    this.structures = createStructureState(world, (this.structures?.revision ?? 0) + 1);
    this.projectiles.clear();this.ruptures=[];this.teamMarks=[];
    this.soFistication=null;this.soFistRevision++;
    this.fightFlight=null;this.fightFlightRevision++;this.fightFlightProjectiles=new Map();
    this.flightBurnZones=[];
    this.biByeLlista=world.ballistaEmplacement?createBiByeLlista(world.ballistaEmplacement):null;
    this.biByeRevision=(this.biByeRevision??0)+1;this.bibyeProjectiles=new Map();
    this.botsProvisioned=false;this.autoStartAt=null;
    let index=0;
    const assigned={ATTACKERS:0,DEFENDERS:0};
    for(const p of this.players.values()) {
      if(this.policy.teamMode){
        const preferred=previousMode===this.mode?p.team:null;
        p.team=preferred&&assigned[preferred]<settings.teamSize?preferred:(assigned.ATTACKERS<=assigned.DEFENDERS?TEAMS.ATTACKERS:TEAMS.DEFENDERS);
        assigned[p.team]++;
      } else p.team=null;
      Object.assign(p,freshCombatState(this.initialSpawnFor(p,index++,nowSec),nowSec),scoreFields());
      p.lobbyReady=false;p.arenaReady=false;p.votes={};
    }
    if(this.policy.teamMode)this.provisionModeActors(nowSec);
    return null;
  }

  swapPlayers(playerId, firstId, secondId, nowSec) {
    if (!this.isPrivate || !this.policy.teamMode || this.state !== 'WAITING' || playerId !== this.hostId()) return 'Only the host may arrange teams before the countdown.';
    const first=this.players.get(firstId),second=this.players.get(secondId);
    if(!first || !second || first.id===second.id || first.team===second.team)return 'Choose two Spellblades on opposite sides.';
    [first.team,second.team]=[second.team,first.team];
    for(const p of [first,second])Object.assign(p,freshCombatState(this.initialSpawnFor(p,0,nowSec),nowSec));
    for(const p of this.players.values())p.lobbyReady=false;
    this.autoStartAt=null;
    return null;
  }

  /** Switch a human player's team in a waiting/lobby team room, swapping with a bot to maintain team slots. */
  switchTeam(playerId, requestedTeam = null, nowSec = 0) {
    if (!this.policy.teamMode || this.state !== 'WAITING') return false;
    const player = this.players.get(playerId);
    if (!player || player.actorKind !== 'human') return false;
    const nextTeam = (requestedTeam === TEAMS.ATTACKERS || requestedTeam === TEAMS.DEFENDERS)
      ? requestedTeam
      : (player.team === TEAMS.ATTACKERS ? TEAMS.DEFENDERS : TEAMS.ATTACKERS);
    if (nextTeam === player.team) return true;
    const teamSize = this.policy.teamSize ?? 3;
    const humansOnNextTeam = [...this.players.values()].filter((p) => p.actorKind === 'human' && p.team === nextTeam).length;
    if (humansOnNextTeam >= teamSize) return false;

    const oldTeam = player.team;
    const swapBot = [...this.players.values()].find((p) => p.actorKind === 'bot' && p.team === nextTeam);
    player.team = nextTeam;
    if (swapBot) {
      swapBot.team = oldTeam;
      const prefix = oldTeam === TEAMS.ATTACKERS ? 'Squire' : 'Warden';
      const names = oldTeam === TEAMS.ATTACKERS ? ['Vance', 'Rowan', 'Garrick', 'Thorne'] : ['Alden', 'Kaelen', 'Bryce', 'Merrick'];
      swapBot.name = `${prefix} ${names[(swapBot.rivalIndex ?? 0) % names.length]}`;
    }
    const spawn = this.initialSpawnFor(player, 0, nowSec);
    player.position = { x: spawn.x, y: spawn.y, z: spawn.z };
    player.yaw = spawn.yaw ?? 0;
    for (const p of this.players.values()) p.lobbyReady = false;
    return true;
  }

  /** Contextual team target or objective ping/mark (max 2 active per team, 6s duration). */
  markTarget(playerId, { targetId = null } = {}, nowSec = 0) {
    if (!this.policy.teamMode || this.state !== 'PLAYING') return false;
    const player = this.players.get(playerId);
    if (!player || !player.alive || !player.team) return false;
    if (nowSec < (player.nextMarkAt ?? -Infinity)) return false;
    player.nextMarkAt = nowSec + 1.2;

    this.teamMarks = (this.teamMarks ?? []).filter((m) => m.expiresAt > nowSec);

    let chosenTarget = null;
    if (targetId && this.players.has(targetId)) {
      const candidate = this.players.get(targetId);
      if (candidate.alive && candidate.team && candidate.team !== player.team) chosenTarget = candidate;
    }
    if (!chosenTarget) {
      const lookX = -Math.sin(player.yaw);
      const lookZ = -Math.cos(player.yaw);
      let bestScore = 0.965;
      for (const other of this.players.values()) {
        if (!other.alive || !other.team || other.team === player.team) continue;
        const dx = other.position.x - player.position.x;
        const dz = other.position.z - player.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.5 || dist > 32) continue;
        const dot = (dx * lookX + dz * lookZ) / dist;
        if (dot > bestScore) {
          bestScore = dot;
          chosenTarget = other;
        }
      }
    }

    const activeObj = this.objectiveState?.objectives?.[this.objectiveState.index] ?? null;
    const mark = chosenTarget
      ? {
          id: `mark-${this.tickNumber}-${player.id}`,
          team: player.team,
          byId: player.id,
          byName: player.name,
          kind: 'enemy',
          targetId: chosenTarget.id,
          label: chosenTarget.name,
          position: { ...chosenTarget.position },
          createdAt: nowSec,
          expiresAt: nowSec + 6.0,
        }
      : activeObj
        ? {
            id: `mark-${this.tickNumber}-${player.id}`,
            team: player.team,
            byId: player.id,
            byName: player.name,
            kind: 'objective',
            targetId: activeObj.id,
            label: activeObj.name,
            position: { ...activeObj.position },
            createdAt: nowSec,
            expiresAt: nowSec + 6.0,
          }
        : null;

    if (!mark) return false;
    this.teamMarks = this.teamMarks.filter((m) => !(m.team === player.team && (m.byId === player.id || m.targetId === mark.targetId)));
    const teamActive = this.teamMarks.filter((m) => m.team === player.team);
    if (teamActive.length >= 2) {
      const oldest = teamActive[0];
      this.teamMarks = this.teamMarks.filter((m) => m !== oldest);
    }
    this.teamMarks.push(mark);
    this.events.push({
      type: 'teamMark',
      playerId: player.id,
      playerName: player.name,
      team: player.team,
      kind: mark.kind,
      targetId: mark.targetId,
      label: mark.label,
      position: mark.position,
      expiresAt: mark.expiresAt,
      at: nowSec,
    });
    return true;
  }

  // older clients sent startMatch: it now just marks the sender ready
  requestStart(playerId, nowSec) {
    return this.setReady(playerId, true, nowSec);
  }

  /** A vote on the next match's arena or score (majority of connected Spellblades decides at the start). */
  vote(playerId, key, value) {
    if (this.isPrivate || !this.policy.votes || ['PLAYING', 'COUNTDOWN', 'REMATCH_COUNTDOWN'].includes(this.state)) return false;
    const player = this.players.get(playerId);
    const options = VOTE_OPTIONS[key];
    if (!player || player.actorKind !== 'human' || !options) return false;
    const choice = key === 'world' ? String(value) : Number(value);
    if (key === 'world' ? !options.includes(choice) : !validRoomNumber(key, choice)) return false;
    player.votes = { ...(player.votes ?? {}), [key]: choice };
    return true;
  }

  /** Counts per option and the choice that would apply now. */
  tallyVotes() {
    const result = {};
    const current = { world: this.worldId, score: this.scoreToWin, time: this.policy.matchSeconds };
    for (const [key, options] of Object.entries(VOTE_OPTIONS)) {
      const choices = [...options];
      if (key !== 'world') for (const p of this.players.values()) {
        if (p.actorKind === 'human' && p.connected && validRoomNumber(key, p.votes?.[key]) && !choices.includes(p.votes[key])) choices.push(p.votes[key]);
      }
      const counts = Object.fromEntries(choices.map((option) => [option, 0]));
      for (const p of this.players.values()) {
        if (p.actorKind !== 'human' || !p.connected) continue;
        const choice = p.votes?.[key];
        if (choice !== undefined && choice in counts) counts[choice] += 1;
      }
      const best = Math.max(0, ...Object.values(counts));
      const leaders = Object.keys(counts).filter((option) => counts[option] === best && best > 0);
      // a tie (or no votes) keeps what the room has now
      const chosen = leaders.length === 1 ? leaders[0] : String(current[key]);
      result[key] = { counts, chosen: key === 'world' ? chosen : Number(chosen) };
    }
    return result;
  }

  #applyVotes() {
    if (this.isPrivate || !this.policy.votes) return;
    const tally = this.tallyVotes();
    if (tally.world.chosen !== this.worldId) {
      try {
        this.world = getWorld(tally.world.chosen);
        this.worldId = tally.world.chosen;
        const template = getWorld(this.worldId);
        if (typeof template?.forObjective === 'function' && this.objectiveState)
          this.world = template.forObjective(this.objectiveState);
        else if (this.worldId === WORLD_IDS.BASTION_BREACH && this.objectiveState)
          this.world = bastionBreachForObjective(this.objectiveState);
        this.biByeLlista = this.world.ballistaEmplacement ? createBiByeLlista(this.world.ballistaEmplacement) : null;
        this.fightFlight=null;this.fightFlightRevision++;this.fightFlightProjectiles=new Map();this.flightBurnZones=[];
        this.biByeRevision = (this.biByeRevision ?? 0) + 1;
        this.bibyeProjectiles = new Map();
      } catch { /* unknown world: keep the current one */ }
    }
    if (Number.isFinite(tally.score.chosen)) this.scoreToWin = tally.score.chosen;
    if (Number.isFinite(tally.time.chosen)) this.policy.matchSeconds = tally.time.chosen;
  }

  /** A Spellblade leaves for good (to seek a duel, for instance): their slot is freed at once. */
  removePlayer(id, nowSec) {
    const player = this.players.get(id);
    if (!player || player.actorKind !== 'human') return false;
    if (this.biByeLlista && this.biByeLlista.operatorId === id) {
      dismountBiByeLlista(this.biByeLlista, player, false, this.world);
    }
    if (this.soFistication?.operatorId === id) dismountSoFistication(this,this.soFistication,player,{force:true});
    if (this.fightFlight?.operatorId === id) dismountFightFlight(this,this.fightFlight,player,{force:true,at:nowSec});
    this.players.delete(id);
    if(this.sharedPractice&&this.sharedPracticeHostId===id)
      this.sharedPracticeHostId=[...this.players.values()].find(p=>p.id!==id&&p.actorKind==='human'&&p.connected)?.id??null;
    this.rematchVotes.delete(id);
    if (this.humanActorCount() === 0) {
      if (this.emptySince === null) this.emptySince = nowSec;
    } else if (this.policy.teamMode && this.botsProvisioned) {
      this.provisionModeActors(nowSec);
    }
    return true;
  }

  disconnectPlayer(id, nowSec) {
    const player = this.players.get(id);
    if (!player || player.actorKind !== 'human') return;
    if (this.biByeLlista && this.biByeLlista.operatorId === id) {
      dismountBiByeLlista(this.biByeLlista, player, true, this.world);
    }
    if (this.soFistication?.operatorId === id) dismountSoFistication(this,this.soFistication,player,{force:true});
    if (this.fightFlight?.operatorId === id) dismountFightFlight(this,this.fightFlight,player,{force:true,at:nowSec});
    player.connected = false;
    if(this.sharedPractice&&this.sharedPracticeHostId===id)
      this.sharedPracticeHostId=[...this.players.values()].find(p=>p.id!==id&&p.actorKind==='human'&&p.connected)?.id??null;
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
    player.attackButton = false;
    player.guardButton = false;
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
        if(this.sharedPractice&&!this.sharedPracticeHostId)this.sharedPracticeHostId=player.id;
        if (this.mode === GAME_MODES.BOT_DUEL && this.state !== 'PLAYING') player.arenaReady = false;
        this.emptySince = null;
        if (this.policy.autoStart && (!this.policy.teamMode || [...this.players.values()].filter(p=>p.actorKind==='human'&&p.connected).every(p=>p.lobbyReady))) this.armAutoStart(nowSec);
        return player;
      }
    }
    return null;
  }

  tick(nowSec) {
    let expiredHuman = false;
    for (const [id, player] of this.players) {
      if (player.actorKind === 'human'
        && !player.connected
        && player.disconnectExpiresAt !== null
        && nowSec > player.disconnectExpiresAt) {
        if (this.biByeLlista && this.biByeLlista.operatorId === id) {
          dismountBiByeLlista(this.biByeLlista, player, false, this.world);
        }
        if (this.fightFlight?.operatorId === id) dismountFightFlight(this,this.fightFlight,player,{force:true,at:nowSec});
        this.players.delete(id);
        this.rematchVotes.delete(id);
        expiredHuman = true;
      }
    }
    if (expiredHuman && this.policy.teamMode && this.botsProvisioned && this.humanActorCount() > 0) {
      this.provisionModeActors(nowSec);
    }
    if (this.teamMarks?.length) {
      this.teamMarks = this.teamMarks.filter((m) => {
        if (m.expiresAt <= nowSec) return false;
        if (m.kind === 'enemy') {
          const target = this.players.get(m.targetId);
          if (!target || !target.alive) return false;
          m.position = { ...target.position };
        }
        return true;
      });
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
      && this.matchStartedAt !== null) {
      if (this.mode === GAME_MODES.HIGH_GROUNDS) {
        if (nowSec >= this.matchStartedAt + this.policy.matchSeconds) finishHighGroundsOnTime(this, nowSec);
      } else if (this.policy.teamMode) {
        const timeExpired = nowSec >= this.matchStartedAt + this.policy.matchSeconds;
        const obj = this.objectiveState;
        const hasAttackers = (obj?.attackersCount ?? 0) > 0;
        const isCapturing = (obj?.capturing || obj?.contested) && (obj?.progress ?? 0) > 0.001;

        if (timeExpired) {
          let hasAttackers = false;
          if (obj) {
            const currentObj = obj.objectives[obj.index];
            if (currentObj) {
              const center = currentObj.position;
              const radSq = currentObj.radius * currentObj.radius;
              for (const p of this.players.values()) {
                if (p.alive && p.team === TEAMS.ATTACKERS) {
                  const dx = p.position.x - center.x;
                  const dz = p.position.z - center.z;
                  if (dx * dx + dz * dz <= radSq) {
                    hasAttackers = true;
                    break;
                  }
                }
              }
            }
          }
          const isCapturing = (obj?.capturing || obj?.contested) && (obj?.progress ?? 0) > 0.001;

          if (this.overtime) {
            // Already in overtime: check if defenders have cleared attackers for >= 3.0s
            if (!hasAttackers) {
              if (this.overtimeClearedAt === null) {
                this.overtimeClearedAt = nowSec;
              }
              if (nowSec - this.overtimeClearedAt >= 3.0) {
                this.overtime = false;
                if (obj) obj.overtime = false;
                this.finish(TEAMS.DEFENDERS, nowSec, 'defense');
              }
            } else {
              this.overtimeClearedAt = null;
            }
          } else if (hasAttackers || isCapturing) {
            this.overtime = true;
            this.overtimeStartedAt = nowSec;
            this.overtimeClearedAt = null;
            if (obj) obj.overtime = true;
            this.events.push({ type: 'overtimeStarted', at: nowSec });
          } else {
            this.overtime = false;
            if (obj) obj.overtime = false;
            this.finish(TEAMS.DEFENDERS, nowSec, 'defense');
          }
        }
      } else if (nowSec >= this.matchStartedAt + this.policy.matchSeconds) {
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
  }

  startMatch(nowSec) {
    resetChallengeTracking(this);
    this.#applyVotes();
    this.state = 'PLAYING';
    this.matchStartedAt = nowSec;
    this.countdownEndsAt = null;
    this.winnerId = null;
    this.winnerTeam = null;
    this.suddenDeath = false;
    this.suddenDeathLeaders = [];
    this.rematchVotes.clear();
    this.teamMarks = [];
    this.overtime = false;
    this.overtimeStartedAt = null;
    this.overtimeClearedAt = null;
    if (this.policy.teamMode) {
      if (this.botsProvisioned) this.provisionModeActors(nowSec);
      this.highGrounds = this.mode === GAME_MODES.HIGH_GROUNDS ? createHighGroundsState(getWorld(this.worldId)) : null;
      this.objectiveState = this.mode === GAME_MODES.HIGH_GROUNDS ? null : createObjectiveState(this.world.objectives ?? []);
      const template = getWorld(this.worldId);
      if (typeof template?.forObjective === 'function')
        this.world = template.forObjective(this.objectiveState, nowSec);
      else if (this.worldId === WORLD_IDS.BASTION_BREACH)
        this.world = bastionBreachForObjective(this.objectiveState);
    }
    // Match reset restores canonical geometry before rebuilding authoritative defense state.
    const baseWorld = getWorld(this.worldId);
    this.structures = createStructureState(baseWorld, (this.structures?.revision ?? 0) + 1);
    this.soFistication = null;
    this.soFistRevision++;
    this.fightFlight=null;this.fightFlightRevision++;this.fightFlightProjectiles=new Map();this.flightBurnZones=[];
    if (this.policy.teamMode) {
      for (const emplacement of baseWorld.siegeEmplacements ?? []) {
        if (!this.objectiveState) continue;
        if (emplacement.type !== 'so-fist-ication' || !emplacement.phases.includes(this.objectiveState.phase)) continue;
        const ram = createSoFistication({ ...emplacement, emplacementId: emplacement.id, id: `${emplacement.id}-${this.soFistRevision}` });
        const pose = soFistTerrainPose(ram, this.world);
        if (pose && soFistClear({ ...ram, ...pose }, this.world, [], {operatorStation:true})) this.soFistication = Object.assign(ram, pose);
        break;
      }
    }
    // Breakthrough emplacements reset per match; Practice controls its own vehicle.
    if (baseWorld.ballistaEmplacement || this.mode !== GAME_MODES.PRACTICE) {
      this.biByeLlista = baseWorld.ballistaEmplacement ? createBiByeLlista(baseWorld.ballistaEmplacement) : null;
      this.biByeRevision = (this.biByeRevision ?? 0) + 1;
      this.bibyeProjectiles = new Map();
    }
    let i = 0;
    for (const player of this.players.values()) {
      player.operatingRamId = null;
      player.operatingFightFlightId = null;
      const spawn = this.initialSpawnFor(player, i, nowSec);
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
    if (areAllies(this, killerId, victimId)) return;
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
    if (this.policy.teamMode) {
      this.winnerTeam = (winnerId === TEAMS.ATTACKERS || winnerId === TEAMS.DEFENDERS)
        ? winnerId
        : (this.players.get(winnerId)?.team ?? null);
    }
    this.finishReason = reason;
    this.events.push({ type: 'matchEnded', winnerId, winnerTeam: this.winnerTeam ?? null, reason, at: nowSec });
    recordChallengeFact(this, { type: 'matchFinished', winnerId, reason, at: nowSec });
  }

  requestRematch(playerId, nowSec) {
    if (!this.policy.allowRematchVote || this.state !== 'FINISHED' || !this.players.has(playerId)) return false;
    this.rematchVotes.add(playerId);
    const connectedIds = [...this.players.values()]
      .filter((p) => p.actorKind === 'human' && p.connected)
      .map((p) => p.id);
    const minForRematch = this.policy.teamMode ? 1 : 2;
    const unanimous = connectedIds.length >= minForRematch && connectedIds.every((id) => this.rematchVotes.has(id));
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
