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
  constructor({ storage = globalThis.localStorage } = {}) {
    this.storage = storage;
    this.ws = null;
    this.profileReady = false;
    this.handlers = new Map();
    this.playerId = null;
    this.token = null;
    try { this.token = this.storage?.getItem?.('ss-session-token') ?? null; } catch {}
    this.roomCode = null;
    this.latestSnapshot = null;
    this.snapshotReceivedAt = 0;
    this.pingMs = 0;
    this.intentionalClose = false;
    this.reconnectTimer = null;
    this.connectPromise = null;
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
    if (this.connectPromise) return this.connectPromise;
    this.intentionalClose = false;
    const ws = new WebSocket(gameServerUrl());
    this.ws = ws;
    this.connectPromise = (async () => {
      let timer = null;
      try {
        await new Promise((resolve, reject) => {
          if (timeoutMs > 0) {
            timer = setTimeout(() => {
              reject(new Error('The game server did not answer'));
              try { ws.close(); } catch { /* never opened */ }
            }, timeoutMs);
          }
          ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
          ws.addEventListener('error', (error) => { clearTimeout(timer); reject(error); }, { once: true });
          ws.addEventListener('close', () => { clearTimeout(timer); reject(new Error('Connection closed before opening')); }, { once: true });
        });
        if (this.intentionalClose) {
          try { ws.close(); } catch {}
          return;
        }
        ws.addEventListener('message', (event) => this.#message(event));
        ws.addEventListener('close', () => this.#closed());
        this.profileReady = false;
        let guestToken = null;
        try { guestToken = this.storage?.getItem?.('ss-guest-token'); } catch {}
        this.send({ type: 'profileHello', token: guestToken });
        if (resume && this.token) this.send({ type: 'resume', token: this.token });
      } finally {
        if (timer) clearTimeout(timer);
        this.connectPromise = null;
      }
    })();
    return this.connectPromise;
  }

  #message(event) {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.type === 'profile') {
      this.profileReady = true;
      if (message.token) {
        try { this.storage?.setItem?.('ss-guest-token', message.token); } catch {
          this.emit('profileError', { message: 'Browser storage is blocked. Your guest identity will be lost after closing this page.' });
        }
      }
    }
    if (message.type === 'joined') {
      this.playerId = message.playerId;
      this.token = message.token;
      this.roomCode = message.roomCode;
      try {
        this.storage?.setItem?.('ss-session-token', message.token);
        this.storage?.setItem?.('ss-room-code', message.roomCode);
      } catch {}
    }
    if (message.type === 'left') {
      this.playerId = null;
      this.token = null;
      this.roomCode = null;
      this.latestSnapshot = null;
      try {
        this.storage?.removeItem?.('ss-session-token');
        this.storage?.removeItem?.('ss-room-code');
      } catch {}
    }
    if (message.type === 'snapshot') {
      this.latestSnapshot = message;
      this.snapshotReceivedAt = performance.now();
    }
    if (message.type === 'pong' && Number.isFinite(message.sentAt)) {
      this.pingMs = Math.round(performance.now() - message.sentAt);
    }
    if (message.type === 'resumeFailed') clearExpiredSession(this, this.storage ?? {});
    this.emit(message.type, message);
  }

  #closed() {
    this.profileReady = false;
    this.emit('connection', { connected: false });
    if (this.intentionalClose) return;
    if (!this.roomCode) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(async () => {
      if (this.intentionalClose || !this.roomCode) return;
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
  createSharedPracticeRoom(name,worldId='castleward') { this.send({type:'createSharedPracticeRoom',name,worldId}); }
  createBreakthroughRoom(name, team = null, botSkill = null, teamSize = null, worldId = null) { this.send({ type: 'createBreakthroughRoom', name, isPrivate: true, ...(team ? { team } : {}), ...(botSkill ? { botSkill } : {}), ...(teamSize ? { teamSize } : {}), ...(worldId ? { worldId } : {}) }); }

  quickPlay(name) { this.send({ type: 'quickPlay', name }); }
  startSolo(mode, name, worldId, botSkill, team = null, teamSize = null) { this.send({ type: 'startSolo', mode, name, worldId, ...(botSkill ? { botSkill } : {}), ...(team ? { team } : {}), ...(teamSize ? { teamSize } : {}) }); }
  joinRoom(code, name) { this.send({ type: 'joinRoom', code: code.trim().toUpperCase(), name }); }
  startMatch() { this.send({ type: 'startMatch' }); }
  arenaReady(ready) { this.send({ type: 'arenaReady', ready: Boolean(ready) }); }
  practiceResetPlayer() { this.send({ type: 'practiceResetPlayer' }); }
  highGroundsBuild(machine) { this.send({ type: 'highGroundsBuild', machine }); }
  practiceSpawnDummy(mode = 'PASSIVE') { this.send({ type: 'practiceSpawnDummy', mode }); }
  practiceRemoveDummy() { this.send({ type: 'practiceRemoveDummy' }); }
  practiceSetDummyMode(mode) { this.send({ type: 'practiceSetDummyMode', mode }); }
  practicePerryAnswer(answer) { this.send({ type: 'practicePerryAnswer', answer }); }
  practicePerryDismiss() { this.send({ type: 'practicePerryDismiss' }); }
  input(input) { this.send({ type: 'input', ...input }); }
  attack(down) { this.send({ type: 'attack', down, clientTime: this.serverNow() }); }
  guard(down) { this.send({ type: 'guard', down, clientTime: this.serverNow() }); }
  cast(direction) { this.send({ type: 'cast', direction, clientTime: this.serverNow() }); }
  castPreparedSpell(spell, direction, input = {}) {
    this.send({ type: 'castPreparedSpell', spell, direction,
      ...(Number.isFinite(input.yaw) ? { yaw: input.yaw } : {}),
      ...(Number.isFinite(input.pitch) ? { pitch: input.pitch } : {}), clientTime: this.serverNow() });
  }
  selectPreparedSlot(slot) { this.send({ type: 'selectPreparedSlot', slot }); }
  castPreparedSlot(slot, direction, input = {}) {
    this.send({ type: 'castPreparedSlot', slot, direction,
      ...(Number.isFinite(input.yaw) ? { yaw: input.yaw } : {}),
      ...(Number.isFinite(input.pitch) ? { pitch: input.pitch } : {}), clientTime: this.serverNow() });
  }
  castCurrentSpell(direction, input = {}) {
    this.send({ type: 'castCurrentSpell', direction,
      ...(Number.isFinite(input.yaw) ? { yaw: input.yaw } : {}),
      ...(Number.isFinite(input.pitch) ? { pitch: input.pitch } : {}), clientTime: this.serverNow() });
  }
  selectPreparedSpell(spell) { this.send({ type: 'selectPreparedSpell', spell }); }
  gauntlet() { this.send({ type: 'gauntlet', clientTime: this.serverNow() }); }
  ultimate() { this.send({ type: 'ultimate' }); }
  practiceReadyUltimate() { this.send({ type: 'practiceReadyUltimate' }); }
  dash(direction) { this.send({ type: 'dash', direction }); }
  rematch() { this.send({ type: 'rematch' }); }
  switchTeam(team = null) { this.send({ type: 'switchTeam', team }); }
  markTarget(targetId = null) { this.send({ type: 'markTarget', targetId }); }
  seekDuel(name) { this.send({ type: 'seekDuel', name }); }
  cancelSeek() { this.send({ type: 'cancelSeek' }); }
  seekBotDuel() { this.send({ type: 'seekBotDuel' }); }
  listRooms() { this.send({ type: 'listRooms' }); }
  createPublicRoom(name) { this.send({ type: 'createPublicRoom', name }); }
  ready(ready) { this.send({ type: 'ready', ready: Boolean(ready) }); }
  vote(key, value) { this.send({ type: 'vote', key, value }); }
  leaveRoom() { this.send({ type: 'leaveRoom' }); }
  // the spell carried from the Armory (kept by the server for every room this connection joins)
  loadout(spell, ultimate, preparedSpells, siegeLoadout) { this.send({ type: 'loadout', spell, ultimate, preparedSpells,
  ...(siegeLoadout!==undefined?{siegeLoadout}:{}) }); }
  ping() { this.send({ type: 'ping', sentAt: performance.now() }); }

  serverNow() {
    if (!this.latestSnapshot) return 0;
    return this.latestSnapshot.serverTime + (performance.now() - this.snapshotReceivedAt) / 1000;
  }

  close({ clearSession = false } = {}) {
    this.intentionalClose = true;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.connectPromise = null;
    this.profileReady = false;
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    if (clearSession) {
      this.playerId = null;
      this.token = null;
      this.roomCode = null;
      this.latestSnapshot = null;
      try {
        localStorage.removeItem('ss-session-token');
        localStorage.removeItem('ss-room-code');
      } catch {}
    }
  }

  disconnect() {
    this.close({ clearSession: true });
  }
}
