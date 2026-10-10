// A life transition is a presentation discontinuity. Never interpolate a corpse
// into its spawn point, or pose a newly dead body from an older living sample.
export function appendRemoteSample(history, player, serverTime, at) {
  const previous = history.at(-1)?.player;
  const next = previous && previous.alive !== player.alive ? [] : history;
  next.push({ at, serverTime, player });
  while (next.length > 5) next.shift();
  return next;
}
