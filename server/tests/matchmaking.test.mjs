import test from 'node:test';
import assert from 'node:assert/strict';
import { Matchmaker } from '../src/rooms/Matchmaker.mjs';
import { createGameServer } from '../src/server.mjs';

function waitOpen(ws) {
  return new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
}

function waitFor(ws, predicate, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.removeEventListener('message', onMessage); reject(new Error('Timed out waiting for websocket message')); }, timeoutMs);
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

function send(ws, message) {
  ws.send(JSON.stringify(message));
}

test('the matchmaker pairs seekers in arrival order and offers each a bot once after thirty seconds', () => {
  const mm = new Matchmaker();
  mm.enqueue('a', 'A', 0);
  mm.enqueue('b', 'B', 1);
  mm.enqueue('c', 'C', 2);
  mm.enqueue('a', 'A2', 3);
  assert.equal(mm.size, 3, 'seeking again keeps your place');
  const pairs = mm.takePairs();
  assert.deepEqual(pairs.map(([x, y]) => [x.key, y.key]), [['a', 'b']]);
  assert.equal(pairs[0][0].name, 'A2');
  assert.deepEqual(mm.queue.map((e) => e.key), ['c']);
  assert.deepEqual(mm.dueBotOffers(31).map((e) => e.key), []);
  assert.deepEqual(mm.dueBotOffers(32).map((e) => e.key), ['c']);
  assert.deepEqual(mm.dueBotOffers(60), [], 'offered once');
  assert.equal(mm.cancel('c'), true);
  assert.equal(mm.size, 0);
  mm.requeueFront({ key: 'z', name: 'Z', since: 5 });
  assert.equal(mm.queue[0].key, 'z');
});

test('two seekers wait in their own practice yards, then meet in a fresh duel room that counts down', async (t) => {
  const game = createGameServer({ port: 0, host: '127.0.0.1' });
  await game.start();
  t.after(async () => game.stop());
  const { port } = game.address();
  const alice = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const bob = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  t.after(() => { alice.close(); bob.close(); });
  await Promise.all([waitOpen(alice), waitOpen(bob)]);

  const aliceYardP = waitFor(alice, (m) => m.type === 'joined');
  const aliceSeekingP = waitFor(alice, (m) => m.type === 'seeking' && m.active);
  send(alice, { type: 'seekDuel', name: 'Alice' });
  const aliceYard = await aliceYardP;
  const seeking = await aliceSeekingP;
  assert.equal(aliceYard.mode, 'PRACTICE', 'she waits in a practice yard');
  assert.equal(seeking.others, 0);
  const yard = game.roomManager.findByCode(aliceYard.roomCode);
  assert.ok([...yard.players.values()].some((p) => p.actorKind === 'dummy'), 'with a dummy to hit');

  const aliceDuelP = waitFor(alice, (m) => m.type === 'joined' && m.mode === 'DUEL');
  const bobDuelP = waitFor(bob, (m) => m.type === 'joined' && m.mode === 'DUEL');
  const foundP = waitFor(alice, (m) => m.type === 'duelFound');
  const countdownP = waitFor(bob, (m) => m.type === 'lobby' && m.mode === 'DUEL' && m.roomState === 'COUNTDOWN');
  send(bob, { type: 'seekDuel', name: 'Bob' });
  const [aliceDuel, bobDuel, found] = await Promise.all([aliceDuelP, bobDuelP, foundP]);
  await countdownP;
  assert.equal(aliceDuel.roomCode, bobDuel.roomCode);
  assert.equal(found.opponent, 'Bob');
  assert.equal(game.roomManager.findByCode(aliceYard.roomCode), null, 'the empty practice yard is gone');
  assert.equal(game.matchmaker.size, 0);
  const duel = game.roomManager.findByCode(aliceDuel.roomCode);
  assert.equal(duel.isPrivate, true, 'never listed or joinable by code');
  assert.equal(game.roomManager.listPublicRooms(game.now()).length, 0);
});

test('a seeker can cancel, and after thirty seconds is offered a bot while staying in the queue', async (t) => {
  const game = createGameServer({ port: 0, host: '127.0.0.1' });
  await game.start();
  t.after(async () => game.stop());
  const { port } = game.address();
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  t.after(() => ws.close());
  await waitOpen(ws);

  send(ws, { type: 'seekDuel', name: 'Solo' });
  await waitFor(ws, (m) => m.type === 'seeking' && m.active);
  game.matchmaker.queue[0].since -= 31;
  const offer = await waitFor(ws, (m) => m.type === 'seeking' && m.botOffer);
  assert.equal(offer.active, true);
  const botRoomP = waitFor(ws, (m) => m.type === 'joined' && m.mode === 'BOT_DUEL');
  send(ws, { type: 'seekBotDuel' });
  await botRoomP;
  assert.equal(game.matchmaker.size, 1, 'still seeking while fighting the bot');
  const cancelledP = waitFor(ws, (m) => m.type === 'seeking' && !m.active);
  send(ws, { type: 'cancelSeek' });
  await cancelledP;
  assert.equal(game.matchmaker.size, 0);
});

test('public rooms are listed for anyone to walk into; private and solo rooms are not', async (t) => {
  const game = createGameServer({ port: 0, host: '127.0.0.1' });
  await game.start();
  t.after(async () => game.stop());
  const { port } = game.address();
  const host = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const friend = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const browser = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  t.after(() => { host.close(); friend.close(); browser.close(); });
  await Promise.all([waitOpen(host), waitOpen(friend), waitOpen(browser)]);

  const publicP = waitFor(host, (m) => m.type === 'joined');
  send(host, { type: 'createPublicRoom', name: 'Host' });
  const publicRoom = await publicP;
  const privateP = waitFor(friend, (m) => m.type === 'joined');
  send(friend, { type: 'createRoom', name: 'Friend' });
  await privateP;

  const listP = waitFor(browser, (m) => m.type === 'roomList');
  send(browser, { type: 'listRooms' });
  const list = await listP;
  assert.deepEqual(list.rooms.map((room) => room.code), [publicRoom.roomCode]);
  assert.equal(list.rooms[0].players, 1);
  const joinedP = waitFor(browser, (m) => m.type === 'joined');
  send(browser, { type: 'joinRoom', code: publicRoom.roomCode, name: 'Walker' });
  assert.equal((await joinedP).roomCode, publicRoom.roomCode);
});
