// When the Spellblade speaks. A knight who grunts on every swing is a parody, so each line has a chance and a
// cooldown, and a speaker only says one thing at a time (a death cry cuts through anything). Pure, so it is tested.
//
// Who he is: a proud, formal knight-mage who means every word. The comedy is that he never knows he is funny: he
// protests that he is a knight when he loses, refuses to believe in the magic that killed him, and cannot resist a
// pun over a fallen foe. So the lines are rare, and each has its own moment.

export const VOICE_LINES = Object.freeze({
  // the heavy third strike, and now and then a lighter one
  effort: { chance: 0.4, cooldown: 1.8, gain: 0.75, reverb: 0.15, echo: 'wall', echoLevel: 0.22 },
  hurt: { chance: 0.7, cooldown: 1.1, gain: 0.85, reverb: 0.15, echo: 'wall', echoLevel: 0.2 },
  death: { chance: 1, cooldown: 0, gain: 1, reverb: 0.25, echo: 'wall', echoLevel: 0.45, interrupts: true },
  // SORCERY! is rare: about one cast in twelve, and never twice within 45 seconds
  sorcery: { chance: 0.08, cooldown: 45, gain: 1, reverb: 0.2, echo: 'shout', echoLevel: 0.6 },
  dash: { chance: 0.25, cooldown: 3, gain: 0.55, reverb: 0.1, echo: 'wall', echoLevel: 0.12 },
  // "MIGHT MAKES... KNIGHT!"
  victory: { chance: 1, cooldown: 0, gain: 1, reverb: 0.25, echo: 'shout', echoLevel: 0.45, interrupts: true },
  // "I don't believe in magic." Only from a knight that magic actually killed, and not every time
  magicDefeat: { chance: 0.35, cooldown: 90, gain: 1, reverb: 0.2, echo: 'wall', echoLevel: 0.35, interrupts: true },
  // "What? But I am a knight!" Every lost match; now and then when felled
  defeat: { chance: 1, cooldown: 30, gain: 1, reverb: 0.2, echo: 'wall', echoLevel: 0.35, interrupts: true },
  // over a fallen foe: "Good knight? That will not be you." (or a laugh)
  killTaunt: { chance: 0.3, cooldown: 30, gain: 0.95, reverb: 0.2, echo: 'shout', echoLevel: 0.4 },
  // "You should have hired a REAL guard!" after breaking one, rarely
  breakTaunt: { chance: 0.35, cooldown: 45, gain: 0.95, reverb: 0.2, echo: 'shout', echoLevel: 0.4 },
});

// the killing blows that count as magic (a knight burned down by a Fireball was still killed by sorcery)
export const MAGIC_SOURCES = Object.freeze(['fireball', 'frostfire', 'burn']);

// how often a felled knight protests "But I am a knight!" (a lost match always gets it)
export const DEFEAT_ON_DEATH = 0.3;

/**
 * What might be said when a Spellblade falls, in the order to try: the fallen first (the first line that passes its
 * rules is the only one), then, only if the fallen kept quiet, whoever felled them. Pure; the runtime asks the
 * director for each in turn.
 */
export function deathLines({ victimId, killerId, source }) {
  const fallen = [];
  if (MAGIC_SOURCES.includes(source)) fallen.push({ line: 'magicDefeat', speaker: victimId });
  fallen.push({ line: 'defeat', speaker: victimId, chanceScale: DEFEAT_ON_DEATH });
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
