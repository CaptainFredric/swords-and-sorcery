import { ARENAS, GAME_MODES, publicRoomMode, getModePolicy } from '../src/modes.mjs';
import { roomSettings } from '../src/roomSettings.mjs';
import { WORLD_IDS } from '../worlds/registry.mjs';
import { Room } from './Room.mjs';

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const SOLO_MODES = new Set([GAME_MODES.BOT_DUEL, GAME_MODES.PRACTICE, GAME_MODES.BREAKTHROUGH, GAME_MODES.HIGH_GROUNDS, GAME_MODES.RENOWN_TRIALS, GAME_MODES.EDGE_OF_VICTORY]);

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
    this.duelsMade = 0;
  }

  /** The arena for the next matchmade duel: each in turn. */
  nextDuelArena() {
    const arena = ARENAS[this.duelsMade % ARENAS.length];
    this.duelsMade += 1;
    return arena;
  }

  createPrivateRoom(nowSec = 0, worldId = WORLD_IDS.CASTLEWARD) {
    // Retain legacy/internal fixtures (including Shattered Keep); network custom rooms are validated separately.
    return this.#createRoom({ isPrivate: true, mode: GAME_MODES.FFA, worldId }, nowSec);
  }

  createSharedPracticeRoom(nowSec = 0, worldId = WORLD_IDS.CASTLEWARD) {
    const room=this.#createRoom({isPrivate:true,mode:GAME_MODES.PRACTICE,worldId},nowSec);
    room.sharedPractice=true;
    return room;
  }

  createPublicRoom(nowSec = 0, worldId = WORLD_IDS.CASTLEWARD) {
    return this.#createRoom({ isPrivate: false, mode: GAME_MODES.FFA, worldId }, nowSec);
  }

  /** All custom rooms share the same validated rules, whether visible in Open Rooms or invited by code. */
  createCustomRoom({ isPrivate = true, mode = GAME_MODES.FFA, worldId, scoreToWin, matchSeconds, teamSize, botSkill } = {}, nowSec = 0) {
    if (!publicRoomMode(mode)) throw new Error('That game mode does not support custom rooms.');
    const baseline = { mode: GAME_MODES.FFA, worldId: WORLD_IDS.CASTLEWARD, scoreToWin: 10, policy: getModePolicy(GAME_MODES.FFA) };
    const settings = roomSettings(baseline, { mode, ...(worldId ? { worldId } : {}),
      ...(scoreToWin !== undefined ? { scoreToWin } : {}),
      ...(matchSeconds !== undefined ? { matchSeconds } : {}),
      ...(teamSize !== undefined ? { teamSize } : {}),
      ...(botSkill !== undefined ? { botSkill } : {}) });
    if (settings.error) throw new Error(settings.error);
    const room = this.#createRoom({ isPrivate: Boolean(isPrivate), mode, worldId: settings.worldId, teamSize: settings.teamSize }, nowSec);
    room.scoreToWin = settings.scoreToWin;
    room.policy.matchSeconds = settings.matchSeconds;
    if (room.policy.teamMode || mode === GAME_MODES.EDGE_OF_VICTORY) room.setBotSkill(settings.botSkill);
    return room;
  }

  createBreakthroughRoom(nowSec = 0, isPrivate = true, worldId = WORLD_IDS.BASTION_BREACH, { teamSize = null } = {}) {
    return this.createCustomRoom({ isPrivate, mode: worldId === WORLD_IDS.HIGH_GROUNDS ? GAME_MODES.HIGH_GROUNDS : GAME_MODES.BREAKTHROUGH, worldId, ...(teamSize ? { teamSize } : {}) }, nowSec);
  }

  // a matchmade one-on-one: never listed, never joinable by code or Quick Play
  createDuelRoom(nowSec = 0, worldId = this.nextDuelArena()) {
    return this.#createRoom({ isPrivate: true, mode: GAME_MODES.DUEL, worldId }, nowSec);
  }

  createSoloRoom(mode, nowSec = 0, worldId = (mode === GAME_MODES.BREAKTHROUGH ? WORLD_IDS.BASTION_BREACH : mode === GAME_MODES.EDGE_OF_VICTORY ? WORLD_IDS.RUINED_KEEP : WORLD_IDS.CASTLEWARD), { teamSize = null } = {}) {
    if (!SOLO_MODES.has(mode)) throw new Error('Unknown solo mode');
    const room = this.#createRoom({ isPrivate: true, mode, worldId, teamSize }, nowSec);
    if (mode === GAME_MODES.EDGE_OF_VICTORY) {
      room.policy.minHumansToStart = 1;
      room.policy.autoStart = true;
      room.policy.readyCheck = false;
      room.policy.botCount = 3;
    }
    return room;
  }

  #createRoom({ isPrivate, mode, worldId, teamSize = null }, nowSec) {
    let code;
    do code = generateRoomCode(this.random); while (this.rooms.has(code));
    const room = new Room(code, { isPrivate, mode, worldId, teamSize });
    room.createdAt = nowSec;
    this.rooms.set(code, room);
    return room;
  }

  /** Prefer a populated compatible room; never silently switch the player's selected mode. */
  quickPlay(nowSec = 0, mode = GAME_MODES.FFA) {
    if (mode !== 'ALL' && !publicRoomMode(mode)) throw new Error('Choose an available public game mode.');
    const rooms = [...this.rooms.values()].filter(room => !room.isPrivate && publicRoomMode(room.mode)
      && (mode === 'ALL' || room.mode === mode) && room.joinError() === null);
    rooms.sort((a, b) => b.humanCount() - a.humanCount() || a.createdAt - b.createdAt);
    return rooms[0] ?? this.createCustomRoom({ isPrivate: false, mode: mode === 'ALL' ? GAME_MODES.FFA : mode }, nowSec);
  }

  /** Joinable public rooms across all supported modes; bots do not consume human capacity. */
  listPublicRooms(nowSec = 0) {
    const list = [];
    for (const room of this.rooms.values()) {
      if (room.isPrivate || room.humanCount() === 0 || room.joinError()) continue;
      const humans = room.humanActorCount();
      const capacity = room.mode === GAME_MODES.EDGE_OF_VICTORY ? 4 : room.policy.teamMode ? (room.policy.teamSize ?? 3) * 2 : 8;
      const left = room.state === 'PLAYING' && room.matchStartedAt !== null && Number.isFinite(room.policy.matchSeconds)
        ? Math.max(0, Math.round(room.matchStartedAt + room.policy.matchSeconds - nowSec)) : null;
      list.push({ code: room.code, mode: room.mode, worldId: room.worldId, state: room.state,
        players: humans, capacity, teamSize: room.policy.teamSize ?? null,
        scoreToWin: room.scoreToWin, matchSeconds: room.policy.matchSeconds,
        botSkill: room.botSkill, secondsLeft: left });
    }
    const order = { WAITING: 0, COUNTDOWN: 1, PLAYING: 2 };
    return list.sort((a,b) => (order[a.state] ?? 9) - (order[b.state] ?? 9) || b.players - a.players);
  }

  findByCode(code) {
    return this.rooms.get(String(code || '').toUpperCase()) ?? null;
  }

  cleanup(nowSec) {
    for (const [code, room] of this.rooms) if (room.isCleanupEligible(nowSec)) this.rooms.delete(code);
  }
}
