import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sendMovementInput,
  hasMeaningfulInputChange,
  REMOTE_INPUT_HEARTBEAT_MS,
  REMOTE_INPUT_MIN_INTERVAL_MS,
  REMOTE_YAW_THRESHOLD_RAD,
} from './movementInput.mjs';
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

test('remote movement sends immediately on state transitions and suppresses sub-threshold noise', () => {
  const sent = [];
  const socket = { playingLocally: false, serverNow: () => 7, input: input => sent.push(input) };
  const stream = { sequence: 4, lastInputSentAt: 1000, lastSentInput: { forward: 1, right: 0, sprint: false, yaw: 0, pitch: 0 } };

  // 1. Same input 16ms later: should NOT send (no change, heartbeat not reached)
  sendMovementInput(socket, { forward: 1, right: 0, sprint: false, yaw: 0, pitch: 0 }, 1016, stream);
  assert.equal(sent.length, 0);

  // 2. Sub-threshold yaw jitter (e.g. 0.01 rad < 0.03 rad threshold) 30ms later: should NOT send
  sendMovementInput(socket, { forward: 1, right: 0, sprint: false, yaw: 0.01, pitch: 0 }, 1030, stream);
  assert.equal(sent.length, 0);

  // 3. Meaningful sprint transition at t=1032ms (elapsed 32ms >= min interval): sends immediately!
  sendMovementInput(socket, { forward: 1, right: 0, sprint: true, yaw: 0.01, pitch: 0 }, 1032, stream);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].seq, 5);
  assert.equal(sent[0].sprint, true);

  // 4. Meaningful yaw turn (> 0.03 rad) at t=1048ms: sends immediately!
  sendMovementInput(socket, { forward: 1, right: 0, sprint: true, yaw: 0.15, pitch: 0 }, 1048, stream);
  assert.equal(sent.length, 2);
  assert.equal(sent[1].seq, 6);
  assert.equal(sent[1].yaw, 0.15);

  // 5. Release movement (stop) at t=1064ms: sends immediately!
  sendMovementInput(socket, { forward: 0, right: 0, sprint: false, yaw: 0.15, pitch: 0 }, 1064, stream);
  assert.equal(sent.length, 3);
  assert.equal(sent[2].seq, 7);
  assert.equal(sent[2].forward, 0);
});

test('remote movement sends heartbeat when input remains unchanged after 50 ms', () => {
  const sent = [];
  const socket = { playingLocally: false, serverNow: () => 7, input: input => sent.push(input) };
  const stream = { sequence: 0, lastInputSentAt: 1000, lastSentInput: { forward: 1, right: 0, sprint: false, yaw: 0 } };
  const input = { forward: 1, right: 0, sprint: false, yaw: 0 };

  sendMovementInput(socket, input, 1020, stream);
  sendMovementInput(socket, input, 1040, stream);
  assert.equal(sent.length, 0);

  // At t=1050ms (elapsed 50ms == REMOTE_INPUT_HEARTBEAT_MS), heartbeat triggers packet
  sendMovementInput(socket, input, 1050, stream);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].seq, 1);

  // Next 30ms unchanged: no packet
  sendMovementInput(socket, input, 1080, stream);
  assert.equal(sent.length, 1);

  // At t=1101ms (elapsed 51ms since last send): next heartbeat triggers packet
  sendMovementInput(socket, input, 1101, stream);
  assert.equal(sent.length, 2);
  assert.equal(sent[1].seq, 2);
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

test('mounted aim and steering use fine packet transitions while on foot thresholds stay unchanged',()=>{
 const a={yaw:0,pitch:0,forward:0,right:0};
 assert.equal(hasMeaningfulInputChange({...a,yaw:.003},a),false);
 assert.equal(hasMeaningfulInputChange({...a,mounted:true,yaw:.003},{...a,mounted:true}),true);
 assert.equal(hasMeaningfulInputChange({...a,mounted:true,right:.02},{...a,mounted:true}),true);
});

test('LocalHost flight-input freshness: samples live controller at 30 Hz and does NOT unconditionally renew when suspended', () => {
  let now = 100;
  const host = new LocalHost({ now: () => now, every: () => 1, cancel: () => {}, later: fn => fn() });
  host.startSolo('PRACTICE', 'Pilot');
  host.arenaReady(true);
  host.tick();

  // Simulate pilot mounted on Fight-and-Flight
  host.player.operatingFightFlightId = 'faf_test';
  host.player.flightInputAt = null;

  let liveSample = { forward: 0, right: 0, jump: true, flightRise: true, yaw: 0, pitch: 0 };
  host.setInputSampler(() => liveSample);

  // 1. Tick samples live input and updates player.flightInputAt to current time
  host.tick();
  assert.equal(host.player.input.flightRise, true);
  assert.equal(host.player.flightInputAt, 100);

  // 2. Continuous sampling at next tick
  now += 1 / 30;
  host.tick();
  assert.equal(host.player.flightInputAt, 100 + 1 / 30);

  // 3. User releases input: sampler returns neutralized input
  liveSample = { forward: 0, right: 0, jump: false, flightRise: false, yaw: 0, pitch: 0 };
  now += 1 / 30;
  host.tick();
  assert.equal(host.player.input.flightRise, false);
  assert.equal(host.player.input.jump, false);
  assert.equal(host.player.flightInputAt, 100 + 2 / 30);

  // 4. Tab backgrounded or blurred: sampler returns null
  host.setInputSampler(() => null);
  const frozenTimestamp = host.player.flightInputAt;

  // Advance 20 ticks (0.66s): ticks must NOT renew flightInputAt!
  for (let i = 0; i < 20; i++) {
    now += 1 / 30;
    host.tick();
  }
  assert.equal(host.player.flightInputAt, frozenTimestamp, 'unconditional tick renewal is absent; flightInputAt stays frozen');
  assert.ok(now - host.player.flightInputAt > 0.5, 'authoritative 0.5s freshness timeout elapsed');
});
