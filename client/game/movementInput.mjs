// Local intent is cheap and needs no network throttle. The host advances combat at 30 Hz.
// Online packets transmit immediately upon meaningful input transitions (direction change,
// sprint/crouch toggle, significant camera yaw), backed by a 50 ms heartbeat to keep server
// state synchronized without wasting network bandwidth during steady locomotion.

export const REMOTE_INPUT_HEARTBEAT_MS = 50;
export const REMOTE_INPUT_MIN_INTERVAL_MS = 12; // cap burst rate to ~80 Hz under extreme input frequency
export const REMOTE_YAW_THRESHOLD_RAD = 0.03; // ~1.72 degrees
export const REMOTE_PITCH_THRESHOLD_RAD = 0.06;

export function hasMeaningfulInputChange(current, previous) {
  if (!previous) return true;
  if(Boolean(current.mounted)!==Boolean(previous.mounted))return true;
  if(current.mounted){
    if(Math.abs((current.forward??0)-(previous.forward??0))>.01||Math.abs((current.right??0)-(previous.right??0))>.01)return true;
    if(Math.abs(Math.atan2(Math.sin(current.yaw-previous.yaw),Math.cos(current.yaw-previous.yaw)))>.002||Math.abs(current.pitch-previous.pitch)>.002)return true;
    if(current.siegeTarget&&previous.siegeTarget&&Math.hypot(...['x','y','z'].map(k=>current.siegeTarget[k]-previous.siegeTarget[k]))>.03)return true;
  }
  if (Boolean(current.sprint) !== Boolean(previous.sprint)) return true;
  if (Boolean(current.crouch) !== Boolean(previous.crouch)) return true;
  if (Boolean(current.jump) !== Boolean(previous.jump)) return true;
  if (Boolean(current.flightRise) !== Boolean(previous.flightRise)) return true;
  if (Boolean(current.flightLower) !== Boolean(previous.flightLower)) return true;
  if (Math.abs((current.forward ?? 0) - (previous.forward ?? 0)) > 0.05) return true;
  if (Math.abs((current.right ?? 0) - (previous.right ?? 0)) > 0.05) return true;
  if (Math.abs((current.yaw ?? 0) - (previous.yaw ?? 0)) > REMOTE_YAW_THRESHOLD_RAD) return true;
  if (Math.abs((current.pitch ?? 0) - (previous.pitch ?? 0)) > REMOTE_PITCH_THRESHOLD_RAD) return true;
  return false;
}

export function sendMovementInput(socket, input, nowMs, stream) {
  if (socket.inspectionFrozen) return;

  if (socket.playingLocally) {
    stream.lastInputSentAt = nowMs;
    stream.lastSentInput = { ...input };
    socket.input({ seq: ++stream.sequence, ...input, clientTime: socket.serverNow() });
    return;
  }

  const elapsed = nowMs - (stream.lastInputSentAt ?? -Infinity);
  const changed = hasMeaningfulInputChange(input, stream.lastSentInput);
  const heartbeatExpired = elapsed >= REMOTE_INPUT_HEARTBEAT_MS;

  // If input hasn't meaningfully changed, wait for heartbeat.
  // If it did change, honor min interval to prevent unbounded packet bursts.
  if (!heartbeatExpired && (!changed || elapsed < REMOTE_INPUT_MIN_INTERVAL_MS)) {
    return;
  }

  stream.lastInputSentAt = nowMs;
  stream.lastSentInput = { ...input };
  socket.input({ seq: ++stream.sequence, ...input, clientTime: socket.serverNow() });
}
