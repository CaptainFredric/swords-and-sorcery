import { clearExpiredSession } from './sessionState.mjs';

// The game server: the page's own host (the Render server serves the client and runs the game), unless the page
// names another. A static copy of the client (GitHub Pages) names the game server with <meta name="ss-game-server">.
export function gameServerUrl(doc = globalThis.document, loc = globalThis.location) {
  const named = doc?.querySelector?.('meta[name="ss-game-server"]')?.content?.trim();
  if (named) return named;
  const scheme = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${loc.host}/ws`;
}

export class GameSocket {
  constructor() {
    this.ws = null;
    this.profileReady = false;
    this.handlers = new Map();
    this.playerId = null;
    this.token = localStorage.getItem('ss-session-token');
    this.roomCode = null;
    this.latestSnapshot = null;
    this.snapshotReceivedAt = 0;
    this.pingMs = 0;
    this.intentionalClose = false;
    this.reconnectTimer = null;
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

  /** Open the connection; `timeoutMs` gives up on a server that never answers (the attempt is closed). */
  async connect({ resume = true, timeoutMs = 0 } = {}) {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    this.intentionalClose = false;
    const ws = new WebSocket(gameServerUrl());
    this.ws = ws;
    await new Promise((resolve, reject) => {
      const timer = timeoutMs > 0 ? setTimeout(() => {
        reject(new Error('The game server did not answer'));
        try { ws.close(); } catch { /* never opened */ }
      }, timeoutMs) : null;
      ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      ws.addEventListener('error', (error) => { clearTimeout(timer); reject(error); }, { once: true });
    });
    ws.addEventListener('message', (event) => this.#message(event));
    ws.addEventListener('close', () => this.#closed());
    this.profileReady = false;
    let guestToken = null;
    try { guestToken = localStorage.getItem('ss-guest-token'); } catch {}
    this.send({ type: 'profileHello', token: guestToken });
    if (resume && this.token) this.send({ type: 'resume', token: this.token });
  }

  #message(event) {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.type === 'profile') {
      this.profileReady = true;
      if (message.token) {
        try { localStorage.setItem('ss-guest-token', message.token); } catch {
          this.emit('profileError', { message: 'Browser storage is blocked. Your guest identity will be lost after closing this page.' });
        }
      }
    }
    if (message.type === 'joined') {
      this.playerId = message.playerId;
      this.token = message.token;
      this.roomCode = message.roomCode;
      localStorage.setItem('ss-session-token', message.token);
      localStorage.setItem('ss-room-code', message.roomCode);
    }
    if (message.type === 'left') {
      this.playerId = null;
      this.token = null;
      this.roomCode = null;
      this.latestSnapshot = null;
      localStorage.removeItem('ss-session-token');
      localStorage.removeItem('ss-room-code');
    }
    if (message.type === 'snapshot') {
      this.latestSnapshot = message;
      this.snapshotReceivedAt = performance.now();
    }
    if (message.type === 'pong' && Number.isFinite(message.sentAt)) {
      this.pingMs = Math.round(performance.now() - message.sentAt);
    }
    if (message.type === 'resumeFailed') clearExpiredSession(this, localStorage);
    this.emit(message.type, message);
  }

  #closed() {
    this.profileReady = false;
    this.emit('connection', { connected: false });
    if (this.intentionalClose) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect({ resume: true });
        this.emit('connection', { connected: true });
      } catch {
        this.#closed();
      }
    }, 900);
  }

  send(message) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }

  createRoom(name) { this.send({ type: 'createRoom', name }); }
  quickPlay(name) { this.send({ type: 'quickPlay', name }); }
  startSolo(mode, name, worldId) { this.send({ type: 'startSolo', mode, name, worldId }); }
  joinRoom(code, name) { this.send({ type: 'joinRoom', code: code.trim().toUpperCase(), name }); }
  startMatch() { this.send({ type: 'startMatch' }); }
  arenaReady(ready) { this.send({ type: 'arenaReady', ready: Boolean(ready) }); }
  practiceResetPlayer() { this.send({ type: 'practiceResetPlayer' }); }
  practiceSpawnDummy(mode = 'PASSIVE') { this.send({ type: 'practiceSpawnDummy', mode }); }
  practiceRemoveDummy() { this.send({ type: 'practiceRemoveDummy' }); }
  practiceSetDummyMode(mode) { this.send({ type: 'practiceSetDummyMode', mode }); }
  input(input) { this.send({ type: 'input', ...input }); }
  attack(down) { this.send({ type: 'attack', down, clientTime: this.serverNow() }); }
  guard(down) { this.send({ type: 'guard', down, clientTime: this.serverNow() }); }
  cast(direction) { this.send({ type: 'cast', direction, clientTime: this.serverNow() }); }
  gauntlet() { this.send({ type: 'gauntlet', clientTime: this.serverNow() }); }
  ultimate() { this.send({ type: 'ultimate' }); }
  practiceReadyUltimate() { this.send({ type: 'practiceReadyUltimate' }); }
  dash(direction) { this.send({ type: 'dash', direction }); }
  rematch() { this.send({ type: 'rematch' }); }
  seekDuel(name) { this.send({ type: 'seekDuel', name }); }
  cancelSeek() { this.send({ type: 'cancelSeek' }); }
  seekBotDuel() { this.send({ type: 'seekBotDuel' }); }
  listRooms() { this.send({ type: 'listRooms' }); }
  createPublicRoom(name) { this.send({ type: 'createPublicRoom', name }); }
  ready(ready) { this.send({ type: 'ready', ready: Boolean(ready) }); }
  vote(key, value) { this.send({ type: 'vote', key, value }); }
  leaveRoom() { this.send({ type: 'leaveRoom' }); }
  // the spell carried from the Armory (kept by the server for every room this connection joins)
  loadout(spell) { this.send({ type: 'loadout', spell }); }
  ping() { this.send({ type: 'ping', sentAt: performance.now() }); }

  serverNow() {
    if (!this.latestSnapshot) return 0;
    return this.latestSnapshot.serverTime + (performance.now() - this.snapshotReceivedAt) / 1000;
  }

  close() {
    this.intentionalClose = true;
    clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }
}
