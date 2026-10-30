// The browser hosts Practice Yard and Bot Duel on the same simulation the server runs (shared/sim), a room with you,
// its bots and its dummies. It speaks exactly like GameSocket (the same messages, the same methods), so the rest of
// the client plays it without knowing the difference. Nothing online lives here: no rooms to join, no matchmaking.

import { stepBotControllers } from '../../shared/sim/BotController.mjs';
import { stepRoom } from '../../shared/sim/combat.mjs';
import { stepPracticeActors } from '../../shared/sim/practice.mjs';
import { RoomManager } from '../../shared/sim/RoomManager.mjs';
import { applyRoomCommand, serializeLobby, serializeSnapshot } from '../../shared/sim/wire.mjs';
import { DEFAULT_SPELL, isSpell } from '../../shared/src/spells.mjs';
import { GAME_MODES, arenaOrDefault } from '../../shared/src/modes.mjs';
import { normalizePreparedSpells, DEFAULT_PREPARED_SPELLS } from '../../shared/src/preparedSpells.mjs';
import { DEFAULT_ULTIMATE, isUltimate } from '../../shared/src/ultimates.mjs';
import { clothChoice } from '../../shared/src/cosmetics.mjs';
import { DEFAULT_EMBLEM, ownedEmblems } from '../../shared/src/heraldry.mjs';
import { resolvePlayerWorld, surfaceHeightAt } from '../../shared/src/collision.mjs';
import { createBiByeLlista, getBiByeSolids, mountBiByeLlista, dismountBiByeLlista } from '../../shared/sim/biByeLlista.mjs';
import { soFistSolids } from '../../shared/sim/soFistGeometry.mjs';
import { createSoFistication, soFistOperator, mountSoFistication, dismountSoFistication } from '../../shared/sim/soFistication.mjs';
import { practiceSiegeCommand } from '../../shared/sim/practiceSiege.mjs';
import { setGuard, beginAttack, endAttack, cancelAttack } from '../../shared/sim/combat.mjs';
import { PROWESS } from '../../shared/src/prowess.mjs';
import { GAME, guardProfile } from '../../shared/src/combat.mjs';
import { freshStagger } from '../../shared/src/stagger.mjs';

const TICK_RATE = 30;
const INSPECTION_ACTIONS = new Set([
  'input','attack','guard','cast','castCurrentSpell','castPreparedSpell',
  'castPreparedSlot','selectPreparedSlot','selectPreparedSpell','gauntlet',
  'siegeSkill','ultimate','dash','practiceReadyUltimate','siegeOperate','bibyeOperate',
  'bibyeToggleDeploy','bibyeWeaponFocus','bibyeFire','fightFlightFire'
]);
const INSPECTION_ADMIN_RESET = new Set(['practiceResetPlayer','practiceSpawnDummy','practiceSetDummyMode','practiceRemoveDummy']);

const SOLO_MODES = new Set([GAME_MODES.BOT_DUEL, GAME_MODES.PRACTICE, GAME_MODES.BREAKTHROUGH]);
export const OFFLINE_MESSAGE = 'Multiplayer is offline right now. Practice and Bot Duel still work.';
export const SOLO_PROFILE_KEY = 'ss-solo-profile-cache';

function defaultSoloProfile() {
  return {
    version: 2,
    balance: 0,
    owned: ['crimson'],
    equipped: 'crimson',
    emblem: DEFAULT_EMBLEM,
    emblems: [DEFAULT_EMBLEM],
    receipts: [],
    challenges: { version: 1, progress: {}, completed: {}, rewarded: [] },
  };
}

