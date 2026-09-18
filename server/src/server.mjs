import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { acceptWebSocket } from './websocket.mjs';
import { RoomManager } from './rooms/RoomManager.mjs';
import { beginAttack, endAttack, setGuard, stepRoom, tryCastFireball, tryDash } from './game/combat.mjs';
import { SHATTERED_KEEP } from '../../shared/src/map.mjs';
import { compensatedInputTime } from './game/history.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const TICK_RATE = 30;

function mimeFor(file) {
  const ext = path.extname(file).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
  })[ext] || 'application/octet-stream';
}

export function resolveStaticFile(root, urlPath) {
  const rawPath = String(urlPath || '/').split('?')[0];
  if (rawPath === '/' || rawPath === '/index.html') return path.join(root, 'client', 'index.html');

  let decoded;
  try { decoded = decodeURIComponent(rawPath); } catch { return null; }
  if (decoded.includes('\0')) return null;

  let namespace;
  if (decoded.startsWith('/client/')) namespace = 'client';
  else if (decoded.startsWith('/shared/')) namespace = 'shared';
  else return null;

  const base = path.resolve(root, namespace);
  const relative = decoded.slice(namespace.length + 2);
  if (!relative) return null;
  const candidate = path.resolve(base, relative);
  if (candidate !== base && !candidate.startsWith(`${base}${path.sep}`)) return null;
  return candidate;
}

function serializeLobby(room) {
  return {
    type: 'lobby',
    roomCode: room.code,
    roomState: room.state,
    countdownEndsAt: room.countdownEndsAt,
    players: [...room.players.values()].map((p) => ({ id: p.id, name: p.name, connected: p.connected, kills: p.kills, deaths: p.deaths })),
  };
}

function serializeSnapshot(room, nowSec) {
  return {
    type: 'snapshot',
    tick: room.tickNumber,
    serverTime: nowSec,
    roomCode: room.code,
    roomState: room.state,
    countdownEndsAt: room.countdownEndsAt,
    matchStartedAt: room.matchStartedAt,
    winnerId: room.winnerId,
    suddenDeath: room.suddenDeath,
    players: [...room.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      position: p.position,
      velocity: p.velocity,
      yaw: p.yaw,
      pitch: p.pitch,
      health: p.health,
      guardStamina: p.guardStamina,
      guarding: p.guarding,
      attackActive: p.attackActive,
      attackStartedAt: p.attackStartedAt,
      attackNextStrike: p.attackNextStrike,
      alive: p.alive,
      kills: p.kills,
      deaths: p.deaths,
      parries: p.parries,
      abyssKills: p.abyssKills,
      fireballReadyAt: p.fireballReadyAt,
      dashReadyAt: p.dashReadyAt,
      dashUntil: p.dashUntil,
      staggerUntil: p.staggerUntil,
      spawnProtectionUntil: p.spawnProtectionUntil,
      respawnAt: p.respawnAt,
      lastInputSeq: p.lastInputSeq,
    })),
    projectiles: [...room.projectiles.values()].map((p) => ({ id: p.id, ownerId: p.ownerId, position: p.position, velocity: p.velocity })),
  };
}

