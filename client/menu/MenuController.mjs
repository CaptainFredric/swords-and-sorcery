const MAX_NAME_LENGTH = 18;

function normalizeName(value) {
  return String(value ?? '').trim().slice(0, MAX_NAME_LENGTH);
}

function normalizeCode(value) {
  return String(value ?? '').trim().toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 5);
}

export function shouldRouteSocketError(roomCode, latestSnapshot) {
  return !(roomCode && latestSnapshot?.roomState === 'PLAYING');
}

export class MenuController {
  constructor(socket, storage = globalThis.localStorage) {
    this.socket = socket;
    this.storage = storage;
  }

  savedName() {
    return normalizeName(this.storage?.getItem?.('ss-player-name') ?? '');
  }

  #withName(rawName, action) {
    const name = normalizeName(rawName);
    if (!name) return { ok: false, error: 'Enter a Spellblade name.' };
    this.storage?.setItem?.('ss-player-name', name);
    action(name);
    return { ok: true, name };
  }

  quickPlay(rawName) {
    return this.#withName(rawName, (name) => this.socket.quickPlay(name));
  }

  botDuel(rawName) {
    return this.#withName(rawName, (name) => this.socket.startSolo('BOT_DUEL', name));
  }

  practice(rawName) {
    return this.#withName(rawName, (name) => this.socket.startSolo('PRACTICE', name));
  }

  createPrivate(rawName) {
    return this.#withName(rawName, (name) => this.socket.createRoom(name));
  }

  joinPrivate(rawCode, rawName) {
    const code = normalizeCode(rawCode);
    if (code.length !== 5) return { ok: false, error: 'Enter the five-character room code.' };
    return this.#withName(rawName, (name) => this.socket.joinRoom(code, name));
  }
}

export const MENU_LIMITS = Object.freeze({ MAX_NAME_LENGTH });
