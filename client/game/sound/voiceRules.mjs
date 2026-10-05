// When the Spellblade speaks. A knight who grunts on every swing is a parody, so each line has a chance and a
// cooldown, and a speaker only says one thing at a time (a death cry cuts through anything). Two kinds: exertions
// (the breath of a blow, a grunt of pain) are heard fairly often, each on its own short cooldown; sentences (every
// spoken line) are rare, and one knight never says two within SENTENCE_GAP of each other. Where a moment could have
// more than one line, the one that belongs to it most is tried first (deathLines, gauntletLines). Current tuning.
// Pure, so it is tested.
//
// Who he is: a proud, formal knight-mage who means every word. The comedy is that he never knows he is funny: he
// protests that he is a knight when he loses, refuses to believe in the magic that killed him, and cannot resist a
// pun over a fallen foe. So the lines are rare, and each has its own moment.
//
// The lines themselves (their words, their moments, how rare they are) are declared in voiceLines.mjs, one entry each;
// this module is how they are spoken: the ranks, the director, how a voice carries, and what a moment's facts are.

import { OTHER_KNIGHTS } from './voiceTimbre.mjs';
import {
  DEFEAT_ON_LOSS, GALE_KILL, KNIGHT_FALLEN_OVERKILL, MINOR_LETHAL_INTERRUPTED, VOICE_LINE_LIST, VOICE_TAGS, linesFor, priorityRank,
} from './voiceLines.mjs';

// Three ranks, so the lines never talk over each other: a short exertion (a grunt, a jump, the breath behind a blow)
// never cuts anything; a situational line (a taunt, the gale's jibe, the rebuttal) waits for a knight's own mouth
// and for anyone's sentence to end; a line of state (a death, a defeat, the ultimate's cry, the match's end) cuts
// through a lower one, the knight's own or whoever's sentence is playing. Only one sentence is heard at a time.
// (and between the two: a part of a longer line already begun, which has earned its turn: it is not left hanging for a
// passing taunt, and a death still cuts it)
export const VOICE_PRIORITY = Object.freeze({ exertion: 1, context: 2, earned: 2.5, state: 3 });
const { exertion: EXERTION, context: CONTEXT, earned: EARNED, state: STATE } = VOICE_PRIORITY;

// The rules of every line that can be said, from its declaration (voiceLines.mjs: one entry there is the whole of a
// line). kind: an exertion or a sentence; priority: its rank; chance: how rarely; cooldown: seconds (or a spread) before
// the same knight says it again; perLife: at most this often in one life; interrupts: a line of state cuts a lesser one
// and is not held to the gap between sentences. A line still waiting on what it belongs to (`coming`) has no rule
// here: it cannot be said.
export const VOICE_LINES = Object.freeze(Object.fromEntries(VOICE_LINE_LIST.filter((line) => !line.coming).map((line) => {
  const priority = priorityRank(line.priority);
  return [line.id, Object.freeze({
    kind: line.kind,
    priority,
    chance: line.rarity,
    cooldown: line.cooldown,
    gain: line.gain,
    ...(line.perLife ? { perLife: line.perLife } : {}),
    ...(priority === STATE ? { interrupts: true } : {}),
    ...(line.parts ? { parts: line.parts.length } : {}),
  })];
})));

/**
 * The cry for invoking ultimate `id`: one of its lines, by share (voiceLines.mjs: the `sunderInvoked` moment), or null
 * for an ultimate with no cry of its own (a Blazing Vortex is lit without a word).
 */
export function ultimateCry(id, rand = Math.random) {
  const moment = cryMoment(id);
  return moment ? linesFor(null, [moment], { rand })[0]?.line ?? null : null;
}

// the least time between two of one knight's sentences (exertions are not counted; a death or a match's end, which
// interrupt, always speak)
export const SENTENCE_GAP = 12;
// the rebuttal: a foe's sentence this recent, and the foe this low (health a gauntlet could plausibly take)
export const REBUTTAL = Object.freeze({ within: 5, health: 15 });

