import { createGameServer } from '../server/src/server.mjs';
import { movePlayer, createMovementState, resolveSprint } from '../shared/src/movement.mjs';
import { getWorld } from '../shared/worlds/registry.mjs';
import { GAME_MODES } from '../shared/src/modes.mjs';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runScenario({ sendIntervalMs, latencyMs = 0, jitterMs = 0 }) {
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

  // Pseudo-random jitter generator
  let seed = 42;
  function sampleDelay() {
    if (latencyMs === 0) return 0;
    seed = (seed * 16807) % 2147483647;
    const j = ((seed - 1) / 2147483646 * 2 - 1) * jitterMs;
    return Math.max(1, latencyMs + j);
  }

  function sendDelayed(payload) {
    const raw = JSON.stringify(payload);
    sentBytes += raw.length;
    sentPackets++;
    const delay = sampleDelay();
    if (delay <= 0) {
      if (ws.readyState === WebSocket.OPEN) ws.send(raw);
    } else {
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(raw);
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

  let lastSendTime = performance.now();
  const startTime = performance.now();

  ws.onmessage = (event) => {
    const now = performance.now();
    const msg = JSON.parse(event.data);
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

    // Network input send cadence
    if (now - lastSendTime >= sendIntervalMs) {
      lastSendTime = now;
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
  const maxErr = predictionErrors.length ? predictionErrors[predictionErrors.length - 1] : 0;

  return {
    sendIntervalMs: sendIntervalMs.toFixed(1),
    bandwidthKbps: ((sentBytes * 8) / (DURATION_MS / 1000) / 1000).toFixed(2),
    packetsPerSec: (sentPackets / (DURATION_MS / 1000)).toFixed(1),
    receivedSnapshotsPerSec: (receivedSnapshots / (DURATION_MS / 1000)).toFixed(1),
    sprintLatencyMs: sprintLatency !== null ? sprintLatency.toFixed(1) : 'N/A',
    turnLatencyMs: turnLatency !== null ? turnLatency.toFixed(1) : 'N/A',
    dashLatencyMs: dashLatency !== null ? dashLatency.toFixed(1) : 'N/A',
    stopLatencyMs: stopLatency !== null ? stopLatency.toFixed(1) : 'N/A',
    stopOvershootMeters: stopOvershoot !== null ? stopOvershoot.toFixed(3) : 'N/A',
    avgPredictionErrMeters: avgErr.toFixed(3),
    p95PredictionErrMeters: p95Err.toFixed(3),
  };
}

console.log('========================================================================================');
console.log('REAL SERVER + REAL WEBSOCKET + REAL 30 Hz ROOM SIMULATION BENCHMARK');
console.log('Comparing 50 ms (20 Hz) vs 33.3 ms (30 Hz)');
console.log('========================================================================================\n');

const conditions = [
  { name: 'Direct Loopback (Localhost, 0ms latency)', latencyMs: 0, jitterMs: 0 },
  { name: 'Broadband Profile (RTT ~40ms, jitter 3ms)', latencyMs: 20, jitterMs: 3 },
  { name: 'Mobile Profile (RTT ~100ms, jitter 12ms)', latencyMs: 50, jitterMs: 12 },
];

for (const cond of conditions) {
  console.log(`--- Condition: ${cond.name} ---`);
  const res50 = await runScenario({ sendIntervalMs: 50, ...cond });
  const res33 = await runScenario({ sendIntervalMs: 1000 / 30, ...cond });

  console.table([
    { Cadence: '50 ms (20 Hz)', ...res50 },
    { Cadence: '33.3 ms (30 Hz)', ...res33 },
  ]);
  console.log('');
}
