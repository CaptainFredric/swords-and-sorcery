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
  // SORCERY! is rare: about one cast in twelve, and never twice within 45 seconds
  sorcery: { kind: 'sentence', priority: CONTEXT, chance: 0.08, cooldown: 45, gain: 1 },
  // "MIGHT MAKES... KNIGHT!"
  victory: { kind: 'sentence', priority: STATE, chance: 1, cooldown: 0, gain: 1, interrupts: true },
  // "I don't believe in magic." Only from a knight that magic actually killed, and not every time
  magicDefeat: { kind: 'sentence', priority: STATE, chance: 0.35, cooldown: 90, gain: 1, interrupts: true },
  // "The knight has fallen! ...and day may arrive no longer..." A rare, theatrical fall (the wording is the joke:
  // knight, night, day); likelier after a blow far heavier than it needed to be (KNIGHT_FALLEN_OVERKILL)
  knightFallen: { kind: 'sentence', priority: STATE, chance: 0.06, cooldown: 300, gain: 1, interrupts: true },
  // "What? But I am a knight!" Now and then when felled, a little likelier when the match is lost, and never soon
  // again: it is funniest when it is a surprise
  defeat: { kind: 'sentence', priority: STATE, chance: 0.25, cooldown: 150, gain: 1, interrupts: true },
  // over a fallen foe: "Good knight? That will not be you." (or a laugh)
  killTaunt: { kind: 'sentence', priority: CONTEXT, chance: 0.3, cooldown: 30, gain: 0.95 },
  // "You should have hired a REAL guard!" after breaking one, rarely
  breakTaunt: { kind: 'sentence', priority: CONTEXT, chance: 0.35, cooldown: 45, gain: 0.95 },
  // "What did you say? Must have been the wind..." after a Gale has really moved someone, now and then (galeTauntScale)
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
  // "YOUR INTEGRITY WILL NOT SUFFICE!" as Sunder All That Rusts takes hold: every time (it is the ultimate's own cry)
  sunderCall: { kind: 'sentence', priority: STATE, chance: 1, cooldown: 0, gain: 1, interrupts: true },
  // (recorded and loaded, waiting on Blazing Vortex, so never said yet: `vortexUse`, its early-spin cry. Its fall,
  // "I was dizzy anyway.", is still to be recorded)
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

// how much likelier "But I am a knight!" is when the match itself is lost (than when merely felled)
export const DEFEAT_ON_LOSS = 1.8;

// how much likelier "The knight has fallen!" is after an overkill (a killing blow far heavier than the health it took)
export const KNIGHT_FALLEN_OVERKILL = 3.5;
export const OVERKILL = Object.freeze({ ratio: 2.5 });

/** Whether a killing blow was an overkill: far more than the health it took, or struck at the elevated level. */
export function isOverkill({ amount = 0, healthBefore = 100, level = null } = {}) {
  if (level === 'elevated') return true;
  return amount >= Math.max(1, healthBefore) * OVERKILL.ratio;
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
 */
export function deathLines({ victimId, killerId, source, overkill = false }) {
  const fallen = [];
  if (MAGIC_SOURCES.includes(source)) fallen.push({ line: 'magicDefeat', speaker: victimId });
  fallen.push({ line: 'knightFallen', speaker: victimId, chanceScale: overkill ? KNIGHT_FALLEN_OVERKILL : 1 });
  fallen.push({ line: 'defeat', speaker: victimId });
  fallen.push({ line: 'death', speaker: victimId });
  // (the victor's line that belongs to the moment most first: a gauntlet's kill has its own)
  const victor = killerId && killerId !== victimId ? [
    ...(source === 'gauntlet' ? [{ line: 'fistKill', speaker: killerId, delay: 0.45 }] : []),
    { line: 'killTaunt', speaker: killerId, delay: 0.45 },
  ] : [];
  return { fallen, victor };
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
   * chanceScale softens (or, for a fitting moment, raises) a line's chance. Voice is presentation only: nothing in
   * the game waits on a line, and nothing here waits on anything.
   */
  consider(line, speaker, now, { chanceScale = 1, duration = MOUTH_BUSY_SEC } = {}) {
    const rule = VOICE_LINES[line];
    if (!rule) return null;
    const priority = rule.priority ?? (rule.interrupts ? STATE : rule.kind === 'sentence' ? CONTEXT : EXERTION);
    const key = `${speaker}:${line}`;
    if (now - (this.lastLine.get(key) ?? -Infinity) < rule.cooldown) return null;
    // never over one's own line, unless this one matters more
    const own = this.speaking.get(speaker);
    const ownBusy = Boolean(own) && now < own.until;
    if (ownBusy && priority <= own.priority) return null;
    if (!rule.interrupts && now - (this.lastSpoke.get(speaker) ?? -Infinity) < MOUTH_BUSY_SEC && !(ownBusy && priority > own.priority)) return null;
    const sentence = rule.kind === 'sentence';
    // one sentence heard at a time: another knight's is let finish, unless this one matters more
    const other = sentence && this.sentence && now < this.sentence.until && this.sentence.speaker !== speaker ? this.sentence : null;
    if (other && priority <= other.priority) return null;
    if (sentence && !rule.interrupts && now - (this.lastSentence.get(speaker) ?? -Infinity) < SENTENCE_GAP) return null;
    if (this.rand() >= rule.chance * chanceScale) return null;
    const stop = [];
    if (ownBusy) stop.push(speaker);
    if (other) {
      stop.push(other.speaker);
      this.speaking.delete(other.speaker);
    }
    this.lastLine.set(key, now);
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
