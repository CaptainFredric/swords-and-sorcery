// Tracks win streaks across matches for knights in the current session.
// Scored matches increment the victor's win streak and reset other participants' streaks.

const streaks = new Map();

export function recordMatchResult({ winnerId = null, players = [], isScored = true } = {}) {
  if (!isScored || !winnerId) return;
  for (const player of players) {
    const id = typeof player === 'string' ? player : player?.id;
    if (!id) continue;
    if (id === winnerId) {
      streaks.set(id, (streaks.get(id) ?? 0) + 1);
    } else {
      streaks.set(id, 0);
    }
  }
}

export function getWinStreak(playerId) {
  if (!playerId) return 0;
  return streaks.get(playerId) ?? 0;
}

export function setWinStreak(playerId, count) {
  if (!playerId) return;
  streaks.set(playerId, Math.max(0, count));
}

export function resetWinStreaks() {
  streaks.clear();
}
