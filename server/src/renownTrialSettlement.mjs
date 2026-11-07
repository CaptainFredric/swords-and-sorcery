// Adapter between the server-owned wave ledger and the EXISTING atomic
// ProfileStore wallet. Never import or call this module in the browser.
import { GAME_MODES } from '../../shared/src/modes.mjs';
import { trialWavePlan, timelyWaveReward } from '../../shared/sim/renownTrials.mjs';

export function pendingTrialAward(room, event) {
  if (room?.mode !== GAME_MODES.RENOWN_TRIALS
      || event?.type !== 'renownTrialWaveCleared'
      || !room.rewardMatchId
      || !/^[0-9a-f-]{36}$/.test(room.rewardMatchId)) return null;
  const state = room.renownTrial;
  if (!state || event.runId !== state.runId || event.waveIndex !== state.waveIndex) return null;
  const player = room.players.get(state.playerId);
  const ledgerId = `${event.runId}:w${event.waveIndex}`;
  const row = state.ledger.find((record) => record.id === ledgerId);
  if (!row || !Number.isSafeInteger(row.reward) || row.reward < 0
      || row.wave !== event.waveIndex || row.verdict !== state.wave?.verdict
      || row.reward !== state.wave.reward) return null;
  // Reject an event whose numeric award exceeds the authoritative wave formula.
  // MatchId, award and participant identity all come from the server simulation.
  if (row.status === 'SETTLED' || row.status === 'NOT_AWARDED') return null;
  const plan = trialWavePlan(row.wave);
  if (row.reward > timelyWaveReward(plan, 0)) return null;
  if (row.reward === 0) {
    row.status = 'NOT_AWARDED';
    return null;
  }
  const token = state.profileToken ?? player?.profileToken;
  // A lost connection does not invalidate an already-authoritative clear.
  // The identity remains locked to this run even during reconnect grace.
  if (!token || (player && player.actorKind !== 'human')
    || (state.profileToken && player?.profileToken && player.profileToken !== state.profileToken)) {
    row.status = 'UNAVAILABLE';
    return null;
  }
  const receiptId = `trial-wave:${room.rewardMatchId}:w${row.wave}`;
  row.receiptId = receiptId;
  row.status = 'PENDING';
  return {
    receiptId, token, amount: row.reward, wave: row.wave,
    ledger: row, retryAt: 0, attempts: 0,
  };
}

/** Persisted receipt and balance are atomic in ProfileStore. The status is
 * changed only AFTER that transaction has returned successfully. */
export function commitTrialAward(store, pending) {
  if (!pending || pending.ledger?.receiptId !== pending.receiptId
      || pending.ledger?.status === 'UNAVAILABLE') throw new Error('Invalid pending trial settlement');
  const profile = store.settleTrialWave(pending.token, pending.receiptId, pending.amount, { wave: pending.wave });
  pending.ledger.status = 'SETTLED';
  return profile;
}
