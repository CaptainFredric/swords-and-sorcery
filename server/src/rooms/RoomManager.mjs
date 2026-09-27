import { GAME_MODES } from '../../../shared/src/modes.mjs';
import { WORLD_IDS } from '../../../shared/worlds/registry.mjs';
import { Room } from '../game/Room.mjs';

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const SOLO_MODES = new Set([GAME_MODES.BOT_DUEL, GAME_MODES.PRACTICE]);

export function generateRoomCode(random = Math.random) {
  let code = '';
  for (let i = 0; i < 4; i += 1) code += LETTERS[Math.floor(random() * LETTERS.length) % LETTERS.length];
  code += String(2 + Math.floor(random() * 8));
  return code;
}

export class RoomManager {
  constructor({ random = Math.random } = {}) {
    this.random = random;
    this.rooms = new Map();
  }

  createPrivateRoom(nowSec = 0, worldId = WORLD_IDS.CASTLEWARD) {
    return this.#createRoom({ isPrivate: true, mode: GAME_MODES.FFA, worldId }, nowSec);
  }

  createPublicRoom(nowSec = 0, worldId = WORLD_IDS.CASTLEWARD) {
    return this.#createRoom({ isPrivate: false, mode: GAME_MODES.FFA, worldId }, nowSec);
  }

  // a matchmade one-on-one: never listed, never joinable by code or Quick Play
  createDuelRoom(nowSec = 0, worldId = WORLD_IDS.CASTLEWARD) {
    return this.#createRoom({ isPrivate: true, mode: GAME_MODES.DUEL, worldId }, nowSec);
  }

  createSoloRoom(mode, nowSec = 0, worldId = WORLD_IDS.CASTLEWARD) {
    if (!SOLO_MODES.has(mode)) throw new Error('Unknown solo mode');
    return this.#createRoom({ isPrivate: true, mode, worldId }, nowSec);
  }

  #createRoom({ isPrivate, mode, worldId }, nowSec) {
    let code;
    do code = generateRoomCode(this.random); while (this.rooms.has(code));
    const room = new Room(code, { isPrivate, mode, worldId });
    room.createdAt = nowSec;
    this.rooms.set(code, room);
    return room;
  }

  quickPlay(nowSec = 0) {
    for (const room of this.rooms.values()) {
      if (!room.isPrivate
        && room.mode === GAME_MODES.FFA
        && room.worldId === WORLD_IDS.CASTLEWARD
        && ['WAITING', 'COUNTDOWN', 'PLAYING'].includes(room.state)
        && room.players.size < 8) return room;
    }
    return this.createPublicRoom(nowSec);
  }

  /** Public free-for-all rooms with space, for the open rooms list. */
  listPublicRooms(nowSec = 0) {
    const list = [];
    for (const room of this.rooms.values()) {
      if (room.isPrivate || room.mode !== GAME_MODES.FFA || room.state === 'FINISHED') continue;
      const humans = room.humanCount();
      if (humans === 0 || room.players.size >= 8) continue;
      const left = room.state === 'PLAYING' && room.matchStartedAt !== null
        ? Math.max(0, Math.round(room.matchStartedAt + (room.policy.matchSeconds ?? 0) - nowSec))
        : null;
      list.push({
        code: room.code,
        worldId: room.worldId,
        state: room.state,
        players: humans,
        capacity: 8,
        scoreToWin: room.scoreToWin,
        secondsLeft: left,
      });
    }
    // rooms still gathering first, then the busiest
    const order = { WAITING: 0, COUNTDOWN: 1, REMATCH_COUNTDOWN: 2, PLAYING: 3 };
    return list.sort((a, b) => (order[a.state] ?? 9) - (order[b.state] ?? 9) || b.players - a.players);
  }

  findByCode(code) {
    return this.rooms.get(String(code || '').toUpperCase()) ?? null;
  }

  cleanup(nowSec) {
    for (const [code, room] of this.rooms) if (room.isCleanupEligible(nowSec)) this.rooms.delete(code);
  }
}
