export function localCombatFeedback(event, localId) {
  if (!event || !localId) return null;
  const involved = event.attackerId === localId || event.defenderId === localId;
  if (!involved) return null;

  if (event.type === 'parry') return 'parry';
  if (event.type === 'block') return 'block';
  if (event.type === 'guardBreak') return 'guardBreak';
  return null;
}

export function shouldPlayWorldClang(event, localId) {
  return Boolean(event && localId && event.type === 'swordWorldImpact' && event.playerId === localId);
}
