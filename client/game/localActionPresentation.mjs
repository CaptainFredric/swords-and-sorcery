import { combatActionPolicy } from '../../shared/src/combatActionPolicy.mjs';
import { spellFor } from '../../shared/src/spells.mjs';
import { recastReady } from '../../shared/src/practiceRecast.mjs';

/**
 * Whether my own action can be shown at once (the server's word follows). practice: in the Practice Yard, where an
 * ability comes back after a short gate though its real cooldown still runs (practiceRecast.mjs); gate: my own
 * press's gate, known before the server's word says so ({ spell, dash }: seconds).
 */
export function canPresentLocalAction(action, auth, localState, nowSec, { practice = false, gate = null, spell = auth?.spell } = {}) {
  if (!auth?.alive || !Number.isFinite(nowSec)) return false;
  if ((auth.staggerUntil ?? -Infinity) > nowSec) return false;
  // both hands are the Vortex's from its startup to the end of its recovery: nothing else is shown in them
  if (handsTaken(auth, nowSec)) return false;
  // bracing into any ultimate, the host takes no guard, spell or dash: none is shown (the attack is: its press is kept)
  if (auth.ultimateState?.phase === 'startup' && action !== 'attack') return false;
  const gates = (ability) => ({ [ability]: Math.max(auth.practiceGate?.[ability] ?? -Infinity, gate?.[ability] ?? -Infinity) });

  if (action === 'guard') return (auth.guardStamina ?? 0) > 0;
  if (action === 'dash') return Boolean(localState) && recastReady({ dashReadyAt: localState.dashReadyAt ?? Infinity, practiceGate: gates('dash') }, 'dash', nowSec, practice);
  if (action === 'attack') return true;
  // the spell answers the moment it is ready again (the server keeps the true cooldown)
  if (action === 'cast' && combatActionPolicy(auth, nowSec).concurrent) {
    const selected = spellFor(spell);
    if (!auth.preparedSpells?.includes(selected.id) || (auth.castEndsAt ?? 0) > nowSec || (gate?.gatherUntil ?? 0) > nowSec) return false;
    if (!selected.kind) return nowSec >= Math.max(auth.chivalryProjectileReadyAt ?? 0, gate?.projectile ?? 0);
    return recastReady({ spellReadyAt: Math.max(auth.spellReadyById?.[selected.id] ?? 0, gate?.byId?.[selected.id] ?? 0), practiceGate: gates('spell') }, 'spell', nowSec, practice);
  }
  if (action === 'cast') return recastReady({ spellReadyAt: auth.spellReadyAt ?? 0, practiceGate: gates('spell') }, 'spell', nowSec, practice);
  return false;
}

/** Whether a Blazing Vortex has a knight's hands now: lighting it, spinning, or in the moment after it ends. */
export function handsTaken(auth, nowSec) {
  return auth?.ultimateState?.id === 'vortex' || (auth?.ultimateState?.id === 'chivalry' && auth.ultimateState.phase === 'startup') || (auth?.recoverUntil ?? -Infinity) > nowSec;
}

export function localWeaponReleaseForEvent(event, localId, auth = null, nowSec = event?.at ?? 0) {
  if (!event || !localId) return null;

  const policy = combatActionPolicy(auth, nowSec);
  if (policy.concurrent && event.playerId === localId && ['spellCast', 'attackStarted', 'guardStarted'].includes(event.type)) return null;
  if ((event.suppressParryReel ?? policy.suppressParryReel) && event.type === 'parry' && event.attackerId === localId) return null;
  // (in Spells & Chivalry only the guard breaks: the sword, the spell and the dash carry on, as on the host)
  if (policy.concurrent && event.type === 'guardBreak' && event.defenderId === localId) return { attack: false, guard: true };
  if (event.type === 'ultimateStart' && event.playerId === localId && event.ultimate === 'chivalry') return { attack: true, guard: true, cast: true, dash: true };
  if (event.type === 'spellCast'  && event.playerId === localId) return { attack: true, guard: true };
  if (event.type === 'attackStarted' && event.playerId === localId) return { attack: false, guard: true };
  // (the server's word that a chain ended is not one: the arms end it by the same rule, and by the time the word
  // arrives a new tap may have started the next chain, which it must not cut off)
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
  if (!auth.alive || (auth.staggerUntil ?? -Infinity) > nowSec || handsTaken(auth, nowSec)) return { attack: true, guard: true };
  if ((auth.guardStamina ?? 0) <= 0 || (combatActionPolicy(auth, nowSec).concurrent && !auth.guarding)) return { attack: false, guard: true };
  return null;
}
