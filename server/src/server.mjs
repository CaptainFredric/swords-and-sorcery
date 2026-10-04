import { observeChallengeFacts, challengeProgressFor } from '../../shared/sim/challenges.mjs';
import { eligibleChallengeParticipant } from './challengeSettlement.mjs';
import { applySavedLoadout } from './savedLoadout.mjs';
import http from 'node:http';
import { ProfileStore, assessMatchReward } from './ProfileStore.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { acceptWebSocket } from './websocket.mjs';
import { RoomManager } from '../../shared/sim/RoomManager.mjs';
import { Matchmaker } from './rooms/Matchmaker.mjs';
import { stepRoom } from '../../shared/sim/combat.mjs';
import { applyRoomCommand, serializeLobby, serializeSnapshot } from '../../shared/sim/wire.mjs';
import { DEFAULT_SPELL, isSpell } from '../../shared/src/spells.mjs';
import { stepBotControllers } from '../../shared/sim/BotController.mjs';
import { spawnPracticeDummy, stepPracticeActors } from '../../shared/sim/practice.mjs';
import { GAME_MODES, arenaOrDefault } from '../../shared/src/modes.mjs';
import { DEFAULT_ULTIMATE, isUltimate } from '../../shared/src/ultimates.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const TICK_RATE = 30;
const SOLO_MODES = new Set([GAME_MODES.BOT_DUEL, GAME_MODES.PRACTICE]);
const IS_DIRECT_EXECUTION = typeof process.argv[1] === 'string'
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

export function mimeFor(file) {
  const ext = path.extname(file).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.m4a': 'audio/mp4',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
  })[ext] || 'application/octet-stream';
}

