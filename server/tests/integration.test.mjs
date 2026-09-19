import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameServer } from '../src/server.mjs';

function waitOpen(ws) {
  return new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
}

function waitFor(ws, predicate, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeEventListener('message', onMessage);
      reject(new Error('Timed out waiting for websocket message'));
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

function waitUntil(predicate, timeoutMs = 1000) {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve();
      } else if (performance.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error('Timed out waiting for authoritative state change'));
      }
    }, 10);
  });
}

function send(ws, message) {
  ws.send(JSON.stringify(message));
}

test('two websocket clients can create, join, start and exchange authoritative combat state', async (t) => {
  const game = createGameServer({ port: 0, host: '127.0.0.1' });
  await game.start();
  t.after(async () => game.stop());
  const { port } = game.address();

  const alice = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const bob = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  t.after(() => { alice.close(); bob.close(); });
  await Promise.all([waitOpen(alice), waitOpen(bob)]);

  const aliceJoinedP = waitFor(alice, (m) => m.type === 'joined');
  send(alice, { type: 'createRoom', name: 'Alice' });
  const aliceJoined = await aliceJoinedP;
  assert.match(aliceJoined.roomCode, /^[A-Z]{4}[2-9]$/);

  const bobJoinedP = waitFor(bob, (m) => m.type === 'joined');
  send(bob, { type: 'joinRoom', code: aliceJoined.roomCode, name: 'Bob' });
  const bobJoined = await bobJoinedP;
  assert.equal(bobJoined.roomCode, aliceJoined.roomCode);

  const room = game.roomManager.findByCode(aliceJoined.roomCode);
  assert.equal(room.state, 'COUNTDOWN');
  room.countdownEndsAt = game.now() - 0.001;
  const playingP = waitFor(alice, (m) => m.type === 'snapshot' && m.roomState === 'PLAYING');
  const playing = await playingP;
  assert.equal(playing.players.length, 2);

  const a = room.players.get(aliceJoined.playerId);
  const b = room.players.get(bobJoined.playerId);
  Object.assign(a.position, { x: -4, y: 0, z: 0 });
  Object.assign(b.position, { x: -2, y: 0, z: 0 });
  a.yaw = -Math.PI / 2; a.input.yaw = a.yaw; a.spawnProtectionUntil = 0;
  b.yaw = Math.PI / 2; b.input.yaw = b.yaw; b.spawnProtectionUntil = 0;

  const damageP = waitFor(alice, (m) => m.type === 'events' && m.events.some((e) => e.type === 'damage'), 2500);
  send(alice, { type: 'attack', down: true });
  const damageBatch = await damageP;
  const damage = damageBatch.events.find((e) => e.type === 'damage');
  assert.equal(damage.attackerId, aliceJoined.playerId);
  assert.equal(damage.victimId, bobJoined.playerId);
  assert.equal(damage.amount, 34);

  const pongP = waitFor(bob, (m) => m.type === 'pong');
  send(bob, { type: 'ping', sentAt: 123 });
  const pong = await pongP;
  assert.equal(pong.sentAt, 123);
});

test('one websocket can start Practice immediately and resume the same solo room', async (t) => {
  const game = createGameServer({ port: 0, host: '127.0.0.1' });
  await game.start();
  t.after(async () => game.stop());
  const { port } = game.address();

  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await waitOpen(ws);

  const joinedP = waitFor(ws, (m) => m.type === 'joined');
  const playingP = waitFor(ws, (m) => m.type === 'snapshot' && m.roomState === 'PLAYING' && m.mode === 'PRACTICE');
  send(ws, { type: 'startSolo', mode: 'PRACTICE', name: 'Aden' });
  const joined = await joinedP;
  const playing = await playingP;

  assert.equal(joined.mode, 'PRACTICE');
  assert.equal(joined.worldId, 'shattered-keep');
  assert.equal(playing.players.filter((p) => p.actorKind === 'human').length, 1);

  const room = game.roomManager.findByCode(joined.roomCode);
  ws.close();
  await waitUntil(() => room.players.get(joined.playerId)?.connected === false);

  const resumed = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  t.after(() => resumed.close());
  await waitOpen(resumed);
  const resumedJoinedP = waitFor(resumed, (m) => m.type === 'joined');
  send(resumed, { type: 'resume', token: joined.token });
  const resumedJoined = await resumedJoinedP;

  assert.equal(resumedJoined.roomCode, joined.roomCode);
  assert.equal(resumedJoined.mode, 'PRACTICE');
  assert.equal(resumedJoined.worldId, 'shattered-keep');
});

test('server closes a websocket that sends an oversized message', async (t) => {
  const game = createGameServer({ port: 0, host: '127.0.0.1' });
  await game.start();
  t.after(async () => game.stop());
  const { port } = game.address();

  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await waitOpen(ws);
  t.after(() => ws.close());

  const closed = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('oversized websocket stayed open')), 750);
    ws.addEventListener('close', () => { clearTimeout(timer); resolve(); }, { once: true });
  });

  ws.send(JSON.stringify({ type: 'oversized', payload: 'x'.repeat(70 * 1024) }));
  await closed;
});

test('server closes a websocket that floods messages far above gameplay rate', async (t) => {
  const game = createGameServer({ port: 0, host: '127.0.0.1' });
  await game.start();
  t.after(async () => game.stop());
  const { port } = game.address();

  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await waitOpen(ws);
  t.after(() => ws.close());

  const closed = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('message flood connection stayed open')), 1000);
    ws.addEventListener('close', () => { clearTimeout(timer); resolve(); }, { once: true });
  });

  for (let i = 0; i < 220; i += 1) ws.send(JSON.stringify({ type: 'ping', sentAt: i }));
  await closed;
});
