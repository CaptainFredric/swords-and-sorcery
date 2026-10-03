// Challenge feats have their own eligibility. A genuine short match can still contain a mastery feat.
export function eligibleChallengeParticipant(room, player) {
  return room.state === 'FINISHED' && ['FFA', 'DUEL', 'BOT_DUEL'].includes(room.mode)
    && room.finishReason !== 'forfeit' && Number.isFinite(room.matchStartedAt)
    && player.actorKind === 'human' && player.connected && Boolean(player.profileToken);
}
