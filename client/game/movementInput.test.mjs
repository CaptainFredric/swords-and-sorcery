import test from 'node:test';
import assert from 'node:assert/strict';
import { sendMovementInput } from './movementInput.mjs';
import { LocalHost } from '../network/LocalHost.mjs';

test('local input reaches the next combat tick without a network send interval', () => {
  let now = 100;
  const host = new LocalHost({ now: () => now, every: () => 1, cancel: () => {}, later: fn => fn() });
  host.startSolo('PRACTICE', 'Runner');
  host.arenaReady(true);
  host.tick();
  const socket = { playingLocally: true, serverNow: () => now, input: input => host.input(input) };
  const stream = { sequence: 0, lastInputSentAt: 1000 };
  const position = { ...host.player.position };
  sendMovementInput(socket, { forward: 1, right: 0, yaw: 0, pitch: .4, sprint: true }, 1016, stream);
  assert.equal(host.player.input.forward, 1);
  assert.equal(host.player.input.sprint, true);
  assert.equal(host.player.input.pitch, .4);
  assert.equal(host.player.lastInputSeq, 1);
  assert.deepEqual(host.player.position, position, 'receiving input does not accelerate simulation');
  now += 1 / 30;
  host.tick();
  assert.ok(host.player.position.z < position.z);
  sendMovementInput(socket, { forward: 0, right: 0, yaw: .2, pitch: 0, sprint: false }, 1032, stream);
  assert.equal(host.player.input.forward, 0);
  assert.equal(host.player.lastInputSeq, 2);
  assert.equal(host.latestSnapshot.tick, 2, 'combat still stepped only at its existing tick rate');
});

test('remote movement retains the 50 ms cadence and monotonic input sequence', () => {
  const sent = [];
  const socket = { playingLocally: false, serverNow: () => 7, input: input => sent.push(input) };
  const stream = { sequence: 4, lastInputSentAt: 1000 };
  const input = { forward: 1, yaw: .7, pitch: -.2 };
  sendMovementInput(socket, input, 1016, stream);
  sendMovementInput(socket, input, 1049, stream);
  assert.equal(sent.length, 0);
  sendMovementInput(socket, input, 1050, stream);
  assert.deepEqual(sent, [{ seq: 5, forward: 1, yaw: .7, pitch: -.2, clientTime: 7 }]);
  sendMovementInput(socket, input, 1066, stream);
  assert.equal(sent.length, 1);
});

test('inspection freeze preserves captured input until live local play resumes', () => {
  const sent = [];
  const socket = { playingLocally: true, inspectionFrozen: true, serverNow: () => 7, input: packet => sent.push(packet) };
  const stream = { sequence: 4, lastInputSentAt: 1000 };
  sendMovementInput(socket, { forward: 1 }, 1016, stream);
  assert.equal(sent.length, 0);
  assert.deepEqual(stream, { sequence: 4, lastInputSentAt: 1000 });
  socket.inspectionFrozen = false;
  sendMovementInput(socket, { forward: 0 }, 1032, stream);
  assert.deepEqual(sent, [{ seq: 5, forward: 0, clientTime: 7 }]);
});
