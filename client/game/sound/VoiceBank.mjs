// The Spellblade's voice. Takes are recorded by a person and shaped offline (tools/audio/knight_voice.py) into a
// hardened battlemage with a touch of his helm; here they are loaded and one is picked (never the same twice running).
// voiceRules.mjs decides when a line is spoken at all, and how far another knight's voice carries.

import { VOICE_HEARING, VOICE_LINES, VoiceDirector } from './voiceRules.mjs';
import { appUrl } from '../../appUrl.mjs';

const BASE = '/client/assets/voice/';
// in the Credits, the breath between the parts of a line said in parts
const PREVIEW_PART_GAP = 0.22;

export class VoiceBank {
  constructor(engine, { base = BASE, director = new VoiceDirector() } = {}) {
    this.engine = engine;
    this.base = base;
    this.director = director;
    this.takes = new Map();
    this.lastTake = new Map();
    // what each knight is saying now (the handle to stop it, if a line that matters more cuts it)
    this.playing = new Map();
    // which lines have a recording, and how many takes (from the takes' manifest; null until it is known)
    this.recorded = null;
    // settles once the manifest is in (what is recorded is known), and once every take has been loaded (or there
    // were none to load)
    this.listed = new Promise((resolve) => { this.resolveListed = resolve; });
    this.ready = new Promise((resolve) => { this.resolveReady = resolve; });
    // what is recorded is asked for at once (the Credits show it whether or not any sound has started); the takes
    // themselves are decoded once the sound has
    const manifest = this.#list();
    engine.onReady(() => this.#load(manifest));
  }

  async #list() {
    let manifest = null;
    try {
      if (typeof fetch === 'function') manifest = await (await fetch(appUrl(`${this.base}manifest.json`), { cache: 'no-cache' })).json();
    } catch { /* no voice recorded yet: the knight fights in silence */ }
    this.recorded = new Map(Object.entries(manifest?.lines ?? {}).map(([name, takes]) => [name, takes.length]));
    this.resolveListed();
    return manifest;
  }

  async #load(listing) {
    const manifest = await listing;
    if (!manifest) {
      this.resolveReady();
      return;
    }
    for (const [name, takes] of Object.entries(manifest.lines ?? {})) {
      for (const take of takes) {
        const buffer = await this.#decode(take.file);
        if (!buffer) continue;
        if (!this.takes.has(name)) this.takes.set(name, []);
        this.takes.get(name).push(buffer);
      }
    }
    this.resolveReady();
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
  say(line, { speaker = 'me', pan = 0, gain = 1, rate = 1, chanceScale = 1, delay = 0, close = false, reverb = VOICE_HEARING.reverb, force = false, cry = false, earned = false, opening = false, part = null } = {}) {
    if (!this.has(line) || !this.engine.running || !(gain > 0)) return false;
    const takes = this.takes.get(line);
    // a line said in parts: its recordings are its parts, in order (the part asked for, the first if none is)
    const parts = VOICE_LINES[line]?.parts ?? 0;
    if (parts && !takes[part ?? 0]) return false;
    const index = parts ? part ?? 0 : this.#nextTake(`line:${line}`, takes.length);
    const take = takes[index];
    const verdict = this.director.consider(line, speaker, this.engine.now, { chanceScale, force, cry, earned, opening, duration: delay + take.duration / Math.max(0.5, rate) });
    if (!verdict) return false;
    this.lastTake.set(`line:${line}`, index);
    // a line that matters more cuts the one it overrides (a short fade, not a click)
    for (const cut of verdict.stop) {
      this.playing.get(cut)?.stop?.(0.1);
      this.playing.delete(cut);
    }
    const rule = VOICE_LINES[line];
    // (a hair of variety each time, no more: every word stays the word it was)
    const played = rate * (0.99 + Math.random() * 0.02);
    const handle = this.engine.playBuffer(take, {
      bus: 'voice', pan: close ? 0 : pan, gain: gain * rule.gain, rate: played, delay,
      reverb: close ? VOICE_HEARING.own : reverb,
    });
    if (handle) this.playing.set(speaker, handle);
    const seconds = take.duration / Math.max(0.5, played);
    // a spoken line: the music and the wind give way under it (a grunt does not need them to)
    if (rule.kind === 'sentence') this.engine.duck?.(seconds, { amount: Math.min(1, gain / 0.8), delay });
    this.onSpoken?.({ line, speaker, delay, seconds, close, ...(parts ? { part: index } : {}) });
    // (how long it runs, for whoever times something on its end: the next part, an answer)
    return { seconds, delay };
  }

  /**
   * Play a take of `line` to hear it (the credits' voice library): as my own knight is heard (dry, at the voice's
   * level), outside every rule of when he speaks; a preview still playing is cut. Returns whether anything played.
   */
  preview(line, take = 0) {
    const takes = this.takes.get(line);
    if (!takes?.length || !this.engine.running) return false;
    this.stopPreview();
    const options = { bus: 'voice', gain: VOICE_LINES[line]?.gain ?? 1, reverb: VOICE_HEARING.own };
    // a line said in parts is heard whole: its parts one after another, a breath between them
    if (VOICE_LINES[line]?.parts) {
      let at = 0;
      this.previewing = takes.map((part) => {
        const handle = this.engine.playBuffer(part, { ...options, delay: at });
        at += part.duration + PREVIEW_PART_GAP;
        return handle;
      }).filter(Boolean);
      return this.previewing.length > 0;
    }
    this.previewing = this.engine.playBuffer(takes[Math.max(0, Math.min(takes.length - 1, take))], options);
    return Boolean(this.previewing);
  }

  /** Cut short whatever `speaker` is saying (a short fade): his case for not falling, as he rises again. */
  cut(speaker, fade = 0.06) {
    this.playing.get(speaker)?.stop?.(fade);
    this.playing.delete(speaker);
    this.director.speaking?.delete?.(speaker);
  }

  stopPreview() {
    for (const handle of [].concat(this.previewing ?? [])) handle?.stop?.(0.08);
    this.previewing = null;
  }

  // the take to try next: any but the one said last (turned about, never the same twice running)
  #nextTake(key, count) {
    let index = Math.floor(Math.random() * count);
    if (count > 1 && index === this.lastTake.get(key)) index = (index + 1) % count;
    return index;
  }
}
