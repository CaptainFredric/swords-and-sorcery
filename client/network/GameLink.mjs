// Who the client plays through: the game server when it can be reached, the browser itself (LocalHost) when it
// cannot. The website never depends on the server: it loads from its own static host, asks the server whether it
// is there, and meanwhile the Practice Yard and Bot Duel are always open. Everything online (Seek a Duel, rooms)
// waits for the server, which is tried again in the background until it answers.
//
//   connecting  just asked
//   waking      no answer yet after a moment: probably asleep (a free server naps when nobody plays)
//   online      the server is there
//   offline     it could not be reached; retrying

import { GameSocket } from './GameSocket.mjs';
import { LocalHost } from './LocalHost.mjs';

export const LINK_TIMING = Object.freeze({
  wakeAfterMs: 2500,
  // a sleeping server takes up to about a minute to wake; past that it is down
  giveUpMs: 75000,
  retryMs: Object.freeze([5000, 10000, 20000, 30000]),
});

// What the front door makes of each state: whether online play is open, a line in the realm's own words (a free
// server naps when nobody plays, so the heralds must ride out and rouse it), a plain note under it, and the longer
// explanation for anyone who hovers.
export function linkStatusView(status) {
  switch (status) {
    case 'online': return { online: true, title: '', note: '', detail: '', tone: 'online' };
    case 'waking': return {
      online: false, tone: 'waking',
      title: 'Heralds ride out to rally worthy Spellblades…',
      note: 'multiplayer waking · solo is ready',
      detail: 'The multiplayer server naps when nobody plays and takes up to a minute to wake. Practice and Bot Duel run in your browser meanwhile.',
    };
    case 'offline': return {
      online: false, tone: 'offline',
      title: 'No herald has returned yet.',
      note: 'multiplayer offline · solo still works',
      detail: 'The multiplayer server cannot be reached; it is tried again in the background. Practice and Bot Duel run in your browser.',
    };
    default: return { online: false, title: 'Sounding the horn…', note: 'reaching multiplayer', detail: '', tone: 'connecting' };
  }
}

// and when the server answers after all
export const LINK_RESTORED = Object.freeze({ title: 'WORTHY CHALLENGERS AWAIT YOU!', note: '(multiplayer now online)' });

const FORWARDED = ['playerId', 'token', 'roomCode', 'latestSnapshot', 'snapshotReceivedAt', 'pingMs'];
const PLAY = ['startMatch', 'ready', 'arenaReady', 'practiceResetPlayer', 'practiceSpawnDummy', 'practiceRemoveDummy',
  'practiceSetDummyMode', 'practiceReadyUltimate', 'input', 'attack', 'guard', 'cast', 'gauntlet', 'ultimate', 'dash', 'rematch', 'vote',
  'ping', 'send'];
const ONLINE = ['createRoom', 'quickPlay', 'joinRoom', 'seekDuel', 'cancelSeek', 'seekBotDuel', 'listRooms', 'createPublicRoom'];

export class GameLink {
  constructor({ remote = new GameSocket(), local = new LocalHost(), timing = LINK_TIMING, timers = globalThis } = {}) {
    this.remote = remote;
    this.local = local;
    this.timing = timing;
    this.timers = timers;
    this.handlers = new Map();
    this.status = 'connecting';
    this.hosting = 'remote';
    this.retries = 0;
    this.retryTimer = null;
    // each host's messages reach the game only while that host is the one playing
    remote.on('*', ({ type, payload }) => this.#fromRemote(type, payload));
    local.on('*', ({ type, payload }) => { if (this.hosting === 'local') this.#emit(type, payload); });
    for (const key of FORWARDED) Object.defineProperty(this, key, { get: () => this.active[key], enumerable: true });
    for (const method of PLAY) this[method] = (...args) => this.active[method](...args);
    for (const method of ONLINE) this[method] = (...args) => this.#online(method, args);
  }

  get active() {
    return this.hosting === 'local' ? this.local : this.remote;
  }

  /** Whether this match is being played in the browser (no server). */
  get playingLocally() {
    return this.hosting === 'local';
  }

  on(type, handler) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }

  #emit(type, payload) {
    for (const handler of this.handlers.get(type) ?? []) handler(payload);
  }

  #fromRemote(type, payload) {
    if (type === 'connection') this.#setStatus(payload.connected ? 'online' : 'offline');
    if (this.hosting === 'remote' || type === 'profile' || type === 'profileError') this.#emit(type, payload);
  }

