import { CLOTH, clothChoice } from '../../shared/src/cosmetics.mjs';
export function renownView(profile, preview, online) {
  const item = clothChoice(preview);
  const ownedIds = Array.isArray(profile?.owned) ? profile.owned.filter((id) => Object.hasOwn(CLOTH, id)) : [];
  const owned = ownedIds.includes(item.id);
  const equipped = profile?.equipped === item.id;
  const balance = Number.isSafeInteger(profile?.balance) && profile.balance >= 0 ? profile.balance : 0;
  const remaining = Math.max(0, item.price - balance);
  const hint = owned ? (equipped ? 'Worn into your next battle.' : 'In your collection. Ready to equip.')
    : remaining ? `${remaining} more Renown to unlock.` : 'Within reach. Unlock this standard.';
  return { item, owned, equipped, remaining, hint, balance,
    collection: `${new Set(ownedIds).size} / ${Object.keys(CLOTH).length}`,
    progress: owned || !item.price ? 1 : Math.min(1, balance / item.price),
    action: owned ? 'equip' : 'purchase',
    label: equipped ? 'EQUIPPED' : owned ? 'EQUIP STANDARD' : `UNLOCK · ${item.price} RENOWN`,
    disabled: !online || !profile || equipped || (!owned && remaining > 0) };
}
export function rewardText(profile, snapshot, local) {
  if (local) return 'Offline training complete. Renown is earned in server hosted matches.';
  const reward = profile?.lastReward;
  if (!reward || !snapshot?.rewardMatchId || reward.matchId !== snapshot.rewardMatchId) return 'Confirming your match reward…';
  if (reward.amount > 0) {
    const parts = [];
    const challenge = reward.challengeAmount ?? 0;
    const completion = reward.completion ?? (reward.amount > challenge ? 20 : 0);
    const victory = reward.victory ?? (reward.amount - challenge === 30 ? 10 : 0);
    if (completion) parts.push(`${completion} completion`);
    if (victory) parts.push(`${victory} victory`);
    if (challenge) parts.push(`${challenge} mastery`);
    return `+${reward.amount} RENOWN · ${parts.join(' + ')} · Balance ${profile.balance}`;
  }
  const reasons = {
    forfeit: 'Match ended by forfeit. No Renown awarded.',
    short: 'This match lasted under 30 seconds. No Renown awarded.',
    inactive: 'Join the fighting with a kill, death or parry to earn Renown.',
    left: 'Finish the match while connected to earn Renown.',
    training: 'Practice is for training. Earn Renown in completed duels and arena matches.',
  };
  return reasons[reward.reason] ?? 'No Renown this match. Complete 30 seconds of combat with a kill, death or parry. Forfeits award zero.';
}
