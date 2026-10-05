// Every other Spellblade speaks with the same recorded voice, so each is given a timbre of his own: the same knight's
// tone, as if another man said it behind another helm. A steady pitch (a little up or down), a little more grit than
// my own (another's voice reaches me through his helm and across the field, roughened), and his helm's own resonance
// (a boxy ring somewhere else in the voice, a little more or less chest). Mine is never touched: I hear myself dry.
//
// One description per player, from their id (the same knight always sounds the same); `build` turns one into Web
// Audio nodes for a line to play through. The description is pure, so it is tested; to change how different the
// other knights sound, change TIMBRE.

export const TIMBRE = Object.freeze({
  // pitch: this far either way (playback rate; 0.04 is about two thirds of a semitone)
  rate: 0.04,
  // grit: how hard the voice is driven, and how much of the driven sound is mixed in
  drive: Object.freeze([2.2, 3.6]),
  wet: Object.freeze([0.35, 0.55]),
  // the helm's own ring: a resonance somewhere in the voice's middle, this strong and this narrow
  resonance: Object.freeze({ low: 700, high: 1900, gain: Object.freeze([3, 6]), q: 1.4 }),
  // how much chest he keeps (the high-pass under the voice) and how much air (the low-pass over it)
  chest: Object.freeze([110, 210]),
  air: Object.freeze([5200, 7600]),
});

// a steady fraction (0..1) from a player's id, a different one for each `salt`
function unit(playerId, salt) {
  let hash = 2166136261 ^ salt;
  for (const char of String(playerId ?? '')) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 15), 2246822507) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 13), 3266489909) >>> 0;
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}
const between = ([a, b], t) => a + (b - a) * t;

export class VoiceTimbre {
  constructor(rules = TIMBRE) {
    this.rules = rules;
    this.cache = new Map();
    this.curves = new Map();
  }

  /** How `playerId` sounds: { rate, drive, wet, resonance: { freq, gain, q }, chest, air } (the same every time). */
  of(playerId) {
    if (this.cache.has(playerId)) return this.cache.get(playerId);
    const r = this.rules;
    const timbre = Object.freeze({
      rate: 1 + (unit(playerId, 1) * 2 - 1) * r.rate,
      drive: between(r.drive, unit(playerId, 2)),
      wet: between(r.wet, unit(playerId, 3)),
      resonance: Object.freeze({
        // (spread evenly in pitch, not in hertz)
        freq: r.resonance.low * (r.resonance.high / r.resonance.low) ** unit(playerId, 4),
        gain: between(r.resonance.gain, unit(playerId, 5)),
        q: r.resonance.q,
      }),
      chest: between(r.chest, unit(playerId, 6)),
      air: between(r.air, unit(playerId, 7)),
    });
    this.cache.set(playerId, timbre);
    return timbre;
  }

  /**
   * The nodes a line of `playerId`'s plays through ({ input, output, nodes }): his chest and air, his helm's ring,
   * and his grit (the driven voice mixed under the clean one, so every word survives it).
   */
  build(ctx, playerId) {
    const timbre = this.of(playerId);
    const input = ctx.createGain();
    const chest = ctx.createBiquadFilter();
    chest.type = 'highpass';
    chest.frequency.value = timbre.chest;
    const ring = ctx.createBiquadFilter();
    ring.type = 'peaking';
    ring.frequency.value = timbre.resonance.freq;
    ring.gain.value = timbre.resonance.gain;
    ring.Q.value = timbre.resonance.q;
    const air = ctx.createBiquadFilter();
    air.type = 'lowpass';
    air.frequency.value = timbre.air;
    const shaper = ctx.createWaveShaper();
    shaper.curve = this.#curve(timbre.drive);
    shaper.oversample = '2x';
    const dry = ctx.createGain();
    dry.gain.value = 1 - timbre.wet;
    const wet = ctx.createGain();
    // (driven, the voice is louder: brought back to sit where the dry one does)
    wet.gain.value = timbre.wet / Math.tanh(timbre.drive);
    const output = ctx.createGain();
    input.connect(chest).connect(ring).connect(air);
    air.connect(dry).connect(output);
    air.connect(shaper).connect(wet).connect(output);
    return { input, output, nodes: [input, chest, ring, air, shaper, dry, wet, output] };
  }

  #curve(drive) {
    const key = Math.round(drive * 100);
    if (!this.curves.has(key)) {
      const curve = new Float32Array(1024);
      for (let i = 0; i < curve.length; i += 1) {
        const x = (i / (curve.length - 1)) * 2 - 1;
        curve[i] = Math.tanh(drive * x);
      }
      this.curves.set(key, curve);
    }
    return this.curves.get(key);
  }
}

/** The one timbre table for the game (each other knight sounds the same wherever he is heard). */
export const OTHER_KNIGHTS = new VoiceTimbre();
