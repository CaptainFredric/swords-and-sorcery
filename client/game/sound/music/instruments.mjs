// Sampled instruments synthesized in plain JS (no Web Audio), so a note is rendered once into a buffer and then
// played as often as the music needs it: plucked strings (Karplus-Strong), a frame drum, a war drum and jingles.
// Every call draws fresh noise, so two renders of the same note are never identical.

// one second-order filter (RBJ cookbook), run over the data in place
export function biquad(data, sampleRate, { type, freq, q = 0.707, gainDb = 0 }) {
  const w = (2 * Math.PI * freq) / sampleRate;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  const A = Math.pow(10, gainDb / 40);
  let b0; let b1; let b2; let a0; let a1; let a2;
  if (type === 'lowpass') { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha; }
  else if (type === 'highpass') { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha; }
  else if (type === 'bandpass') { b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha; }
  else if (type === 'peaking') { b0 = 1 + alpha * A; b1 = -2 * cos; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cos; a2 = 1 - alpha / A; }
  else throw new Error(`Unknown filter ${type}`);
  let x1 = 0; let x2 = 0; let y1 = 0; let y2 = 0;
  for (let i = 0; i < data.length; i += 1) {
    const x = data[i];
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    data[i] = y;
  }
  return data;
}

function normalize(data, peak = 0.8) {
  let max = 0;
  for (let i = 0; i < data.length; i += 1) max = Math.max(max, Math.abs(data[i]));
  if (max > 0) for (let i = 0; i < data.length; i += 1) data[i] *= peak / max;
  return data;
}

// a string or a skin takes a millisecond or two to speak: without this ramp every note starts with a digital click
function fadeIn(data, sampleRate, seconds = 0.0015) {
  const n = Math.min(data.length, Math.max(1, Math.floor(sampleRate * seconds)));
  for (let i = 0; i < n; i += 1) data[i] *= i / n;
  return data;
}

function fadeOut(data, sampleRate, seconds = 0.06) {
  const n = Math.min(data.length, Math.floor(sampleRate * seconds));
  for (let i = 0; i < n; i += 1) data[data.length - 1 - i] *= i / n;
  return data;
}

// pluck: how bright the finger or plectrum is (Hz); pick: where along the string it is plucked (0..0.5)
export const STRINGS = Object.freeze({
  // gut strings on a round-backed lute: plucked near the bridge (nasal), a short ring, a woody body
  lute: { seconds: 1.8, t60: 1.5, pluck: 2600, pick: 0.14, body: [{ freq: 125, gainDb: 4, q: 1.2 }, { freq: 280, gainDb: 3, q: 1.4 }], air: 5200 },
  // a small wire harp: plucked with the fingertips in the middle of the string, long and ringing
  harp: { seconds: 2.6, t60: 2.6, pluck: 4000, pick: 0.3, body: [{ freq: 420, gainDb: 2, q: 1 }], air: 7500 },
});

/**
 * A plucked string at freq Hz. Extended Karplus-Strong: a noise burst (softened to the pluck's brightness, combed by
 * the pluck position) circulates in a delay line whose length is tuned with an allpass, losing a little each trip.
 */
export function pluck(freq, { sampleRate = 48000, instrument = 'lute', rand = Math.random } = {}) {
  const spec = STRINGS[instrument] ?? STRINGS.lute;
  const length = Math.floor(sampleRate * spec.seconds);
  const out = new Float32Array(length);
  const period = sampleRate / freq;
  const delay = Math.max(2, Math.floor(period - 0.6));
  const frac = period - delay - 0.5;
  const allpass = (1 - frac) / (1 + frac);
  // loss per trip so the fundamental dies away over t60 seconds (the averaging filter already loses a little)
  const averagingGain = Math.abs(Math.cos((Math.PI * freq) / sampleRate));
  const loss = Math.min(0.99995, Math.pow(0.001, 1 / (freq * spec.t60)) / averagingGain);

  const line = new Float32Array(delay);
  let soft = 0;
  const smooth = Math.exp((-2 * Math.PI * spec.pluck) / sampleRate);
  const pickAt = Math.max(1, Math.floor(delay * spec.pick));
  const burst = new Float32Array(delay);
  for (let i = 0; i < delay; i += 1) {
    soft = smooth * soft + (1 - smooth) * (rand() * 2 - 1);
    burst[i] = soft;
  }
  for (let i = 0; i < delay; i += 1) line[i] = burst[i] - (i >= pickAt ? burst[i - pickAt] : 0);

  let index = 0;
  let previous = 0;
  let apIn = 0;
  let apOut = 0;
  for (let n = 0; n < length; n += 1) {
    const current = line[index];
    const averaged = 0.5 * (current + previous);
    previous = current;
    // first-order allpass: fine-tunes the loop to the exact pitch
    const tuned = allpass * averaged + apIn - allpass * apOut;
    apIn = averaged;
    apOut = tuned;
    line[index] = tuned * loss;
    out[n] = current;
    index = (index + 1) % delay;
  }
  biquad(out, sampleRate, { type: 'highpass', freq: 40, q: 0.7 });
  for (const body of spec.body) biquad(out, sampleRate, { type: 'peaking', ...body });
  biquad(out, sampleRate, { type: 'lowpass', freq: spec.air, q: 0.6 });
  return fadeIn(fadeOut(normalize(out), sampleRate), sampleRate);
}