// How a knight's voice carries. Your own is heard as it is: dry and close, at its full level. Another knight's is heard
// from where he stands, and follows him while he speaks: full level within `near`, falling off with distance as
// (near / distance) ^ rolloff, fading out over the last part of the range and not played at all beyond `far`. His
// breath (a grunt, a gasp) is for the knights around him and falls off as sound does (1/d); his words are said to be
// heard (a charge at a foe a dozen metres off, a chase, the battle begun), so they carry across a duel and fall off far
// less (SPEECH_HEARING), never across the whole map. A touch of the courtyard grows with distance (the direct sound
// falls faster than the room); no echo off the walls, so every word stays clear.
export const VOICE_HEARING = Object.freeze({
  near: 2.5,          // metres: full level this close
  far: 16,            // metres: silent from here (and not played at all)
  rolloff: 1,         // (near / distance) to this power: 1, as a breath falls away
  fade: 0.3,          // the last share of the range it fades out over (no sudden cut at the edge)
  pan: 0.85,          // how far left or right a voice can sit
  reverb: 0.05,       // the courtyard's share, close by...
  reverbFar: 0.14,    // ...and at the edge of earshot
  own: 0.02,          // the courtyard in my own voice (next to none)
});
// his words: heard across a duel (a shout at a foe 14 m off is some 9 dB under one said beside you, not 15-25)
export const SPEECH_HEARING = Object.freeze({ ...VOICE_HEARING, far: 28, fade: 0.25, rolloff: 0.55 });

/** How far a line of `line`'s carries (VOICE_HEARING for a breath or a grunt, SPEECH_HEARING for words). */
export function hearingFor(line) {
  return VOICE_LINES[line]?.kind === 'exertion' ? VOICE_HEARING : SPEECH_HEARING;
}

const clamp01 = (t) => Math.max(0, Math.min(1, t));

/**
 * Where another knight's line is heard: { pan, gain, reverb }, or null when he is out of earshot (then nothing plays).
 * listener/source: { x, z }; yaw: which way the listener faces (three.js: forward is (-sin, -cos)).
 */
export function voicePlacement(listener, yaw, source, hearing = VOICE_HEARING) {
  if (!listener || !source) return null;
  const dx = source.x - listener.x;
  const dz = source.z - listener.z;
  const distance = Math.hypot(dx, dz);
  if (!(distance < hearing.far)) return null;
  const falloff = (hearing.near / Math.max(hearing.near, distance)) ** (hearing.rolloff ?? 1);
  const edge = hearing.far * (1 - hearing.fade);
  const fadeOut = 1 - clamp01((distance - edge) / (hearing.far - edge));
  const gain = falloff * fadeOut * fadeOut * (3 - 2 * fadeOut);
  // the listener's right for this yaw is (cos yaw, -sin yaw)
  const pan = distance < 0.5 ? 0 : Math.max(-1, Math.min(1, ((dx * Math.cos(yaw) - dz * Math.sin(yaw)) / distance) * hearing.pan));
  const reverb = hearing.reverb + (hearing.reverbFar - hearing.reverb) * clamp01(distance / hearing.far);
  return { pan, gain, reverb };
}

// the killing blows that count as magic (a knight burned down by a Fireball was still killed by sorcery)
export const MAGIC_SOURCES = Object.freeze(['fireball', 'frostfire', 'burn', 'ember', 'vortexFire', 'vortexBlaze']);

// (how much likelier some lines are at their fitting moment is theirs to say: voiceLines.mjs)
export { DEFEAT_ON_LOSS, GALE_KILL, KNIGHT_FALLEN_OVERKILL };

// an overkill: at least `ratio` times the health it took, and a real blow (`least`), not a lick on the last scrap
export const OVERKILL = Object.freeze({ ratio: 2.5, least: 20 });

/** Whether a killing blow was an overkill: far more than the health it took, or struck at the elevated level. */
export function isOverkill({ amount = 0, healthBefore = 100, level = null } = {}) {
  if (level === 'elevated') return true;
  return amount >= Math.max(OVERKILL.least, Math.max(1, healthBefore) * OVERKILL.ratio);
}

// a minor lethal blow: this much or less (a burn's lick, a gauntlet's tap, a blast's edge), and nothing grander
export const MINOR_LETHAL = Object.freeze({ amount: 12, interrupted: MINOR_LETHAL_INTERRUPTED });

