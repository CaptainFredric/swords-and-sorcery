// When the Spellblade speaks. A knight who grunts on every swing is a parody, so each line has a chance and a
// cooldown, and a speaker only says one thing at a time (a death cry cuts through anything). Pure, so it is tested.
//
// Who he is: a proud, formal knight-mage who means every word. The comedy is that he never knows he is funny: he
// protests that he is a knight when he loses, refuses to believe in the magic that killed him, and cannot resist a
// pun over a fallen foe. So the lines are rare, and each has its own moment.

export const VOICE_LINES = Object.freeze({
  // the heavy third strike, and now and then a lighter one
  effort: { chance: 0.4, cooldown: 1.8, gain: 0.75 },
  hurt: { chance: 0.7, cooldown: 1.1, gain: 0.85 },
  death: { chance: 1, cooldown: 0, gain: 1, interrupts: true },
  // SORCERY! is rare: about one cast in twelve, and never twice within 45 seconds
  sorcery: { chance: 0.08, cooldown: 45, gain: 1 },
  dash: { chance: 0.25, cooldown: 3, gain: 0.55 },
  // "MIGHT MAKES... KNIGHT!"
  victory: { chance: 1, cooldown: 0, gain: 1, interrupts: true },
  // "I don't believe in magic." Only from a knight that magic actually killed, and not every time
  magicDefeat: { chance: 0.35, cooldown: 90, gain: 1, interrupts: true },
  // "What? But I am a knight!" Now and then when felled, a little likelier when the match is lost, and never soon
  // again: it is funniest when it is a surprise
  defeat: { chance: 0.25, cooldown: 150, gain: 1, interrupts: true },
  // over a fallen foe: "Good knight? That will not be you." (or a laugh)
  killTaunt: { chance: 0.3, cooldown: 30, gain: 0.95 },
  // "You should have hired a REAL guard!" after breaking one, rarely
  breakTaunt: { chance: 0.35, cooldown: 45, gain: 0.95 },
  // "What did you say? Must have been the wind..." after a Gale has moved someone, now and then
  galeTaunt: { chance: 0.3, cooldown: 60, gain: 0.95 },
  // "My armor works now!" when Sheathed in Steel has turned a spell aside, rarely
  steelBoast: { chance: 0.3, cooldown: 75, gain: 0.95 },
});

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

/**
 * What might be said when a Spellblade falls, in the order to try: the fallen first (the first line that passes its
 * rules is the only one), then, only if the fallen kept quiet, whoever felled them. Pure; the runtime asks the
 * director for each in turn.
 */
export function deathLines({ victimId, killerId, source }) {
  const fallen = [];
  if (MAGIC_SOURCES.includes(source)) fallen.push({ line: 'magicDefeat', speaker: victimId });
  fallen.push({ line: 'defeat', speaker: victimId });
  fallen.push({ line: 'death', speaker: victimId });
  const victor = killerId && killerId !== victimId ? [{ line: 'killTaunt', speaker: killerId, delay: 0.45 }] : [];
  return { fallen, victor };
}

// a speaker finishes one line before starting another
export const MOUTH_BUSY_SEC = 0.8;

export class VoiceDirector {
  constructor({ rand = Math.random } = {}) {
    this.rand = rand;
    this.lastLine = new Map();
    this.lastSpoke = new Map();
  }

  /** Whether `speaker` says `line` at `now` (seconds). chanceScale softens a line for lighter moments. */
  allow(line, speaker, now, { chanceScale = 1 } = {}) {
    const rule = VOICE_LINES[line];
    if (!rule) return false;
    const key = `${speaker}:${line}`;
    if (now - (this.lastLine.get(key) ?? -Infinity) < rule.cooldown) return false;
    if (!rule.interrupts && now - (this.lastSpoke.get(speaker) ?? -Infinity) < MOUTH_BUSY_SEC) return false;
    if (this.rand() >= rule.chance * chanceScale) return false;
    this.lastLine.set(key, now);
    this.lastSpoke.set(speaker, now);
    return true;
  }
}

/** Every Spellblade wears the same helm, but no two sound quite alike: a steady pitch per player. */
export function voiceRate(playerId) {
  let hash = 0;
  for (const char of String(playerId ?? '')) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return 0.94 + (hash % 1000) / 1000 * 0.12;
}
