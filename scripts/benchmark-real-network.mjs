import { createGameServer } from '../server/src/server.mjs';
import { movePlayer, createMovementState } from '../shared/src/movement.mjs';
import { getWorld } from '../shared/worlds/registry.mjs';
import { GAME_MODES } from '../shared/src/modes.mjs';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runScenario({
  strategy = 'periodic', // 'periodic' or 'immediate_on_change'
  sendIntervalMs = 50,
  heartbeatMs = 50,
  oneWayLatencyMs = 0,
  jitterMs = 0,
  seed = 42,
}) {
  const game = createGameServer({ port: 0, host: '127.0.0.1' });
  await game.start();
  const { port } = game.address();

  let ws;
  let closed = false;
  let sentBytes = 0;
  let sentPackets = 0;
  let receivedSnapshots = 0;
  const snapshotArrivalTimes = [];
  const predictionErrors = [];

  let myId = null;
  let clientSeq = 0;
  let localState = null;
  const world = getWorld('castleward');

  // Transition tracking
  let sprintPressTime = null;
  let sprintAckTime = null;

  let stopPressTime = null;
  let stopAckTime = null;
  let stopPositionAtPress = null;
  let stopPositionAtAck = null;

  let turnPressTime = null;
  let turnAckTime = null;

  let dashPressTime = null;
  let dashAckTime = null;

  // Pseudo-random jitter generator (deterministic Park-Miller LCG)
  let currentSeed = seed;
  function sampleDelay() {
    if (oneWayLatencyMs === 0) return 0;
    currentSeed = (currentSeed * 16807) % 2147483647;
    const j = ((currentSeed - 1) / 2147483646 * 2 - 1) * jitterMs;
    return Math.max(1, oneWayLatencyMs + j);
  }

  function sendDelayed(payload) {
    const raw = JSON.stringify(payload);
    sentBytes += raw.length;
    sentPackets++;
    const delay = sampleDelay();
    if (delay <= 0) {
      if (!closed && ws.readyState === WebSocket.OPEN) ws.send(raw);
    } else {
      setTimeout(() => {
        if (!closed && ws.readyState === WebSocket.OPEN) ws.send(raw);
      }, delay);
    }
  }

  ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);

  await new Promise((resolve) => {
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'startSolo', mode: GAME_MODES.PRACTICE, name: 'BenchmarkKnight' }));
      resolve();
    };
  });

  // Client inputs
  let currentForward = 1;
  let currentRight = 0;
  let currentSprint = false;
  let currentYaw = 0;
  let currentPitch = 0;

  let lastSentInput = {
    forward: currentForward,
    right: currentRight,
    sprint: currentSprint,
    yaw: currentYaw,
  };

  let lastSendTime = performance.now();
  const startTime = performance.now();

  function handleMessage(data) {
    if (closed) return;
    const now = performance.now();
    const msg = JSON.parse(data);
    if (msg.type === 'snapshot') {
      receivedSnapshots++;
      snapshotArrivalTimes.push(now);

      const me = msg.players?.find((p) => p.name === 'BenchmarkKnight' || (myId && p.id === myId));
      if (me) {
        myId = me.id;
        if (!localState) {
          localState = createMovementState({ x: me.position.x, y: me.position.y, z: me.position.z });
        }

        // Measure prediction error against server authoritative position
        const dx = me.position.x - localState.position.x;
        const dy = me.position.y - localState.position.y;
        const dz = me.position.z - localState.position.z;
        const err = Math.hypot(dx, dy, dz);
        predictionErrors.push(err);

        // Exponential smoothing reconciliation
        localState.position.x += dx * 0.15;
        localState.position.y += dy * 0.20;
        localState.position.z += dz * 0.15;

        // Transition detection
        if (sprintPressTime !== null && sprintAckTime === null && me.sprinting) {
          sprintAckTime = now;
        }

        if (stopPressTime !== null && stopAckTime === null && Math.hypot(me.velocity.x, me.velocity.z) < 0.1) {
          stopAckTime = now;
          stopPositionAtAck = { ...me.position };
        }

        if (turnPressTime !== null && turnAckTime === null && Math.abs(me.yaw - Math.PI / 2) < 0.05) {
          turnAckTime = now;
        }

        if (dashPressTime !== null && dashAckTime === null && me.dashStartedAt > 0) {
          dashAckTime = now;
        }
      }
    }
  }

  // Bidirectional simulation: delay incoming snapshots with downlink latency
  ws.onmessage = (event) => {
    const delay = sampleDelay();
    if (delay <= 0) {
      handleMessage(event.data);
    } else {
      setTimeout(() => {
        handleMessage(event.data);
      }, delay);
    }
  };

  // Run the benchmark loop for 4.5 seconds
  const DURATION_MS = 4500;
  const SPRINT_AT_MS = 800;
  const TURN_AT_MS = 1800;
  const DASH_AT_MS = 2600;
  const STOP_AT_MS = 3400;

  let lastFrameTime = performance.now();

  while (performance.now() - startTime < DURATION_MS) {
    const now = performance.now();
    const elapsed = now - startTime;
    const dt = (now - lastFrameTime) / 1000;
    lastFrameTime = now;

    // Timeline triggers
    if (elapsed >= SPRINT_AT_MS && sprintPressTime === null) {
      sprintPressTime = now;
      currentSprint = true;
    }

    if (elapsed >= TURN_AT_MS && turnPressTime === null) {
      turnPressTime = now;
      currentYaw = Math.PI / 2;
    }

    if (elapsed >= DASH_AT_MS && dashPressTime === null) {
      dashPressTime = now;
      sendDelayed({ type: 'dash', direction: { x: 1, z: 0 }, clientTime: now / 1000 });
    }

    if (elapsed >= STOP_AT_MS && stopPressTime === null) {
      stopPressTime = now;
      currentForward = 0;
      currentSprint = false;
      if (localState) stopPositionAtPress = { ...localState.position };
    }

    // Local prediction step
    if (localState) {
      const moveInput = {
        forward: currentForward,
        right: currentRight,
        jump: false,
        sprint: currentSprint,
        crouch: false,
        yaw: currentYaw,
        pitch: currentPitch,
      };
      localState = movePlayer(localState, moveInput, Math.min(0.05, dt), now / 1000, world);
    }

    // Network input send strategy
    let shouldSend = false;
    if (strategy === 'periodic') {
      shouldSend = (now - lastSendTime >= sendIntervalMs);
    } else if (strategy === 'immediate_on_change') {
      const inputChanged = (
        currentForward !== lastSentInput.forward ||
        currentRight !== lastSentInput.right ||
        currentSprint !== lastSentInput.sprint ||
        Math.abs(currentYaw - lastSentInput.yaw) > 0.03
      );
      const heartbeatExpired = (now - lastSendTime >= heartbeatMs);
      shouldSend = inputChanged || heartbeatExpired;
    }

    if (shouldSend) {
      lastSendTime = now;
      lastSentInput = {
        forward: currentForward,
        right: currentRight,
        sprint: currentSprint,
        yaw: currentYaw,
      };
      clientSeq++;
      sendDelayed({
        type: 'input',
        seq: clientSeq,
        forward: currentForward,
        right: currentRight,
        jump: false,
        sprint: currentSprint,
        crouch: false,
        yaw: currentYaw,
        pitch: currentPitch,
        clientTime: now / 1000,
      });
    }

    await sleep(4); // ~250 Hz client poll
  }

  closed = true;
  ws.close();
  await game.stop();

  // Calculate results
  const sprintLatency = (sprintAckTime && sprintPressTime) ? (sprintAckTime - sprintPressTime) : null;
  const turnLatency = (turnAckTime && turnPressTime) ? (turnAckTime - turnPressTime) : null;
  const dashLatency = (dashAckTime && dashPressTime) ? (dashAckTime - dashPressTime) : null;
  const stopLatency = (stopAckTime && stopPressTime) ? (stopAckTime - stopPressTime) : null;

  const stopOvershoot = (stopPositionAtAck && stopPositionAtPress)
    ? Math.hypot(stopPositionAtAck.x - stopPositionAtPress.x, stopPositionAtAck.z - stopPositionAtPress.z)
    : null;

  const avgErr = predictionErrors.length ? (predictionErrors.reduce((a, b) => a + b, 0) / predictionErrors.length) : 0;
  predictionErrors.sort((a, b) => a - b);
  const p95Err = predictionErrors.length ? predictionErrors[Math.floor(predictionErrors.length * 0.95)] : 0;

  return {
    strategy: strategy === 'periodic' ? `Periodic ${sendIntervalMs.toFixed(1)}ms` : `Immediate + ${heartbeatMs}ms hb`,
    bandwidthKbps: ((sentBytes * 8) / (DURATION_MS / 1000) / 1000).toFixed(2),
    packetsPerSec: (sentPackets / (DURATION_MS / 1000)).toFixed(1),
    sprintLatencyMs: sprintLatency !== null ? sprintLatency.toFixed(1) : 'N/A',
    turnLatencyMs: turnLatency !== null ? turnLatency.toFixed(1) : 'N/A',
    stopLatencyMs: stopLatency !== null ? stopLatency.toFixed(1) : 'N/A',
    stopOvershootM: stopOvershoot !== null ? stopOvershoot.toFixed(3) : 'N/A',
    avgPredErrM: avgErr.toFixed(3),
    p95PredErrM: p95Err.toFixed(3),
  };
}

