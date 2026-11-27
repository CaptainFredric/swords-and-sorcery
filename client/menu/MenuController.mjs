import { arenaForMode, RENOWN_ARENAS } from '../../shared/src/modes.mjs';
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
  soloArena(mode = 'BOT_DUEL') {
    const legacy = this.storage?.getItem?.('ss-solo-arena');
    const saved = mode === 'PRACTICE' ? this.storage?.getItem?.('ss-practice-arena') ?? legacy : legacy;
    return arenaForMode(mode, saved);
  }

  chooseSoloArena(worldId, mode = 'BOT_DUEL') {
    const arena = arenaForMode(mode, worldId);
    this.storage?.setItem?.(mode === 'PRACTICE' ? 'ss-practice-arena' : 'ss-solo-arena', arena);
    return arena;
  }

  /** The arena chosen for Renown Trials (remembered; Court of Merit by default). */
  renownArena() {
    const saved = this.storage?.getItem?.('ss-renown-arena');
    return RENOWN_ARENAS?.includes(saved) ? saved : 'court-of-merit';
  }

  chooseRenownArena(worldId) {
    const arena = RENOWN_ARENAS?.includes(worldId) ? worldId : 'court-of-merit';
    this.storage?.setItem?.('ss-renown-arena', arena);
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
    if (raw === 'outerworks' || raw === 'blackbell-foundry' || raw === 'high-grounds' || raw === 'restless-day') return raw;
    return 'bastion-breach';
  }

  chooseBreakthroughArena(arena) {
    const chosen = (arena === 'outerworks' || arena === 'blackbell-foundry' || arena === 'high-grounds' || arena === 'restless-day') ? arena : 'bastion-breach';
    this.storage?.setItem?.('ss-breakthrough-arena', chosen);
    return chosen;
  }

  /** Selected arena for Free-for-All ('castleward', 'ruined-keep', 'court-of-merit', 'blackbell-foundry'). */
  ffaArena() {
    return arenaForMode('FFA', this.storage?.getItem?.('ss-ffa-arena'));
  }

  chooseFfaArena(arena) {
    const chosen = arenaForMode('FFA', arena);
    this.storage?.setItem?.('ss-ffa-arena', chosen);
    return chosen;
  }

  /** Preferred side for Solo Breakthrough ('AUTO', 'ATTACKERS', 'DEFENDERS'). */
  soloTeam() {
    return this.breakthroughTeam();
  }

  chooseSoloTeam(team) {
    return this.chooseBreakthroughTeam(team);
  }

  siegeFormat() {
    const raw = this.storage?.getItem?.('ss-siege-format');
    return raw === 'MATCH' ? 'MATCH' : 'ENDLESS';
  }

  chooseSiegeFormat(format) {
    const chosen = format === 'MATCH' ? 'MATCH' : 'ENDLESS';
    this.storage?.setItem?.('ss-siege-format', chosen);
    return chosen;
  }

  siegeSize() {
    const raw = Number(this.storage?.getItem?.('ss-siege-size'));
    return (raw === 1 || raw === 2 || raw === 3) ? raw : 1;
  }

  chooseSiegeSize(size) {
    const chosen = (Number(size) === 2 || Number(size) === 3) ? Number(size) : 1;
    this.storage?.setItem?.('ss-siege-size', String(chosen));
    return chosen;
  }

  siegeMachine() {
    const raw = this.storage?.getItem?.('ss-siege-machine');
    return ['random', 'so-fist-ication', 'bi-bye-llista', 'fight-and-flight'].includes(raw) ? raw : 'random';
  }

  chooseSiegeMachine(machine) {
    const chosen = ['random', 'so-fist-ication', 'bi-bye-llista', 'fight-and-flight'].includes(machine) ? machine : 'random';
    this.storage?.setItem?.('ss-siege-machine', chosen);
    return chosen;
  }

  siegeRounds() {
    const raw = Number(this.storage?.getItem?.('ss-siege-rounds'));
    return (raw === 3 || raw === 5 || raw === 7) ? raw : 3;
  }

  chooseSiegeRounds(rounds) {
    const chosen = (Number(rounds) === 5 || Number(rounds) === 7) ? Number(rounds) : 3;
    this.storage?.setItem?.('ss-siege-rounds', String(chosen));
    return chosen;
  }

  siegeEndlessRounds() {
    const rawVal = this.storage?.getItem?.('ss-siege-endless-rounds');
    if (rawVal === null || rawVal === undefined) return 25;
    const raw = Number(rawVal);
    return (raw === 10 || raw === 25 || raw === 50 || raw === 0) ? raw : 25;
  }

  chooseSiegeEndlessRounds(rounds) {
    const val = Number(rounds);
    const chosen = (val === 10 || val === 50 || val === 0) ? val : 25;
    this.storage?.setItem?.('ss-siege-endless-rounds', String(chosen));
    return chosen;
  }

  siegeClashStarts() {
    const raw = this.storage?.getItem?.('ss-siege-clash');
    return raw !== 'false';
  }

  chooseSiegeClashStarts(enabled) {
    const chosen = Boolean(enabled);
    this.storage?.setItem?.('ss-siege-clash', String(chosen));
    return chosen;
  }

  siegeExperimentalDragOon() {
    return this.storage?.getItem?.('ss-siege-exp-dragoon') === 'true';
  }

  chooseSiegeExperimentalDragOon(enabled) {
    const chosen = Boolean(enabled);
    this.storage?.setItem?.('ss-siege-exp-dragoon', String(chosen));
    return chosen;
  }

  siegeBlades(rawName, options = null) {
    const format = options?.format ?? this.siegeFormat();
    const size = (options?.teamSize !== undefined ? Number(options.teamSize) : this.siegeSize());
    const skill = options?.botSkill ?? this.breakthroughSkill();
    const arena = options?.worldId ?? (this.breakthroughArena() === 'outerworks' || this.breakthroughArena() === 'blackbell-foundry' ? this.breakthroughArena() : 'high-grounds');
    const teamPref = options?.team ?? this.breakthroughTeam();
    const team = (teamPref === 'ATTACKERS' || teamPref === 'DEFENDERS') ? teamPref : null;
    const machine = options?.machine ?? this.siegeMachine();
    const matchRounds = options?.matchRounds ?? this.siegeRounds();
    const endlessRoundCap = options?.endlessRoundCap ?? this.siegeEndlessRounds();
    const clashStarts = options?.clashStarts ?? this.siegeClashStarts();
    const experimentalDragOon = Boolean(options?.experimentalDragOon ?? this.siegeExperimentalDragOon());

    return this.#withName(rawName, (name) => {
      return this.socket.startSolo('SIEGE_BLADES', name, arena, skill, team, size, {
        format,
        teamSize: size,
        botDifficulty: skill,
        machineSelection: machine,
        matchRounds,
        endlessRoundCap,
        clashStarts,
        ...(experimentalDragOon ? { experimentalDragOon: true } : {}),
      });
    });
  }

  nameForMatch(rawName) {
    return normalizeName(rawName)||this.savedName()||`Spellblade ${Math.floor(1000+Math.random()*9000)}`;
  }

  #withName(rawName, action) {
    const name = this.nameForMatch(rawName);
    this.storage?.setItem?.('ss-player-name', name);
    action(name);
    return { ok: true, name };
  }

  quickPlay(rawName, mode = 'FFA') {
    return this.#withName(rawName, (name) => this.socket.quickPlay(name, mode));
  }

  seekDuel(rawName) {
    return this.#withName(rawName, (name) => this.socket.seekDuel(name));
  }

  seekSiege(rawName) {
    return this.#withName(rawName, (name) => this.socket.seekSiege(name));
  }

  createPublic(rawName, settings = {}) {
    return this.#withName(rawName, (name) => this.socket.createPublicRoom(name, settings));
  }

  edgeOfVictory(rawName, botSkill = null) {
    const skill = botSkill ? botSkillId(botSkill) : this.breakthroughSkill();
    return this.#withName(rawName, (name) => this.socket.startSolo('EDGE_OF_VICTORY', name, 'ruined-keep', skill));
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
    return this.#withName(rawName, (name) => this.socket.startSolo(arena === 'restless-day' ? 'RESTLESS_DAY' : arena === 'high-grounds' ? 'HIGH_GROUNDS' : 'BREAKTHROUGH', name, arena, skill, team, arena === 'restless-day' ? 5 : size));
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



  renownTrials(rawName, options = null) {
    const arena = (typeof options === 'object' && options?.worldId)
      ? (RENOWN_ARENAS?.includes(options.worldId) ? options.worldId : 'court-of-merit')
      : (typeof options === 'string' && RENOWN_ARENAS?.includes(options) ? options : this.renownArena());
    return this.#withName(rawName, (name) => options?.rehearsal
      ? this.socket.startRenownRehearsal(name, arena)
      : this.socket.startSolo('RENOWN_TRIALS', name, arena));
  }

  practice(rawName, worldId = this.soloArena('PRACTICE')) {
    return this.#withName(rawName, (name) => this.socket.startSolo('PRACTICE', name, arenaForMode('PRACTICE', worldId)));
  }

  sharedPractice(rawName) {
    return this.#withName(rawName,name=>this.socket.createSharedPracticeRoom(name,this.soloArena('PRACTICE')));
  }

  inspectionPractice(rawName) {
    return this.#withName(rawName, name => this.socket.startInspectionPractice(name, this.soloArena('PRACTICE')));
  }

  createPrivate(rawName,settings=null,team=null) {
    return this.#withName(rawName, (name) => this.socket.createRoom(name,settings,team));
  }

  joinPrivate(rawCode, rawName) {
    const code = normalizeCode(rawCode);
    if (code.length !== 5) return { ok: false, error: 'Enter the five-character room code.' };
    return this.#withName(rawName, (name) => this.socket.joinRoom(code, name));
  }
}

export const MENU_LIMITS = Object.freeze({ MAX_NAME_LENGTH });
