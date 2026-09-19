import assert from 'node:assert/strict';
import { createGameServer } from '../server/src/server.mjs';

function waitOpen(ws) {
  return new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
}

function waitForMessage(ws, predicate, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for WebSocket smoke message')), timeoutMs);
    ws.addEventListener('message', function onMessage(event) {
      const message = JSON.parse(String(event.data));
      if (!predicate(message)) return;
      clearTimeout(timer);
      ws.removeEventListener('message', onMessage);
      resolve(message);
    });
  });
}

const game = createGameServer({ port: 0, host: '127.0.0.1' });
await game.start();
const { port } = game.address();
const base = `http://127.0.0.1:${port}`;

try {
  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true, rooms: 0 });

  const index = await fetch(`${base}/`);
  assert.equal(index.status, 200);
  const shell = await index.text();
  assert.match(shell, /SWORDS[\s\S]*SORCERY/i);
  assert.match(shell, /BOT DUEL/i);
  assert.match(shell, /PRACTICE YARD/i);
  assert.match(shell, /CASTLEWARD/i);

  const clientModule = await fetch(`${base}/client/main.mjs`);
  assert.equal(clientModule.status, 200);
  assert.match(clientModule.headers.get('content-type') ?? '', /javascript/);

  const castlewardWorld = await fetch(`${base}/shared/worlds/castleward.mjs`);
  assert.equal(castlewardWorld.status, 200);
  assert.match(castlewardWorld.headers.get('content-type') ?? '', /javascript/);

  const privateFile = await fetch(`${base}/package.json`);
  assert.equal(privateFile.status, 404);

  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await waitOpen(ws);
  try {
    const hello = await waitForMessage(ws, (message) => message.type === 'hello');
    assert.equal(hello.type, 'hello');
    assert.equal(typeof hello.serverTime, 'number');
  } finally {
    ws.close();
  }

  console.log(`Smoke OK: Castleward/solo shell, HTTP assets, private-path isolation, health, and WebSocket handshake on port ${port}`);
} finally {
  await game.stop();
}
