// The Spellblade's voice. Takes are recorded by a person and shaped offline (tools/audio/knight_voice.py) into a
// hardened battlemage with a touch of his helm; here they are loaded and one is picked (never the same twice running).
// voiceRules.mjs decides when a line is spoken at all, and how far another knight's voice carries.

import { VOICE_HEARING, VOICE_LINES, VoiceDirector } from './voiceRules.mjs';
import { appUrl } from '../../appUrl.mjs';

const BASE = '/client/assets/voice/';

export class VoiceBank {
  constructor(engine, { base = BASE, director = new VoiceDirector() } = {}) {
    this.engine = engine;
    this.base = base;
    this.director = director;
    this.takes = new Map();
    this.lastTake = new Map();
    engine.onReady(() => this.#load());
  }

  async #load() {
    let manifest;
    try {
      manifest = await (await fetch(appUrl(`${this.base}manifest.json`), { cache: 'no-cache' })).json();
    } catch {
      return; // no voice recorded yet: the knight fights in silence
    }
    for (const [name, takes] of Object.entries(manifest.lines ?? {})) {
      for (const take of takes) {
        const buffer = await this.#decode(take.file);
        if (!buffer) continue;
        if (!this.takes.has(name)) this.takes.set(name, []);
        this.takes.get(name).push(buffer);
      }
    }
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
   * Speak `line` for `speaker` if the rules allow it now. pan/gain/reverb place another Spellblade (voicePlacement in
   * voiceRules.mjs: nothing is said by one out of earshot); rate is their pitch. close: it is my own knight, heard as
   * he is (dry, full level). Returns whether anything was said.
   */
  say(line, { speaker = 'me', pan = 0, gain = 1, rate = 1, chanceScale = 1, delay = 0, close = false, reverb = VOICE_HEARING.reverb } = {}) {
    if (!this.has(line) || !this.engine.running || !(gain > 0)) return false;
    if (!this.director.allow(line, speaker, this.engine.now, { chanceScale })) return false;
    const rule = VOICE_LINES[line];
    this.engine.playBuffer(this.#pick(`line:${line}`, this.takes.get(line)), {
      bus: 'voice', pan: close ? 0 : pan, gain: gain * rule.gain, rate: rate * (0.98 + Math.random() * 0.04), delay,
      reverb: close ? VOICE_HEARING.own : reverb,
    });
    return true;
  }
}