/** Whether a killing blow was a very small amount that proved sufficient: no overkill, no ultimate, no fall. */
export function isMinorLethal({ amount = 0, healthBefore = 100, level = null, ultimate = false, source = null } = {}) {
  if (ultimate || level === 'elevated' || source === 'abyss' || source === 'rupture') return false;
  if (isOverkill({ amount, healthBefore, level })) return false;
  return amount > 0 && amount <= MINOR_LETHAL.amount;
}

/**
 * How much likelier the gale's jibe is for a gust that caught these knights (0: it said nothing worth a jibe). Only a
 * gust that really moved someone (well into its pressure, not behind a guard) counts; the harder it threw them, and
 * the more of them, the likelier.
 */
export function galeTauntScale(affected = []) {
  const moved = affected.filter((caught) => !caught.guarded && caught.pressure >= 0.5);
  if (!moved.length) return 0;
  const hardest = Math.max(...moved.map((caught) => caught.pressure));
  return Math.min(2.2, 1 + (hardest - 0.5) + 0.4 * (moved.length - 1));
}

/** What the knight whose blade struck the world might say: only a true snag on an incidental furnishing is a moment. */
export function worldImpactLines(event) {
  return event?.type === 'swordWorldImpact' && event.snag ? linesFor(event.playerId, ['bladeSnag']) : [];
}

/**
 * What might be said when a Spellblade falls, in the order to try: the fallen first (the first line that passes its
 * rules is the only one), then, only if the fallen kept quiet, whoever felled them. Pure; the runtime asks the
 * director for each in turn. Which lines belong to which moment is theirs to say (voiceLines.mjs): this only names the
 * moment.
 *
 * minor: a very small blow proved enough (isMinorLethal), `interrupted` if it cut short something they were doing;
 * decisive: the fall lost the match; answer: it answers the squire's question (every line of the fallen that fits
 * is forced, those of one moment in a random order). moment: what made the kill (for the victor's line): { sunder,
 * knighthood (0, 1, or 2 for a high killing swing), gale, steel, clean, subpar, practice, messy }.
 */
export function deathLines(fall, rand = Math.random) {
  const moment = deathMoment(fall);
  // the squire's answer: whichever fits, with no odds about it (a line, never a grunt), and nobody talks over it
  if (fall.answer) return { fallen: linesFor(fall.victimId, moment.fallen, { facts: moment.facts, force: true, rand }), victor: [] };
  return {
    fallen: linesFor(fall.victimId, moment.fallen, { facts: moment.facts }),
    victor: moment.victor ? linesFor(fall.killerId, moment.victor, { facts: moment.victorFacts }) : [],
  };
}

/**
 * A fall as the moments it is (their tags, for linesFor): { fallen, facts } for the one who fell, and { victor,
 * victorFacts } for whoever felled them (victor: null when nobody did, or they fell by their own doing).
 */
export function deathMoment({ victimId, killerId, source, overkill = false, minor = false, interrupted = false, decisive = false, dizzy = false, planFailed = false, chivalry = false, fair = false, moment = {} }) {
  return {
    // (dizzy: felled spinning in a Blazing Vortex, or in the moment after it)
    // (chivalry: felled during Spells & Chivalry; fair: by the sword, after a real exchange of blows with the victor)
    fallen: { death: 1, ...(minor ? { minorLethal: 1 } : {}), ...(dizzy ? { vortexDeath: 1 } : {}), ...(chivalry ? { chivalryDeath: 1 } : {}), ...(fair ? { fairLoss: 1 } : {}), ...(MAGIC_SOURCES.includes(source) ? { magicDeath: 1 } : {}) },
    // (planFailed: felled waiting on a plan he had just announced: "Wait, wait!!...")
    facts: [overkill && 'overkill', decisive && 'decisive', interrupted && 'interrupted', planFailed && 'planFailed'].filter(Boolean),
    victor: killerId && killerId !== victimId ? victorTags({ source, moment }) : null,
    victorFacts: moment.knighthood >= 2 ? ['highSwing'] : [],
  };
}

