import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { WebSocketPeer, encodeJsonFrame, MAX_SNAPSHOT_QUEUE_BYTES } from '../src/websocket.mjs';

function fakeSocket() {
  const socket = new EventEmitter();
  socket.frames = [];
  socket.writableLength = 0;
  socket.writableNeedDrain = false;
  socket.destroyed = false;
  socket.write = frame => { socket.frames.push(frame); return true; };
  socket.end = () => {};
  return socket;
}

test('slow websocket discards obsolete snapshots but not critical combat events', () => {
  const socket = fakeSocket(), peer = new WebSocketPeer(socket);
  socket.writableLength = MAX_SNAPSHOT_QUEUE_BYTES;
  assert.equal(peer.sendJson({type:'snapshot', tick:1}), false);
  assert.equal(peer.skippedSnapshots, 1);
  assert.equal(socket.frames.length, 0);
  assert.equal(peer.sendJson({type:'events', events:[{type:'damage',amount:1}]}), true);
  assert.equal(socket.frames.length, 1);
  socket.writableLength = 0;
  socket.writableNeedDrain = true;
  assert.equal(peer.sendPrepared(encodeJsonFrame({type:'snapshot',tick:2}), true), false);
  assert.equal(socket.frames.length, 1);
  socket.writableNeedDrain = false;
  const payload = encodeJsonFrame({type:'snapshot',tick:3});
  assert.equal(peer.sendPrepared(payload, true), true);
  assert.equal(socket.frames.at(-1), payload);
});
