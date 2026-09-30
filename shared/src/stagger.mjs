// Stagger: balance lost to what has struck a knight, accumulated. Every physical impact adds to it by how hard it was
// (a glancing touch a little, a clean blow more, a collision at full tilt more still, a broken guard a great deal),
// and it drains away steadily once nothing has shaken them for a moment. It is not a hit reaction (those are the
// client's, a flinch per blow): it is the state under them.
//
// When it fills, the knight's balance breaks: they are staggered (`staggerUntil`, the same "cannot act" state a parry
// or a broken guard already gives) for about a second. Their stagger then drops well down rather than to nothing, and
// drains faster for a short recovery, taking less from what strikes them meanwhile: footing found again, not a knight
// held down by blow after blow. A staggered knight is shoved further (it is how a lost balance feels); nothing takes
// their controls. Current tuning (provisional).

export const STAGGER = Object.freeze({
  max: 100,
  // what each kind of impact adds at its most forceful (a sword blow scales by its force: swordForce in combat.mjs)
  gain: Object.freeze({
    sword: 26,          // a sword blow at full force (a glancing one at a standstill gives about a fifth of it)
    blocked: 0.35,      // a blow on a guard: this share of what it would have given
    guardBreak: 30,     // a guard broken
    parried: 14,        // a blow turned by a perfect guard: the one who swung it
    gale: 20,           // a gust at its heart
    blast: 14,          // a spell's burst, square on
    gauntlet: 10,       // a thrown fist
  }),
  holdSec: 0.9,         // how long it holds after a knight is shaken, before it drains
  drainPerSec: 22,
  // the break
  breakSec: 1.0,        // staggered this long
  afterBreak: 30,       // and left this unsteady (not reset)
  recoverSec: 2.5,      // then, this long after the break: it drains faster, and blows add less
  recoverDrainPerSec: 45,
  recoverGain: 0.5,
  // a shove on a knight this unsteady goes this much further (at a full meter)
  knockback: 0.35,
});

/** A knight's stagger, fresh. */
export function freshStagger() {
  return { level: 0, shakenAt: -Infinity, recoverUntil: -Infinity };
}

/**
 * Add `amount` to a knight's stagger (scaled down while they recover from a break). Returns true if their balance
 * breaks now (the level has reached the top, and they are not already recovering from a break).
 */
export function addStagger(stagger, amount, nowSec, rules = STAGGER) {
  if (!stagger || !(amount > 0)) return false;
  const recovering = nowSec < stagger.recoverUntil;
  stagger.level = Math.min(rules.max, stagger.level + amount * (recovering ? rules.recoverGain : 1));
  stagger.shakenAt = nowSec;
  if (recovering || stagger.level < rules.max) return false;
  stagger.level = rules.afterBreak;
  stagger.recoverUntil = nowSec + rules.breakSec + rules.recoverSec;
  return true;
}

/** Drain a knight's stagger over `dt` seconds ending at `nowSec`. */
export function drainStagger(stagger, dt, nowSec, rules = STAGGER) {
  if (!stagger || stagger.level <= 0) return;
  const recovering = nowSec < stagger.recoverUntil;
  if (!recovering && nowSec - stagger.shakenAt < rules.holdSec) return;
  stagger.level = Math.max(0, stagger.level - (recovering ? rules.recoverDrainPerSec : rules.drainPerSec) * dt);
}

/** How much further a shove carries a knight this unsteady. */
export function staggerShove(stagger, rules = STAGGER) {
  return 1 + rules.knockback * Math.max(0, Math.min(1, (stagger?.level ?? 0) / rules.max));
}
