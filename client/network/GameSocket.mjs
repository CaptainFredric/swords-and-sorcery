import { clearExpiredSession } from './sessionState.mjs';

export class GameSocket {
  constructor() {
    this.ws = null;
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

  async connect({ resume = true } = {}) {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    this.intentionalClose = false;
    const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${scheme}//${location.host}/ws`);
    this.ws = ws;
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    ws.addEventListener('message', (event) => this.#message(event));
    ws.addEventListener('close', () => this.#closed());
    if (resume && this.token) this.send({ type: 'resume', token: this.token });
  }

  #message(event) {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.type === 'joined') {
      this.playerId = message.playerId;
      this.token = message.token;
      this.roomCode = message.roomCode;
      localStorage.setItem('ss-session-token', message.token);
      localStorage.setItem('ss-room-code', message.roomCode);
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
  startSolo(mode, name) { this.send({ type: 'startSolo', mode, name }); }
  joinRoom(code, name) { this.send({ type: 'joinRoom', code: code.trim().toUpperCase(), name }); }
  practiceResetPlayer() { this.send({ type: 'practiceResetPlayer' }); }
  practiceSpawnDummy(mode = 'PASSIVE') { this.send({ type: 'practiceSpawnDummy', mode }); }
  practiceRemoveDummy() { this.send({ type: 'practiceRemoveDummy' }); }
  practiceSetDummyMode(mode) { this.send({ type: 'practiceSetDummyMode', mode }); }
  input(input) { this.send({ type: 'input', ...input }); }
  attack(down) { this.send({ type: 'attack', down, clientTime: this.serverNow() }); }
  guard(down) { this.send({ type: 'guard', down, clientTime: this.serverNow() }); }
  cast(direction) { this.send({ type: 'cast', direction }); }
  dash(direction) { this.send({ type: 'dash', direction }); }
  rematch() { this.send({ type: 'rematch' }); }
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
