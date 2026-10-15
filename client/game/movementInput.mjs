// Local intent is cheap and needs no network throttle. The host advances combat at 30 Hz.
// Online packets align with the server tick rate (30 Hz / ~33.3 ms) to reduce input-transition latency against the 30 Hz authoritative simulation.
export const REMOTE_INPUT_INTERVAL_MS = 1000 / 30;

export function sendMovementInput(socket, input, nowMs, stream) {
  if (socket.inspectionFrozen || (!socket.playingLocally && nowMs - stream.lastInputSentAt < REMOTE_INPUT_INTERVAL_MS)) return;
  stream.lastInputSentAt = nowMs;
  socket.input({ seq: ++stream.sequence, ...input, clientTime: socket.serverNow() });
}

