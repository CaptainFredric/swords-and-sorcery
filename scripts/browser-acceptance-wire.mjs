// Observe real game WebSocket frames from CDP. Never send gameplay commands
// from this probe, and retain only the fields needed to explain acceptance.
export function observeAcceptanceWire(label) {
  let socketId;
  let playerId;
  let previousInput;
  let previousSnapshot;
  let lastInputAt = 0;
  let peakAltitude = 0;
  const wire = { state: null, forward: null, movement: null };

  function report(stage, details) {
    console.log('[ACCEPTANCE WIRE]', JSON.stringify({ client: label, at: new Date().toISOString(), stage, ...details }));
  }

  wire.watchMovement = () => {
    wire.forward = null;
    wire.movement = { start: wire.state, firstAck: null, peak: 0 };
    report('movement baseline', wire.state);
  };

  wire.observe = ({ method, params }) => {
    const sent = method === 'Network.webSocketFrameSent';
    if (!sent && method !== 'Network.webSocketFrameReceived') return;
    if (params.response.opcode !== 1) return;
    let packet;
    try { packet = JSON.parse(params.response.payloadData); } catch { return; }
    if (!sent && packet.type === 'joined') {
      socketId = params.requestId;
      playerId = wire.playerId = packet.playerId;
    }
    if (params.requestId !== socketId) return;

    if (sent) {
      if (packet.type === 'input') {
        const input = { seq: packet.seq, forward: packet.forward, right: packet.right,
          jump: Boolean(packet.jump), rise: Boolean(packet.flightRise) };
        const signature = JSON.stringify([input.forward, input.right, input.jump, input.rise]);
        if (signature !== previousInput || ((input.jump || input.rise) && Date.now() - lastInputAt >= 400)) {
          report('input sent', input);
          previousInput = signature;
          lastInputAt = Date.now();
        }
        if (wire.movement && !wire.forward && input.forward > 0.5) {
          wire.forward = input;
          report('first W input sent', input);
        }
      } else if (['siegeOperate', 'flightEject', 'fightFlightFire', 'flightDash', 'attack', 'guard'].includes(packet.type)) {
        report('command sent', { type: packet.type, down: packet.down });
      }
      return;
    }

    if (packet.type === 'error') report('server rejection', { message: packet.message });
    if (packet.type === 'events') {
      for (const event of packet.events ?? []) {
        if (event.type === 'fightFlightMounted' || event.type === 'fightFlightDismounted') {
          report('server event', { type: event.type, atServer: event.at, operator: event.playerId, machine: event.machineId });
        }
      }
    }
    if (packet.type !== 'snapshot') return;

    const player = packet.players.find(p => p.id === playerId);
    const flight = packet.fightFlight;
    const state = wire.state = {
      tick: packet.tick, serverTime: packet.serverTime, roomState: packet.roomState,
      position: player?.position, velocity: player?.velocity, alive: player?.alive, ack: player?.lastInputSeq,
      mounted: player?.operatingFightFlightId, operator: flight?.operatorId,
      altitude: flight?.y, rpm: flight?.rotorRPM, flightMode: flight?.mode, shots: flight?.shotSeq,
    };
    const signature = JSON.stringify([state.roomState, state.mounted, state.operator, state.flightMode, state.shots]);
    const altitude = state.altitude ?? 0;
    if (signature !== previousSnapshot || altitude > peakAltitude + 0.25) {
      report('authoritative snapshot', state);
      previousSnapshot = signature;
      peakAltitude = Math.max(peakAltitude, altitude);
    }
    const movement = wire.movement;
    if (!movement?.start?.position || !wire.forward || !(state.ack >= wire.forward.seq) || !state.position) return;
    if (!movement.firstAck) {
      movement.firstAck = state;
      report('first W sequence acknowledged', state);
    }
    if (state.roomState !== 'PLAYING' || !state.alive) return;
    const start = movement.start.position;
    const distance = Math.hypot(state.position.x - start.x, state.position.z - start.z);
    if (distance > movement.peak) {
      if (movement.peak <= 0.25 && distance > 0.25) report('authoritative W displacement', { distance, ...state });
      movement.peak = distance;
    }
  };
  return wire;
}
