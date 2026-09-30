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

// Three ranks, so the lines never talk over each other: a short exertion (a grunt, a jump, the breath behind a blow)
// never cuts anything; a situational line (a taunt, the gale's jibe, the rebuttal) waits for a knight's own mouth
// and for anyone's sentence to end; a line of state (a death, a defeat, the ultimate's cry, the match's end) cuts
// through a lower one, the knight's own or whoever's sentence is playing. Only one sentence is heard at a time.
export const VOICE_PRIORITY = Object.freeze({ exertion: 1, context: 2, state: 3 });
const { exertion: EXERTION, context: CONTEXT, state: STATE } = VOICE_PRIORITY;

export const VOICE_LINES = Object.freeze({
  // --- exertions
  // the heavy third strike, and now and then a lighter one
  effort: { kind: 'exertion', priority: EXERTION, chance: 0.4, cooldown: 1.8, gain: 0.75 },
  hurt: { kind: 'exertion', priority: EXERTION, chance: 0.7, cooldown: 1.1, gain: 0.85 },
  death: { kind: 'exertion', priority: STATE, chance: 1, cooldown: 0, gain: 1, interrupts: true },
  dash: { kind: 'exertion', priority: EXERTION, chance: 0.25, cooldown: 3, gain: 0.55 },
  // "HYA!" as the gauntlet goes out
  fistEffort: { kind: 'exertion', priority: EXERTION, chance: 0.55, cooldown: 1.5, gain: 0.8 },
  // a grunt as he jumps: now and then, never twice close together, the takes turned about (never the same twice
  // running); experimental
  jump: { kind: 'exertion', priority: EXERTION, chance: 0.3, cooldown: 2.5, gain: 0.7 },
  // --- sentences
  // "SORCERY!!" now and then as an ordinary spell leaves his hand: about one cast in twelve, never twice within 45 s
  sorcery: { kind: 'sentence', priority: CONTEXT, chance: 0.08, cooldown: 45, gain: 1 },
  // "MIGHT MAKES... KNIGHT!" no longer the match's end: after force has settled the argument (a Sundering kill, a
  // Sundering blow that breaks a knight or ruptures the ground under two, a guard broken by one; victorLines)
  victory: { kind: 'sentence', priority: CONTEXT, chance: 0.3, cooldown: 120, gain: 1 },
  // "I don't believe in magic." Only from a knight that magic actually killed, and not every time
  magicDefeat: { kind: 'sentence', priority: STATE, chance: 0.35, cooldown: 90, gain: 1, interrupts: true },
  // "The Knight has fallen!... no longer may day arrive..." A rare, theatrical fall (the wording is the joke: knight,
  // night, day); much likelier after a blow far heavier than it needed to be (KNIGHT_FALLEN_OVERKILL)
  knightFallen: { kind: 'sentence', priority: STATE, chance: 0.06, cooldown: 300, gain: 1, interrupts: true },
  // "What!? But I am a knight!" Now and then when felled, substantially likelier when that fall loses the match
  // (DEFEAT_ON_LOSS), and never soon again: it is funniest when it is a surprise
  defeat: { kind: 'sentence', priority: STATE, chance: 0.25, cooldown: 150, gain: 1, interrupts: true },
  // "I had never thought this day would come..." Only when the defeat is official: the match lost (not a fall)
  neverThought: { kind: 'sentence', priority: STATE, chance: 0.3, cooldown: 200, gain: 1, interrupts: true },
  // "NOOoo! I am going to be late!" Felled by very little (a burn's lick, a last scrap of a blow: isMinorLethal),
  // likelier when it cut short something he was doing; never an overkill, an ultimate or a fall worth drama
  lateLine: { kind: 'sentence', priority: STATE, chance: 0.12, cooldown: 180, gain: 1, interrupts: true },
  // over a fallen foe: "Good knight? That will not be you."
  killTaunt: { kind: 'sentence', priority: CONTEXT, chance: 0.3, cooldown: 30, gain: 0.95 },
  // "AHHHhh, hahaHAH!" The wildcard: any sufficiently ill-advised moment (a blow dealt or taken, a kill, a fall, a
  // dash, a launch, a hard landing, a sprint under pressure, a cast, an ultimate), a chance in fifty each time; about
  // once in a life at most, and a long while between (45-75 s). Never from anything that runs on (a burn, a loop)
  laugh: { kind: 'sentence', priority: EXERTION, chance: 0.02, cooldown: [45, 75], perLife: 1, gain: 0.95 },
  // "What did the squire say to the Spellblade?" Asked, very rarely, of a foe he has all but finished. What follows is
  // the joke: the first knight to fall near him in the next few seconds answers with a death line, whatever its odds
  // (SQUIRE; VoiceMoments). Nobody falling is an answer too
  squireSetup: { kind: 'sentence', priority: CONTEXT, chance: 0.1, cooldown: 240, gain: 1 },
  // "You have achieved a new form of knight hood." A sword kill after a run of clean blows, aimed high (a knighting,
  // and a beheading); likelier when the killing swing itself was high (knighthoodFrom)
  newKnighthood: { kind: 'sentence', priority: CONTEXT, chance: 0.3, cooldown: 240, gain: 1 },
  // "A staggering display." after breaking someone's balance
  staggerDisplay: { kind: 'sentence', priority: CONTEXT, chance: 0.3, cooldown: 90, gain: 0.95 },
  // "I helped you lower your guard." after breaking a guard; "You should've hired a REAL guard." is the rarer one
  lowerGuard: { kind: 'sentence', priority: CONTEXT, chance: 0.3, cooldown: 60, gain: 0.95 },
  breakTaunt: { kind: 'sentence', priority: CONTEXT, chance: 0.15, cooldown: 90, gain: 0.95 },
  // "You are the hack. I will be the slash." a sword kill at the cleanest contact, or a clean blow through a swing
  hackSlash: { kind: 'sentence', priority: CONTEXT, chance: 0.25, cooldown: 120, gain: 0.95 },
  // "Your standard is subpar." felling another player who flies a standard other than the default
  subparStandard: { kind: 'sentence', priority: CONTEXT, chance: 0.08, cooldown: 300, gain: 0.95 },
  // "I always knew that I thought this would happen." Rescued by events: a knight near his end whose threat is
  // felled, thrown or broken by someone else a moment later (the likeliest); or a kill of his that arrived late and
  // messily (a burn, a fall)
  alwaysKnew: { kind: 'sentence', priority: CONTEXT, chance: 0.35, cooldown: 300, gain: 1 },
  // "If you keep practicing... you will still never reach me." the Practice Yard only, felling an opponent that fights
  neverReach: { kind: 'sentence', priority: CONTEXT, chance: 0.25, cooldown: 120, gain: 0.95 },
  // "What did you say? Must have been the wind..." after a Gale has really moved someone (galeTauntScale); much
  // likelier when the ground is no longer under them (a kill by the drop it threw them into)
  galeTaunt: { kind: 'sentence', priority: CONTEXT, chance: 0.3, cooldown: 60, gain: 0.95 },
  // "My armor works now!" when Sheathed in Steel has turned a spell aside, rarely
  steelBoast: { kind: 'sentence', priority: CONTEXT, chance: 0.3, cooldown: 75, gain: 0.95 },
  // "I throw you my gauntlet." now and then as the fist lands
  fistThrow: { kind: 'sentence', priority: CONTEXT, chance: 0.12, cooldown: 90, gain: 0.95 },
  // "I am quite soFISTicated." only when the gauntlet fells someone, and not every time even then
  fistKill: { kind: 'sentence', priority: CONTEXT, chance: 0.35, cooldown: 180, gain: 1 },
  // "I present my rebuttal." answering a foe who has just spoken, with the gauntlet, when it could finish them
  rebuttal: { kind: 'sentence', priority: CONTEXT, chance: 0.5, cooldown: 120, gain: 1 },
  // "Ah! My blade caught on the edge of a flower pot! I must rest. You may slay me. Quickly!" Only when the blade
  // truly snagged on some small, incidental furnishing in passing (the host marks it: a `snag` world impact), and
  // even then almost never
  bladeCaught: { kind: 'sentence', priority: CONTEXT, chance: 0.12, cooldown: 900, gain: 1 },
  // "Your integrity will not suffice!" as Sunder All That Rusts takes hold: every time (it is the ultimate's own cry)
  sunderCall: { kind: 'sentence', priority: STATE, chance: 1, cooldown: 0, gain: 1, interrupts: true },
  // (recorded and loaded, waiting on Blazing Vortex, so never said yet: `vortexUse`, its early-spin cry, and
  // `vortexDefeat`, "I was dizzy anyway.". Waiting on the Riposte, and unrecorded: "I have misaddressed.")
});

