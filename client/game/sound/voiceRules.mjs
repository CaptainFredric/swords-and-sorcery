// When the Spellblade speaks. A knight who grunts on every swing is a parody, so each line has a chance and a
// cooldown, and a speaker only says one thing at a time (a death cry cuts through anything). Pure, so it is tested.

export const VOICE_LINES = Object.freeze({
  // the heavy third strike, and now and then a lighter one
  effort: { chance: 0.4, cooldown: 1.8, gain: 0.75, reverb: 0.15, echo: 'wall', echoLevel: 0.22 },
  hurt: { chance: 0.7, cooldown: 1.1, gain: 0.85, reverb: 0.15, echo: 'wall', echoLevel: 0.2 },
  death: { chance: 1, cooldown: 0, gain: 1, reverb: 0.25, echo: 'wall', echoLevel: 0.45, interrupts: true },
  // SORCERY! is rare: about one cast in twelve, and never twice within 45 seconds
  sorcery: { chance: 0.08, cooldown: 45, gain: 1, reverb: 0.2, echo: 'shout', echoLevel: 0.6 },
  dash: { chance: 0.25, cooldown: 3, gain: 0.55, reverb: 0.1, echo: 'wall', echoLevel: 0.12 },
  victory: { chance: 1, cooldown: 0, gain: 1, reverb: 0.25, echo: 'shout', echoLevel: 0.45, interrupts: true },
});

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
