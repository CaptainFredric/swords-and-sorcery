// The Spellblade's voice. Takes are recorded by a person and shaped offline (tools/audio/knight_voice.py) into a
// hardened battlemage heard through his helm; here they are loaded, one is picked (never the same twice running),
// and it is sent into the echo off the castle walls. voiceRules.mjs decides when a line is spoken at all.

import { VOICE_LINES, VoiceDirector } from './voiceRules.mjs';
import { appUrl } from '../../appUrl.mjs';

const BASE = '/client/assets/voice/';
// how much of the courtyard is heard on my own knight's voice (a share of the line's own reverb)
export const CLOSE_ROOM = 0.25;

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
   * Speak `line` for `speaker` if the rules allow it now. pan/gain place a remote Spellblade; rate is their pitch.
   * close: it is my own knight, heard from inside his helm (no echo off the walls, barely any of the courtyard).
   * Returns whether anything was said.
   */
  say(line, { speaker = 'me', pan = 0, gain = 1, rate = 1, chanceScale = 1, delay = 0, close = false } = {}) {
    if (!this.has(line) || !this.engine.running) return false;
    if (!this.director.allow(line, speaker, this.engine.now, { chanceScale })) return false;
    const rule = VOICE_LINES[line];
    const room = close ? { reverb: rule.reverb * CLOSE_ROOM } : { reverb: rule.reverb, echo: rule.echo, echoLevel: rule.echoLevel };
    this.engine.playBuffer(this.#pick(`line:${line}`, this.takes.get(line)), {
      bus: 'voice', pan, gain: gain * rule.gain, rate: rate * (0.98 + Math.random() * 0.04), delay, ...room,
    });
    return true;
  }
}