function randomId() {
  return globalThis.crypto?.randomUUID?.() ?? `local-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export class LocalHost {
  constructor({
    now = () => performance.now() / 1000,
    every = (fn, ms) => setInterval(fn, ms),
    cancel = (timer) => clearInterval(timer),
    later = (fn) => setTimeout(fn, 0),
    storage = (typeof globalThis !== 'undefined' ? globalThis.localStorage : null),
  } = {}) {
    this.wallNow = now;
    this.timeOffset = 0;
    this.frozenAt = null;
    this.inspectionEnabled = false;
    this.inspectionControlId = null;
    this.inspectionControlUsed = false;
    this.inspectionPendingRelease = new Set();
    this.inspectionFramesPlaying = false;
    this.inspectionNextBeat = null;
    this.now = () => this.frozenAt ?? (this.wallNow() - this.timeOffset);
    this.every = every;
    this.cancel = cancel;
    this.later = later;
    this.storage = storage;
    this.handlers = new Map();
    this.rooms = new RoomManager();
    this.room = null;
    this.timer = null;
    this.spell = DEFAULT_SPELL;
    this.preparedSpells = [...DEFAULT_PREPARED_SPELLS];
    // (the ultimate carried: named apart from ultimate(), the key's command)
    this.ultimateId = DEFAULT_ULTIMATE;
    this.playerId = null;
    this.token = null;
    this.roomCode = null;
    this.latestSnapshot = null;
    this.snapshotReceivedAt = 0;
    this.pingMs = 0;
    this.local = true;
    this.generation = 0;
    this.cloth = 'crimson';
    this.profile = null;
    this.emblem = DEFAULT_EMBLEM;
    this.emblems = [];
    this.challenges = { completed: {}, progress: {} };
  }

  on(type, handler) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }

  emit(type, payload) {
    for (const handler of this.handlers.get(type) ?? []) handler(payload);
    for (const handler of this.handlers.get('*') ?? []) handler({ type, payload });
  }

  // Bootstrap remains queued so listeners can finish setup. Tick facts need no transport delay.
  // Both paths detach their data: interpolation history and consumers never share live authority.
  #deliver(message, immediate = false) {
    const copy = structuredClone(message);
    const generation = this.generation;
    if (immediate) this.#receive(copy);
    else this.later(() => { if (generation === this.generation) this.#receive(copy); });
  }

  #receive(message) {
    if (message.type === 'joined') {
      this.playerId = message.playerId;
      this.token = message.token;
      this.roomCode = message.roomCode;
    }
    if (message.type === 'snapshot') {
      this.latestSnapshot = message;
      this.snapshotReceivedAt = performance.now();
    }
    this.emit(message.type, message);
  }

  async connect() {}

  close() {
    this.#stop();
  }

  serverNow() {
    return this.now();
  }

  // --- a solo room: you, and the bots or dummies the mode brings ---
  startSolo(mode, name, worldId, botSkill, tutorial = false, team = null, teamSize = null) {
    if (!SOLO_MODES.has(mode)) {
      this.#deliver({ type: 'error', message: 'Unknown solo mode' });
      return;
    }
    this.#stop();
    const time = this.now();
    const resolvedWorld = tutorial ? 'greener-pastures' : (mode === GAME_MODES.BREAKTHROUGH ? (worldId === 'outerworks' ? 'outerworks' : (worldId === 'blackbell-foundry' ? 'blackbell-foundry' : 'bastion-breach')) : arenaOrDefault(worldId));
    const room = this.rooms.createSoloRoom(mode, time, resolvedWorld, { teamSize });
    room.localTutorial = tutorial;
    if (!this.profile && this.storage) {
      try {
        const cached = JSON.parse(this.storage.getItem(SOLO_PROFILE_KEY) || this.storage.getItem('ss-profile-cache') || 'null');
        if (cached) this.setProfile(cached);
      } catch {}
    }
    const player = room.addPlayer({ id: randomId(), token: randomId(), name: String(name || 'Spellblade').slice(0, 18), spell: this.spell, ultimate: this.ultimateId, preparedSpells: this.preparedSpells, team }, time);
    player.cloth = this.cloth;
    player.emblem = this.emblem || this.profile?.emblem || DEFAULT_EMBLEM;
    player.emblems = this.emblems?.length ? [...this.emblems] : (this.profile?.emblems ? [...this.profile.emblems] : []);
    player.challenges = this.challenges?.completed ? structuredClone(this.challenges) : (this.profile?.challenges ? structuredClone(this.profile.challenges) : { completed: {}, progress: {} });
    room.setBotSkill(botSkill);
    room.provisionModeActors(time);
    room.armAutoStart(time);
    this.room = room;
    this.player = player;
    room.inspectionActorId = player.id;
    this.#deliver({
      type: 'joined', playerId: player.id, token: player.token, roomCode: room.code, hostId: room.hostId(),
      roomState: room.state, mode: room.mode, worldId: room.worldId, local: true,
    });
    this.#deliver(serializeLobby(room));
    if (this.profile) this.#deliver({ type: 'profile', profile: this.profile, local: true }, true);
    this.timer = this.every(() => this.tick(), 1000 / TICK_RATE);
  }

  startInspectionPractice(name, worldId) {
    this.startSolo(GAME_MODES.PRACTICE, name, worldId);
    this.inspectionEnabled = true;
    if (this.room) {
      this.room.inspectionEnabled = true;
    }
    this.#inspectionState();
  }

  startTutorial(name) {
    this.startSolo(GAME_MODES.PRACTICE, name, 'greener-pastures', undefined, true);
  }

  startBreakthrough(name, botSkill = null, team = null, worldId = 'bastion-breach') {
    this.startSolo(GAME_MODES.BREAKTHROUGH, name, worldId, botSkill, false, team);
  }


  get inspectionActorId() { return this.inspectionEnabled ? (this.inspectionControlId ?? this.player?.id ?? null) : null; }

  setInspectionActor(id) {
    if (!this.inspectionEnabled || this.room?.state !== 'PLAYING') return false;
    const target = this.room.players.get(id);
    if (!target?.alive || (id !== this.player.id && target.actorKind !== 'dummy')) return false;
    if (id === this.inspectionActorId) return true;
    const previous = this.inspectionActorId;
    // A view handoff while frozen must not lower a captured Guard or change a pose.
    for (const actorId of [previous,id]) {
      if (this.inspectionFrozen) this.inspectionPendingRelease.add(actorId);
      else this.#releaseInspectionActor(actorId);
    }
    this.inspectionControlId = id === this.player.id ? null : id;
    if (this.room) {
      this.room.inspectionControlId = this.inspectionControlId;
      this.room.inspectionActorId = this.inspectionActorId;
    }
    if (this.inspectionControlId) this.inspectionControlUsed = true;
    this.#inspectionState();
    this.#deliver(serializeSnapshot(this.room,this.now(),this.playerId),true);
    return true;
  }

  #releaseInspectionActor(id) {
    const actor = this.room?.players.get(id);
    if (!actor) return;
    const time = this.now();
    applyRoomCommand(this.room,actor,{type:'attack',down:false,clientTime:time},time);
    applyRoomCommand(this.room,actor,{type:'guard',down:false,clientTime:time},time);
    applyRoomCommand(this.room,actor,{type:'input',seq:(actor.lastInputSeq??0)+1,forward:0,right:0,jump:false,sprint:false,crouch:false,yaw:actor.yaw,pitch:actor.pitch,attack:false,guard:false},time);
    actor.ai = null;
  }

  releaseInspectionInput() {
    if (!this.inspectionEnabled) return false;
    if (this.inspectionFrozen) this.inspectionPendingRelease.add(this.inspectionActorId);
    else this.#releaseInspectionActor(this.inspectionActorId);
    return true;
  }

  #validateInspectionActor() {
    if (!this.inspectionControlId) return;
    const actor = this.room?.players.get(this.inspectionControlId);
    if (actor?.alive && actor.actorKind === 'dummy') return;
    this.#releaseInspectionActor(this.inspectionControlId);
    this.inspectionControlId = null;
    if (this.room) {
      this.room.inspectionControlId = null;
      this.room.inspectionActorId = this.player?.id ?? null;
    }
    this.#inspectionState();
  }

  get inspectionFrozen() { return this.frozenAt !== null; }
  get inspectionFreezeMode() { return this.freezeModeState ?? (this.frozenAt !== null ? 'all' : 'none'); }
  get inspectionFreezeProjectiles() { return Boolean(this.room?.freezeProjectiles ?? this.freezeProjectilesState); }

  setInspectionFreezeMode(mode) {
    if (!this.inspectionEnabled || this.room?.state !== 'PLAYING') return false;
    const validModes = ['all', 'others', 'actor', 'none'];
    if (!validModes.includes(mode)) return false;
    this.freezeModeState = mode;
    if (mode === 'all') {
      if (this.frozenAt === null) this.frozenAt = this.now();
    } else {
      if (this.frozenAt !== null) {
        this.inspectionFramesPlaying = false;
        this.inspectionNextBeat = null;
        this.timeOffset = this.wallNow() - this.frozenAt;
        this.frozenAt = null;
        for (const id of new Set([this.player?.id, this.inspectionActorId, ...this.inspectionPendingRelease])) {
          this.#releaseInspectionActor(id);
        }
        this.inspectionPendingRelease.clear();
      }
      if (mode === 'none') {
        this.freezeProjectilesState = false;
      }
    }
    if (this.room) {
      this.room.inspectionFreezeMode = mode;
      if (mode === 'none') {
        this.room.freezeProjectiles = false;
        this.room.inspectionFrozenActors = new Set();
      } else {
        this.room.freezeProjectiles = Boolean(this.freezeProjectilesState);
      }
    }
    this.#inspectionState();
    return true;
  }

  setInspectionFreezeProjectiles(frozen) {
    if (!this.inspectionEnabled || this.room?.state !== 'PLAYING') return false;
    this.freezeProjectilesState = Boolean(frozen);
    if (this.room) {
      this.room.freezeProjectiles = this.freezeProjectilesState;
    }
    this.#inspectionState();
    return true;
  }

  setInspectionFrozen(frozen) {
    return this.setInspectionFreezeMode(frozen ? 'all' : 'none');
  }

  /**
   * A local match paused (the tutorial's transcript open): time stops for everything in it, as an inspection freeze
   * stops it, and goes on from where it stopped. Nothing is stepped meanwhile.
   */
  setPaused(paused) {
    if (this.room?.state !== 'PLAYING') return false;
    if (Boolean(paused) === this.inspectionFrozen) return true;
    if (paused) this.frozenAt = this.now();
    else {
      this.timeOffset = this.wallNow() - this.frozenAt;
      this.frozenAt = null;
    }
    return true;
  }

  playInspectionFrames(playing) {
    if (!this.inspectionEnabled || !this.inspectionFrozen) return false;
    if (Boolean(playing) === this.inspectionFramesPlaying) return true;
    this.inspectionFramesPlaying = Boolean(playing);
    this.inspectionNextBeat = playing ? this.wallNow() + 0.2 : null;
    if (playing && this.room) {
      this.room.freezeProjectiles = false;
    }
    this.#inspectionState();
    return true;
  }

  #inspectionState() {
    this.#deliver({
      type: 'inspectionState',
      frozen: this.inspectionFrozen,
      freezeMode: this.inspectionFreezeMode,
      freezeProjectiles: this.inspectionFreezeProjectiles,
      playingFrames: this.inspectionFramesPlaying,
      actorId: this.inspectionActorId,
      sandbox: this.inspectionControlUsed,
    });
  }

  stepInspection() {
    if (!this.inspectionEnabled || !this.inspectionFrozen) return false;
    this.frozenAt += 1 / TICK_RATE;
    this.#step();
    return true;
  }

  /** One step of the match, as the server's tick does it for each room. */
  tick(explicitTime) {
    if (this.inspectionFrozen) {
      if (this.inspectionFramesPlaying && this.wallNow() + 1e-9 >= this.inspectionNextBeat) {
        this.stepInspection();
        // One visible frame per beat. Background stalls never create a catch-up burst.
        const nextBeat = this.inspectionNextBeat + 0.2;
        this.inspectionNextBeat = nextBeat > this.wallNow() ? nextBeat : this.wallNow() + 0.2;
      }
      return;
    }
    this.#step(explicitTime);
  }

  #step(explicitTime) {
    const room = this.room;
    if (!room) return;
    const time = explicitTime ?? this.now();
    this.#validateInspectionActor();

    const activeActorId = this.inspectionActorId;
    const frozenActors = new Set();
    const mode = this.inspectionFreezeMode;
    if (mode === 'all') {
      // In 'all' mode, during stepInspection/playFrames, actors step together.
    } else if (mode === 'others') {
      for (const p of room.players.keys()) {
        if (p !== activeActorId) frozenActors.add(p);
      }
    } else if (mode === 'actor') {
      if (activeActorId) frozenActors.add(activeActorId);
    }
    room.inspectionFrozenActors = frozenActors;
    room.inspectionFreezeMode = mode;
    room.freezeProjectiles = this.inspectionFramesPlaying ? false : Boolean(this.freezeProjectilesState);

    if (this.inspectionQueuedActions?.length) {
      const queued = this.inspectionQueuedActions.splice(0);
      for (const item of queued) {
        const actor = room.players.get(item.actorId);
        if (!actor || !actor.alive) continue;
        if (item.action === 'attack') {
          applyRoomCommand(room, actor, { type: 'attack', down: true, clientTime: time }, time);
        } else if (item.action === 'guard') {
          applyRoomCommand(room, actor, { type: 'guard', down: true, clientTime: time }, time);
        } else if (item.action === 'cast') {
          applyRoomCommand(room, actor, { type: 'cast', direction: { x: Math.sin(actor.yaw), y: 0, z: Math.cos(actor.yaw) }, clientTime: time }, time);
        } else if (item.action === 'dash') {
          applyRoomCommand(room, actor, { type: 'dash', direction: 'forward' }, time);
        } else if (item.action === 'ultimate') {
          actor.prowess = PROWESS.full;
          applyRoomCommand(room, actor, { type: 'ultimate' }, time);
        }
      }
    }

    stepBotControllers(room, time, room.world);
    if (this.sessionController) this.sessionController.beforeStep(time);
    else if (!this.inspectionControlId) stepPracticeActors(room, time, room.world);
    stepRoom(room, 1 / TICK_RATE, time, room.world);
    this.#validateInspectionActor();
    const events = room.events.splice(0).filter(event => !(this.inspectionControlUsed && event.type === 'prestigeChallengeCompleted'));
    for (const event of events) {
      if (event.type === 'prestigeChallengeCompleted') {
        this.#completePrestigeChallenge(event, events, time);
      }
    }
    if (this.pendingPrestige && time >= this.pendingPrestige.retryAt) {
      const pending = this.pendingPrestige;
      try {
        if (this.storage && pending.profile) {
          this.storage.setItem(SOLO_PROFILE_KEY, JSON.stringify(pending.profile));
        }
        this.setProfile(pending.profile);
        this.pendingPrestige = null;
        this.#deliver({ type: 'profile', profile: pending.profile, prestigeFeat: pending.event.challengeId, local: true }, true);
        this.#deliver({
          type: 'events',
          events: [
            {
              type: 'stPerryPlainUnlocked',
              playerId: pending.player.id,
              message: 'PRESTIGE HERALD EARNED: ST. PERRY THE PLAIN!',
              at: time,
            },
            {
              type: 'spellbladeLine',
              playerId: pending.player.id,
              text: 'I suppose anyone can become a saint... these days.',
              speaker: pending.player.name || 'Spellblade',
              at: time,
            },
          ],
        }, true);
      } catch {
        pending.retryAt = time + 1;
      }
    }
    if (events.length) this.#deliver({ type: 'events', events }, true);
    if (this.room === room) this.#deliver(serializeSnapshot(room, time, this.playerId), true);
  }

  #stop() {
    this.generation += 1;
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = null;
    if (this.room) {
      this.room.inspectionEnabled = false;
      this.room.inspectionControlId = null;
      this.rooms.rooms.delete(this.room.code);
    }
    this.room = null;
    this.player = null;
    this.commandFilter = null;
    this.sessionController = null;
    this.inspectionEnabled = false;
    this.inspectionControlId = null;
    this.inspectionControlUsed = false;
    this.inspectionPendingRelease = new Set();
    this.inspectionFramesPlaying = false;
    this.inspectionNextBeat = null;
    this.freezeModeState = 'none';
    this.freezeProjectilesState = false;
    this.inspectionQueuedActions = [];
    this.frozenAt = null;
    this.timeOffset = 0;
  }

  #command(message) {
    const room = this.room;
    const owner = room?.players.get(this.player?.id);
    if (!room || !owner || this.inspectionFrozen) return;
    this.#validateInspectionActor();
    if (this.inspectionControlId && INSPECTION_ADMIN_RESET.has(message.type)) this.setInspectionActor(owner.id);
    const player = this.inspectionControlId && INSPECTION_ACTIONS.has(message.type)
      ? room.players.get(this.inspectionControlId) : owner;
    if (this.inspectionFreezeMode === 'actor' && player?.id === this.inspectionActorId) return;
    if (this.commandFilter) {
      message = this.commandFilter(message);
      if (!message) return;
    }
    const result = applyRoomCommand(room, player, message, this.now());
    if (result.rejected) this.#deliver({ type: 'error', message: result.rejected });
    else if (result.lobby) this.#deliver(serializeLobby(room));
    this.#validateInspectionActor();
  }

  stageInspectionActor({
    actorId = null,
    position = null,
    flight = undefined,
    vitals = null,
    ultimate = null,
    clearCooldowns = false,
    loadout = null,
    ai = null,
    pose = null,
    mount = null,
    nextTick = null,
  } = {}) {
    if (!this.inspectionEnabled || !this.room) return { success: false, reason: 'Inspection inactive' };
    const room = this.room;
    const id = actorId ?? this.inspectionActorId ?? this.player?.id;
    const actor = room.players.get(id);
    if (!actor) return { success: false, reason: 'Actor not found' };
    if (!actor.alive) {
      if (vitals || clearCooldowns || flight !== undefined) {
        actor.alive = true;
        actor.health = GAME.maxHealth;
        actor.guardStamina = guardProfile(actor.knightClass).capacity;
        actor.respawnAt = 0;
      } else {
        return { success: false, reason: 'Actor not found or dead' };
      }
    }
    const now = this.now();
    actor.spawnProtectionUntil = Math.min(actor.spawnProtectionUntil, now);

    if (flight !== undefined) {
      actor.flight = Boolean(flight);
      if (actor.flight) {
        actor.grounded = false;
        actor.velocity = { x: 0, y: 0, z: 0 };
      }
    }

    // 1. Position
    if (position) {
      const world = room.world;
      const solids = [...(world.solids ?? []), ...getBiByeSolids(room.biByeLlista), ...soFistSolids(room.soFistication)];
      let targetX = actor.position.x;
      let targetY = actor.position.y;
      let targetZ = actor.position.z;
      let targetYaw = actor.yaw;
      let targetPitch = actor.pitch;

      if (typeof position === 'string') {
        if (position === 'face_target') {
          const other = [...room.players.values()].find(p => p.id !== actor.id && p.alive);
          if (other) {
            targetYaw = Math.atan2(-(other.position.x - actor.position.x), -(other.position.z - actor.position.z));
          }
        } else if (position === 'courtyard') {
          targetX = 0; targetZ = -2;
        } else if (position === 'walkway') {
          targetX = 4; targetZ = 8;
        } else if (position === 'near_ballista' && room.biByeLlista) {
          targetX = room.biByeLlista.x - 2; targetZ = room.biByeLlista.z;
        } else if (position === 'near_ram' && room.soFistication) {
          targetX = room.soFistication.x - 2.5; targetZ = room.soFistication.z;
        }
      } else {
        if (Number.isFinite(position.x)) targetX = position.x;
        if (Number.isFinite(position.y)) targetY = position.y;
        if (Number.isFinite(position.z)) targetZ = position.z;
        if (Number.isFinite(position.yaw)) targetYaw = position.yaw;
        if (Number.isFinite(position.pitch)) targetPitch = position.pitch;
      }
      const ground = surfaceHeightAt(targetX, targetZ, targetY + 1.2, world);
      const safeY = ground !== null ? Math.max(targetY, ground) : targetY;
      const candidate = { x: targetX, y: safeY, z: targetZ };
      const resolved = resolvePlayerWorld(candidate, 0.45, solids, 1.8);
      actor.position = { x: resolved.x, y: resolved.y, z: resolved.z };
      actor.velocity = { x: 0, y: 0, z: 0 };
      actor.impulse = { x: 0, z: 0 };
      actor.yaw = targetYaw;
      actor.pitch = targetPitch;
      actor.history = [{ at: now, position: { ...actor.position }, yaw: actor.yaw, pitch: actor.pitch, crouched: Boolean(actor.crouched) }];
    }

    // 2. Vitals
    if (vitals) {
      if (vitals.refill) {
        actor.health = GAME.maxHealth;
        actor.guardStamina = guardProfile(actor.knightClass).capacity;
      }
      if (Number.isFinite(vitals.health)) {
        actor.health = Math.max(1, Math.min(GAME.maxHealth, vitals.health));
      }
      if (Number.isFinite(vitals.guardStamina)) {
        actor.guardStamina = Math.max(0, Math.min(guardProfile(actor.knightClass).capacity, vitals.guardStamina));
      }
    }

    // 3. Ultimate
    if (ultimate) {
      actor.prowess = PROWESS.full;
      actor.ultimateLockedUntil = -Infinity;
      actor.recoverUntil = -Infinity;
      actor.staggerUntil = -Infinity;
      if (typeof ultimate === 'string' && isUltimate(ultimate)) {
        actor.ultimate = ultimate;
        actor.startingUltimate = ultimate;
      }
    }

    // 4. Cooldowns
    if (clearCooldowns) {
      actor.dashReadyAt = -Infinity;
      actor.castEndsAt = 0;
      actor.gauntlet = null;
      actor.recast = {};
      actor.stagger = freshStagger();
      actor.staggerUntil = -Infinity;
    }

    // 5. Loadout
    if (loadout) {
      if (loadout.spell && isSpell(loadout.spell)) {
        actor.spell = loadout.spell;
        actor.startingSpell = loadout.spell;
        if (!actor.preparedSpells.includes(loadout.spell)) actor.preparedSpells[0] = loadout.spell;
      }
      if (loadout.ultimate && isUltimate(loadout.ultimate)) {
        actor.ultimate = loadout.ultimate;
        actor.startingUltimate = loadout.ultimate;
      }
    }

    // 6. AI
    if (ai) {
      if (ai.suspended !== undefined) {
        actor.aiSuspended = Boolean(ai.suspended);
        if (actor.aiSuspended) actor.input = { forward: 0, right: 0, jump: false, sprint: false, crouch: false, yaw: actor.yaw, pitch: actor.pitch, attack: false, guard: false };
      }
    }

    // 7. Poses
    if (pose) {
      if (pose === 'idle') {
        if (actor.guarding) setGuard(room, actor.id, false, now);
        actor.guardHeld = false;
        if (actor.attackActive) cancelAttack(room, actor.id, now);
        actor.pendingSpell = null;
        actor.castEndsAt = 0;
      } else if (pose === 'guard') {
        setGuard(room, actor.id, true, now);
        actor.guardHeld = true;
      } else if (pose === 'swing') {
        beginAttack(room, actor.id, now);
      } else if (pose === 'cast') {
        actor.pendingSpell = { spell: actor.spell, startedAt: now };
        actor.castEndsAt = now + 0.6;
      }
    }

    // 8. Siege Mount
    if (mount) {
      if (mount === 'ballista') {
        actor.ultimateState = null;
        actor.attackActive = false;
        actor.pendingSpell = null;
        actor.gauntlet = null;
        actor.staggerUntil = 0;
        if (actor.operatingRamId && room.soFistication) {
          dismountSoFistication(room, room.soFistication, actor, { force: true });
        }
        if (!room.biByeLlista) {
          practiceSiegeCommand(room, room.players.get(this.player.id), 'build', 'bi-bye-llista', now);
          if (!room.biByeLlista) {
            const b = createBiByeLlista({ x: 5, y: 0, z: -10, baseYaw: 0 });
            room.biByeLlista = b;
            room.biByeRevision = (room.biByeRevision ?? 0) + 1;
            room.events.push({ type: 'bibyeConstructed', machineId: b.id, ballistaId: b.id, rebuild: false, point: { x: b.x, y: b.y, z: b.z }, at: now });
          }
        }
        if (room.biByeLlista) {
          const b = room.biByeLlista;
          actor.position = { x: b.x, y: b.y + 0.5, z: b.z };
          if (!mountBiByeLlista(b, actor, now)) {
            b.operatorId = actor.id;
            actor.operatingBallistaId = b.id;
            actor.velocity = { x: 0, y: 0, z: 0 };
            actor.guarding = false;
            actor.input = { ...actor.input, forward: 0, right: 0, jump: false, sprint: false, yaw: b.yaw, pitch: b.pitch };
          }
        }
      } else if (mount === 'ram') {
        actor.ultimateState = null;
        actor.attackActive = false;
        actor.pendingSpell = null;
        actor.gauntlet = null;
        actor.staggerUntil = 0;
        if (actor.operatingBallistaId && room.biByeLlista) {
          dismountBiByeLlista(room.biByeLlista, actor, true, room.world);
        }
        if (!room.soFistication) {
          if (room.biByeLlista) {
            practiceSiegeCommand(room, room.players.get(this.player.id), 'dismantle', 'bi-bye-llista', now);
            room.biByeLlista = null;
          }
          practiceSiegeCommand(room, room.players.get(this.player.id), 'build', 'so-fist-ication', now);
          if (!room.soFistication) {
            const h = surfaceHeightAt(0, -6, 2, room.world) ?? 0;
            const ram = createSoFistication({ x: 0, y: h, z: -6, heading: 0 });
            room.soFistication = ram;
            room.soFistRevision = (room.soFistRevision ?? 0) + 1;
            room.events.push({ type: 'soFistConstructed', machineId: ram.id, rebuild: false, point: { x: ram.x, y: ram.y, z: ram.z }, at: now });
          }
        }
        if (room.soFistication) {
          const ram = room.soFistication;
          const seat = soFistOperator(ram, room.world);
          if (seat.y == null) seat.y = ram.y;
          actor.position = { ...seat };
          if (!mountSoFistication(room, ram, actor, now)) {
            ram.operatorId = actor.id;
            actor.operatingRamId = ram.id;
            actor.position = { ...seat };
            actor.velocity = { x: 0, y: 0, z: 0 };
            actor.impulse = { x: 0, z: 0 };
            actor.guarding = false;
            actor.input = { forward: 0, right: 0, yaw: ram.heading, pitch: 0, jump: false, sprint: false };
          }
        }
      } else if (mount === 'dismount') {
        if (actor.operatingBallistaId && room.biByeLlista) {
          dismountBiByeLlista(room.biByeLlista, actor, true, room.world);
        }
        if (actor.operatingRamId && room.soFistication) {
          dismountSoFistication(room, room.soFistication, actor, { force: true });
        }
      }
    }

    // 9. Next tick queued action
    if (nextTick) {
      this.inspectionQueuedActions = this.inspectionQueuedActions || [];
      this.inspectionQueuedActions.push({ actorId: actor.id, action: nextTick });
    }

    this.#deliver(serializeSnapshot(room, now, this.playerId), true);
    return { success: true };
  }

  leaveRoom() {
    this.#stop();
    this.playerId = null;
    this.roomCode = null;
    this.latestSnapshot = null;
    this.#deliver({ type: 'left' });
  }

  loadout(spell, ultimate = this.ultimateId, preparedSpells = this.preparedSpells) {
    this.spell = isSpell(spell) ? spell : DEFAULT_SPELL;
    this.ultimateId = isUltimate(ultimate) ? ultimate : DEFAULT_ULTIMATE;
    this.preparedSpells = normalizePreparedSpells(this.spell, preparedSpells);
    const player = this.player;
    if (!player) return;
    player.startingSpell = this.spell;
    player.startingPreparedSpells = [...this.preparedSpells];
    player.startingUltimate = this.ultimateId;
    if (this.room?.state !== 'PLAYING') {
      player.spell = this.spell;
      player.preparedSpells = [...this.preparedSpells];
      player.ultimate = this.ultimateId;
      player.spellReadyAt = player.spellReadyById?.[this.spell] ?? -Infinity;
    }
  }

  // Carry the server-confirmed cosmetic into solo without granting currency or reward authority locally.
  setProfileCloth(cloth) {
    this.cloth = clothChoice(cloth).id;
    if (this.player) this.player.cloth = this.cloth;
  }

  setProfile(profile, token = null) {
    if (!profile) return;
    if (token) this.token = token;
    if (profile.equipped) this.setProfileCloth(profile.equipped);
    if (profile.emblem) this.emblem = profile.emblem;

    let challenges = profile.challenges ? structuredClone(profile.challenges) : { completed: {}, progress: {} };
    if (this.storage) {
      try {
        const solo = JSON.parse(this.storage.getItem(SOLO_PROFILE_KEY) || 'null');
        if (solo?.challenges?.completed) {
          challenges.completed ??= {};
          for (const [k, v] of Object.entries(solo.challenges.completed)) {
            challenges.completed[k] ??= v;
          }
        }
      } catch {}
    }
    this.challenges = challenges;
    this.emblems = ownedEmblems(this.challenges);
    this.profile = { ...profile, challenges: this.challenges, emblems: this.emblems };
    if (this.player) {
      this.player.cloth = this.cloth;
      this.player.emblem = this.emblem || DEFAULT_EMBLEM;
      this.player.emblems = [...this.emblems];
      this.player.challenges = structuredClone(this.challenges);
    }
  }

  #completePrestigeChallenge(event, tickEvents, time = this.now()) {
    const player = this.room?.players?.get(event.playerId);
    if (!player) return;
    let profile = this.profile;
    if (!profile && this.storage) {
      try {
        profile = JSON.parse(this.storage.getItem(SOLO_PROFILE_KEY) || this.storage.getItem('ss-profile-cache') || 'null');
      } catch {}
    }
    if (!profile) {
      profile = defaultSoloProfile();
    }
    if (!profile.challenges) profile.challenges = { version: 1, progress: {}, completed: {}, rewarded: [] };
    if (!profile.challenges.completed) profile.challenges.completed = {};
    if (!profile.challenges.progress) profile.challenges.progress = {};

    const completedAt = Number.isFinite(event.at) && event.at > 0 ? event.at * 1000 : Date.now();
    profile.challenges.completed[event.challengeId] = completedAt;
    profile.challenges.progress[event.challengeId] = 1;
    profile.emblems = ownedEmblems(profile.challenges);

    try {
      if (this.storage) {
        this.storage.setItem(SOLO_PROFILE_KEY, JSON.stringify(profile));
      }
      this.setProfile(profile);
      this.pendingPrestige = null;

      // Deliver updated profile message so Armory and Challenge UI update immediately
      this.#deliver({ type: 'profile', profile, prestigeFeat: event.challengeId, local: true }, true);

      // Confirmed unlock announcements delivered on the events channel:
      tickEvents.push({
        type: 'stPerryPlainUnlocked',
        playerId: player.id,
        message: 'PRESTIGE HERALD EARNED: ST. PERRY THE PLAIN!',
        at: event.at,
      });
      tickEvents.push({
        type: 'spellbladeLine',
        playerId: player.id,
        text: 'I suppose anyone can become a saint... these days.',
        speaker: player.name || 'Spellblade',
        at: event.at,
      });
    } catch (err) {
      this.pendingPrestige = {
        event,
        player,
        profile,
        retryAt: time + 1,
      };
      this.#deliver({
        type: 'profileError',
        message: 'Prestige feat storage unavailable. Retrying in background...',
      }, true);
    }
  }

  send(message) { this.#command(message); }
  startMatch() { this.#command({ type: 'startMatch' }); }
  ready(ready) { this.#command({ type: 'ready', ready: Boolean(ready) }); }
  arenaReady(ready) { this.#command({ type: 'arenaReady', ready: Boolean(ready) }); }
  practiceResetPlayer() { this.#command({ type: 'practiceResetPlayer' }); }
  practiceSpawnDummy(mode = 'PASSIVE') { this.#command({ type: 'practiceSpawnDummy', mode }); }
  practiceRemoveDummy() { this.#command({ type: 'practiceRemoveDummy' }); }
  practiceSetDummyMode(mode) { this.#command({ type: 'practiceSetDummyMode', mode }); }
  practicePerryAnswer(answer) { this.#command({ type: 'practicePerryAnswer', answer }); }
  practicePerryDismiss() { this.#command({ type: 'practicePerryDismiss' }); }
  input(input) { this.#command({ type: 'input', ...input }); }
  attack(down) { this.#command({ type: 'attack', down, clientTime: this.now() }); }
  guard(down) { this.#command({ type: 'guard', down, clientTime: this.now() }); }
  cast(direction) { this.#command({ type: 'cast', direction, clientTime: this.now() }); }
  castPreparedSpell(spell, direction, input = {}) {
    this.#command({ type: 'castPreparedSpell', spell, direction,
      ...(Number.isFinite(input.yaw) ? { yaw: input.yaw } : {}),
      ...(Number.isFinite(input.pitch) ? { pitch: input.pitch } : {}), clientTime: this.now() });
  }
  selectPreparedSlot(slot) { this.#command({ type: 'selectPreparedSlot', slot }); }
  castPreparedSlot(slot, direction, input = {}) {
    this.#command({ type: 'castPreparedSlot', slot, direction,
      ...(Number.isFinite(input.yaw) ? { yaw: input.yaw } : {}),
      ...(Number.isFinite(input.pitch) ? { pitch: input.pitch } : {}), clientTime: this.now() });
  }
  castCurrentSpell(direction, input = {}) {
    this.#command({ type: 'castCurrentSpell', direction,
      ...(Number.isFinite(input.yaw) ? { yaw: input.yaw } : {}),
      ...(Number.isFinite(input.pitch) ? { pitch: input.pitch } : {}), clientTime: this.now() });
  }
  selectPreparedSpell(spell) { this.#command({ type: 'selectPreparedSpell', spell }); }
  gauntlet() { this.#command({ type: 'gauntlet', clientTime: this.now() }); }
  ultimate() { this.#command({ type: 'ultimate' }); }
  practiceReadyUltimate() { this.#command({ type: 'practiceReadyUltimate' }); }
  siegeOperate() { this.#command({ type: 'siegeOperate' }); }
  bibyeOperate() { this.#command({ type: 'bibyeOperate' }); }
  bibyeFire(weapon = 'MAIN') { this.#command({ type: 'bibyeFire', weapon }); }
  bibyeToggleDeploy() { this.#command({ type: 'bibyeToggleDeploy' }); }
  bibyeWeaponFocus(focus) { this.#command({ type: 'bibyeWeaponFocus', focus }); }
  practiceSiege(action, machine) { this.#command({ type: 'practiceSiege', action, machine }); }
  dash(direction) { this.#command({ type: 'dash', direction }); }
  rematch() { this.#command({ type: 'rematch' }); }
  switchTeam(team = null) { this.#command({ type: 'switchTeam', team }); }
  markTarget(targetId = null) { this.#command({ type: 'markTarget', targetId }); }
  vote(key, value) { this.#command({ type: 'vote', key, value }); }
  ping() { this.#deliver({ type: 'pong', sentAt: performance.now(), serverTime: this.now() }); }

  // everything else needs other people, and so the game server
  #online() { this.#deliver({ type: 'error', message: OFFLINE_MESSAGE }); }
  createRoom() { this.#online(); }
  createBreakthroughRoom() { this.#online(); }
  quickPlay() { this.#online(); }
  joinRoom() { this.#online(); }
  seekDuel() { this.#online(); }
  cancelSeek() {}
  seekBotDuel() { this.#online(); }
  listRooms() { this.#deliver({ type: 'roomList', rooms: [], serverTime: this.now() }); }
  createPublicRoom() { this.#online(); }
}