console.log('========================================================================================');
console.log('REAL SERVER + REAL WEBSOCKET + REAL 30 Hz ROOM SIMULATION BENCHMARK');
console.log('True Bidirectional Delay (Uplink + Downlink) across Deterministic Seeds');
console.log('Comparing:');
console.log('  1. Periodic 50 ms (20 Hz)');
console.log('  2. Periodic 33.3 ms (30 Hz)');
console.log('  3. Immediate-on-Change + 50 ms Heartbeat');
console.log('  4. Immediate-on-Change + 100 ms Heartbeat');
console.log('========================================================================================\n');

const profiles = [
  { name: 'Direct Loopback (0ms uplink / 0ms downlink)', oneWayLatencyMs: 0, jitterMs: 0 },
  { name: 'Broadband Profile (20ms uplink / 20ms downlink, RTT ~40ms, jitter 3ms)', oneWayLatencyMs: 20, jitterMs: 3 },
  { name: 'Mobile Profile (50ms uplink / 50ms downlink, RTT ~100ms, jitter 12ms)', oneWayLatencyMs: 50, jitterMs: 12 },
];

const seeds = [42, 1001, 7777];

for (const prof of profiles) {
  console.log(`\n################################################################################`);
  console.log(`### Profile: ${prof.name}`);
  console.log(`################################################################################`);

  for (const seed of seeds) {
    console.log(`\n--- Seed: ${seed} ---`);
    const res50 = await runScenario({ strategy: 'periodic', sendIntervalMs: 50, seed, ...prof });
    const res33 = await runScenario({ strategy: 'periodic', sendIntervalMs: 1000 / 30, seed, ...prof });
    const resImm50 = await runScenario({ strategy: 'immediate_on_change', heartbeatMs: 50, seed, ...prof });
    const resImm100 = await runScenario({ strategy: 'immediate_on_change', heartbeatMs: 100, seed, ...prof });

    console.table([
      { Strategy: '1. Periodic 50 ms', ...res50 },
      { Strategy: '2. Periodic 33.3 ms', ...res33 },
      { Strategy: '3. Immediate + 50ms hb', ...resImm50 },
      { Strategy: '4. Immediate + 100ms hb', ...resImm100 },
    ]);
  }
}
