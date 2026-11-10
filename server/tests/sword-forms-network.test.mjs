import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameServer } from '../src/server.mjs';

// Two real WebSocket clients in one room: one holds the attack through three chains at the other; both must see the
// same chains (form, start, strikes landed, how they ended) and the same blows (each judged as the cut it is).
test('two clients see the same sword chains and the same blows: forms, cuts, contact points and judgements', async () => {
  const game = createGameServer({ host: '127.0.0.1', port: 0 });
  await game.start();
  const clients = [];
  async function connect() {
    const ws = new WebSocket(`ws://127.0.0.1:${game.address().port}/ws`);
    clients.push(ws);
    const queue = [];
    ws.addEventListener('message', (e) => queue.push(JSON.parse(e.data)));
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
    return {
      queue,
      send: (msg) => ws.send(JSON.stringify(msg)),
      async wait(predicate, ms = 6000) {
        const deadline = Date.now() + ms;
        while (Date.now() < deadline) {
          const i = queue.findIndex(predicate);
          if (i >= 0) return queue.splice(i, 1)[0];
          await new Promise((r) => setTimeout(r, 15));
        }
        throw new Error('sword sync observation timed out');
      },
    };
  }
  try {
    const host = await connect();
    host.send({ type: 'createSharedPracticeRoom', name: 'Striker' });
    const joined = await host.wait((m) => m.type === 'joined');
    const guest = await connect();
    guest.send({ type: 'joinRoom', code: joined.roomCode, name: 'Struck' });
    const observer = await guest.wait((m) => m.type === 'joined');
    const room = game.roomManager.findByCode(joined.roomCode);
    room.world = { floors: [{ center: [0, -0.1, 0], size: [100, 0.2, 100], y: 0 }], solids: [], ramps: [], abyssY: -30, spawnPoints: [{ x: 0, y: 0, z: 0, yaw: 0 }] };
    const striker = room.players.get(joined.playerId);
    const struck = room.players.get(observer.playerId);
    Object.assign(striker.position, { x: 0, y: 0, z: 0 });
    Object.assign(struck.position, { x: 0, y: 0, z: -1.85 });
    striker.spawnProtectionUntil = 0; struck.spawnProtectionUntil = 0;
    host.send({ type: 'input', yaw: 0, pitch: 0, forward: 0, right: 0 });
    for (const c of [host, guest]) c.queue.length = 0;
    host.send({ type: 'attack', down: true });
    // three chains held (two forms), then let go
    await new Promise((r) => setTimeout(r, 3 * 2080 - 150));
    host.send({ type: 'attack', down: false });
    await new Promise((r) => setTimeout(r, 900));
    const seen = (c) => {
      const events = c.queue.filter((m) => m.type === 'events').flatMap((m) => m.events)
        .filter((e) => ['swordSwing', 'swordHit'].includes(e.type) && (e.playerId === striker.id));
      const chains = [];
      for (const s of c.queue.filter((m) => m.type === 'snapshot')) {
        const p = s.players.find((q) => q.id === striker.id);
        if (p?.attackActive && chains.at(-1)?.startedAt !== p.attackStartedAt) chains.push({ startedAt: p.attackStartedAt, variant: p.attackVariant });
      }
      return { events, chains };
    };
    const a = seen(host), b = seen(guest);
    assert.ok(a.chains.length >= 3, `three chains seen: ${JSON.stringify(a.chains)}`);
    assert.deepEqual(a.chains.slice(0, 3).map((c) => c.variant), [0, 1, 0]);
    assert.deepEqual(b.chains.slice(0, 3), a.chains.slice(0, 3));
    const swings = a.events.filter((e) => e.type === 'swordSwing');
    assert.deepEqual(swings.slice(0, 6).map((e) => e.kind), [0, 1, 2, 1, 0, 2], 'falling then rising');
    const hits = a.events.filter((e) => e.type === 'swordHit');
    assert.ok(hits.length >= 3, `blows landed: ${hits.length}`);
    assert.deepEqual(b.events.filter((e) => e.type === 'swordHit'), hits, 'both clients have the same blows, to the last digit');
    for (const h of hits) {
      assert.ok(h.point && h.heat && Number.isInteger(h.kind));
      assert.ok(h.heat.reach >= 0 && h.heat.reach <= 1, JSON.stringify(h.heat));
    }
  } finally {
    for (const ws of clients) ws.close();
    await game.stop();
  }
});
