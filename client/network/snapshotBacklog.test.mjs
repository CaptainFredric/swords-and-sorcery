import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSocket } from './GameSocket.mjs';
import { RoomManager } from '../../shared/sim/RoomManager.mjs';
import { serializeSnapshot } from '../../shared/sim/wire.mjs';

// A browser WebSocket that the test feeds by hand, several messages per task,
// the way a page that fell behind finds them queued.
class QueuedWebSocket {
  static OPEN = 1;
  static last = null;
  constructor() {
    this.readyState = 0;
    this.listeners = new Map();
    this.sent = [];
    QueuedWebSocket.last = this;
    setTimeout(() => { this.readyState = QueuedWebSocket.OPEN; this.fire('open', {}); }, 0);
  }
  addEventListener(type, fn, { once = false } = {}) {
    const list = this.listeners.get(type) ?? [];
    list.push({ fn, once });
    this.listeners.set(type, list);
  }
  fire(type, event) {
    const list = this.listeners.get(type) ?? [];
    this.listeners.set(type, list.filter(l => !l.once));
    for (const { fn } of list) fn(event);
  }
  receive(...messages) { for (const m of messages) this.fire('message', { data: JSON.stringify(m) }); }
  send(data) { this.sent.push(data); }
  close() { this.readyState = 3; this.fire('close', {}); }
}

const nextTask = () => new Promise(resolve => setTimeout(resolve, 5));
const snapshot = (tick, extra = {}) => ({ type: 'snapshot', tick, serverTime: tick / 30, roomCode: 'ROOM', players: [], ...extra });

async function connected() {
  const previous = { WebSocket: globalThis.WebSocket, location: globalThis.location };
  globalThis.WebSocket = QueuedWebSocket;
  globalThis.location = { protocol: 'http:', host: '127.0.0.1:1' };
  const socket = new GameSocket({ storage: null });
  await socket.connect({ resume: false });
  const seen = [];
  socket.on('*', ({ type, payload }) => seen.push(type === 'snapshot' ? `snapshot ${payload.tick}` : type));
  return { socket, ws: QueuedWebSocket.last, seen, restore: () => Object.assign(globalThis, previous) };
}

test('the server writes snapshots with the prefix the client looks for', () => {
  const room = new RoomManager().createSoloRoom('PRACTICE', 0, 'castleward');
  assert.ok(JSON.stringify(serializeSnapshot(room, 1)).startsWith('{"type":"snapshot"'));
});

test('a page that fell behind handles only the newest of its queued snapshots', async () => {
  const { socket, ws, seen, restore } = await connected();
  try {
    ws.receive(snapshot(1), snapshot(2), snapshot(3));
    assert.deepEqual(seen, [], 'snapshots wait for the queued messages to be read');
    await nextTask();
    assert.deepEqual(seen, ['snapshot 3']);
    assert.equal(socket.latestSnapshot.tick, 3);
    assert.equal(socket.staleSnapshotsSkipped, 2);
    const acks = () => ws.sent.map(d => JSON.parse(d)).filter(m => m.type === 'snapshotAck');
    assert.deepEqual(acks(), [{ type: 'snapshotAck', tick: 3, roomCode: 'ROOM' }],
      'only the snapshot actually handled is acknowledged');
    ws.receive(snapshot(4));
    await nextTask();
    assert.deepEqual(seen, ['snapshot 3', 'snapshot 4'], 'a page that keeps up still sees every snapshot');
    assert.deepEqual(acks().map(a => a.tick), [3, 4]);
    assert.equal(socket.staleSnapshotsSkipped, 2);
  } finally { restore(); }
});

test('other messages are never skipped and keep their order after earlier snapshots', async () => {
  const { socket, ws, seen, restore } = await connected();
  const latestAtEvents = [];
  socket.on('events', () => latestAtEvents.push(socket.latestSnapshot?.tick));
  try {
    ws.receive(snapshot(1), snapshot(2), { type: 'events', events: [{ type: 'hit' }] },
      snapshot(3), { type: 'error', message: 'refused' }, snapshot(4), snapshot(5));
    await nextTask();
    assert.deepEqual(seen, ['snapshot 2', 'events', 'snapshot 3', 'error', 'snapshot 5']);
    assert.deepEqual(latestAtEvents, [2], 'events see the room as it was when they were sent');
    assert.equal(socket.staleSnapshotsSkipped, 2);
  } finally { restore(); }
});

test('a dropped connection delivers its last snapshot before reporting the drop', async () => {
  const { socket, ws, seen, restore } = await connected();
  try {
    ws.receive(snapshot(7));
    ws.close();
    assert.deepEqual(seen.slice(0, 2), ['snapshot 7', 'connection']);
    await nextTask();
    assert.equal(seen.filter(s => s.startsWith('snapshot')).length, 1, 'never handled twice');
  } finally { socket.close(); restore(); }
});

test('leaving on purpose discards a snapshot still waiting to be handled', async () => {
  const { socket, ws, seen, restore } = await connected();
  try {
    ws.receive(snapshot(9));
    socket.disconnect();
    await nextTask();
    assert.equal(socket.latestSnapshot, null);
    assert.ok(!seen.includes('snapshot 9'));
  } finally { restore(); }
});