// the least time between two of one knight's sentences (exertions are not counted; a death or a match's end, which
// interrupt, always speak)
export const SENTENCE_GAP = 12;
// the rebuttal: a foe's sentence this recent, and the foe this low (health a gauntlet could plausibly take)
export const REBUTTAL = Object.freeze({ within: 5, health: 15 });

// How a knight's voice carries. Your own is heard as it is: dry and close, at its full level. Another knight's is heard
// from where he stands and only near him: full level within `near`, falling off with distance as sound does (inverse,
// 1/d), fading out over the last part of the range and not played at all beyond `far`. A bark is for the knights around
// him, never the whole map. A touch of the courtyard grows with distance (the direct sound falls faster than the room);
// no echo off the walls, so every word stays clear.
export const VOICE_HEARING = Object.freeze({
  near: 2.5,          // metres: full level this close
  far: 16,            // metres: silent from here (and not played at all)
  fade: 0.3,          // the last share of the range it fades out over (no sudden cut at the edge)
  pan: 0.85,          // how far left or right a voice can sit
  reverb: 0.05,       // the courtyard's share, close by...
  reverbFar: 0.14,    // ...and at the edge of earshot
  own: 0.02,          // the courtyard in my own voice (next to none)
});

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
  const falloff = hearing.near / Math.max(hearing.near, distance);
  const edge = hearing.far * (1 - hearing.fade);
  const fadeOut = 1 - clamp01((distance - edge) / (hearing.far - edge));
  const gain = falloff * fadeOut * fadeOut * (3 - 2 * fadeOut);
  // the listener's right for this yaw is (cos yaw, -sin yaw)
  const pan = distance < 0.5 ? 0 : Math.max(-1, Math.min(1, ((dx * Math.cos(yaw) - dz * Math.sin(yaw)) / distance) * hearing.pan));
  const reverb = hearing.reverb + (hearing.reverbFar - hearing.reverb) * clamp01(distance / hearing.far);
  return { pan, gain, reverb };
}

