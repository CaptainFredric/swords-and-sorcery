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

  /** Preferred side for Breakthrough ('AUTO', 'ATTACKERS', 'DEFENDERS'). */
  breakthroughTeam() {
    const raw = this.storage?.getItem?.('ss-breakthrough-team') ?? this.storage?.getItem?.('ss-solo-team');
    return (raw === 'ATTACKERS' || raw === 'DEFENDERS') ? raw : 'AUTO';
  }

  chooseBreakthroughTeam(team) {
    const chosen = (team === 'ATTACKERS' || team === 'DEFENDERS') ? team : 'AUTO';
    this.storage?.setItem?.('ss-breakthrough-team', chosen);
    return chosen;
  }

  /** Team battle size (2 or 3, default 3). Architected so 5v5 can be added later. */
  breakthroughSize() {
    const raw = Number(this.storage?.getItem?.('ss-breakthrough-size'));
    return (raw === 2 || raw === 3) ? raw : 3;
  }

  chooseBreakthroughSize(size) {
    const chosen = Number(size) === 2 ? 2 : 3;
    this.storage?.setItem?.('ss-breakthrough-size', String(chosen));
    return chosen;
  }

  /** Bot difficulty for Breakthrough (defaults to Knight). */
  breakthroughSkill() {
    return botSkillId(this.storage?.getItem?.('ss-breakthrough-skill') ?? 'knight');
  }

  chooseBreakthroughSkill(skill) {
    const chosen = botSkillId(skill);
    this.storage?.setItem?.('ss-breakthrough-skill', chosen);
    return chosen;
  }

  /** Selected battlefield for Breakthrough ('bastion-breach', 'outerworks', 'blackbell-foundry'). */
  breakthroughArena() {
    const raw = this.storage?.getItem?.('ss-breakthrough-arena');
    if (raw === 'outerworks' || raw === 'blackbell-foundry') return raw;
    return 'bastion-breach';
  }

  chooseBreakthroughArena(arena) {
    const chosen = (arena === 'outerworks' || arena === 'blackbell-foundry') ? arena : 'bastion-breach';
    this.storage?.setItem?.('ss-breakthrough-arena', chosen);
    return chosen;
  }

  /** Preferred side for Solo Breakthrough ('AUTO', 'ATTACKERS', 'DEFENDERS'). */
  soloTeam() {
    return this.breakthroughTeam();
  }

  chooseSoloTeam(team) {
    return this.chooseBreakthroughTeam(team);
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

  breakthrough(rawName, options = null) {
    const teamPref = (typeof options === 'string' ? options : options?.team) ?? this.breakthroughTeam();
    const team = (teamPref === 'ATTACKERS' || teamPref === 'DEFENDERS') ? teamPref : null;
    const skill = (typeof options === 'object' && options?.botSkill) ? options.botSkill : this.breakthroughSkill();
    const size = (typeof options === 'object' && options?.teamSize) ? Number(options.teamSize) : this.breakthroughSize();
    const arena = (typeof options === 'object' && options?.worldId) ? options.worldId : this.breakthroughArena();
    return this.#withName(rawName, (name) => this.socket.startSolo('BREAKTHROUGH', name, arena, skill, team, size));
  }

  createBreakthroughPrivate(rawName, options = null) {
    const teamPref = (typeof options === 'string' ? options : options?.team) ?? this.breakthroughTeam();
    const team = (teamPref === 'ATTACKERS' || teamPref === 'DEFENDERS') ? teamPref : null;
    const skill = (typeof options === 'object' && options?.botSkill) ? options.botSkill : this.breakthroughSkill();
    const size = (typeof options === 'object' && options?.teamSize) ? Number(options.teamSize) : this.breakthroughSize();
    const worldId = (typeof options === 'object' && options?.worldId) ? options.worldId : null;
    return this.#withName(rawName, (name) => {
      if (worldId) {
        return this.socket.createBreakthroughRoom(name, team, skill, size, worldId);
      }
      return this.socket.createBreakthroughRoom(name, team, skill, size);
    });
  }



  practice(rawName) {
    return this.#withName(rawName, (name) => this.socket.startSolo('PRACTICE', name, this.soloArena()));
  }

  inspectionPractice(rawName) {
    return this.#withName(rawName, name => this.socket.startInspectionPractice(name, this.soloArena()));
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
