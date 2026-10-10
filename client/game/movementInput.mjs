// Local intent is cheap and needs no network throttle. The host still advances combat at 30 Hz.
// Online packets retain the existing 50 ms cadence. Inspection steps retain their captured input.
export function sendMovementInput(socket, input, nowMs, stream) {
  if (socket.inspectionFrozen || (!socket.playingLocally && nowMs - stream.lastInputSentAt < 50)) return;
  stream.lastInputSentAt = nowMs;
  socket.input({ seq: ++stream.sequence, ...input, clientTime: socket.serverNow() });
}
