import { arenaOrDefault } from '../../shared/src/modes.mjs';
import { botSkillId } from '../../shared/sim/botSkill.mjs';

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

  /** The arena chosen for solo play (remembered; Castleward until another is chosen). */
  soloArena() {
    return arenaOrDefault(this.storage?.getItem?.('ss-solo-arena'));
  }

  chooseSoloArena(worldId) {
    const arena = arenaOrDefault(worldId);
    this.storage?.setItem?.('ss-solo-arena', arena);
    return arena;
  }

  /** How well the Bot Duel's rival plays (remembered; the Knight until another is chosen). */
  botSkill() {
    return botSkillId(this.storage?.getItem?.('ss-bot-skill'));
  }

  chooseBotSkill(skill) {
    const chosen = botSkillId(skill);
    this.storage?.setItem?.('ss-bot-skill', chosen);
    return chosen;
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

  seekDuel(rawName) {
    return this.#withName(rawName, (name) => this.socket.seekDuel(name));
  }

  createPublic(rawName) {
    return this.#withName(rawName, (name) => this.socket.createPublicRoom(name));
  }

  botDuel(rawName) {
    return this.#withName(rawName, (name) => this.socket.startSolo('BOT_DUEL', name, this.soloArena(), this.botSkill()));
  }

  practice(rawName) {
    return this.#withName(rawName, (name) => this.socket.startSolo('PRACTICE', name, this.soloArena()));
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
