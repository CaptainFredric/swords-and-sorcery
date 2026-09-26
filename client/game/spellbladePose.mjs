export function resolveSpellbladeState(player, serverNow, castPoseUntil = 0, castPoseStartAt = -Infinity) {
  if (!player?.alive) return 'dead';
  if ((player.staggerUntil ?? 0) > serverNow) return 'stagger';
  if ((player.dashUntil ?? 0) > serverNow) return 'dash';
  if (player.guarding) return 'guard';
  if (player.attackActive) return 'attack';
  if (serverNow >= castPoseStartAt && castPoseUntil > serverNow) return 'cast';

  const velocity = player.velocity ?? { x: 0, y: 0, z: 0 };
  if (Math.abs(velocity.y ?? 0) > 0.45) return 'air';
  const horizontal = Math.hypot(velocity.x ?? 0, velocity.z ?? 0);
  if (player.sprinting && horizontal > 0.8) return 'sprint';
  if (horizontal > 0.8) return 'run';
  return 'idle';
}

export function castPoseWindowFromEvent(event) {
  if (event?.type !== 'fireballCast' || !Number.isFinite(event.at)) return null;
  const castEndsAt = Number.isFinite(event.castEndsAt) ? event.castEndsAt : event.at + 0.3;
  return { startAt: event.at, endAt: castEndsAt + 0.06 };
}

export function castPoseDeadlineFromEvent(event, currentDeadline = 0) {
  const window = castPoseWindowFromEvent(event);
  return window ? Math.max(currentDeadline, window.endAt) : currentDeadline;
}

export function bufferedServerTime(a, b, renderTimeMs) {
  const first = a ?? b;
  const second = b ?? a;
  if (!first || !second) return 0;

  const clientSpanMs = second.at - first.at;
  if (clientSpanMs > 0 && renderTimeMs >= first.at && renderTimeMs <= second.at) {
    const t = (renderTimeMs - first.at) / clientSpanMs;
    return first.serverTime + (second.serverTime - first.serverTime) * t;
  }

  const anchor = renderTimeMs >= second.at ? second : first;
  const extrapolationSec = Math.max(-0.25, Math.min(0.25, (renderTimeMs - anchor.at) / 1000));
  return anchor.serverTime + extrapolationSec;
}

export function attackMotion(player, serverNow) {
  const elapsed = Math.max(0, serverNow - (player.attackStartedAt ?? serverNow));
  const cycle = elapsed % 2.08;
  const strike = cycle < 0.72 ? 0 : cycle < 1.44 ? 1 : 2;
  const start = strike === 0 ? 0 : strike === 1 ? 0.72 : 1.44;
  const duration = strike === 2 ? 0.64 : 0.72;
  const local = Math.max(0, Math.min(1, (cycle - start) / duration));
  const swing = Math.sin(local * Math.PI);
  return { strike, local, swing };
}
