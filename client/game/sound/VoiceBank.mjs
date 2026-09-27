// The Spellblade's voice. Takes are recorded by a person and shaped offline (tools/audio/knight_voice.py) into a
// hardened battlemage heard through his helm; here they are loaded, one is picked (never the same twice running),
// and it is sent into the echo off the castle walls. voiceRules.mjs decides when a line is spoken at all.

import { VOICE_LINES, VoiceDirector } from './voiceRules.mjs';

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
      manifest = await (await fetch(`${this.base}manifest.json`, { cache: 'no-cache' })).json();
    } catch {
      return; // no voice recorded yet: the knight fights in silence
    }
    for (const [line, takes] of Object.entries(manifest.lines ?? {})) {
      for (const take of takes) {
        const buffer = await this.#decode(take.file);
        if (!buffer) continue;
        if (!this.takes.has(line)) this.takes.set(line, []);
        this.takes.get(line).push(buffer);
      }
    }
  }

  async #decode(file) {
    // AAC first (small); the WAV is there for a browser that cannot decode it
    for (const extension of ['m4a', 'wav']) {
      try {
        const response = await fetch(`${this.base}${file}.${extension}`);
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
  say(line, { speaker = 'me', pan = 0, gain = 1, rate = 1, chanceScale = 1 } = {}) {
    if (!this.has(line) || !this.engine.running) return false;
    if (!this.director.allow(line, speaker, this.engine.now, { chanceScale })) return false;
    const takes = this.takes.get(line);
    let index = Math.floor(Math.random() * takes.length);
    if (takes.length > 1 && index === this.lastTake.get(line)) index = (index + 1) % takes.length;
    this.lastTake.set(line, index);
    const rule = VOICE_LINES[line];
    this.engine.playBuffer(takes[index], {
      bus: 'voice', pan, gain: gain * rule.gain, rate: rate * (0.98 + Math.random() * 0.04),
      reverb: rule.reverb, echo: rule.echo, echoLevel: rule.echoLevel,
    });
    return true;
  }
}
