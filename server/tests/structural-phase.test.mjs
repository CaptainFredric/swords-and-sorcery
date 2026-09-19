import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameServer } from '../src/server.mjs';

function waitOpen(ws) {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) { resolve(); return; }
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
}

function waitFor(ws, predicate, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeEventListener('message', onMessage);
      reject(new Error('Timed out waiting for structural WebSocket message'));
    }, timeoutMs);
    function onMessage(event) {
      const message = JSON.parse(String(event.data));
      if (!predicate(message)) return;
      clearTimeout(timer);
      ws.removeEventListener('message', onMessage);
      resolve(message);
    }
    ws.addEventListener('message', onMessage);
  });
}

function send(ws, message) { ws.send(JSON.stringify(message)); }

function waitUntil(predicate, timeoutMs = 1500) {
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (predicate()) { resolve(); return; }
      if (performance.now() - started >= timeoutMs) { reject(new Error('Timed out waiting for authoritative state')); return; }
      setTimeout(poll, 10);
    };
    poll();
  });
}

async function connect(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const helloP = waitFor(ws, (m) => m.type === 'hello');
  await waitOpen(ws);
  await helloP;
  return ws;
}

async function startServer(t) {
  const game = createGameServer({ port: 0, host: '127.0.0.1' });
  await game.start();
  t.after(async () => game.stop());
  return { game, port: game.address().port };
}

function closeLater(t, ...sockets) {
  t.after(() => {
    for (const ws of sockets) if (ws && ws.readyState < WebSocket.CLOSING) ws.close();
  });
}

test('one FFA human waits, second human can start, and snapshots expose structural identity', async (t) => {
  const { game, port } = await startServer(t);
  const alice = await connect(port);
  const bob = await connect(port);
  closeLater(t, alice, bob);

  const aliceJoinedP = waitFor(alice, (m) => m.type === 'joined');
  send(alice, { type: 'createRoom', name: 'Alice' });
  const aliceJoined = await aliceJoinedP;
  const room = game.roomManager.findByCode(aliceJoined.roomCode);
  assert.equal(room.mode, 'FFA');
  assert.equal(room.worldId, 'castleward');
  assert.equal(room.state, 'WAITING');

  const waitingSnapshotP = waitFor(alice, (m) => m.type === 'snapshot' && m.roomState === 'WAITING');
  const waiting = await waitingSnapshotP;
  assert.equal(waiting.mode, 'FFA');
  assert.equal(waiting.worldId, 'castleward');
  assert.equal(waiting.players.length, 1);
  assert.equal(waiting.players[0].actorKind, 'human');

  const bobJoinedP = waitFor(bob, (m) => m.type === 'joined');
  send(bob, { type: 'joinRoom', code: aliceJoined.roomCode, name: 'Bob' });
  await bobJoinedP;
  assert.equal(room.state, 'COUNTDOWN');
  room.countdownEndsAt = game.now() - 0.01;
  const playing = await waitFor(alice, (m) => m.type === 'snapshot' && m.roomState === 'PLAYING');
  assert.equal(playing.players.filter((p) => p.actorKind === 'human').length, 2);
});

test('one Bot Duel human waits for arena readiness, then arms the normal countdown with one bot', async (t) => {
  const { game, port } = await startServer(t);
  const ws = await connect(port);
  closeLater(t, ws);

  const joinedP = waitFor(ws, (m) => m.type === 'joined');
  send(ws, { type: 'startSolo', mode: 'BOT_DUEL', name: 'Duelist' });
  const joined = await joinedP;
  const room = game.roomManager.findByCode(joined.roomCode);
  assert.equal(room.state, 'WAITING');
  assert.equal([...room.players.values()].filter((p) => p.actorKind === 'human').length, 1);
  assert.equal([...room.players.values()].filter((p) => p.actorKind === 'bot').length, 1);

  const countdownP = waitFor(ws, (m) => m.type === 'lobby' && m.roomState === 'COUNTDOWN');
  send(ws, { type: 'arenaReady', ready: true });
  await countdownP;
  assert.equal(room.state, 'COUNTDOWN');
  room.countdownEndsAt = game.now() - 0.01;

  const playing = await waitFor(ws, (m) => m.type === 'snapshot' && m.roomState === 'PLAYING' && m.mode === 'BOT_DUEL');
  assert.equal(joined.worldId, 'castleward');
  assert.equal(playing.players.filter((p) => p.actorKind === 'human').length, 1);
  assert.equal(playing.players.filter((p) => p.actorKind === 'bot').length, 1);
  assert.equal(playing.players.length, 2);
});

test('one Practice human starts immediately with no server actor until a dummy is requested', async (t) => {
  const { port } = await startServer(t);
  const ws = await connect(port);
  closeLater(t, ws);

  const joinedP = waitFor(ws, (m) => m.type === 'joined');
  const playingP = waitFor(ws, (m) => m.type === 'snapshot' && m.roomState === 'PLAYING' && m.mode === 'PRACTICE');
  send(ws, { type: 'startSolo', mode: 'PRACTICE', name: 'Student' });
  await joinedP;
  const playing = await playingP;
  assert.equal(playing.players.length, 1);
  assert.equal(playing.players[0].actorKind, 'human');

  const dummySnapshotP = waitFor(ws, (m) => m.type === 'snapshot' && m.players.some((p) => p.actorKind === 'dummy'));
  send(ws, { type: 'practiceSpawnDummy', mode: 'PASSIVE' });
  const withDummy = await dummySnapshotP;
  assert.equal(withDummy.players.filter((p) => p.actorKind === 'dummy').length, 1);
});

