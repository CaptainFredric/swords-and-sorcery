import { activeUltimate } from './ultimates.mjs';

const ORDINARY = Object.freeze({ concurrent: false, suppressParryReel: false, projectileGateSec: 0 });

/** The ordinary kit can coexist only during a committed, living Chivalry window. */
export function combatActionPolicy(player, nowSec) {
  if (!player?.alive) return ORDINARY;
  const ultimate = activeUltimate(player, nowSec);
  if (ultimate?.id !== 'chivalry') return ORDINARY;
  return { concurrent: true, suppressParryReel: true, projectileGateSec: ultimate.projectileChivalryGateSec };
}
