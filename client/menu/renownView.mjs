import { clothChoice } from '../../shared/src/cosmetics.mjs';
export function renownView(profile, preview, online) {
  const item = clothChoice(preview);
  const owned = profile?.owned?.includes(item.id);
  const equipped = profile?.equipped === item.id;
  return { item, action: owned ? 'equip' : 'purchase',
    label: equipped ? 'EQUIPPED' : owned ? 'EQUIP' : `UNLOCK · ${item.price} RENOWN`,
    disabled: !online || !profile || equipped || (!owned && profile.balance < item.price) };
}
export function rewardText(profile, snapshot, local) {
  if (local) return 'Offline training complete. Renown is earned in server hosted matches.';
  const reward = profile?.lastReward;
  if (!reward || !snapshot?.rewardMatchId || reward.matchId !== snapshot.rewardMatchId) return 'Confirming your match reward…';
  return reward.amount > 0
    ? `+${reward.amount} RENOWN · ${reward.amount === 30 ? '20 completion + 10 victory' : 'Match completion'} · Balance ${profile.balance}`
    : 'No Renown this match. Complete 30 seconds of combat with a kill, death or parry. Forfeits award zero.';
}
