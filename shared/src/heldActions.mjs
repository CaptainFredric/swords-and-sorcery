// Held buttons, a rule of the game: an attack or a guard whose button is still held comes back by itself as soon as it
// can, after whatever broke it off (a Parry's reel, a stagger, a broken guard, a wall, a spell, the fist), with no need
// to press it again. Of the two held together, the one pressed last has the hands, as it had when it was pressed; in
// Spells & Chivalry, where both are had at once, each comes back on its own.
//
// A guard that comes back up by itself is a held guard, not a timed one: it blocks, and only a fresh press can Parry.

/** Which of the held buttons' actions should be had now ({ attack, guard }: booleans). Times are the presses'. */
export function heldActions({ attack = false, guard = false, attackPressedAt = -Infinity, guardPressedAt = -Infinity, concurrent = false } = {}) {
  if (concurrent || !(attack && guard)) return { attack: Boolean(attack), guard: Boolean(guard) };
  const attackLast = attackPressedAt > guardPressedAt;
  return { attack: attackLast, guard: !attackLast };
}
