import { movePlayer, createMovementState, resolveSprint } from '../shared/src/movement.mjs';
import { getWorld } from '../shared/worlds/registry.mjs';

function runScenario({
  sendIntervalMs,
  baseLatencyMs = 25, // one-way latency (RTT = 50ms)
  jitterMs = 4,
  durationSec = 10,
  renderFps = 60,
  serverTickRate = 30,
}) {
  const world = getWorld('castleward');
  const serverTickIntervalMs = 1000 / serverTickRate;
  const renderFrameIntervalMs = 1000 / renderFps;

  // Trackers
  let sentPackets = 0;
  let sentBytes = 0;
  let serverTickCount = 0;
  let serverTicksWithNewPacket = 0;
  const packetAgesAtTick = [];
  const predictionErrors = [];
  let turnInitiatedAt = null;
  let turnCompletedAtServer = null;
  let sprintInitiatedAt = null;
  let sprintAcknowledgedAtServer = null;

  // Client and server states
  let clientState = createMovementState({ x: 0, y: 0.1, z: 0 });
  let serverState = createMovementState({ x: 0, y: 0.1, z: 0 });
  let clientAuthStamina = 100;
  let clientYaw = 0;
  let serverYaw = 0;
  let clientInputSeq = 0;
  let lastSendTimeMs = -Infinity;

  // In-flight network queues:
  // Client -> Server
  const uplink = []; // { arriveAtMs, packet }
  // Server -> Client
  const downlink = []; // { arriveAtMs, snapshot }

  let currentServerInput = {
    forward: 0,
    right: 0,
    jump: false,
    sprint: false,
    crouch: false,
    yaw: 0,
    pitch: 0,
  };
  let newestPacketTimeAtServer = -Infinity;

  // Simulation clock
  const totalMs = durationSec * 1000;
  const dtSim = 1 / serverTickRate;

  let nextServerTickMs = serverTickIntervalMs;
  let nextRenderFrameMs = renderFrameIntervalMs;
  let simTimeMs = 0;

  // Event schedule
  const TURN_START_MS = 2000;
  const SPRINT_START_MS = 4000;
  const SPRINT_STOP_MS = 6000;
  const JIGGLE_START_MS = 6000;
  const STOP_MS = 8000;

  // Pseudo-random jitter generator (deterministic seed)
  let seed = 12345;
  function rand() {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  }
  function sampleLatency() {
    const j = (rand() * 2 - 1) * jitterMs;
    return Math.max(1, baseLatencyMs + j);
  }

  while (simTimeMs < totalMs) {
    const nextEventMs = Math.min(nextServerTickMs, nextRenderFrameMs);
    simTimeMs = nextEventMs;

    // 1. Deliver packets arriving up to simTimeMs
    // Uplink (Client -> Server)
    let newPacketsDeliveredThisStep = 0;
    for (let i = 0; i < uplink.length; i++) {
      if (uplink[i].arriveAtMs <= simTimeMs) {
        const { packet } = uplink.splice(i, 1)[0];
        i--;
        currentServerInput = { ...packet };
        newestPacketTimeAtServer = packet.clientTimeMs;
        newPacketsDeliveredThisStep++;
      }
    }

    // Downlink (Server -> Client)
    for (let i = 0; i < downlink.length; i++) {
      if (downlink[i].arriveAtMs <= simTimeMs) {
        const { snapshot } = downlink.splice(i, 1)[0];
        i--;
        // Client reconciliation check
        const dx = snapshot.position.x - clientState.position.x;
        const dy = snapshot.position.y - clientState.position.y;
        const dz = snapshot.position.z - clientState.position.z;
        const err = Math.hypot(dx, dy, dz);
        predictionErrors.push(err);
        // Exponential reconciliation as in GameRuntime.mjs line 537
        clientState.position.x += dx * 0.11;
        clientState.position.y += dy * 0.16;
        clientState.position.z += dz * 0.11;
      }
    }

    // 2. Client Render Frame
    if (simTimeMs >= nextRenderFrameMs) {
      const dtClient = renderFrameIntervalMs / 1000;

      // Determine client desired input based on time
      let f = 1;
      let r = 0;
      let wantSprint = false;

      if (simTimeMs >= TURN_START_MS && simTimeMs < TURN_START_MS + 200) {
        // Sharp turn over 200ms
        clientYaw = ((simTimeMs - TURN_START_MS) / 200) * (Math.PI / 2);
        if (turnInitiatedAt === null) turnInitiatedAt = simTimeMs;
      } else if (simTimeMs >= TURN_START_MS + 200) {
        clientYaw = Math.PI / 2;
      }

      if (simTimeMs >= SPRINT_START_MS && simTimeMs < SPRINT_STOP_MS) {
        wantSprint = true;
        if (sprintInitiatedAt === null) sprintInitiatedAt = simTimeMs;
      }

      if (simTimeMs >= JIGGLE_START_MS && simTimeMs < STOP_MS) {
        const cycle = Math.floor((simTimeMs - JIGGLE_START_MS) / 300);
        r = cycle % 2 === 0 ? 1 : -1;
      } else if (simTimeMs >= STOP_MS) {
        f = 0;
        r = 0;
      }

      // Client predicts locally
      clientState.sprinting = resolveSprint({
        wantsSprint: wantSprint,
        forward: f,
        right: r,
        grounded: clientState.grounded,
        stamina: clientAuthStamina,
        sprinting: clientState.sprinting,
        blocked: false,
        crouched: false,
      });

      const moveInput = {
        forward: f,
        right: r,
        jump: false,
        sprint: clientState.sprinting,
        crouch: false,
        yaw: clientYaw,
        pitch: 0,
      };

      clientState = movePlayer(clientState, moveInput, dtClient, simTimeMs / 1000, world);

      // Check client send throttle
      if (simTimeMs - lastSendTimeMs >= sendIntervalMs) {
        lastSendTimeMs = simTimeMs;
        clientInputSeq++;
        const packet = {
          seq: clientInputSeq,
          forward: f,
          right: r,
          jump: false,
          sprint: wantSprint,
          crouch: false,
          yaw: clientYaw,
          pitch: 0,
          clientTimeMs: simTimeMs,
        };
        const rawJson = JSON.stringify({ type: 'input', ...packet });
        sentBytes += rawJson.length;
        sentPackets++;
        const arriveAt = simTimeMs + sampleLatency();
        uplink.push({ arriveAtMs: arriveAt, packet });
      }

      nextRenderFrameMs += renderFrameIntervalMs;
    }

    // 3. Server Tick Execution
    if (simTimeMs >= nextServerTickMs) {
      serverTickCount++;
      const hasFresh = newestPacketTimeAtServer > 0 && newPacketsDeliveredThisStep > 0;
      if (hasFresh) {
        serverTicksWithNewPacket++;
      }
      if (newestPacketTimeAtServer > 0) {
        const age = simTimeMs - newestPacketTimeAtServer;
        packetAgesAtTick.push(age);
      }

      // Check turn latency
      if (turnInitiatedAt !== null && turnCompletedAtServer === null && currentServerInput.yaw >= Math.PI / 2 - 0.01) {
        turnCompletedAtServer = simTimeMs;
      }

      // Check sprint latency
      const serverSprinting = resolveSprint({
        wantsSprint: currentServerInput.sprint,
        forward: currentServerInput.forward,
        right: currentServerInput.right,
        grounded: serverState.grounded,
        stamina: 100,
        sprinting: serverState.sprinting,
        blocked: false,
        crouched: false,
      });

      if (sprintInitiatedAt !== null && sprintAcknowledgedAtServer === null && serverSprinting) {
        sprintAcknowledgedAtServer = simTimeMs;
      }

      const serverMoveInput = {
        ...currentServerInput,
        sprint: serverSprinting,
      };

      serverState = movePlayer(serverState, serverMoveInput, dtSim, simTimeMs / 1000, world);

      // Server emits snapshot to downlink
      const snapshot = {
        tick: serverTickCount,
        serverTimeMs: simTimeMs,
        position: { ...serverState.position },
        velocity: { ...serverState.velocity },
        sprinting: serverSprinting,
        yaw: currentServerInput.yaw,
      };
      downlink.push({ arriveAtMs: simTimeMs + sampleLatency(), snapshot });

      nextServerTickMs += serverTickIntervalMs;
    }
  }

  // Summary calculations
  const starvationRate = 1 - (serverTicksWithNewPacket / serverTickCount);
  const avgAge = packetAgesAtTick.length ? packetAgesAtTick.reduce((a, b) => a + b, 0) / packetAgesAtTick.length : 0;
  packetAgesAtTick.sort((a, b) => a - b);
  const p95Age = packetAgesAtTick.length ? packetAgesAtTick[Math.floor(packetAgesAtTick.length * 0.95)] : 0;

  const avgErr = predictionErrors.length ? predictionErrors.reduce((a, b) => a + b, 0) / predictionErrors.length : 0;
  predictionErrors.sort((a, b) => a - b);
  const p95Err = predictionErrors.length ? predictionErrors[Math.floor(predictionErrors.length * 0.95)] : 0;
  const maxErr = predictionErrors.length ? predictionErrors[predictionErrors.length - 1] : 0;

  const turnLag = (turnCompletedAtServer !== null && turnInitiatedAt !== null) ? (turnCompletedAtServer - turnInitiatedAt) : null;
  const sprintLag = (sprintAcknowledgedAtServer !== null && sprintInitiatedAt !== null) ? (sprintAcknowledgedAtServer - sprintInitiatedAt) : null;

  return {
    sendIntervalMs,
    sentPacketsPerSec: sentPackets / durationSec,
    bandwidthBytesPerSec: sentBytes / durationSec,
    serverTickCount,
    starvationRate: (starvationRate * 100).toFixed(1) + '%',
    avgInputAgeMs: avgAge.toFixed(1),
    p95InputAgeMs: p95Age.toFixed(1),
    avgPositionErrM: avgErr.toFixed(3),
    p95PositionErrM: p95Err.toFixed(3),
    maxPositionErrM: maxErr.toFixed(3),
    turnLatencyMs: turnLag !== null ? turnLag.toFixed(1) : 'N/A',
    sprintLatencyMs: sprintLag !== null ? sprintLag.toFixed(1) : 'N/A',
  };
}

// Run comparison suite across network profiles
const profiles = [
  { name: 'LAN / Low Latency (RTT ~30ms, jitter 1ms)', baseLatencyMs: 15, jitterMs: 1 },
  { name: 'Broadband / Moderate Latency (RTT ~50ms, jitter 4ms)', baseLatencyMs: 25, jitterMs: 4 },
  { name: 'Mobile / High Latency & Jitter (RTT ~120ms, jitter 15ms)', baseLatencyMs: 60, jitterMs: 15 },
];

console.log('========================================================================================');
console.log('REMOTE MOVEMENT INPUT CADENCE: 50 ms vs 33.3 ms (30 Hz Simulation Tick Rate)');
console.log('========================================================================================\n');

for (const prof of profiles) {
  console.log(`--- Condition: ${prof.name} ---`);
  const res50 = runScenario({ sendIntervalMs: 50, ...prof });
  const res33 = runScenario({ sendIntervalMs: 1000 / 30, ...prof });

  console.table([
    { Cadence: '50 ms (20 Hz)', ...res50 },
    { Cadence: '33.3 ms (30 Hz)', ...res33 },
  ]);
  console.log('');
}
