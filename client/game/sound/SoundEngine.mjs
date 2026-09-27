// Web Audio playback for the synthesized combat sounds (see soundRecipes.mjs).
//
// Chain: every sound -> its own panner -> dry bus + reverb send -> master gain -> compressor -> speakers. The reverb
// is a generated stone-courtyard impulse, so hits sit in the space instead of beeping in your ear. Browsers only let
// audio start after a user gesture, so the context is created and resumed on the first click or key press.

const STORAGE_KEY = 'ss-sound';

function readSetting() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') ?? { muted: false, volume: 0.8 }; }
  catch { return { muted: false, volume: 0.8 }; }
}

function writeSetting(setting) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(setting)); } catch { /* private mode: keep it for the session */ }
}

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.setting = readSetting();
    this.noise = null;
    const unlock = () => this.unlock();
    addEventListener('pointerdown', unlock, { capture: true, passive: true });
    addEventListener('keydown', unlock, { capture: true });
  }

  get muted() {
    return Boolean(this.setting.muted);
  }

  toggleMute() {
    this.setting = { ...this.setting, muted: !this.setting.muted };
    writeSetting(this.setting);
    if (this.master) this.master.gain.setTargetAtTime(this.setting.muted ? 0 : this.setting.volume, this.ctx.currentTime, 0.02);
    return this.setting.muted;
  }

  /** Render into a given context instead of the speakers (an OfflineAudioContext, for checking the mix). */
  useContext(ctx) {
    this.ctx = ctx;
    this.offline = typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
    this.#buildChain();
    return this;
  }

  unlock() {
    if (!this.ctx) {
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Context) return null;
      this.ctx = new Context();
      this.#buildChain();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
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
    this.master.gain.value = this.setting.muted ? 0 : this.setting.volume;
    this.master.connect(this.compressor);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.#courtyardImpulse(1.6);
    this.reverbReturn = ctx.createGain();
    this.reverbReturn.gain.value = 0.55;
    this.reverb.connect(this.reverbReturn);
    this.reverbReturn.connect(this.master);
    // one second of white noise, reused by every noise layer
    const length = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
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

  /**
   * Play a recipe. pan: -1..1; gain: 0..1 (distance falloff); delay: seconds from now.
   */
  play(recipe, { pan = 0, gain = 1, delay = 0 } = {}) {
    const ctx = this.ctx;
    if (!ctx || (ctx.state !== 'running' && !this.offline) || this.setting.muted || !recipe) return;
    const start = ctx.currentTime + Math.max(0, delay) + 0.005;
    const out = ctx.createGain();
    out.gain.value = gain;
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      out.connect(panner);
      panner.connect(this.master);
    } else {
      out.connect(this.master);
    }
    if (recipe.reverb > 0) {
      const send = ctx.createGain();
      send.gain.value = recipe.reverb;
      out.connect(send);
      send.connect(this.reverb);
    }
    let end = start;
    for (const layer of recipe.layers) end = Math.max(end, this.#layer(layer, out, start));
    // let the graph go once everything has rung out
    if (!this.offline) setTimeout(() => { try { out.disconnect(); panner?.disconnect(); } catch { /* already gone */ } }, (end - ctx.currentTime + 0.2) * 1000);
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
        const stop = this.#envelope(amp.gain, start, 0.002, partial.decay, partial.gain);
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
