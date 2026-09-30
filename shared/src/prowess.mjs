// Prowess: what a knight earns by fighting, spent on their ultimate. One meter for every ultimate there is.
//
// It comes from meaningful combat and nothing else: health taken off a foe most of all; health lost to a foe a
// smaller share (the knight on the losing end is not locked out of theirs); a parry, a broken guard, a foe thrown
// well off their feet a small fixed piece. Nothing for standing about, nothing for hurting yourself, nothing in the
// Practice Yard, and nothing for what an ultimate does while it is active (Sunder does not pay for the next Sunder).
// It holds one ultimate at most, it is kept through a death, and it starts each match empty. Tuned so a knight
// usually has one after some 45-75 s of real fighting (a health bar and a half to two of back and forth); a long
// fight can earn a second. Current tuning (provisional).

export const PROWESS = Object.freeze({
  full: 100,
  dealt: 0.7,          // per point of health taken off a foe
  taken: 0.35,         // per point of health lost to a foe
  parry: 8,
  guardBreak: 10,
  displaced: 5,        // a foe thrown well off their feet (a gust's heart, a spell's burst square on)
});

/** Whether a room pays prowess (its mode says so: never the Practice Yard). */
export function earnsProwess(room) {
  return room?.policy?.prowess !== false;
}

/** Add prowess to a knight (up to one full ultimate). */
export function gainProwess(room, player, amount, rules = PROWESS) {
  if (!player || !earnsProwess(room) || !(amount > 0)) return 0;
  const before = player.prowess ?? 0;
  player.prowess = Math.min(rules.full, before + amount);
  return player.prowess - before;
}

/**
 * What damage pays: the one who dealt it and the one who took it (none for hurting oneself; an ultimate's own damage
 * pays its user nothing, though the one it hurts still earns from it).
 */
export function prowessForDamage(room, attacker, victim, amount, { ultimate = false } = {}, rules = PROWESS) {
  if (!attacker || !victim || attacker === victim) return;
  if (!ultimate) gainProwess(room, attacker, amount * rules.dealt, rules);
  gainProwess(room, victim, amount * rules.taken, rules);
}
