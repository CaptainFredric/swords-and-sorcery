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

// Sword contacts report their quality separately. Burn ticks report damage, not a fresh impact.
export function damageHitMarker(event, localId) {
  if (!localId || event?.type !== 'damage' || event.attackerId !== localId ||
      !event.victimId || event.victimId === localId || !(event.amount > 0)) return null;
  return event.source === 'sword' || event.source === 'burn' ? null : 'hit';
}
