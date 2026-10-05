// How well a bot plays, apart from what kind of opponent it is (botBehavior.mjs). Difficulty here is decision quality
// and nothing else: how soon it reacts, whether it times its guard to the strike it can see coming (a parry), whether
// it steps out of a swing's reach instead of standing in it, whether it punishes an opening, whether it leads a spell
// and how true it throws, whether it slips a spell coming at it, when it backs off to let its health come back, how
// it judges its ultimate and a Gale near a drop, and how often it simply errs. Never more health or damage, never a
// cooldown shortened, and never anything a player could not see: it reads its foe's body, blade and spells as anyone
// watching would (when a swing began and which strike is next, a spell in flight, who is reeling), never their
// buttons or their stamina.
//
// The Knight is the rival as it has always fought (every new judgment off); the Squire is slower and makes
// mistakes; the Champion and the Spellblade are better at the game, the Spellblade the best a knight plays it: the
// closest thing to how the Spellblade himself fights.
//
//   reaction: [least, spread] seconds before it answers what it sees (a quick player is about a fifth of a second);
//   think: seconds between its offensive decisions; guard: how readily it guards when threatened (times its kind's);
//   guardFloor: below this much of its own stamina it would rather get out of reach than block; parry: the share of
//   those guards it times to land the strike in the parry window; spacing: the share of threatening swings it steps
//   out of reach of; punish: how surely it goes at an opening (a foe reeling, bracing into an ultimate, or gathering a
//   spell); patience: how often it answers a raised guard with a spell (spells pass a guard) instead of swinging into
//   it; lead: how far ahead of a moving foe it aims a spell (1: where they will be); aimError: its throws' scatter
//   (radians); dodge: how often it slips a spell coming at it; retreat: at or under this much health, with its foe well
//   ahead, it backs off to heal (0: never); smartUltimate: it calls its ultimate when it will tell (a foe reeling, low,
//   or a moment's opening), not merely when full; edgeGale: how much it saves a Gale for a foe with a drop behind them;
//   sprintReserve: stamina it keeps back from sprinting, to guard with; mistakes: how often a swing is begun from just
//   out of reach; aggression: how readily it presses at all; chain: [least, spread] seconds it holds its sword chain
//   before deciding again (the whole chain is about two; a foe left open, it presses on to the end); yields: it lets
//   its own swing go to guard, parry or step out when its foe's blow will land first (never trading a blow it loses).
export const BOT_SKILLS = Object.freeze({
  squire: Object.freeze({
    label: 'Squire', name: 'Rival Squire', reaction: Object.freeze([0.42, 0.3]), think: 0.32, guard: 0.55, guardFloor: 0,
    parry: 0, spacing: 0, punish: 0, patience: 0, lead: 0, aimError: 0.12, dodge: 0, retreat: 0, smartUltimate: false,
    edgeGale: 0, sprintReserve: 15, mistakes: 0.25, aggression: 0.8, chain: Object.freeze([1.9, 0.3]), yields: false,
  }),
  knight: Object.freeze({
    label: 'Knight', name: 'Rival Spellblade', reaction: Object.freeze([0.22, 0.2]), think: 0.18, guard: 1, guardFloor: 0,
    parry: 0, spacing: 0, punish: 0, patience: 0, lead: 0, aimError: 0, dodge: 0, retreat: 0, smartUltimate: false,
    edgeGale: 0, sprintReserve: 45, mistakes: 0, aggression: 1, chain: Object.freeze([1.9, 0.3]), yields: false,
  }),
  champion: Object.freeze({
    label: 'Champion', name: 'Rival Champion', reaction: Object.freeze([0.19, 0.1]), think: 0.14, guard: 1.15, guardFloor: 12,
    parry: 0.4, spacing: 0.15, punish: 0.7, patience: 0.4, lead: 0.75, aimError: 0.03, dodge: 0.35, retreat: 25,
    smartUltimate: true, edgeGale: 0.6, sprintReserve: 45, mistakes: 0, aggression: 1, chain: Object.freeze([1.9, 0.3]), yields: true,
  }),
  spellblade: Object.freeze({
    label: 'The Spellblade', name: 'The Spellblade', reaction: Object.freeze([0.17, 0.05]), think: 0.1, guard: 1.3, guardFloor: 15,
    parry: 0.75, spacing: 0.3, punish: 0.95, patience: 0.75, lead: 1, aimError: 0.01, dodge: 0.65, retreat: 32,
    smartUltimate: true, edgeGale: 1, sprintReserve: 45, mistakes: 0, aggression: 1, chain: Object.freeze([1.9, 0.3]), yields: true,
  }),
});

export const BOT_SKILL_IDS = Object.freeze(Object.keys(BOT_SKILLS));
// the rival as it has always fought
export const DEFAULT_BOT_SKILL = 'knight';

/** A skill's id if it is one, or the default. */
export function botSkillId(id) {
  return Object.hasOwn(BOT_SKILLS, id) ? id : DEFAULT_BOT_SKILL;
}

/** How well `actor` plays (its `botSkill`), the Knight's unless it was given another. */
export function botSkill(actor) {
  // (one given whole, over the Knight's: a test or a tournament trying one judgment at a time)
  if (actor?.botSkill && typeof actor.botSkill === 'object') return { ...BOT_SKILLS[DEFAULT_BOT_SKILL], ...actor.botSkill };
  return BOT_SKILLS[botSkillId(actor?.botSkill)];
}

/** Seconds before a bot of `skill` answers what it has just seen. */
export function reactionDelay(skill, random = Math.random) {
  return skill.reaction[0] + random() * skill.reaction[1];
}
