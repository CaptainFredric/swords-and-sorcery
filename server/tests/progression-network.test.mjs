import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createGameServer } from '../src/server.mjs';
import { ProfileStore } from '../src/ProfileStore.mjs';

function inbox(ws) {
  const messages = [];
  ws.addEventListener('message', (e) => messages.push(JSON.parse(e.data)));
  return async (type, predicate = () => true) => {
    const end = Date.now() + 3000;
    while (Date.now() < end) {
      const i = messages.findIndex((m) => m.type === type && predicate(m));
      if (i >= 0) return messages.splice(i, 1)[0];
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`Missing ${type}`);
  };
}
const send = (ws, value) => ws.send(JSON.stringify(value));
test('earned wallet, purchase, equip, observer replication and fresh connection use one guest identity', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'renown-wire-'));
  const store = new ProfileStore(dir);
  const game = createGameServer({ port: 0, host: '127.0.0.1', profileStore: store });
  await game.start();
  const sockets = [];
  t.after(async () => { sockets.forEach((s) => s.close()); await game.stop(); fs.rmSync(dir, { recursive: true, force: true }); });
  async function connect() {
    const ws = new WebSocket(`ws://127.0.0.1:${game.address().port}/ws`);
    sockets.push(ws);
    const next = inbox(ws);
    await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
    return { ws, next };
  }
  const a = await connect();
  send(a.ws, { type: 'profileHello' });
  const guest = await a.next('profile');
  send(a.ws, { type: 'purchaseCloth', cloth: 'azure' });
  await a.next('profileError');
  send(a.ws, { type: 'createRoom', name: 'A' });
  const joined = await a.next('joined');
  const b = await connect();
  send(b.ws, { type: 'joinRoom', code: joined.roomCode, name: 'B' });
  await b.next('joined');
  const room = game.roomManager.findByCode(joined.roomCode);
  const player = room.players.get(joined.playerId);
  room.startMatch(game.now() - 60);
  player.kills = 1;
  room.finish(player.id, game.now());
  const reward = await a.next('profile', (m) => m.profile.balance === 30);
  assert.equal(reward.profile.lastReward.amount, 30);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(store.open(guest.token).profile.balance, 30);
  room.startMatch(game.now() - 60);
  player.kills = 1;
  room.finish(player.id, game.now());
  await a.next('profile', (m) => m.profile.balance === 60);
  send(a.ws, { type: 'purchaseCloth', cloth: 'azure' });
  await a.next('profile', (m) => m.profile.balance === 20);
  send(a.ws, { type: 'equipCloth', cloth: 'azure' });
  await a.next('profile', (m) => m.profile.equipped === 'azure');
  await b.next('snapshot', (m) => m.players.find((p) => p.id === player.id)?.cloth === 'azure');
  const c = await connect();
  send(c.ws, { type: 'profileHello', token: guest.token });
  const restored = await c.next('profile');
  assert.equal(restored.profile.balance, 20);
  assert.equal(restored.profile.equipped, 'azure');
  send(c.ws, { type: 'purchaseCloth', cloth: 'azure' });
  assert.equal((await c.next('profile')).profile.balance, 20);
});
