// Sustained voices built live from oscillators (a note can last any length): a bowed drone, a choir, a wooden flute,
// a horn and a string section. Each function schedules one note into `dest` and returns { end, stop(at) } so a fading cue can cut it.

const cents = (value) => Math.pow(2, value / 1200);

function envelope(param, start, end, { attack, release, level }) {
  const hold = Math.max(start + attack, end - release);
  param.setValueAtTime(0.0001, start);
  param.linearRampToValueAtTime(level, start + attack);
  param.setValueAtTime(level, hold);
  param.linearRampToValueAtTime(0.0001, Math.max(hold + 0.01, end));
}

function handle(ctx, sources, amp, end) {
  return {
    end,
    stop(at = ctx.currentTime) {
      amp.gain.cancelScheduledValues(at);
      amp.gain.setTargetAtTime(0.0001, at, 0.25);
      for (const source of sources) { try { source.stop(at + 1.2); } catch { /* already stopped */ } }
    },
  };
}

// a slow wandering control (vibrato, a bow's breathing) added to a parameter
function wander(ctx, param, { rate, depth, start, end, delay = 0 }) {
  const lfo = ctx.createOscillator();
  lfo.frequency.value = rate;
  const amount = ctx.createGain();
  amount.gain.setValueAtTime(0, start);
  amount.gain.linearRampToValueAtTime(depth, start + delay + 0.4);
  lfo.connect(amount).connect(param);
  lfo.start(start);
  lfo.stop(end + 0.05);
  return lfo;
}

/** A bowed drone (a viol or hurdy-gurdy string): two sawtooths, dark and breathing. */
export function drone(ctx, dest, { freq, start, duration, gain = 0.1, bright = 1, attack = 2.5, release = 3 }) {
  const end = start + duration;
  const amp = ctx.createGain();
  envelope(amp.gain, start, end, { attack, release, level: gain });
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 700 * bright;
  tone.Q.value = 0.7;
  const lfo = wander(ctx, tone.frequency, { rate: 0.07, depth: 160 * bright, start, end });
  const sources = [lfo];
  for (const detune of [-5, 5]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq * cents(detune);
    osc.connect(tone);
    osc.start(start);
    osc.stop(end + 0.05);
    sources.push(osc);
  }
  tone.connect(amp).connect(dest);
  return handle(ctx, sources, amp, end);
}

// the mouth shape of the choir: an open "ah" rounding toward "oh"
const FORMANTS = [{ freq: 560, q: 5, gain: 1 }, { freq: 920, q: 6, gain: 0.55 }, { freq: 2600, q: 8, gain: 0.18 }];

/** A choir chord: three slightly detuned voices per note through vowel formants, swelling in and out. */
export function choir(ctx, dest, { freqs, start, duration, gain = 0.06, attack = 1.4, release = 1.8 }) {
  const end = start + duration;
  const amp = ctx.createGain();
  envelope(amp.gain, start, end, { attack, release, level: gain });
  const mouth = ctx.createGain();
  for (const formant of FORMANTS) {
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = formant.freq;
    band.Q.value = formant.q;
    const level = ctx.createGain();
    level.gain.value = formant.gain * 3;
    mouth.connect(band).connect(level).connect(amp);
  }
  amp.connect(dest);
  const sources = [];
  for (const freq of freqs) {
    for (const detune of [-7, 0, 7]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq * cents(detune);
      sources.push(wander(ctx, osc.detune, { rate: 4.6 + Math.random() * 1.2, depth: 6, start, end, delay: 0.6 }));
      osc.connect(mouth);
      osc.start(start);
      osc.stop(end + 0.05);
      sources.push(osc);
    }
  }
  return handle(ctx, sources, amp, end);
}

/** A wooden flute: a soft hollow tone with breath at the front of each note and a late vibrato. */
export function flute(ctx, dest, { freq, start, duration, gain = 0.12, noise }) {
  const end = start + duration + 0.12;
  const amp = ctx.createGain();
  envelope(amp.gain, start, end, { attack: 0.07, release: 0.14, level: gain });
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = Math.min(9000, freq * 4);
  const sources = [];
  for (const [type, ratio, level] of [['triangle', 1, 1], ['sine', 2, 0.18]]) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq * ratio * cents(-25), start);
    osc.frequency.exponentialRampToValueAtTime(freq * ratio, start + 0.06);
    sources.push(wander(ctx, osc.detune, { rate: 5.3, depth: 10, start, end, delay: 0.3 }));
    const partial = ctx.createGain();
    partial.gain.value = level;
    osc.connect(partial).connect(tone);
    osc.start(start);
    osc.stop(end + 0.05);
    sources.push(osc);
  }
  if (noise) {
    const breath = ctx.createBufferSource();
    breath.buffer = noise;
    breath.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = freq * 2;
    band.Q.value = 1.2;
    const puff = ctx.createGain();
    puff.gain.setValueAtTime(0.0001, start);
    puff.gain.linearRampToValueAtTime(0.35, start + 0.03);
    puff.gain.exponentialRampToValueAtTime(0.06, start + 0.2);
    puff.gain.setValueAtTime(0.06, Math.max(start + 0.2, end - 0.1));
    puff.gain.linearRampToValueAtTime(0.0001, end);
    breath.connect(band).connect(puff).connect(tone);
    breath.start(start, Math.random() * 0.5);
    breath.stop(end + 0.05);
    sources.push(breath);
  }
  tone.connect(amp).connect(dest);
  return handle(ctx, sources, amp, end);
}