// a kill as the moments it is, for whoever made it (see deathLines' moment)
function victorTags({ source, moment = {} }) {
  return {
    kill: 1,
    ...(moment.sunder ? { sunderKill: 1 } : {}),
    ...(moment.knighthood ? { knighthoodKill: 1 } : {}),
    ...(moment.gale ? { galeKill: 1 } : {}),
    ...(moment.practice ? { practiceWin: 1 } : {}),
    ...(moment.steel ? { steelKill: 1 } : {}),
    ...(source === 'gauntlet' ? { gauntletKill: 1 } : {}),
    ...(moment.clean && source === 'sword' ? { cleanSwordKill: 1 } : {}),
    ...(moment.subpar ? { subparKill: 1 } : {}),
    ...(moment.messy ? { messyKill: 1 } : {}),
    ...(moment.fair ? { fairWin: 1 } : {}),
    ...(moment.rushed ? { rushedKill: 1 } : {}),
    ...(moment.leader ? { leaderFelled: 1 } : {}),
    ...(moment.streak === 3 ? { killStreak3: 1 } : {}),
  };
}

/** What the knight who felled another might say over them, in the order to try (see deathLines' moment). */
export function victorLines({ killerId, source, moment = {} }) {
  return linesFor(killerId, victorTags({ source, moment }), { facts: moment.knighthood >= 2 ? ['highSwing'] : [] });
}

/**
 * What the knight who broke a guard might say, in the order to try: a guard broken by a Sundering blow (catastrophic)
 * may be force settling the argument; otherwise the helping hand, and rarely the staffing advice.
 */
export function guardBreakLines({ attackerId, catastrophic = false }) {
  return linesFor(attackerId, { guardBreak: 1, ...(catastrophic ? { catastrophicGuardBreak: 1 } : {}) });
}

/**
 * What the knight who landed the gauntlet might say, in the order to try (the first that passes its rules is the only
 * one): the rebuttal, when the foe has just spoken (`foeSpokeAgo` seconds ago) and is left low enough for a gauntlet
 * to finish; otherwise, now and then, the gauntlet thrown.
 */
export function gauntletLines({ attackerId, foeSpokeAgo = Infinity, foeHealth = 100 }) {
  return linesFor(attackerId, gauntletMoment({ foeSpokeAgo, foeHealth }));
}

/** The gauntlet landing as the moments it is (their tags): always a gauntlet's hit, and a rebuttal's opening if so. */
export function gauntletMoment({ foeSpokeAgo = Infinity, foeHealth = 100 }) {
  const rebuttal = foeSpokeAgo <= REBUTTAL.within && foeHealth > 0 && foeHealth <= REBUTTAL.health;
  return { gauntletHit: 1, ...(rebuttal ? { rebuttalOpening: 1 } : {}) };
}

/** The moment an ultimate's cry belongs to (its tag): `<id>Invoked`, or null for one with no cry of its own. */
export function cryMoment(id) {
  return VOICE_TAGS[`${id}Invoked`]?.cry ? `${id}Invoked` : null;
}

// a speaker finishes one line before starting another
export const MOUTH_BUSY_SEC = 0.8;

export class VoiceDirector {
  constructor({ rand = Math.random } = {}) {
    this.rand = rand;
    // when each knight may say each line again (its cooldown, some of them a spread), and how often this life
    this.readyAt = new Map();
    this.thisLife = new Map();
    this.lastLine = new Map();
    this.lastSpoke = new Map();
    this.lastSentence = new Map();
    // what each knight is saying now, and the one sentence being heard anywhere ({ speaker, line, priority, until })
    this.speaking = new Map();
    this.sentence = null;
    // line -> { tried, said }: how often each line has been asked for and how often said (for telling why a line is
    // never heard: voiceReport)
    this.stats = new Map();
  }

