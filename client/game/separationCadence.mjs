// The host resolves player-to-player overlap once per authoritative tick.
// Rendering at 120 Hz must not resolve that same overlap four more times.
export function shouldPredictSeparation(previousKey, snapshot) {
  if (!snapshot || !Number.isFinite(snapshot.tick)) return false;
  const key = `${snapshot.roomCode ?? ''}/${snapshot.matchStartedAt ?? ''}/${snapshot.tick}`;
  return key !== previousKey;
}
export function separationTickKey(snapshot) {
  return snapshot ? `${snapshot.roomCode ?? ''}/${snapshot.matchStartedAt ?? ''}/${snapshot.tick}` : null;
}