export function createGameServer({ port = Number(process.env.PORT || 3001), host = process.env.HOST || '0.0.0.0', world = SHATTERED_KEEP } = {}) {
  const roomManager = new RoomManager();
  const sessions = new Set();
  let tickTimer = null;
  const now = () => performance.now() / 1000;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true, rooms: roomManager.rooms.size }));
      return;
    }
    const filePath = resolveStaticFile(ROOT, url.pathname);
    if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'content-type': mimeFor(filePath), 'cache-control': filePath.endsWith('.html') ? 'no-store' : 'public, max-age=60' });
    fs.createReadStream(filePath).pipe(res);
  });

  function send(session, message) {
    session.peer.sendJson(message);
  }

  function broadcastRoom(room, message) {
    for (const session of sessions) if (session.roomCode === room.code && !session.peer.closed) send(session, message);
  }

  function broadcastLobby(room) {
    broadcastRoom(room, serializeLobby(room));
  }

  function attachPlayer(session, room, player) {
    session.roomCode = room.code;
    session.playerId = player.id;
    send(session, { type: 'joined', playerId: player.id, token: player.token, roomCode: room.code, roomState: room.state });
    broadcastLobby(room);
  }

  function joinNew(session, room, name) {
    const id = crypto.randomUUID();
    const token = crypto.randomUUID();
    const player = room.addPlayer({ id, token, name }, now());
    attachPlayer(session, room, player);
  }

  function sessionRoom(session) {
    return session.roomCode ? roomManager.findByCode(session.roomCode) : null;
  }

  function sessionPlayer(session) {
    const room = sessionRoom(session);
    return room && session.playerId ? room.players.get(session.playerId) : null;
  }

  function handleMessage(session, message) {
    const time = now();
    if (time - session.messageWindowStartedAt >= 1) {
      session.messageWindowStartedAt = time;
      session.messageCount = 0;
    }
    session.messageCount += 1;
    if (session.messageCount > 180) {
      session.peer.close();
      return;
    }
    if (!message || typeof message.type !== 'string') return;
    if (message.type === 'ping') {
      send(session, { type: 'pong', sentAt: message.sentAt, serverTime: time });
      return;
    }
    if (message.type === 'createRoom' && !session.roomCode) {
      const room = roomManager.createPrivateRoom(time);
      joinNew(session, room, message.name);
      return;
    }
    if (message.type === 'quickPlay' && !session.roomCode) {
      const room = roomManager.quickPlay(time);
      joinNew(session, room, message.name);
      return;
    }
    if (message.type === 'joinRoom' && !session.roomCode) {
      const room = roomManager.findByCode(message.code);
      if (!room) { send(session, { type: 'error', message: 'Room not found' }); return; }
      try { joinNew(session, room, message.name); } catch (error) { send(session, { type: 'error', message: error.message }); }
      return;
    }
    if (message.type === 'resume' && !session.roomCode && message.token) {
      for (const room of roomManager.rooms.values()) {
        const player = room.reconnectPlayer(message.token, time);
        if (player) { attachPlayer(session, room, player); return; }
      }
      send(session, { type: 'resumeFailed' });
      return;
    }

    const room = sessionRoom(session);
    const player = sessionPlayer(session);
    if (!room || !player) return;

    switch (message.type) {
      case 'input': {
        player.lastInputSeq = Number.isFinite(message.seq) ? message.seq : player.lastInputSeq;
        player.input = {
          forward: Math.max(-1, Math.min(1, Number(message.forward) || 0)),
          right: Math.max(-1, Math.min(1, Number(message.right) || 0)),
          jump: Boolean(message.jump),
          yaw: Number.isFinite(message.yaw) ? message.yaw : player.yaw,
          pitch: Number.isFinite(message.pitch) ? Math.max(-1.45, Math.min(1.45, message.pitch)) : player.pitch,
        };
        break;
      }
      case 'attack': {
        const inputTime = compensatedInputTime(message.clientTime, time);
        message.down ? beginAttack(room, player.id, inputTime) : endAttack(room, player.id, time);
        break;
      }
      case 'guard': setGuard(room, player.id, Boolean(message.down), compensatedInputTime(message.clientTime, time)); break;
      case 'cast': tryCastFireball(room, player.id, message.direction || { x: 0, y: 0, z: -1 }, time); break;
      case 'dash': tryDash(room, player.id, message.direction || { x: 0, z: -1 }, time); break;
      case 'rematch': room.requestRematch(player.id, time); break;
      default: break;
    }
  }

  server.on('upgrade', (req, socket) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname !== '/ws') { socket.destroy(); return; }
    const peer = acceptWebSocket(req, socket);
    if (!peer) return;
    const session = { peer, roomCode: null, playerId: null, messageWindowStartedAt: now(), messageCount: 0 };
    sessions.add(session);
    peer.onMessage = (message) => handleMessage(session, message);
    peer.onClose = () => {
      sessions.delete(session);
      const room = sessionRoom(session);
      if (room && session.playerId) {
        room.disconnectPlayer(session.playerId, now());
        broadcastLobby(room);
      }
    };
    send(session, { type: 'hello', serverTime: now() });
  });

  function tick() {
    const time = now();
    for (const room of roomManager.rooms.values()) {
      stepRoom(room, 1 / TICK_RATE, time, world);
      const events = room.events.splice(0);
      if (events.length) broadcastRoom(room, { type: 'events', events });
      broadcastRoom(room, serializeSnapshot(room, time));
    }
    roomManager.cleanup(time);
  }

  return {
    roomManager,
    now,
    start() {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.off('error', reject);
          tickTimer = setInterval(tick, 1000 / TICK_RATE);
          resolve();
        });
      });
    },
    stop() {
      if (tickTimer) clearInterval(tickTimer);
      for (const session of sessions) session.peer.close();
      return new Promise((resolve) => server.close(() => resolve()));
    },
    address() {
      const addr = server.address();
      if (!addr || typeof addr === 'string') return { host, port };
      return { host: addr.address, port: addr.port };
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const game = createGameServer();
  game.start().then(() => {
    const address = game.address();
    console.log(`Swords & Sorcery server listening on http://${address.host}:${address.port}`);
  });
}
