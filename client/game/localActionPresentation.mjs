export function canPresentLocalAction(action, auth, localState, nowSec) {
  if (!auth?.alive || !Number.isFinite(nowSec)) return false;
  if ((auth.staggerUntil ?? -Infinity) > nowSec) return false;

  if (action === 'guard') return (auth.guardStamina ?? 0) > 0;
  if (action === 'dash') return Boolean(localState) && nowSec >= (localState.dashReadyAt ?? Infinity);
  if (action === 'attack') return true;
  return false;
}

export function localWeaponReleaseForEvent(event, localId) {
  if (!event || !localId) return null;

  if (event.type === 'fireballCast' && event.playerId === localId) return { attack: true, guard: true };
  if (event.type === 'attackStarted' && event.playerId === localId) return { attack: false, guard: true };
  if (event.type === 'attackEnded' && event.playerId === localId) return { attack: true, guard: false };
  if (event.type === 'guardStarted' && event.playerId === localId) return { attack: true, guard: false };
  if (event.type === 'guardEnded' && event.playerId === localId) return { attack: false, guard: true };
  if (event.type === 'swordWorldImpact' && event.playerId === localId) return { attack: true, guard: false };
  if (event.type === 'parry' && event.attackerId === localId) return { attack: true, guard: false };
  if (event.type === 'guardBreak' && event.defenderId === localId) return { attack: false, guard: true };
  if (event.type === 'death' && event.victimId === localId) return { attack: true, guard: true };
  if (event.type === 'matchEnded') return { attack: true, guard: true };
  return null;
}

export function localWeaponReleaseForSnapshot(auth, nowSec) {
  if (!auth || !Number.isFinite(nowSec)) return null;
  if (!auth.alive || (auth.staggerUntil ?? -Infinity) > nowSec) return { attack: true, guard: true };
  if ((auth.guardStamina ?? 0) <= 0) return { attack: false, guard: true };
  return null;
}
