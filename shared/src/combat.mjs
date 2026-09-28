export const GAME = Object.freeze({
  maxHealth: 100,
  // four clean hits fell a full-health Spellblade (a spell can stand in for one)
  swordDamage: 28,
  swordRange: 2.75,
  guardMax: 100,
  guardBlockCost: 35,
  parryWindowMs: 180,
  parryStaggerMs: 450,
  guardBreakStaggerMs: 700,
  dashCooldownSec: 5,
});

export const SWORD_STRIKE_TIMES = Object.freeze([0.4, 1.1, 1.8]);

export function getSwordStrikeIndex(elapsedSec) {
  let result = -1;
  for (let i = 0; i < SWORD_STRIKE_TIMES.length; i += 1) {
    if (elapsedSec + 1e-9 >= SWORD_STRIKE_TIMES[i]) result = i;
  }
  return result;
}

export function resolveSwordVsGuard({ guarding, guardAgeMs, stamina }) {
  if (!guarding) return { kind: 'hit', staminaAfter: stamina };
  if (guardAgeMs <= GAME.parryWindowMs) return { kind: 'parry', staminaAfter: stamina };
  const staminaAfter = Math.max(0, stamina - GAME.guardBlockCost);
  return { kind: staminaAfter === 0 ? 'guardBreak' : 'block', staminaAfter };
}

export function isCooldownReady(nowSec, readyAtSec) {
  return nowSec >= readyAtSec;
}
