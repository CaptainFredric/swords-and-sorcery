import { Room } from '../game/Room.mjs';

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

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

  createPrivateRoom(nowSec = 0) {
    return this.#create(true, nowSec);
  }

  createPublicRoom(nowSec = 0) {
    return this.#create(false, nowSec);
  }

  #create(isPrivate, nowSec) {
    let code;
    do code = generateRoomCode(this.random); while (this.rooms.has(code));
    const room = new Room(code, { isPrivate });
    room.createdAt = nowSec;
    this.rooms.set(code, room);
    return room;
  }

  quickPlay(nowSec = 0) {
    for (const room of this.rooms.values()) {
      if (!room.isPrivate && ['WAITING', 'COUNTDOWN', 'PLAYING'].includes(room.state) && room.players.size < 8) return room;
    }
    return this.createPublicRoom(nowSec);
  }

  findByCode(code) {
    return this.rooms.get(String(code || '').toUpperCase()) ?? null;
  }

  cleanup(nowSec) {
    for (const [code, room] of this.rooms) if (room.isCleanupEligible(nowSec)) this.rooms.delete(code);
  }
}