// Revisioned assets (the character GLBs are requested as ?v=<source sha>) never change under the same URL, so the
// browser keeps them; everything else revalidates cheaply against its modification time.
export function cacheControlFor(filePath, searchParams) {
  if (filePath.endsWith('.html')) return 'no-store';
  if (searchParams?.has?.('v') && /\.(glb|gltf|png|jpg|webp)$/i.test(filePath)) return 'public, max-age=31536000, immutable';
  return 'public, max-age=60';
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

export function createGameServer({ port = Number(process.env.PORT || 3001), host = process.env.HOST || '0.0.0.0',
  profileStore = new ProfileStore(process.env.RENOWN_DATA_DIR || path.join(ROOT, '.data', 'renown')) } = {}) {
  const roomManager = new RoomManager();
  const matchmaker = new Matchmaker();
  const sessions = new Set();
  const sessionsById = new Map();
  const pendingRewards = new Map();
  let lastSeekBroadcastAt = 0;
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
    const stat = fs.statSync(filePath);
    const lastModified = new Date(Math.floor(stat.mtimeMs / 1000) * 1000).toUTCString();
    const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    // content-length lets the page show real download progress for the character models
    const headers = { 'content-type': mimeFor(filePath), 'cache-control': cacheControlFor(filePath, url.searchParams), 'content-length': stat.size };
    if (!filePath.endsWith('.html')) Object.assign(headers, { 'last-modified': lastModified, etag });
    if (!filePath.endsWith('.html') && (req.headers['if-none-match'] === etag
      || (!req.headers['if-none-match'] && req.headers['if-modified-since'] === lastModified))) {
      delete headers['content-length'];
      res.writeHead(304, headers);
      res.end();
      return;
    }
    res.writeHead(200, headers);
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
    if (session.profileToken) {
      player.profileToken = session.profileToken;
      player.cloth = profileStore.open(session.profileToken).profile.equipped;
    }
    session.roomCode = room.code;
    session.playerId = player.id;
    send(session, {
      type: 'joined',
      playerId: player.id,
      token: player.token,
      roomCode: room.code,
    hostId: room.hostId(),
      roomState: room.state,
      mode: room.mode,
      worldId: room.worldId,
    });
    broadcastLobby(room);
  }

  // a new Spellblade in a room, carrying the spell its player chose in the Armory
  function createNetworkPlayer(session, room, name) {
    const id = crypto.randomUUID();
    const token = crypto.randomUUID();
    return room.addPlayer({ id, token, name, spell: session.spell, ultimate: session.ultimate, preparedSpells: session.preparedSpells }, now());
  }

  function joinNew(session, room, name) {
    const player = createNetworkPlayer(session, room, name);
    attachPlayer(session, room, player);
  }

  // a Spellblade leaves their room for good (to seek a duel, change rooms or return to the menu)
  function leaveRoom(session, time) {
    const room = sessionRoom(session);
    if (room && session.playerId) {
      room.removePlayer(session.playerId, time);
      // a solo room (practice yard or bot duel) has no reason to outlive its only Spellblade
      if (SOLO_MODES.has(room.mode) && room.humanActorCount() === 0) roomManager.rooms.delete(room.code);
      else broadcastLobby(room);
    }
    session.roomCode = null;
    session.playerId = null;
  }

  // the practice yard a seeker waits in: a training dummy to hit while the queue works
  function enterPracticeYard(session, name, time) {
    const room = roomManager.createSoloRoom(GAME_MODES.PRACTICE, time);
    const player = createNetworkPlayer(session, room, name);
    room.armAutoStart(time);
    spawnPracticeDummy(room, 'PASSIVE', time);
    attachPlayer(session, room, player);
  }

  function sendSeeking(session, time) {
    const entry = matchmaker.entry(session.id);
    send(session, {
      type: 'seeking',
      active: Boolean(entry),
      since: entry?.since ?? null,
      others: Math.max(0, matchmaker.size - (entry ? 1 : 0)),
      botOffer: Boolean(entry?.botOffered),
      serverTime: time,
    });
  }

  // pair seekers into fresh duel rooms; offer a bot to anyone who has waited long
  function runMatchmaking(time) {
    for (const [a, b] of matchmaker.takePairs()) {
      const first = sessionsById.get(a.key);
      const second = sessionsById.get(b.key);
      if (!first || first.peer.closed) { if (second && !second.peer.closed) matchmaker.requeueFront(b); continue; }
      if (!second || second.peer.closed) { matchmaker.requeueFront(a); continue; }
      const room = roomManager.createDuelRoom(time);
      for (const [session, entry, opponent] of [[first, a, b], [second, b, a]]) {
        leaveRoom(session, time);
        joinNew(session, room, entry.name);
        send(session, { type: 'duelFound', opponent: opponent.name, roomCode: room.code });
        sendSeeking(session, time);
      }
      room.armAutoStart(time);
      broadcastLobby(room);
    }
    for (const entry of matchmaker.dueBotOffers(time)) {
      const session = sessionsById.get(entry.key);
      if (session) sendSeeking(session, time);
    }
    if (time - lastSeekBroadcastAt >= 2) {
      lastSeekBroadcastAt = time;
      for (const entry of matchmaker.queue) {
        const session = sessionsById.get(entry.key);
        if (session) sendSeeking(session, time);
      }
    }
  }

  function sessionRoom(session) {
    return session.roomCode ? roomManager.findByCode(session.roomCode) : null;
  }

  function sessionPlayer(session) {
    const room = sessionRoom(session);
    return room && session.playerId ? room.players.get(session.playerId) : null;
  }

  function publishProfile(token, profile, extra = {}) {
    for (const room of roomManager.rooms.values()) {
      for (const player of room.players.values()) if (player.profileToken === token) player.cloth = profile.equipped;
    }
    for (const session of sessions) if (session.profileToken === token) send(session, { type: 'profile', profile, ...extra });
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
    if (['profileHello', 'purchaseCloth', 'equipCloth'].includes(message.type)) {
      try {
        if (message.type === 'profileHello') {
          // A connection may establish one identity only; reconnect to change identities.
          if (session.profileToken) {
            send(session, { type: 'profile', ...profileStore.open(session.profileToken) });
          } else {
            const result = profileStore.open(message.token || null);
            session.profileToken = result.token || message.token;
            send(session, { type: 'profile', ...result });
          }
        } else {
          if (!session.profileToken) throw new Error('Connect your guest profile first.');
          const profile = message.type === 'purchaseCloth'
            ? profileStore.purchase(session.profileToken, message.cloth)
            : profileStore.equip(session.profileToken, message.cloth);
          publishProfile(session.profileToken, profile);
        }
      } catch (error) {
        send(session, { type: 'profileError', message: error.code ? 'Renown storage unavailable. Please retry later.' : error.message });
      }
      return;
    }
    if (message.type === 'loadout') {
      const room = sessionRoom(session);
      applySavedLoadout(session, room, room?.players.get(session.playerId), message);
      return;
    }
    if (message.type === 'seekDuel') {
      // wait in a practice yard while the server-wide queue finds a challenger
      const name = String(message.name || 'Spellblade').trim().slice(0, 18) || 'Spellblade';
      const room = sessionRoom(session);
      if (!room || room.mode !== GAME_MODES.PRACTICE) {
        if (room) leaveRoom(session, time);
        enterPracticeYard(session, name, time);
      }
      matchmaker.enqueue(session.id, name, time);
      sendSeeking(session, time);
      return;
    }
    if (message.type === 'cancelSeek') {
      matchmaker.cancel(session.id);
      sendSeeking(session, time);
      return;
    }
    if (message.type === 'seekBotDuel') {
      // fight a bot while still in the queue
      const entry = matchmaker.entry(session.id);
      if (!entry) return;
      leaveRoom(session, time);
      const room = roomManager.createSoloRoom(GAME_MODES.BOT_DUEL, time);
      const player = createNetworkPlayer(session, room, entry.name);
      room.provisionModeActors(time);
      room.armAutoStart(time);
      attachPlayer(session, room, player);
      sendSeeking(session, time);
      return;
    }
    if (message.type === 'leaveRoom') {
      matchmaker.cancel(session.id);
      leaveRoom(session, time);
      send(session, { type: 'left' });
      return;
    }
    if (message.type === 'listRooms') {
      send(session, { type: 'roomList', rooms: roomManager.listPublicRooms(time), serverTime: time });
      return;
    }
    if (message.type === 'createPublicRoom' && !session.roomCode) {
      const room = roomManager.createPublicRoom(time);
      joinNew(session, room, message.name);
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
    if (message.type === 'startSolo' && !session.roomCode) {
      if (!SOLO_MODES.has(message.mode)) {
        send(session, { type: 'error', message: 'Unknown solo mode' });
        return;
      }
      const room = roomManager.createSoloRoom(message.mode, time, arenaOrDefault(message.worldId));
      const player = createNetworkPlayer(session, room, message.name);
      room.provisionModeActors(time);
      room.armAutoStart(time);
      attachPlayer(session, room, player);
      return;
    }
    if (message.type === 'joinRoom' && !session.roomCode) {
      const room = roomManager.findByCode(message.code);
      if (!room) { send(session, { type: 'error', message: 'Room not found' }); return; }
      if (room.mode !== GAME_MODES.FFA) { send(session, { type: 'error', message: 'Room is not joinable' }); return; }
      try { joinNew(session, room, message.name); } catch (error) { send(session, { type: 'error', message: error.message }); }
      return;
    }
    if (message.type === 'resume' && !session.roomCode && message.token) {
      for (const room of roomManager.rooms.values()) {
        const candidate = [...room.players.values()].find((p) => p.token === message.token);
        if (candidate?.profileToken && candidate.profileToken !== session.profileToken) continue;
        const player = room.reconnectPlayer(message.token, time);
        if (player) { attachPlayer(session, room, player); return; }
      }
      send(session, { type: 'resumeFailed' });
      return;
    }

    const room = sessionRoom(session);
    const player = sessionPlayer(session);
    if (!room || !player) return;

    const result = applyRoomCommand(room, player, message, time);
    if (result.rejected) send(session, { type: 'error', message: result.rejected });
    else if (result.lobby) broadcastLobby(room);
  }

  server.on('upgrade', (req, socket) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname !== '/ws') { socket.destroy(); return; }
    const peer = acceptWebSocket(req, socket);
    if (!peer) return;
    const session = { id: crypto.randomUUID(), peer, roomCode: null, playerId: null, spell: DEFAULT_SPELL, messageWindowStartedAt: now(), messageCount: 0 };
    sessions.add(session);
    sessionsById.set(session.id, session);
    peer.onMessage = (message) => handleMessage(session, message);
    peer.onClose = () => {
      sessions.delete(session);
      sessionsById.delete(session.id);
      matchmaker.cancel(session.id);
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
      stepBotControllers(room, time, room.world);
      stepPracticeActors(room, time, room.world);
      stepRoom(room, 1 / TICK_RATE, time, room.world);
      observeChallengeFacts(room);
      const events = room.events.splice(0);
      for (const event of events) {
        if (event.type === 'matchStarted') room.rewardMatchId = crypto.randomUUID();
        if (event.type === 'matchEnded' && room.rewardMatchId) {
          for (const player of room.players.values()) {
            if (!player.profileToken) continue;
            const key = `${room.rewardMatchId}:${profileStore.key(player.profileToken)}`;
            // Capture the result now: a later rematch, departure or retry cannot change this reward.
            if (!pendingRewards.has(key)) pendingRewards.set(key, {
              token: player.profileToken, matchId: room.rewardMatchId,
              ...assessMatchReward(room, player, event.at),
              challengeProgress: eligibleChallengeParticipant(room, player) ? { ...challengeProgressFor(room, player.id) } : {},
              completedAt: Date.now(), retryAt: 0,
            });
          }
        }
      }
      if (events.length) broadcastRoom(room, { type: 'events', events });
      broadcastRoom(room, serializeSnapshot(room, time));
    }
    for (const [key, reward] of pendingRewards) {
      if (time < reward.retryAt) continue;
      try {
        publishProfile(reward.token, profileStore.settleMatch(reward.token, reward.matchId, reward.amount, reward.challengeProgress, reward));
        pendingRewards.delete(key);
      } catch {
        reward.retryAt = time + 5;
        for (const session of sessions) if (session.profileToken === reward.token)
          send(session, { type: 'profileError', message: 'Reward storage is temporarily unavailable. Your match reward will retry shortly.' });
      }
    }
    runMatchmaking(time);
    roomManager.cleanup(time);
  }

  return {
    roomManager,
    matchmaker,
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

if (IS_DIRECT_EXECUTION) {
  const game = createGameServer();
  game.start().then(() => {
    const address = game.address();
    console.log(`Swords & Sorcery server listening on http://${address.host}:${address.port}`);
  });
}
