// What kind of opponent a bot is, as data: one controller (BotController.mjs) plays every kind from its profile, rather
// than one copied AI per kind. The rival (the Bot Duel's bot) is the default; the others face you in the Practice Yard.
// Every kind decides from what it can see (where you are, what you are visibly doing), never from your buttons.
// Current tuning (provisional).
//
//   sword / spells: whether it attacks with each; guard: how readily it raises its guard when threatened; dash: how
//   readily it dashes; keepRange: [near, far] metres it keeps from its foe (null: it closes in); flee: it gets out of
//   the way when pressed rather than fighting; spellCycle: the spells it turns through, one after another (null: the
//   one it carries); spellCooldown: its spells come back this much sooner than a knight's; ward: a ward it carries in
//   its spell's place and calls as a fight begins (Sheathe in Steel; a kind that also throws spells keeps the ward on a
//   clock of its own, at a knight's full cooldown, so calling it never holds its spells back); lunge: [near, far]
//   metres from which it dashes in to close to the blade; footwork: how hard it circles once in sword range (the
//   rival's 0.55); name: what the Practice Yard calls it.

export const BOT_PROFILES = Object.freeze({
  // the Bot Duel's rival: sword and spell
  rival: Object.freeze({ sword: true, spells: true, guard: 0.58, dash: 0.12, keepRange: null, flee: false }),
  // Mr. Melee: a swordsman through and through. Lunges in to the blade, circles hard once there, guards readily,
  // carries Sheathe in Steel and hardens as a fight begins (never at nothing); no offensive spells
  melee: Object.freeze({
    name: 'Mr. Melee', sword: true, spells: false, guard: 0.72, dash: 0.1, keepRange: null, flee: false, ward: 'steel',
    lunge: Object.freeze([3.2, 7]), footwork: 0.85,
  }),
  // Spells & Sorcery: all spell, never the sword. Keeps its casting distance, slips aside when you close, turns through
  // every spell there is (and hardens with Sheathe in Steel when pressed), and has the thrown ones back sooner than
  // you do: a spell every two and a half to four seconds, never a volley
  caster: Object.freeze({
    name: 'Spells & Sorcery', sword: false, spells: true, guard: 0.5, dash: 0.25, keepRange: Object.freeze([6, 10]), flee: false,
    spellCycle: Object.freeze(['fireball', 'frostfire', 'gale']), spellCooldown: 0.65, ward: 'steel',
  }),
  // Sir Runs-a-Lot: avoidance. Runs across your line and away at an angle (never just backwards), dashes aside when
  // you close, guards when caught; for learning to pursue and cut off
  runner: Object.freeze({
    name: 'Sir Runs-a-Lot', sword: false, spells: false, guard: 0.7, dash: 0.35, keepRange: Object.freeze([6, 11]), flee: true,
  }),
});

/** The profile a bot plays: one named in BOT_PROFILES, or one given whole; the rival's unless it was given another. */
export function botProfile(actor) {
  const chosen = actor?.botProfile;
  if (chosen && typeof chosen === 'object') return { ...BOT_PROFILES.rival, ...chosen };
  return BOT_PROFILES[chosen] ?? BOT_PROFILES.rival;
}

/**
 * The spell a caster that turns through `cycle` casts next at a foe `distance` away: the next in turn after the one
 * it last cast that can reach (a Gale only from close by). null when none can.
 */
export function nextCycledSpell(cycle, last, distance, reachOf) {
  if (!cycle?.length) return null;
  const from = Math.max(-1, cycle.indexOf(last));
  for (let step = 1; step <= cycle.length; step += 1) {
    const spell = cycle[(from + step) % cycle.length];
    if (distance <= reachOf(spell)) return spell;
  }
  return null;
}