test('Quick Play never attaches a human to an existing solo room', async (t) => {
  const { port } = await startServer(t);
  const solo = await connect(port);
  const publicPlayer = await connect(port);
  closeLater(t, solo, publicPlayer);
  const soloJoinedP = waitFor(solo, (m) => m.type === 'joined');
  send(solo, { type: 'startSolo', mode: 'PRACTICE', name: 'Solo' });
  const soloJoined = await soloJoinedP;
  const publicJoinedP = waitFor(publicPlayer, (m) => m.type === 'joined');
  send(publicPlayer, { type: 'quickPlay', name: 'Public' });
  const publicJoined = await publicJoinedP;
  assert.notEqual(publicJoined.roomCode, soloJoined.roomCode);
  assert.equal(publicJoined.mode, 'FFA');
});

test('Practice commands are rejected in FFA without mutating room actors', async (t) => {
  const { game, port } = await startServer(t);
  const ws = await connect(port);
  closeLater(t, ws);
  const joinedP = waitFor(ws, (m) => m.type === 'joined');
  send(ws, { type: 'createRoom', name: 'Alice' });
  const joined = await joinedP;
  const room = game.roomManager.findByCode(joined.roomCode);
  const beforeSize = room.players.size;
  const errorP = waitFor(ws, (m) => m.type === 'error' && /Practice command unavailable/.test(m.message));
  send(ws, { type: 'practiceSpawnDummy', mode: 'PASSIVE' });
  await errorP;
  assert.equal(room.players.size, beforeSize);
  assert.equal([...room.players.values()].some((p) => p.actorKind === 'dummy'), false);
});

test('solo reconnect resumes the same room, mode, world and human identity', async (t) => {
  const { game, port } = await startServer(t);
  const first = await connect(port);
  const joinedP = waitFor(first, (m) => m.type === 'joined');
  send(first, { type: 'startSolo', mode: 'PRACTICE', name: 'Returner' });
  const joined = await joinedP;
  const room = game.roomManager.findByCode(joined.roomCode);
  const originalId = joined.playerId;
  first.close();
  await waitUntil(() => room.players.get(originalId)?.connected === false);
  const resumed = await connect(port);
  closeLater(t, resumed);
  const resumedJoinedP = waitFor(resumed, (m) => m.type === 'joined');
  send(resumed, { type: 'resume', token: joined.token });
  const resumedJoined = await resumedJoinedP;
  assert.equal(resumedJoined.roomCode, joined.roomCode);
  assert.equal(resumedJoined.playerId, originalId);
  assert.equal(resumedJoined.mode, 'PRACTICE');
  assert.equal(resumedJoined.worldId, 'castleward');
});

test('malformed solo mode and attempted client world injection cannot create or mutate room identity', async (t) => {
  const { game, port } = await startServer(t);
  const invalid = await connect(port);
  const injected = await connect(port);
  closeLater(t, invalid, injected);
  const beforeRooms = game.roomManager.rooms.size;
  const errorP = waitFor(invalid, (m) => m.type === 'error' && /Unknown solo mode/.test(m.message));
  send(invalid, { type: 'startSolo', mode: 'GOD_MODE', worldId: 'shattered-keep', name: 'Nope' });
  await errorP;
  assert.equal(game.roomManager.rooms.size, beforeRooms);
  const joinedP = waitFor(injected, (m) => m.type === 'joined');
  send(injected, { type: 'startSolo', mode: 'PRACTICE', worldId: 'shattered-keep', name: 'Injected' });
  const joined = await joinedP;
  assert.equal(joined.worldId, 'castleward');
  const room = game.roomManager.findByCode(joined.roomCode);
  assert.equal(room.worldId, 'castleward');
});

test('invalid dummy mode is rejected without replacing or mutating the current Practice dummy', async (t) => {
  const { game, port } = await startServer(t);
  const ws = await connect(port);
  closeLater(t, ws);
  const joinedP = waitFor(ws, (m) => m.type === 'joined');
  send(ws, { type: 'startSolo', mode: 'PRACTICE', name: 'Trainer' });
  const joined = await joinedP;
  const room = game.roomManager.findByCode(joined.roomCode);
  const passiveP = waitFor(ws, (m) => m.type === 'snapshot' && m.players.some((p) => p.actorKind === 'dummy'));
  send(ws, { type: 'practiceSpawnDummy', mode: 'PASSIVE' });
  await passiveP;
  const dummy = [...room.players.values()].find((p) => p.actorKind === 'dummy');
  assert.ok(dummy);
  assert.equal(dummy.practiceMode, 'PASSIVE');
  const errorP = waitFor(ws, (m) => m.type === 'error' && /Practice command unavailable/.test(m.message));
  send(ws, { type: 'practiceSetDummyMode', mode: 'PERFECT_PARRY_BOT' });
  await errorP;
  const after = [...room.players.values()].filter((p) => p.actorKind === 'dummy');
  assert.equal(after.length, 1);
  assert.equal(after[0].id, dummy.id);
  assert.equal(after[0].practiceMode, 'PASSIVE');
});
