// Plays the score (score.mjs) through the SoundEngine: a lookahead scheduler puts each bar's notes on the audio clock
// a little before they sound, so the timing never depends on frame rate. Pieces crossfade; the battle theme's
// intensity (0 calm, 1 blades out, 2 the fight is on) changes on the next bar line; stingers play over everything.

import { frameDrum, jingles, pluck, warDrum } from './instruments.mjs';
import { midiToFreq, PIECES, STINGERS } from './score.mjs';
import { choir, drone, flute, horn } from './voices.mjs';

const LOOKAHEAD = 0.6;
const TICK_MS = 100;

// how loud each instrument sits in the mix (the music bus is the overall level)
// (balanced by measuring each instrument alone: melody on top, lute under it, the drone felt more than heard)
export const INSTRUMENT_LEVELS = Object.freeze({
  lute: 0.42, harp: 0.85, drone: 0.015, choir: 0.022, flute: 0.11, horn: 0.085,
  dum: 0.21, tek: 0.15, ghost: 0.11, war: 0.14, jingle: 0.5,
});

const PLUCKED = new Set(['lute', 'harp']);
const DRUMS = new Set(['dum', 'tek', 'ghost', 'war', 'jingle']);

export class MusicPlayer {
  constructor(engine, { rand = Math.random, levels = INSTRUMENT_LEVELS } = {}) {
    this.engine = engine;
    this.rand = rand;
    this.levels = levels;
    this.wanted = null;
    this.cue = null;
    this.intensity = 0;
    this.pendingIntensity = 0;
    this.samples = new Map();
    this.timer = null;
    engine.onChange(() => this.#sync());
  }

  /** Which piece should be playing: 'hall', 'battle' or null for none. */
  play(name) {
    this.wanted = PIECES[name] ? name : null;
    this.engine.onReady(() => this.#sync());
  }

  /** 0 calm, 1 blades out, 2 the fight is on (takes effect on the next bar). */
  setIntensity(level) {
    this.pendingIntensity = Math.max(0, Math.min(2, Math.round(level)));
  }

  /** A one-shot phrase over (or instead of) the current piece. */
  stinger(name, { at = null, gain = 1 } = {}) {
    const stinger = STINGERS[name];
    const engine = this.engine;
    if (!stinger || !engine.running || !engine.musicOn) return;
    const ctx = engine.ctx;
    const start = at ?? ctx.currentTime + 0.05;
    const bus = this.#bus(stinger.hall ?? 0.5);
    bus.gain.value = gain;
    const beat = 60 / stinger.bpm;
    let end = start;
    for (const event of stinger.events) {
      const note = this.#note(bus, event, start + event.beat * beat, event.beats * beat, []);
      end = Math.max(end, note ?? start);
    }
    setTimeout(() => { try { bus.disconnect(); } catch { /* gone */ } }, (end - ctx.currentTime + 5) * 1000);
  }

  #bus(hallSend) {
    const ctx = this.engine.ctx;
    const bus = ctx.createGain();
    bus.connect(this.engine.buses.music);
    const send = ctx.createGain();
    send.gain.value = hallSend;
    bus.connect(send).connect(this.engine.hall);
    return bus;
  }

  #sync() {
    if (!this.engine.running) return;
    const want = this.engine.musicOn ? this.wanted : null;
    if ((this.cue?.name ?? null) === want) return;
    if (this.cue) this.#fadeOut(this.cue, 2);
    this.cue = want ? this.#start(want) : null;
    if (this.cue && !this.timer && !this.engine.offline) {
      this.timer = setInterval(() => this.scheduleUntil(this.engine.now + LOOKAHEAD), TICK_MS);
    }
  }