// a struck round skin: a few inharmonic modes (circular membrane ratios), each dying at its own rate
function membrane(out, sampleRate, { f0, drop = 1, dropSec = 0.04, modes }) {
  for (const mode of modes) {
    // every mode starts from rest (phase 0), as a struck skin does
    let phase = 0;
    const decay = mode.decay;
    for (let n = 0; n < out.length; n += 1) {
      const t = n / sampleRate;
      const bend = 1 + (drop - 1) * Math.exp(-t / dropSec);
      phase += (2 * Math.PI * f0 * mode.ratio * bend) / sampleRate;
      out[n] += Math.sin(phase) * mode.gain * Math.exp(-t / decay);
    }
  }
}

function burst(out, sampleRate, { gain, decay, filter, rand }) {
  const noise = new Float32Array(Math.min(out.length, Math.floor(sampleRate * decay * 8)));
  for (let n = 0; n < noise.length; n += 1) noise[n] = (rand() * 2 - 1) * Math.exp(-n / sampleRate / decay);
  biquad(noise, sampleRate, filter);
  for (let n = 0; n < noise.length; n += 1) out[n] += noise[n] * gain;
}

const MEMBRANE = [1, 1.59, 2.14, 2.3, 2.65];

/** A frame drum (bendir/tabor): dum = open centre, tek = the rim, ghost = a light rim touch. */
export function frameDrum(kind = 'dum', { sampleRate = 48000, rand = Math.random } = {}) {
  const out = new Float32Array(Math.floor(sampleRate * (kind === 'dum' ? 0.9 : 0.35)));
  if (kind === 'dum') {
    membrane(out, sampleRate, {
      f0: 92 * (0.97 + rand() * 0.06), drop: 1.3,
      modes: MEMBRANE.map((ratio, i) => ({ ratio, gain: [1, 0.45, 0.3, 0.22, 0.16][i], decay: [0.32, 0.16, 0.1, 0.09, 0.07][i] })),
    });
    burst(out, sampleRate, { gain: 0.5, decay: 0.012, filter: { type: 'lowpass', freq: 1500, q: 0.7 }, rand });
  } else {
    const light = kind === 'ghost' ? 0.45 : 1;
    membrane(out, sampleRate, {
      f0: 310 * (0.96 + rand() * 0.08), drop: 1.08, dropSec: 0.01,
      modes: [1, 1.5, 2.1].map((ratio, i) => ({ ratio, gain: [0.5, 0.3, 0.2][i] * light, decay: 0.05 })),
    });
    burst(out, sampleRate, { gain: 0.9 * light, decay: 0.008, filter: { type: 'bandpass', freq: 2800, q: 0.9 }, rand });
  }
  biquad(out, sampleRate, { type: 'highpass', freq: 35, q: 0.7 });
  return fadeIn(fadeOut(normalize(out, kind === 'ghost' ? 0.4 : 0.85), sampleRate, 0.03), sampleRate, 0.001);
}

/** A great war drum: a deep skin, a long boom, the thud of the beater. */
export function warDrum({ sampleRate = 48000, rand = Math.random } = {}) {
  const out = new Float32Array(Math.floor(sampleRate * 1.6));
  membrane(out, sampleRate, {
    f0: 52 * (0.97 + rand() * 0.06), drop: 1.45, dropSec: 0.06,
    modes: [{ ratio: 1, gain: 1, decay: 0.55 }, { ratio: 1.52, gain: 0.35, decay: 0.22 }, { ratio: 2.02, gain: 0.18, decay: 0.15 }],
  });
  burst(out, sampleRate, { gain: 0.45, decay: 0.03, filter: { type: 'lowpass', freq: 600, q: 0.7 }, rand });
  burst(out, sampleRate, { gain: 0.12, decay: 0.006, filter: { type: 'bandpass', freq: 2200, q: 1 }, rand });
  biquad(out, sampleRate, { type: 'highpass', freq: 28, q: 0.7 });
  return fadeIn(fadeOut(normalize(out, 0.9), sampleRate, 0.1), sampleRate, 0.002);
}

/** The jingles of a tambourine: small brass discs, struck almost together. */
export function jingles({ sampleRate = 48000, rand = Math.random } = {}) {
  const out = new Float32Array(Math.floor(sampleRate * 0.4));
  for (let j = 0; j < 6; j += 1) {
    const offset = Math.floor(rand() * 0.012 * sampleRate);
    for (const ratio of [1, 1.41, 1.93]) {
      const freq = (4200 + rand() * 2600) * ratio;
      const decay = 0.05 + rand() * 0.05;
      for (let n = offset; n < out.length; n += 1) {
        const t = (n - offset) / sampleRate;
        out[n] += Math.sin(2 * Math.PI * freq * t) * Math.exp(-t / decay) * 0.12;
      }
    }
  }
  burst(out, sampleRate, { gain: 0.35, decay: 0.03, filter: { type: 'highpass', freq: 6000, q: 0.7 }, rand });
  return fadeIn(fadeOut(normalize(out, 0.6), sampleRate, 0.05), sampleRate, 0.0008);
}
