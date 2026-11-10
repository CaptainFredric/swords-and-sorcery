import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameServer, SNAPSHOT_ACK_WINDOW_TICKS } from '../src/server.mjs';

// A raw client, so the test decides when snapshots are acknowledged.
async function practiceClient(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const snapshots = [];
  let roomCode = null;
  let acknowledging = false;
  const ack = (tick = snapshots.at(-1)) => ws.send(JSON.stringify({ type: 'snapshotAck', tick, roomCode }));
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.type === 'joined') roomCode = message.roomCode;
    if (message.type !== 'snapshot') return;
    snapshots.push(message.tick);
    if (acknowledging) ack(message.tick);
  });
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.send(JSON.stringify({ type: 'createSharedPracticeRoom', name: 'Acker', worldId: 'castleward' }));
  await until(() => roomCode && snapshots.length > 3);
  return {
    snapshots,
    ack,
    // Acknowledge each snapshot as it arrives, as GameSocket does.
    acknowledgeEach() { acknowledging = true; ack(); },
    close: () => ws.close(),
  };
}

async function until(check, ms = 5000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise(r => setTimeout(r, 10));
  }
}

const settle = (ms) => new Promise(r => setTimeout(r, ms));

test('a client that never acknowledges still gets every snapshot', async () => {
  const server = createGameServer({ port: 0, host: '127.0.0.1' });
  await server.start();
  const client = await practiceClient(server.address().port);
  try {
    const before = client.snapshots.length;
    await settle(1500);
    assert.ok(client.snapshots.length - before > 30, 'about 30 snapshots a second keep arriving');
  } finally { client.close(); await server.stop(); }
});

test('unacknowledged snapshots in flight are bounded, and an acknowledgement resumes them', async () => {
  const server = createGameServer({ port: 0, host: '127.0.0.1' });
  await server.start();
  const client = await practiceClient(server.address().port);
  try {
    // The client reads normally but stops acknowledging: like a page whose
    // reads are stuck behind a full connection.
    client.ack();
    const ackedTick = client.snapshots.at(-1);
    await settle(1500);
    const after = client.snapshots.filter(t => t > ackedTick);
    assert.ok(after.length > 0, 'the window lets some snapshots through');
    assert.ok(after.at(-1) - ackedTick <= SNAPSHOT_ACK_WINDOW_TICKS,
      `nothing beyond the window: last ${after.at(-1)}, acknowledged ${ackedTick}`);
    const held = client.snapshots.length;
    await settle(500);
    assert.equal(client.snapshots.length, held, 'held while unacknowledged');

    client.acknowledgeEach();
    await settle(1000);
    assert.ok(client.snapshots.length - held > 20, 'a client that keeps acknowledging gets the full rate back');
    const health = await fetch(`http://127.0.0.1:${server.address().port}/health`).then(r => r.json());
    assert.ok(health.simulation.unacknowledgedSnapshotsHeld > 0);
  } finally { client.close(); await server.stop(); }
});

test('an acknowledgement from another room never holds snapshots back', async () => {
  const server = createGameServer({ port: 0, host: '127.0.0.1' });
  await server.start();
  const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`);
  const snapshots = [];
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.type === 'snapshot') snapshots.push(message.tick);
  });
  try {
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    ws.send(JSON.stringify({ type: 'createSharedPracticeRoom', name: 'Elsewhere', worldId: 'castleward' }));
    await until(() => snapshots.length > 3);
    ws.send(JSON.stringify({ type: 'snapshotAck', tick: 0, roomCode: 'OTHER' }));
    const before = snapshots.length;
    await settle(1500);
    assert.ok(snapshots.length - before > 30);
  } finally { ws.close(); await server.stop(); }
});
