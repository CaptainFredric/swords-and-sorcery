// The browser as its own host: when the game server cannot be reached (asleep, restarting, gone for the month), the
// Practice Yard and Bot Duel run right here, on the same simulation the server runs (shared/sim), a room with you,
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

const TICK_RATE = 30;
const SOLO_MODES = new Set([GAME_MODES.BOT_DUEL, GAME_MODES.PRACTICE]);
export const OFFLINE_MESSAGE = 'Multiplayer is offline right now. Practice and Bot Duel still work.';

function randomId() {
  return globalThis.crypto?.randomUUID?.() ?? `local-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export class LocalHost {
  constructor({
    now = () => performance.now() / 1000,
    every = (fn, ms) => setInterval(fn, ms),
    cancel = (timer) => clearInterval(timer),
    later = (fn) => setTimeout(fn, 0),
  } = {}) {
    this.wallNow = now;
    this.timeOffset = 0;
    this.frozenAt = null;
    this.inspectionEnabled = false;
    this.inspectionFramesPlaying = false;
    this.inspectionNextBeat = null;
    this.now = () => this.frozenAt ?? (this.wallNow() - this.timeOffset);
    this.every = every;
    this.cancel = cancel;
    this.later = later;
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

  // as if it came over the wire: a moment later, in order, and never sharing objects with the simulation
  #deliver(message) {
    const copy = structuredClone(message);
    this.later(() => this.#receive(copy));
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
  startSolo(mode, name, worldId, botSkill) {
    if (!SOLO_MODES.has(mode)) {
      this.#deliver({ type: 'error', message: 'Unknown solo mode' });
      return;
    }
    this.#stop();
    const time = this.now();
    const room = this.rooms.createSoloRoom(mode, time, arenaOrDefault(worldId));
    const player = room.addPlayer({ id: randomId(), token: randomId(), name: String(name || 'Spellblade').slice(0, 18), spell: this.spell, ultimate: this.ultimateId, preparedSpells: this.preparedSpells }, time);
    room.setBotSkill(botSkill);
    room.provisionModeActors(time);
    room.armAutoStart(time);
    this.room = room;
    this.player = player;
    this.#deliver({
      type: 'joined', playerId: player.id, token: player.token, roomCode: room.code, hostId: room.hostId(),
      roomState: room.state, mode: room.mode, worldId: room.worldId, local: true,
    });
    this.#deliver(serializeLobby(room));
    this.timer = this.every(() => this.tick(), 1000 / TICK_RATE);
  }

  startInspectionPractice(name, worldId) {
    this.startSolo(GAME_MODES.PRACTICE, name, worldId);
    this.inspectionEnabled = true;
  }

  get inspectionFrozen() { return this.frozenAt !== null; }

  setInspectionFrozen(frozen) {
    if (!this.inspectionEnabled || this.room?.state !== 'PLAYING') return false;
    if (Boolean(frozen) === this.inspectionFrozen) return true;
    if (frozen) this.frozenAt = this.now();
    else {
      this.inspectionFramesPlaying = false;
      this.inspectionNextBeat = null;
      this.timeOffset = this.wallNow() - this.frozenAt;
      this.frozenAt = null;
      // Held input belongs to the old live frame, never to a resumed inspection.
      this.attack(false);
      this.guard(false);
      this.input({ seq: (this.player?.lastInputSeq ?? 0) + 1, forward: 0, right: 0,
        jump: false, sprint: false, crouch: false, yaw: this.player?.yaw ?? 0, pitch: this.player?.pitch ?? 0 });
    }
    this.#inspectionState();
    return true;
  }

  playInspectionFrames(playing) {
    if (!this.inspectionEnabled || !this.inspectionFrozen) return false;
    if (Boolean(playing) === this.inspectionFramesPlaying) return true;
    this.inspectionFramesPlaying = Boolean(playing);
    this.inspectionNextBeat = playing ? this.wallNow() + 0.2 : null;
    this.#inspectionState();
    return true;
  }

  #inspectionState() {
    this.#deliver({ type: 'inspectionState', frozen: this.inspectionFrozen, playingFrames: this.inspectionFramesPlaying });
  }

  stepInspection() {
    if (!this.inspectionEnabled || !this.inspectionFrozen) return false;
    this.frozenAt += 1 / TICK_RATE;
    this.#step();
    return true;
  }

  /** One step of the match, as the server's tick does it for each room. */
  tick() {
    if (this.inspectionFrozen) {
      if (this.inspectionFramesPlaying && this.wallNow() + 1e-9 >= this.inspectionNextBeat) {
        this.stepInspection();
        // One visible frame per beat. Background stalls never create a catch-up burst.
        const nextBeat = this.inspectionNextBeat + 0.2;
        this.inspectionNextBeat = nextBeat > this.wallNow() ? nextBeat : this.wallNow() + 0.2;
      }
      return;
    }
    this.#step();
  }

  #step() {
    const room = this.room;
    if (!room) return;
    const time = this.now();
    stepBotControllers(room, time, room.world);
    stepPracticeActors(room, time, room.world);
    stepRoom(room, 1 / TICK_RATE, time, room.world);
    const events = room.events.splice(0);
    if (events.length) this.#deliver({ type: 'events', events });
    this.#deliver(serializeSnapshot(room, time));
  }

  #stop() {
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = null;
    if (this.room) this.rooms.rooms.delete(this.room.code);
    this.room = null;
    this.player = null;
    this.inspectionEnabled = false;
    this.inspectionFramesPlaying = false;
    this.inspectionNextBeat = null;
    this.frozenAt = null;
    this.timeOffset = 0;
  }

  #command(message) {
    const room = this.room;
    const player = room?.players.get(this.player?.id);
    if (!room || !player || this.inspectionFrozen) return;
    const result = applyRoomCommand(room, player, message, this.now());
    if (result.rejected) this.#deliver({ type: 'error', message: result.rejected });
    else if (result.lobby) this.#deliver(serializeLobby(room));
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

  send(message) { this.#command(message); }
  startMatch() { this.#command({ type: 'startMatch' }); }
  ready(ready) { this.#command({ type: 'ready', ready: Boolean(ready) }); }
  arenaReady(ready) { this.#command({ type: 'arenaReady', ready: Boolean(ready) }); }
  practiceResetPlayer() { this.#command({ type: 'practiceResetPlayer' }); }
  practiceSpawnDummy(mode = 'PASSIVE') { this.#command({ type: 'practiceSpawnDummy', mode }); }
  practiceRemoveDummy() { this.#command({ type: 'practiceRemoveDummy' }); }
  practiceSetDummyMode(mode) { this.#command({ type: 'practiceSetDummyMode', mode }); }
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
  castCurrentSpell(direction, input = {}) {
    this.#command({ type: 'castCurrentSpell', direction,
      ...(Number.isFinite(input.yaw) ? { yaw: input.yaw } : {}),
      ...(Number.isFinite(input.pitch) ? { pitch: input.pitch } : {}), clientTime: this.now() });
  }
  selectPreparedSpell(spell) { this.#command({ type: 'selectPreparedSpell', spell }); }
  gauntlet() { this.#command({ type: 'gauntlet', clientTime: this.now() }); }
  ultimate() { this.#command({ type: 'ultimate' }); }
  practiceReadyUltimate() { this.#command({ type: 'practiceReadyUltimate' }); }
  dash(direction) { this.#command({ type: 'dash', direction }); }
  rematch() { this.#command({ type: 'rematch' }); }
  vote(key, value) { this.#command({ type: 'vote', key, value }); }
  ping() { this.#deliver({ type: 'pong', sentAt: performance.now(), serverTime: this.now() }); }

  // everything else needs other people, and so the game server
  #online() { this.#deliver({ type: 'error', message: OFFLINE_MESSAGE }); }
  createRoom() { this.#online(); }
  quickPlay() { this.#online(); }
  joinRoom() { this.#online(); }
  seekDuel() { this.#online(); }
  cancelSeek() {}
  seekBotDuel() { this.#online(); }
  listRooms() { this.#deliver({ type: 'roomList', rooms: [], serverTime: this.now() }); }
  createPublicRoom() { this.#online(); }
}
