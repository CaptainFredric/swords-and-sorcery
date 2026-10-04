import { activeUltimate, ultimateStartup, vortexing } from './ultimates.mjs';

const ORDINARY = Object.freeze({ concurrent: false, suppressParryReel: false, projectileGateSec: 0 });

/** The ordinary kit can coexist only during a committed, living Chivalry window. */
export function combatActionPolicy(player, nowSec) {
  if (!player?.alive) return ORDINARY;
  const ultimate = activeUltimate(player, nowSec);
  if (ultimate?.id !== 'chivalry') return ORDINARY;
  return { concurrent: true, suppressParryReel: true, projectileGateSec: ultimate.projectileChivalryGateSec };
}

/** Shared action exclusions for authoritative Sprint and local prediction. */
export function combatBlocksSprint(player, nowSec, {
  guarding = player?.guarding, attacking = player?.attackActive, casting = Boolean(player?.pendingSpell || player?.castEndsAt > nowSec),
} = {}) {
  if ((player?.staggerUntil ?? 0) > nowSec || ultimateStartup(player, nowSec)?.id === 'chivalry' || vortexing(player, nowSec)) return true;
  return !combatActionPolicy(player, nowSec).concurrent && Boolean(guarding || attacking || casting);
}