  /**
   * Whether `speaker` says `line` at `now` (seconds), and what it cuts: null (nothing is said), or { stop: [speakers
   * whose line this one cuts off] }. duration: how long the take will run (from `now`, any delay included).
   * chanceScale softens (or, for a fitting moment, raises) a line's chance. force: the moment demands it (the
   * squire's answer): no odds, no cooldown and no gap, though it still waits its turn by rank. cry: said as an
   * ultimate's cry (a cry's moment: voiceLines.mjs), whatever line it is: forced, at the rank of state, cutting a lesser line. Voice is
   * presentation only: nothing in the game waits on a line, and nothing here waits on anything.
   */
  consider(line, speaker, now, { chanceScale = 1, duration = MOUTH_BUSY_SEC, force = false, cry = false, earned = false, opening = false } = {}) {
    const base = VOICE_LINES[line];
    if (!base) return null;
    const stat = this.stats.get(line) ?? { tried: 0, said: 0 };
    this.stats.set(line, stat);
    stat.tried += 1;
    // earned: the next part of a line already begun, or the answer a scene has led up to (voiceScenes.mjs): no odds, no
    // cooldown, no gap, and it cuts a passing line (never a line of state)
    // opening: the first part of a scene that begins on something done (the Sunder sentence, at its first slam): the
    // line's own odds, cooldown and once-a-life, but it takes the voice as a part does
    const part = earned || opening;
    const rule = cry ? { ...base, priority: STATE, interrupts: true } : part ? { ...base, priority: Math.max(base.priority, EARNED), interrupts: true } : base;
    if (cry || earned) force = true;
    const priority = rule.priority ?? (rule.interrupts ? STATE : rule.kind === 'sentence' ? CONTEXT : EXERTION);
    const key = `${speaker}:${line}`;
    if (!force && now < (this.readyAt.get(key) ?? -Infinity)) return null;
    if (!force && rule.perLife && (this.thisLife.get(key) ?? 0) >= rule.perLife) return null;
    // never over one's own line, unless this one matters more
    const own = this.speaking.get(speaker);
    const ownBusy = Boolean(own) && now < own.until;
    // (the next part of the line he is saying follows on from the part before it: its tail gives way)
    const followsOn = earned && ownBusy && own.line === line;
    // (and a scene's part takes the voice from his own ultimate's cry: what has been earned outranks what is announced)
    const overCry = part && ownBusy && own.cry;
    if (ownBusy && priority <= own.priority && !followsOn && !overCry) return null;
    if (!rule.interrupts && now - (this.lastSpoke.get(speaker) ?? -Infinity) < MOUTH_BUSY_SEC && !(ownBusy && priority > own.priority)) return null;
    const sentence = rule.kind === 'sentence';
    // one sentence heard at a time: another knight's is let finish, unless this one matters more
    const other = sentence && this.sentence && now < this.sentence.until && this.sentence.speaker !== speaker ? this.sentence : null;
    if (other && priority <= other.priority) return null;
    if (!force && sentence && !rule.interrupts && now - (this.lastSentence.get(speaker) ?? -Infinity) < SENTENCE_GAP) return null;
    if (!force && this.rand() >= rule.chance * chanceScale) return null;
    const stop = [];
    if (ownBusy) stop.push(speaker);
    if (other) {
      stop.push(other.speaker);
      this.speaking.delete(other.speaker);
    }
    stat.said += 1;
    this.lastLine.set(key, now);
    const [least, most] = Array.isArray(rule.cooldown) ? rule.cooldown : [rule.cooldown, rule.cooldown];
    this.readyAt.set(key, now + (most > least ? least + (most - least) * this.rand() : least));
    if (rule.perLife) this.thisLife.set(key, (this.thisLife.get(key) ?? 0) + 1);
    this.lastSpoke.set(speaker, now);
    const entry = { speaker, line, priority, until: now + Math.max(0, duration), ...(cry ? { cry: true } : {}) };
    this.speaking.set(speaker, entry);
    if (sentence) {
      this.lastSentence.set(speaker, now);
      this.sentence = entry;
    }
    return { stop };
  }

  /** Whether `speaker` says `line` at `now` (as consider, for callers that cut nothing). */
  allow(line, speaker, now, options = {}) {
    return Boolean(this.consider(line, speaker, now, options));
  }

  /** A knight lives again (a respawn; every knight, for a new match): lines kept to once a life may be said again. */
  newLife(speaker = null) {
    if (speaker === null) this.thisLife.clear();
    for (const key of [...this.thisLife.keys()]) if (key.startsWith(`${speaker}:`)) this.thisLife.delete(key);
  }

  /** How long ago `speaker` last said a sentence (Infinity if never): for lines that answer one. */
  sentenceAgo(speaker, now) {
    return now - (this.lastSentence.get(speaker) ?? -Infinity);
  }
}

/**
 * Every Spellblade wears the same helm, but no two sound quite alike: a steady pitch per player, within about two
 * thirds of a semitone either way (a wider spread took the words with it). The rest of what makes another knight
 * sound like another man (his grit, his helm's ring) is his timbre: voiceTimbre.mjs.
 */
export function voiceRate(playerId) {
  return OTHER_KNIGHTS.of(playerId).rate;
}

