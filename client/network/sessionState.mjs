export function clearExpiredSession(socketState, storage) {
  if (!socketState) return;

  socketState.playerId = null;
  socketState.token = null;
  socketState.roomCode = null;
  socketState.latestSnapshot = null;
  socketState.snapshotReceivedAt = 0;

  storage?.removeItem?.('ss-session-token');
  storage?.removeItem?.('ss-room-code');
}