// the killing blows that count as magic (a knight burned down by a Fireball was still killed by sorcery)
export const MAGIC_SOURCES = Object.freeze(['fireball', 'frostfire', 'burn']);

// how much likelier "But I am a knight!" is when the fall loses the match (than when merely felled)
export const DEFEAT_ON_LOSS = 2.5;

// how much likelier "The knight has fallen!" is after an overkill (a killing blow far heavier than the health it took)
export const KNIGHT_FALLEN_OVERKILL = 3.5;
// an overkill: at least `ratio` times the health it took, and a real blow (`least`), not a lick on the last scrap
export const OVERKILL = Object.freeze({ ratio: 2.5, least: 20 });

/** Whether a killing blow was an overkill: far more than the health it took, or struck at the elevated level. */
export function isOverkill({ amount = 0, healthBefore = 100, level = null } = {}) {
  if (level === 'elevated') return true;
  return amount >= Math.max(OVERKILL.least, Math.max(1, healthBefore) * OVERKILL.ratio);
}

// a minor lethal blow: this much or less (a burn's lick, a gauntlet's tap, a blast's edge), and nothing grander
export const MINOR_LETHAL = Object.freeze({ amount: 12, interrupted: 1.4 });

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

/** What the knight whose blade struck the world might say: only a true snag on an incidental furnishing is a line. */
export function worldImpactLines(event) {
  return event?.type === 'swordWorldImpact' && event.snag ? [{ line: 'bladeCaught', speaker: event.playerId, delay: 0.55 }] : [];
}

/**
 * What might be said when a Spellblade falls, in the order to try: the fallen first (the first line that passes its
 * rules is the only one), then, only if the fallen kept quiet, whoever felled them. Pure; the runtime asks the
 * director for each in turn.
 *
 * minor: a very small blow proved enough (isMinorLethal), `interrupted` if it cut short something they were doing;
 * decisive: the fall lost the match; answer: it answers the squire's question (every line of the fallen that fits
 * is forced, the grander ones in a random order: SQUIRE). moment: what made the kill (for the victor's line): {
 * sunder, knighthood (0, 1, or 2 for a high killing swing), gale, clean, subpar, practice, messy }.
 */
export function deathLines({ victimId, killerId, source, overkill = false, minor = false, interrupted = false, decisive = false, answer = false, moment = {} }, rand = Math.random) {
  const fallen = [];
  if (minor) fallen.push({ line: 'lateLine', speaker: victimId, chanceScale: interrupted ? MINOR_LETHAL.interrupted : 1 });
  if (MAGIC_SOURCES.includes(source)) fallen.push({ line: 'magicDefeat', speaker: victimId });
  const grand = [
    { line: 'knightFallen', speaker: victimId, chanceScale: overkill ? KNIGHT_FALLEN_OVERKILL : 1 },
    { line: 'defeat', speaker: victimId, chanceScale: decisive ? DEFEAT_ON_LOSS : 1 },
  ];
  if (answer) {
    // the squire's answer: whichever fits, with no odds about it (and no grunt: it must be a line)
    if (rand() < 0.5) grand.reverse();
    return { fallen: [...fallen, ...grand].map((say) => ({ ...say, force: true })), victor: [] };
  }
  fallen.push(...grand);
  fallen.push({ line: 'laugh', speaker: victimId });
  fallen.push({ line: 'death', speaker: victimId });
  return { fallen, victor: killerId && killerId !== victimId ? victorLines({ killerId, source, moment }) : [] };
}

