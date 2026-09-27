// Web Audio playback for the whole soundscape: combat recipes (soundRecipes.mjs), the menu's brass, the wind and bell
// of the ambience, the music and the knight's voice.
//
// Chain: every sound -> its own panner -> a bus (sfx, ui, ambience, music, voice) -> master gain -> compressor ->
// speakers. Sounds can also send to two generated rooms: a stone courtyard (combat, voice) and a long hall (music, the
// bell), and the voice has an echo off the castle walls. Browsers only let audio start after a user gesture, so the
// context is created and resumed on the first click, tap or key press.

const STORAGE_KEY = 'ss-sound';
const DEFAULT_SETTING = Object.freeze({ muted: false, volume: 0.8, music: true, musicVolume: 0.55 });
export const BUS_LEVELS = Object.freeze({ sfx: 1, ui: 0.5, ambience: 0.55, music: 1, voice: 0.9 });

function readSetting() {
  try { return { ...DEFAULT_SETTING, ...(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') ?? {}) }; }
  catch { return { ...DEFAULT_SETTING }; }
}

function writeSetting(setting) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(setting)); } catch { /* private mode: keep it for the session */ }
}

export class SoundEngine {
  constructor({ listen = true } = {}) {
    this.ctx = null;
    this.offline = false;
    this.setting = readSetting();
    this.noise = null;
    this.buses = {};
    this.readyCallbacks = [];
    this.changeCallbacks = [];
    this.pending = [];
    if (!listen) return;
    const unlock = () => this.unlock();
    for (const type of ['pointerdown', 'touchend', 'click', 'keydown']) addEventListener(type, unlock, { capture: true, passive: true });
    // nothing plays in a hidden tab: the music and wind stop costing anything until you come back
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx || this.offline) return;
      if (document.hidden) this.ctx.suspend().catch(() => {});
      else this.ctx.resume().catch(() => {});
    });
  }

  get muted() { return Boolean(this.setting.muted); }
  get musicOn() { return Boolean(this.setting.music) && !this.setting.muted; }
  get running() { return Boolean(this.ctx) && (this.offline || this.ctx.state === 'running'); }
  get now() { return this.ctx?.currentTime ?? 0; }

  /** Runs fn once the context exists and plays (at once if it already does). */
  onReady(fn) {
    if (this.running) fn(this);
    else this.readyCallbacks.push(fn);
  }

  /** Called with the setting whenever sound or music is switched on or off. */
  onChange(fn) { this.changeCallbacks.push(fn); }

  toggleMute() {
    this.#updateSetting({ muted: !this.setting.muted });
    return this.setting.muted;
  }

  toggleMusic() {
    this.#updateSetting({ music: !this.setting.music });
    return this.setting.music;
  }

  #updateSetting(patch) {
    this.setting = { ...this.setting, ...patch };
    writeSetting(this.setting);
    this.#applyLevels(0.08);
    for (const fn of this.changeCallbacks) fn(this.setting);
  }

  #applyLevels(glide = 0) {
    if (!this.master) return;
    const at = this.ctx.currentTime;
    const set = (param, value) => (glide ? param.setTargetAtTime(value, at, glide / 3) : param.setValueAtTime(value, at));
    set(this.master.gain, this.setting.muted ? 0 : this.setting.volume);
    set(this.buses.music.gain, this.setting.music ? BUS_LEVELS.music * this.setting.musicVolume : 0);
  }

  /** Render into a given context instead of the speakers (an OfflineAudioContext, for checking the mix). */
  useContext(ctx) {
    this.ctx = ctx;
    this.offline = typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
    this.#buildChain();
    this.#flushReady();
    return this;
  }

  unlock() {
    if (!this.ctx) {
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Context) return null;
      this.ctx = new Context({ latencyHint: 'interactive' });
      this.#buildChain();
    }
    if (this.ctx.state === 'suspended' && !document.hidden) {
      this.ctx.resume().then(() => this.#flushReady()).catch(() => {});
    } else if (this.ctx.state === 'running') {
      this.#flushReady();
    }
    return this.ctx;
  }

  #flushReady() {
    if (!this.running) return;
    const callbacks = this.readyCallbacks.splice(0);
    for (const fn of callbacks) fn(this);
    const pending = this.pending.splice(0);
    for (const fn of pending) fn();
  }

  #buildChain() {
    const ctx = this.ctx;
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -16;
    this.compressor.knee.value = 10;
    this.compressor.ratio.value = 5;
    this.compressor.attack.value = 0.002;
    this.compressor.release.value = 0.18;
    this.compressor.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(this.compressor);
    for (const [name, level] of Object.entries(BUS_LEVELS)) {
      const bus = ctx.createGain();
      bus.gain.value = level;
      bus.connect(this.master);
      this.buses[name] = bus;
    }
    this.#applyLevels();

    // the courtyard: short, with early reflections off stone
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.#courtyardImpulse(1.6);
    this.reverbReturn = ctx.createGain();
    this.reverbReturn.gain.value = 0.55;
    this.reverb.connect(this.reverbReturn);
    this.reverbReturn.connect(this.master);

    // the hall: long and dark, for the music and the distant bell
    this.hall = ctx.createConvolver();
    this.hall.buffer = this.#hallImpulse(3.4);
    this.hallReturn = ctx.createGain();
    this.hallReturn.gain.value = 0.5;
    this.hall.connect(this.hallReturn);
    this.hallReturn.connect(this.master);

    // the voice echoes off the castle walls: repeats that darken as they fade
    this.echoes = {
      wall: this.#echo(0.2, 0.26, 2600),
      shout: this.#echo(0.32, 0.46, 2000),
    };

    // one second of white noise, reused by every noise layer
    const length = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  }

  #echo(delaySec, feedback, lowpass) {
    const ctx = this.ctx;
    const input = ctx.createGain();
    const delay = ctx.createDelay(1);
    delay.delayTime.value = delaySec;
    const fb = ctx.createGain();
    fb.gain.value = feedback;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = lowpass;
    const thin = ctx.createBiquadFilter();
    thin.type = 'highpass';
    thin.frequency.value = 240;
    const out = ctx.createGain();
    out.gain.value = 0.8;
    input.connect(delay);
    delay.connect(tone).connect(thin);
    thin.connect(fb).connect(delay);
    thin.connect(out);
    out.connect(this.buses.voice);
    out.connect(this.hall);
    return input;
  }

  // stereo noise with an exponential tail and a few early reflections off stone walls
  #courtyardImpulse(seconds) {
    const ctx = this.ctx;
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    const reflections = [0.011, 0.023, 0.037, 0.052, 0.071];
    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i += 1) {
        const t = i / ctx.sampleRate;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t / seconds, 2.4) * 0.5;
      }
      for (const [k, at] of reflections.entries()) {
        const index = Math.floor((at + channel * 0.003) * ctx.sampleRate);
        if (index < length) data[index] += (k % 2 ? -1 : 1) * 0.6 * Math.pow(0.7, k);
      }
    }
    return buffer;
  }

  // a long stone hall: a soft onset, then a tail that loses its highs as it dies (air and stone soak them up)
  #hallImpulse(seconds) {
    const ctx = this.ctx;
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * seconds);
    const buffer = ctx.createBuffer(2, length, rate);
    const predelay = Math.floor(0.022 * rate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel);
      let low = 0;
      for (let i = predelay; i < length; i += 1) {
        const t = (i - predelay) / rate;
        const cutoff = 7000 * Math.exp(-t * 1.1) + 900;
        const a = Math.exp((-2 * Math.PI * cutoff) / rate);
        low = (1 - a) * (Math.random() * 2 - 1) + a * low;
        const onset = Math.min(1, t / 0.06);
        data[i] = low * onset * Math.exp((-6.9 * t) / seconds) * 0.9;
      }
    }
    return buffer;
  }

  #route(bus, pan) {
    const ctx = this.ctx;
    const out = ctx.createGain();
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const target = this.buses[bus] ?? this.buses.sfx;
    if (panner) {
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      out.connect(panner);
      panner.connect(target);
    } else {
      out.connect(target);
    }
    return { out, panner };
  }

  #send(out, node, amount) {
    if (!(amount > 0) || !node) return;
    const send = this.ctx.createGain();
    send.gain.value = amount;
    out.connect(send);
    send.connect(node);
  }

  #release(nodes, endTime) {
    if (this.offline) return;
    setTimeout(() => { for (const node of nodes) { try { node?.disconnect(); } catch { /* already gone */ } } }, (endTime - this.ctx.currentTime + 0.3) * 1000);
  }

  /**
   * Play a recipe. pan: -1..1; gain: 0..1 (distance falloff); delay: seconds from now; bus: which mix it belongs to.
   */
  play(recipe, { pan = 0, gain = 1, delay = 0, bus = 'sfx', at = null } = {}) {
    const ctx = this.ctx;
    if (!ctx || this.setting.muted || !recipe) return;
    if (!this.running) {
      // the first click wakes the context: its own clank plays as soon as it can
      if (ctx.state === 'suspended' && bus === 'ui' && this.pending.length < 4) this.pending.push(() => this.play(recipe, { pan, gain, bus }));
      return;
    }
    const start = at ?? ctx.currentTime + Math.max(0, delay) + 0.005;
    const { out, panner } = this.#route(bus, pan);
    out.gain.value = gain;
    this.#send(out, this.reverb, recipe.reverb);
    this.#send(out, this.hall, recipe.hall);
    let end = start;
    for (const layer of recipe.layers) end = Math.max(end, this.#layer(layer, out, start + (layer.at ?? 0)));
    // let the graph go once everything has rung out
    this.#release([out, panner], end);
  }

  /**
   * Play a decoded buffer (music notes, voice lines). Returns a handle with stop(fadeSeconds).
   * rate: playback rate (pitch); reverb/hall: send levels; echo: 'wall' | 'shout' and echoLevel.
   */
  playBuffer(buffer, {
    bus = 'sfx', pan = 0, gain = 1, rate = 1, at = null, delay = 0, reverb = 0, hall = 0, echo = null, echoLevel = 0.5,
    attack = 0, duration = null, release = 0.05,
  } = {}) {
    const ctx = this.ctx;
    if (!ctx || !buffer || this.setting.muted || !this.running) return null;
    const start = at ?? ctx.currentTime + Math.max(0, delay) + 0.005;
    const { out, panner } = this.#route(bus, pan);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const amp = ctx.createGain();
    if (attack > 0) {
      amp.gain.setValueAtTime(0, start);
      amp.gain.linearRampToValueAtTime(gain, start + attack);
    } else {
      amp.gain.value = gain;
    }
    source.connect(amp).connect(out);
    this.#send(out, this.reverb, reverb);
    this.#send(out, this.hall, hall);
    if (echo && this.echoes[echo]) this.#send(out, this.echoes[echo], echoLevel);
    const natural = buffer.duration / rate;
    const length = duration === null ? natural : Math.min(duration, natural);
    if (duration !== null && duration < natural) {
      amp.gain.setValueAtTime(gain, start + Math.max(attack, length - release));
      amp.gain.linearRampToValueAtTime(0.0001, start + length);
    }
    source.start(start);
    source.stop(start + length + 0.02);
    this.#release([out, panner, amp], start + length);
    return {
      source,
      stop: (fade = 0.08) => {
        const now = ctx.currentTime;
        amp.gain.cancelScheduledValues(now);
        amp.gain.setValueAtTime(amp.gain.value, now);
        amp.gain.linearRampToValueAtTime(0.0001, now + fade);
        try { source.stop(now + fade + 0.02); } catch { /* not started or already stopped */ }
      },
    };
  }

  /** Make a mono or stereo AudioBuffer from Float32Arrays (synthesized notes). */
  buffer(channels, sampleRate = this.ctx.sampleRate) {
    const list = Array.isArray(channels) ? channels : [channels];
    const buffer = this.ctx.createBuffer(list.length, list[0].length, sampleRate);
    list.forEach((data, index) => buffer.copyToChannel(data, index));
    return buffer;
  }

  #envelope(param, start, attack, decay, peak) {
    param.setValueAtTime(0.0001, start);
    param.linearRampToValueAtTime(peak, start + attack);
    param.exponentialRampToValueAtTime(0.0001, start + attack + decay);
    return start + attack + decay;
  }

  #layer(layer, out, start) {
    const ctx = this.ctx;
    if (layer.type === 'noise') {
      const source = ctx.createBufferSource();
      source.buffer = this.noise;
      source.playbackRate.value = 0.9 + Math.random() * 0.2;
      source.loop = layer.attack + layer.decay > 0.45;
      const filter = ctx.createBiquadFilter();
      filter.type = layer.filter;
      filter.frequency.setValueAtTime(layer.freq, start);
      if (layer.sweepTo) filter.frequency.exponentialRampToValueAtTime(layer.sweepTo, start + layer.attack + layer.decay);
      filter.Q.value = layer.q ?? 0.7;
      const amp = ctx.createGain();
      const end = this.#envelope(amp.gain, start, layer.attack, layer.decay, layer.gain);
      source.connect(filter).connect(amp).connect(out);
      source.start(start, Math.random() * 0.5);
      source.stop(end + 0.02);
      return end;
    }
    if (layer.type === 'tone') {
      const osc = ctx.createOscillator();
      osc.type = layer.wave ?? 'sine';
      osc.frequency.setValueAtTime(layer.freq, start);
      if (layer.slideTo) osc.frequency.exponentialRampToValueAtTime(layer.slideTo, start + layer.attack + layer.decay);
      const amp = ctx.createGain();
      const end = this.#envelope(amp.gain, start, layer.attack, layer.decay, layer.gain);
      osc.connect(amp).connect(out);
      osc.start(start);
      osc.stop(end + 0.02);
      return end;
    }
    if (layer.type === 'ring') {
      let end = start;
      for (const partial of layer.partials) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = partial.freq;
        const amp = ctx.createGain();
        const stop = this.#envelope(amp.gain, start, partial.attack ?? 0.002, partial.decay, partial.gain);
        osc.connect(amp).connect(out);
        osc.start(start);
        osc.stop(stop + 0.02);
        end = Math.max(end, stop);
      }
      return end;
    }
    return start;
  }
}
