const HISTORY_SEC = 0.5;

function cloneTransform(player) {
  return {
    position: { x: player.position.x, y: player.position.y, z: player.position.z },
    yaw: player.yaw ?? 0,
    pitch: player.pitch ?? 0,
  };
}

function lerpAngle(a, b, t) {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * t;
}

export function recordTransform(player, nowSec) {
  if (!Array.isArray(player.history)) player.history = [];
  player.history.push({ at: nowSec, ...cloneTransform(player) });
  const cutoff = nowSec - HISTORY_SEC;
  while (player.history.length > 1 && player.history[0].at < cutoff) player.history.shift();
}

export function sampleTransform(player, atSec) {
  const history = Array.isArray(player.history) ? player.history : [];
  if (!history.length) return cloneTransform(player);
  if (atSec <= history[0].at) {
    const s = history[0];
    return { position: { ...s.position }, yaw: s.yaw, pitch: s.pitch };
  }
  const last = history[history.length - 1];
  if (atSec >= last.at) {
    return { position: { ...last.position }, yaw: last.yaw, pitch: last.pitch };
  }
  for (let i = 0; i < history.length - 1; i += 1) {
    const a = history[i];
    const b = history[i + 1];
    if (a.at <= atSec && atSec <= b.at) {
      const span = Math.max(1e-9, b.at - a.at);
      const t = (atSec - a.at) / span;
      return {
        position: {
          x: a.position.x + (b.position.x - a.position.x) * t,
          y: a.position.y + (b.position.y - a.position.y) * t,
          z: a.position.z + (b.position.z - a.position.z) * t,
        },
        yaw: lerpAngle(a.yaw, b.yaw, t),
        pitch: a.pitch + (b.pitch - a.pitch) * t,
      };
    }
  }
  return cloneTransform(player);
}

export const TRANSFORM_HISTORY_SEC = HISTORY_SEC;

export function compensatedInputTime(clientTime, serverNow, maxBackdateSec = 0.2) {
  if (!Number.isFinite(clientTime)) return serverNow;
  return Math.max(serverNow - maxBackdateSec, Math.min(serverNow, clientTime));
}
