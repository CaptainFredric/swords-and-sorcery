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
import { GAME_MODES } from '../../shared/src/modes.mjs';

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
    this.now = now;
    this.every = every;
    this.cancel = cancel;
    this.later = later;
    this.handlers = new Map();
    this.rooms = new RoomManager();
    this.room = null;
    this.timer = null;
    this.spell = DEFAULT_SPELL;
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
  startSolo(mode, name) {
    if (!SOLO_MODES.has(mode)) {
      this.#deliver({ type: 'error', message: 'Unknown solo mode' });
      return;
    }
    this.#stop();
    const time = this.now();
    const room = this.rooms.createSoloRoom(mode, time);
    const player = room.addPlayer({ id: randomId(), token: randomId(), name: String(name || 'Spellblade').slice(0, 18), spell: this.spell }, time);
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

  /** One step of the match, as the server's tick does it for each room. */
  tick() {
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
  }

  #command(message) {
    const room = this.room;
    const player = room?.players.get(this.player?.id);
    if (!room || !player) return;
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

  loadout(spell) {
    this.spell = isSpell(spell) ? spell : DEFAULT_SPELL;
    if (this.player && !this.player.pendingSpell) this.player.spell = this.spell;
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
  gauntlet() { this.#command({ type: 'gauntlet', clientTime: this.now() }); }
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
