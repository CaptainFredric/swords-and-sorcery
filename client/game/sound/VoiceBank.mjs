// The Spellblade's voice. Takes are recorded by a person and shaped offline (tools/audio/knight_voice.py) into a
// hardened battlemage heard through his helm; here they are loaded, one is picked (never the same twice running),
// and it is sent into the echo off the castle walls. voiceRules.mjs decides when a line is spoken at all.
//
// The same recordings hold a few voiced contact effects (the ring of a blow on a guard, the PERCUNK of a guard
// breaking). Those are not lines: they sound every time their moment comes, as effects.

import { VOICE_LINES, VoiceDirector } from './voiceRules.mjs';
import { appUrl } from '../../appUrl.mjs';

const BASE = '/client/assets/voice/';

export class VoiceBank {
  constructor(engine, { base = BASE, director = new VoiceDirector() } = {}) {
    this.engine = engine;
    this.base = base;
    this.director = director;
    this.takes = new Map();
    this.effects = new Map();
    this.lastTake = new Map();
    // the voiced contact effects can be switched off (Settings: Voiced guard hits), leaving the steel alone
    this.effectsOn = true;
    engine.onReady(() => this.#load());
  }

  async #load() {
    let manifest;
    try {
      manifest = await (await fetch(appUrl(`${this.base}manifest.json`), { cache: 'no-cache' })).json();
    } catch {
      return; // no voice recorded yet: the knight fights in silence
    }
    const load = async (groups, into) => {
      for (const [name, takes] of Object.entries(groups ?? {})) {
        for (const take of takes) {
          const buffer = await this.#decode(take.file);
          if (!buffer) continue;
          if (!into.has(name)) into.set(name, []);
          into.get(name).push(buffer);
        }
      }
    };
    await load(manifest.lines, this.takes);
    await load(manifest.effects, this.effects);
  }

  #pick(key, takes) {
    let index = Math.floor(Math.random() * takes.length);
    if (takes.length > 1 && index === this.lastTake.get(key)) index = (index + 1) % takes.length;
    this.lastTake.set(key, index);
    return takes[index];
  }

  async #decode(file) {
    // AAC first (small); the WAV is there for a browser that cannot decode it
    for (const extension of ['m4a', 'wav']) {
      try {
        const response = await fetch(appUrl(`${this.base}${file}.${extension}`));
        if (!response.ok) continue;
        return await this.engine.ctx.decodeAudioData(await response.arrayBuffer());
      } catch { /* try the next */ }
    }
    return null;
  }

  has(line) {
    return (this.takes.get(line)?.length ?? 0) > 0;
  }

  /**
   * Speak `line` for `speaker` if the rules allow it now. pan/gain place a remote Spellblade; rate is their pitch.
   * Returns whether anything was said.
   */
  say(line, { speaker = 'me', pan = 0, gain = 1, rate = 1, chanceScale = 1, delay = 0 } = {}) {
    if (!this.has(line) || !this.engine.running) return false;
    if (!this.director.allow(line, speaker, this.engine.now, { chanceScale })) return false;
    const rule = VOICE_LINES[line];
    this.engine.playBuffer(this.#pick(`line:${line}`, this.takes.get(line)), {
      bus: 'voice', pan, gain: gain * rule.gain, rate: rate * (0.98 + Math.random() * 0.04), delay,
      reverb: rule.reverb, echo: rule.echo, echoLevel: rule.echoLevel,
    });
    return true;
  }

  /** A voiced contact effect (guardHit, guardBreak): every time, a different take each time. */
  effect(name, { pan = 0, gain = 1, rate = 1 } = {}) {
    const takes = this.effects.get(name);
    if (!this.effectsOn || !takes?.length || !this.engine.running) return false;
    this.engine.playBuffer(this.#pick(`effect:${name}`, takes), {
      bus: 'sfx', pan, gain, rate: rate * (0.97 + Math.random() * 0.06), reverb: 0.12, echo: 'wall', echoLevel: 0.25,
    });
    return true;
  }
}