  #start(name) {
    const piece = PIECES[name];
    const now = this.engine.now;
    const bus = this.#bus(piece.hall);
    bus.gain.setValueAtTime(0.0001, now);
    bus.gain.exponentialRampToValueAtTime(1, now + 1.5);
    this.intensity = this.pendingIntensity;
    return { name, piece, bus, bars: piece.bars(this.rand), nextBarAt: now + 0.2, voices: [] };
  }

  #fadeOut(cue, seconds) {
    const now = this.engine.now;
    cue.bus.gain.cancelScheduledValues(now);
    cue.bus.gain.setTargetAtTime(0.0001, now, seconds / 4);
    for (const voice of cue.voices) voice.stop(now + seconds);
    cue.bars = null;
    if (!this.engine.offline) setTimeout(() => { try { cue.bus.disconnect(); } catch { /* gone */ } }, (seconds + 2) * 1000);
  }

  /** Put every bar that starts before `time` on the clock (the timer calls this; so does a demo render). */
  scheduleUntil(time) {
    const cue = this.cue;
    if (!cue?.bars) return;
    const beat = 60 / cue.piece.bpm;
    while (cue.nextBarAt < time) {
      this.intensity = this.pendingIntensity;
      const bar = cue.bars.next().value;
      for (const event of bar.events) {
        if ((event.layer ?? 0) > this.intensity) continue;
        // a player's hands are never quite on the grid
        const human = DRUMS.has(event.inst) || PLUCKED.has(event.inst) ? (this.rand() - 0.5) * 0.012 : 0;
        this.#note(cue.bus, event, cue.nextBarAt + event.beat * beat + human, event.beats * beat, cue.voices);
      }
      cue.nextBarAt += cue.piece.beatsPerBar * beat;
      // forget voices that have finished
      cue.voices = cue.voices.filter((voice) => voice.end > this.engine.now);
    }
  }

  // schedule one event; returns when it ends
  #note(dest, event, start, duration, voices) {
    const engine = this.engine;
    const ctx = engine.ctx;
    const level = (this.levels[event.inst] ?? 0) * (event.vel ?? 1);
    const humanVel = PLUCKED.has(event.inst) || DRUMS.has(event.inst) ? 0.92 + this.rand() * 0.16 : 1;
    if (!(level > 0)) return start;
    const panned = this.#panner(dest, event.pan ?? 0);
    if (PLUCKED.has(event.inst) || DRUMS.has(event.inst)) {
      const buffer = this.#sample(event.inst, event.midi);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      // one take per note: a few cents either way keeps repeats from sounding stamped
      if (PLUCKED.has(event.inst)) source.detune.value = (this.rand() - 0.5) * 8;
      const amp = ctx.createGain();
      amp.gain.value = level * humanVel;
      source.connect(amp).connect(panned);
      source.start(Math.max(ctx.currentTime, start));
      return start + buffer.duration;
    }
    const freq = Array.isArray(event.midi) ? event.midi.map(midiToFreq) : midiToFreq(event.midi);
    let voice = null;
    if (event.inst === 'drone') voice = drone(ctx, panned, { freq, start, duration, gain: level, attack: event.attack ?? 2.5, release: event.release ?? 3 });
    else if (event.inst === 'choir') voice = choir(ctx, panned, { freqs: [].concat(freq), start, duration, gain: level, attack: event.attack ?? 1.4, release: event.release ?? 1.8 });
    else if (event.inst === 'flute') voice = flute(ctx, panned, { freq, start, duration, gain: level, noise: engine.noise });
    else if (event.inst === 'horn') voice = horn(ctx, panned, { freq, start, duration, gain: level });
    if (voice) voices.push(voice);
    return voice?.end ?? start;
  }

  #panner(dest, pan) {
    const ctx = this.engine.ctx;
    if (!pan || !ctx.createStereoPanner) return dest;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    panner.connect(dest);
    return panner;
  }

  // plucked notes (one take each) and drum hits (a few takes) are rendered once and reused. At 24 kHz: nothing in them
  // sits above 12 kHz, and it halves the memory and the work (the jingles keep the full rate for their shimmer)
  #sample(inst, midi) {
    const key = PLUCKED.has(inst) ? `${inst}:${midi}` : inst;
    let takes = this.samples.get(key);
    if (!takes) {
      takes = [];
      this.samples.set(key, takes);
    }
    const wanted = PLUCKED.has(inst) ? 1 : 3;
    if (takes.length < wanted) {
      const sampleRate = inst === 'jingle' ? this.engine.ctx.sampleRate : Math.min(this.engine.ctx.sampleRate, 24000);
      let data;
      if (PLUCKED.has(inst)) data = pluck(midiToFreq(midi), { sampleRate, instrument: inst, rand: this.rand });
      else if (inst === 'war') data = warDrum({ sampleRate, rand: this.rand });
      else if (inst === 'jingle') data = jingles({ sampleRate, rand: this.rand });
      else data = frameDrum(inst, { sampleRate, rand: this.rand });
      takes.push(this.engine.buffer(data, sampleRate));
      return takes[takes.length - 1];
    }
    return takes[Math.floor(this.rand() * takes.length)];
  }
}
