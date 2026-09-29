// What kind of opponent a bot is, as data: one controller (BotController.mjs) plays every kind from its profile, rather
// than one copied AI per kind. The rival (the Bot Duel's bot) is the default; the others are for the Practice Yard.
// Current tuning (provisional).
//
//   sword / spells: whether it attacks with each; guard: how readily it raises its guard when threatened; dash: how
//   readily it dashes; keepRange: [near, far] metres it keeps from its foe (null: it closes in); flee: it runs across
//   and away when pressed rather than fighting.

export const BOT_PROFILES = Object.freeze({
  // the Bot Duel's rival: sword and spell
  rival: Object.freeze({ sword: true, spells: true, guard: 0.58, dash: 0.12, keepRange: null, flee: false }),
  // Blade Duelist: the sword only, no offensive spells, and a readier guard. For melee spacing, guard and parry
  duelist: Object.freeze({ sword: true, spells: false, guard: 0.72, dash: 0.08, keepRange: null, flee: false }),
  // Spellcaster: spells and footwork, never the sword's offence; keeps a casting distance. For dodging and closing in
  caster: Object.freeze({ sword: false, spells: true, guard: 0.5, dash: 0.2, keepRange: Object.freeze([5.5, 9]), flee: false }),
  // Sir Runs-a-Lot: escape, spacing and guard; runs across and dashes aside rather than only backing off. For learning
  // to pursue and cut off
  runner: Object.freeze({ sword: false, spells: false, guard: 0.7, dash: 0.35, keepRange: Object.freeze([6, 11]), flee: true }),
});

/** The profile a bot plays: one named in BOT_PROFILES, or one given whole; the rival's unless it was given another. */
export function botProfile(actor) {
  const chosen = actor?.botProfile;
  if (chosen && typeof chosen === 'object') return { ...BOT_PROFILES.rival, ...chosen };
  return BOT_PROFILES[chosen] ?? BOT_PROFILES.rival;
}