  #setStatus(status) {
    if (status === this.status) return;
    const was = this.status;
    this.status = status;
    if (status === 'online') this.retries = 0;
    this.#emit('status', { status, was });
  }

  /** The first reach for the server (resuming a session if there is one); never throws, keeps trying if it fails. */
  async connect() {
    this.#setStatus('connecting');
    const waking = this.timers.setTimeout(() => { if (this.status === 'connecting') this.#setStatus('waking'); }, this.timing.wakeAfterMs);
    try {
      await this.remote.connect({ resume: true, timeoutMs: this.timing.giveUpMs });
      this.#connected();
      return true;
    } catch {
      this.#setStatus('offline');
      this.#retryLater();
      return false;
    } finally {
      this.timers.clearTimeout(waking);
    }
  }

  #connected() {
    this.#setStatus('online');
    // every connection carries what the player brings (the Armory's spell): heard like a reconnect
    if (this.hosting === 'remote') this.#emit('connection', { connected: true });
    else this.remote.loadout(this.local.spell, this.local.ultimateId);
  }

  #retryLater() {
    this.timers.clearTimeout(this.retryTimer);
    const delays = this.timing.retryMs;
    const delay = delays[Math.min(this.retries, delays.length - 1)];
    this.retries += 1;
    this.retryTimer = this.timers.setTimeout(async () => {
      try {
        await this.remote.connect({ resume: false, timeoutMs: this.timing.giveUpMs });
        this.#connected();
      } catch {
        this.#retryLater();
      }
    }, delay);
  }

  /** Try the server again now (the Retry button). */
  retryNow() {
    if (this.status === 'online') return;
    this.retries = 0;
    this.timers.clearTimeout(this.retryTimer);
    this.retryTimer = this.timers.setTimeout(() => this.#retryNowAttempt(), 0);
  }

  async #retryNowAttempt() {
    this.#setStatus('connecting');
    try {
      await this.remote.connect({ resume: false, timeoutMs: this.timing.giveUpMs });
      this.#connected();
    } catch {
      this.#setStatus('offline');
      this.#retryLater();
    }
  }

  /** A solo mode: on the server when it is there, otherwise here. */
  startSolo(mode, name, worldId) {
    if (this.status === 'online') {
      this.hosting = 'remote';
      this.remote.startSolo(mode, name, worldId);
      return;
    }
    this.hosting = 'local';
    this.local.startSolo(mode, name, worldId);
  }

  // online play needs the server; without it, Seek a Duel offers the honest next best thing: a bot, here
  #online(method, args) {
    if (this.status === 'online') {
      this.hosting = 'remote';
      this.remote[method](...args);
      return;
    }
    if (method === 'cancelSeek') return;
    if (method === 'seekDuel') {
      this.#emit('notice', { text: 'No challengers yet: a Reanimated Armor steps in (multiplayer offline)' });
      this.hosting = 'local';
      this.local.startSolo('BOT_DUEL', args[0]);
      return;
    }
    this.local[method](...args);
  }

  leaveRoom() {
    this.active.leaveRoom();
    // the next thing chosen goes wherever makes sense then
    if (this.hosting === 'local') this.hosting = 'remote';
  }

  loadout(spell, ultimate) {
    this.local.loadout(spell, ultimate);
    this.remote.loadout(spell, ultimate);
  }

  serverNow() {
    return this.active.serverNow();
  }

  close() {
    this.timers.clearTimeout(this.retryTimer);
    this.local.close();
    this.remote.close();
  }
}