/** A horn: brassy sawtooths whose filter opens on the attack, with a scoop up into the note. */
export function horn(ctx, dest, { freq, start, duration, gain = 0.09 }) {
  const end = start + duration + 0.15;
  const amp = ctx.createGain();
  envelope(amp.gain, start, end, { attack: 0.05, release: 0.2, level: gain });
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.Q.value = 1.2;
  tone.frequency.setValueAtTime(350, start);
  tone.frequency.exponentialRampToValueAtTime(2300, start + 0.06);
  tone.frequency.exponentialRampToValueAtTime(1300, start + 0.3);
  const sources = [];
  for (const detune of [-4, 4]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq * cents(-35 + detune), start);
    osc.frequency.exponentialRampToValueAtTime(freq * cents(detune), start + 0.07);
    sources.push(wander(ctx, osc.detune, { rate: 4.8, depth: 7, start, end, delay: 0.35 }));
    osc.connect(tone);
    osc.start(start);
    osc.stop(end + 0.05);
    sources.push(osc);
  }
  tone.connect(amp).connect(dest);
  return handle(ctx, sources, amp, end);
}

/**
 * A string section on a chord (or one line of it): three bows to each note, a few cents apart and each with its own
 * vibrato, through a body that brightens as the bows dig in. It swells: from pianissimo (`from` of it) to `gain` over `swell` seconds
 * (the tone opening with it, `bright` from..to), holds, and is let go over `release`. With `noise`, a breath of rosin
 * at the front of the stroke.
 */
export function strings(ctx, dest, { freqs, start, duration, gain = 0.03, swell = 0.8, release = 0.8, bright = [0.45, 1.6], from = 0.04, noise = null }) {
  const end = start + duration;
  const peak = start + Math.min(swell, Math.max(0.05, duration - 0.05));
  const hold = Math.max(peak, end - release);
  const amp = ctx.createGain();
  // (the bows come in pianissimo, `from` of the peak, heard from the first: then the crescendo)
  const entry = Math.min(start + 0.12, peak);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.linearRampToValueAtTime(Math.max(0.0001, gain * from), entry);
  amp.gain.exponentialRampToValueAtTime(gain, Math.max(entry + 0.01, peak));
  amp.gain.setValueAtTime(gain, hold);
  amp.gain.exponentialRampToValueAtTime(0.0001, Math.max(hold + 0.02, end));
  const body = ctx.createBiquadFilter();
  body.type = 'lowpass';
  body.Q.value = 0.8;
  const top = Math.max(...[].concat(freqs));
  body.frequency.setValueAtTime(Math.min(9000, 700 + top * bright[0]), start);
  body.frequency.exponentialRampToValueAtTime(Math.min(12000, 1400 + top * bright[1] * 2.2), peak);
  const floor = ctx.createBiquadFilter();
  floor.type = 'highpass';
  floor.frequency.value = 90;
  const sources = [];
  for (const freq of [].concat(freqs)) {
    for (const [detune, rate] of [[-9, 5.1], [2, 5.6], [11, 6.0]]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq * cents(detune);
      sources.push(wander(ctx, osc.detune, { rate: rate + Math.random() * 0.3, depth: 7, start, end, delay: 0.25 }));
      osc.connect(body);
      osc.start(start);
      osc.stop(end + 0.05);
      sources.push(osc);
    }
  }
  if (noise) {
    const rosin = ctx.createBufferSource();
    rosin.buffer = noise;
    rosin.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 2600;
    band.Q.value = 0.9;
    const bite = ctx.createGain();
    bite.gain.setValueAtTime(0.0001, start);
    bite.gain.linearRampToValueAtTime(0.05, start + 0.04);
    bite.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
    rosin.connect(band).connect(bite).connect(amp);
    rosin.start(start, Math.random() * 0.5);
    rosin.stop(start + 0.4);
    sources.push(rosin);
  }
  body.connect(floor).connect(amp).connect(dest);
  return handle(ctx, sources, amp, end);
}
