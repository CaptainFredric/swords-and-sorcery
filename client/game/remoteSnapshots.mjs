// Snapshots arrive on a variable network schedule, but the host's simulation
// timestamps advance at a fixed cadence. Base remote motion on simulation time,
// never on packet arrival intervals.
export const REMOTE_PLAYBACK_DELAY_SEC = 0.12;

export function appendRemoteSample(history, player, serverTime, at) {
  const last = history.at(-1);
  if (last && serverTime < last.serverTime) return history; // stale snapshot after a reconnect
  if (last && serverTime === last.serverTime) {
    if (last.player.alive !== player.alive) return [{ at, serverTime, player }];
    last.at = at;
    last.player = player;
    return history;
  }
  // A life transition is a presentation discontinuity, not a 12-m interpolation.
  const next = last && last.player.alive !== player.alive ? [] : history;
  next.push({ at, serverTime, player });
  while (next.length > 5) next.shift();
  return next;
}

// One shared monotonic playback clock for everyone in a room. Drift correction
// is bounded to prevent each late packet from pulling actors backwards.
export function advanceRemotePlaybackClock(previous, latest, dt, delay = REMOTE_PLAYBACK_DELAY_SEC) {
  if (!Number.isFinite(latest)) return previous;
  const target = latest - delay;
  if (!Number.isFinite(previous) || latest < previous - 1) return target;
  const step = Math.max(0, Math.min(0.05, dt));
  const projected = previous + step;
  const correction = Math.max(-0.004, Math.min(0.004, (target - projected) * 0.12));
  return Math.max(previous, Math.min(latest, projected + correction));
}

export function remoteSamplePair(samples, serverTime) {
  if (!samples.length) return null;
  if (serverTime <= samples[0].serverTime) return { a: samples[0], b: samples[0], t: 0 };
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i], b = samples[i + 1];
    if (serverTime <= b.serverTime) {
      const t = Math.max(0, Math.min(1, (serverTime - a.serverTime) / Math.max(1e-6, b.serverTime - a.serverTime)));
      return { a, b, t };
    }
  }
  const last = samples.at(-1);
  return { a: last, b: last, t: 0 };
}