/** What the knight who felled another might say over them, in the order to try (see deathLines' moment). */
export function victorLines({ killerId, source, moment = {} }) {
  const say = (line, extra = {}) => ({ line, speaker: killerId, delay: 0.45, ...extra });
  const lines = [];
  if (moment.sunder) lines.push(say('victory'));
  if (moment.knighthood) lines.push(say('newKnighthood', { chanceScale: moment.knighthood >= 2 ? 2 : 1 }));
  if (moment.gale) lines.push(say('galeTaunt', { chanceScale: GALE_KILL, delay: 0.6 }));
  if (moment.practice) lines.push(say('neverReach', { delay: 0.6 }));
  if (source === 'gauntlet') lines.push(say('fistKill'));
  if (moment.clean && source === 'sword') lines.push(say('hackSlash'));
  if (moment.subpar) lines.push(say('subparStandard', { delay: 0.6 }));
  if (moment.messy) lines.push(say('alwaysKnew', { chanceScale: 0.35, delay: 0.6 }));
  lines.push(say('killTaunt'));
  lines.push(say('laugh', { delay: 0.5 }));
  return lines;
}

// how much likelier the gale's jibe is when the drop it threw them into is what killed them
export const GALE_KILL = 3;

/**
 * What the knight who broke a guard might say, in the order to try: a guard broken by a Sundering blow (catastrophic)
 * may be force settling the argument; otherwise the helping hand, and rarely the staffing advice.
 */
export function guardBreakLines({ attackerId, catastrophic = false }) {
  return [
    ...(catastrophic ? [{ line: 'victory', speaker: attackerId, delay: 0.7 }] : []),
    { line: 'lowerGuard', speaker: attackerId, delay: 0.7 },
    { line: 'breakTaunt', speaker: attackerId, delay: 0.7 },
  ];
}

/**
 * What the knight who landed the gauntlet might say, in the order to try (the first that passes its rules is the only
 * one): the rebuttal, when the foe has just spoken (`foeSpokeAgo` seconds ago) and is left low enough for a gauntlet
 * to finish; otherwise, now and then, the gauntlet thrown.
 */
export function gauntletLines({ attackerId, foeSpokeAgo = Infinity, foeHealth = 100 }) {
  const lines = [];
  if (foeSpokeAgo <= REBUTTAL.within && foeHealth > 0 && foeHealth <= REBUTTAL.health) lines.push({ line: 'rebuttal', speaker: attackerId, delay: 0.25 });
  lines.push({ line: 'fistThrow', speaker: attackerId, delay: 0.3 });
  return lines;
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
  }

  /**
   * Whether `speaker` says `line` at `now` (seconds), and what it cuts: null (nothing is said), or { stop: [speakers
   * whose line this one cuts off] }. duration: how long the take will run (from `now`, any delay included).
   * chanceScale softens (or, for a fitting moment, raises) a line's chance. force: the moment demands it (the
   * squire's answer): no odds, no cooldown and no gap, though it still waits its turn by rank. Voice is presentation
   * only: nothing in the game waits on a line, and nothing here waits on anything.
   */
  consider(line, speaker, now, { chanceScale = 1, duration = MOUTH_BUSY_SEC, force = false } = {}) {
    const rule = VOICE_LINES[line];
    if (!rule) return null;
    const priority = rule.priority ?? (rule.interrupts ? STATE : rule.kind === 'sentence' ? CONTEXT : EXERTION);
    const key = `${speaker}:${line}`;
    if (!force && now < (this.readyAt.get(key) ?? -Infinity)) return null;
    if (!force && rule.perLife && (this.thisLife.get(key) ?? 0) >= rule.perLife) return null;
    // never over one's own line, unless this one matters more
    const own = this.speaking.get(speaker);
    const ownBusy = Boolean(own) && now < own.until;
    if (ownBusy && priority <= own.priority) return null;
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
    this.lastLine.set(key, now);
    const [least, most] = Array.isArray(rule.cooldown) ? rule.cooldown : [rule.cooldown, rule.cooldown];
    this.readyAt.set(key, now + (most > least ? least + (most - least) * this.rand() : least));
    if (rule.perLife) this.thisLife.set(key, (this.thisLife.get(key) ?? 0) + 1);
    this.lastSpoke.set(speaker, now);
    const entry = { speaker, line, priority, until: now + Math.max(0, duration) };
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

/** Every Spellblade wears the same helm, but no two sound quite alike: a steady pitch per player. */
export function voiceRate(playerId) {
  let hash = 0;
  for (const char of String(playerId ?? '')) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return 0.94 + (hash % 1000) / 1000 * 0.12;
}
