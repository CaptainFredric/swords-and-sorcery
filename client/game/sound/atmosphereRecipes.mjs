// Recipes for everything that is not a blow: the brass of the menu, the arena gate, the countdown drum, banners in
// the wind and the bell of the keep. Same layer format as soundRecipes.mjs (pure data, varied on every call).

import { jitter, ring } from './soundRecipes.mjs';

// a heavy brass fitting: closer to harmonic than struck steel, so it clanks warm instead of ringing cold
const BRASS = Object.freeze([1, 2.02, 2.93, 4.13, 5.36]);

/** A menu button: a latch tick, then brass landing on wood. variant: press | confirm | back. */
export function uiClankRecipe(rand = Math.random, { variant = 'press' } = {}) {
  const base = ({ press: 780, confirm: 930, back: 610 }[variant] ?? 780) * jitter(rand, 0.03);
  const land = 0.016 + rand() * 0.006;
  return {
    layers: [
      { type: 'noise', filter: 'highpass', freq: 4200, q: 0.7, attack: 0.001, decay: 0.01, gain: 0.28 },
      { type: 'ring', partials: [{ freq: base * 3.1 * jitter(rand, 0.02), gain: 0.05, decay: 0.035 }] },
      { type: 'noise', filter: 'bandpass', freq: 1900 * jitter(rand, 0.1), q: 1.4, at: land, attack: 0.001, decay: 0.028, gain: 0.3 },
      {
        type: 'ring',
        at: land,
        partials: BRASS.map((ratio, i) => ({ freq: base * ratio * jitter(rand, 0.01), gain: 0.11 * Math.pow(0.62, i), decay: 0.22 * Math.pow(0.7, i) })),
      },
      { type: 'tone', wave: 'sine', freq: 210, slideTo: 120, at: land, attack: 0.002, decay: 0.05, gain: 0.26 },
    ],
    reverb: 0.1,
  };
}

/** A war drum: the countdown to a duel (weight grows III, II, I) and the blow that opens the gate. */
export function warDrumRecipe(rand = Math.random, { weight = 1 } = {}) {
  return {
    layers: [
      { type: 'tone', wave: 'sine', freq: 86 * jitter(rand, 0.03), slideTo: 45, attack: 0.003, decay: 0.45 + weight * 0.3, gain: 0.7 + weight * 0.15 },
      // the second mode of a round skin sits about 1.59 times higher
      { type: 'tone', wave: 'sine', freq: 137 * jitter(rand, 0.04), slideTo: 88, attack: 0.002, decay: 0.16, gain: 0.28 },
      { type: 'noise', filter: 'lowpass', freq: 900, q: 0.7, attack: 0.002, decay: 0.12, gain: 0.42 },
      { type: 'noise', filter: 'bandpass', freq: 2400, q: 1, attack: 0.001, decay: 0.02, gain: 0.16 },
    ],
    reverb: 0.3,
    hall: 0.3 + weight * 0.12,
  };
}

/** The arena gate: the winch catches, the chain runs over its wheel, and the gate locks open. */
export function gateRecipe(rand = Math.random) {
  const layers = [
    { type: 'tone', wave: 'sine', freq: 70, slideTo: 38, attack: 0.004, decay: 0.55, gain: 0.8 },
    { type: 'noise', filter: 'lowpass', freq: 320, q: 0.6, attack: 0.003, decay: 0.4, gain: 0.5 },
    // air through the opening
    { type: 'noise', filter: 'bandpass', freq: 260, q: 0.8, sweepTo: 1400, at: 0.05, attack: 0.35, decay: 0.7, gain: 0.2 },
  ];
  let t = 0.06;
  for (let i = 0; i < 16; i += 1) {
    const gain = 0.12 * (1 - i / 20) * jitter(rand, 0.3);
    layers.push({ type: 'noise', filter: 'bandpass', freq: 3200 * jitter(rand, 0.25), q: 2.2, at: t, attack: 0.001, decay: 0.018, gain });
    layers.push({ type: 'ring', at: t, partials: [{ freq: 2300 * jitter(rand, 0.2), gain: gain * 0.35, decay: 0.05 }, { freq: 3900 * jitter(rand, 0.2), gain: gain * 0.2, decay: 0.03 }] });
    t += 0.035 + i * 0.004 + rand() * 0.02;
  }
  layers.push({ type: 'tone', wave: 'sine', freq: 95, slideTo: 50, at: t + 0.05, attack: 0.003, decay: 0.3, gain: 0.55 });
  layers.push({ ...ring(rand, 240 * jitter(rand, 0.05), { decay: 0.6, gain: 0.08, partials: 4, bright: 0.6 }), at: t + 0.05 });
  return { layers, reverb: 0.45, hall: 0.25 };
}

/** A banner snapping in a gust: a run of flaps that swells and dies with the wind, now and then cracking taut. */
export function clothFlapRecipe(rand = Math.random, { strength = 0.7 } = {}) {
  const layers = [];
  const flaps = 4 + Math.floor(rand() * 4 + strength * 4);
  let t = 0;
  for (let i = 0; i < flaps; i += 1) {
    const swell = Math.sin((Math.PI * (i + 0.5)) / flaps);
    const gain = (0.16 + 0.3 * strength) * (0.35 + 0.65 * swell) * jitter(rand, 0.25);
    layers.push({ type: 'noise', filter: 'bandpass', freq: 560 * jitter(rand, 0.35), q: 0.6, at: t, attack: 0.006, decay: 0.05 + rand() * 0.05, gain });
    if (rand() < 0.25 * strength) layers.push({ type: 'noise', filter: 'highpass', freq: 2600, q: 0.7, at: t + 0.01, attack: 0.001, decay: 0.012, gain: gain * 0.8 });
    t += 0.075 + rand() * 0.07;
  }
  return { layers, reverb: 0.15 };
}

// a cast bronze bell, relative to its strike note: hum, prime, the minor-third tierce that makes it sound like a bell,
// quint, nominal and the bright upper ring
export const BELL_PARTIALS = Object.freeze([
  { ratio: 0.5, gain: 0.5, decay: 7 },
  { ratio: 1, gain: 0.42, decay: 5 },
  { ratio: 1.2, gain: 0.34, decay: 4 },
  { ratio: 1.5, gain: 0.16, decay: 2.6 },
  { ratio: 2, gain: 0.4, decay: 3.2 },
  { ratio: 2.5, gain: 0.12, decay: 1.6 },
  { ratio: 2.67, gain: 0.1, decay: 1.4 },
  { ratio: 3, gain: 0.08, decay: 1.2 },
  { ratio: 4, gain: 0.05, decay: 0.8 },
]);

/**
 * The bell of the keep. prime: its prime partial in Hz (146.8 = D3, in the key of the music); distance 0..1 takes
 * the shimmer off; strikes toll `spacing` seconds apart.
 */
export function bellTollRecipe(rand = Math.random, { strikes = 3, spacing = 2.9, prime = 146.8, distance = 1 } = {}) {
  const layers = [];
  for (let s = 0; s < strikes; s += 1) {
    const at = s * spacing * jitter(rand, 0.02);
    const partials = [];
    for (const [i, partial] of BELL_PARTIALS.entries()) {
      const dull = i > 4 ? 1 - 0.6 * distance : 1;
      const gain = partial.gain * dull * jitter(rand, 0.08);
      partials.push({ freq: prime * partial.ratio * jitter(rand, 0.002), gain, decay: partial.decay, attack: 0.004 });
      // a bell beats slowly against itself: its low partials come in close pairs
      if (i < 3) partials.push({ freq: prime * partial.ratio + 0.6 + rand() * 0.5, gain: gain * 0.5, decay: partial.decay * 0.9, attack: 0.004 });
    }
    layers.push({ type: 'ring', at, partials });
    layers.push({ type: 'noise', filter: 'bandpass', freq: 1500, q: 1.2, at, attack: 0.002, decay: 0.03, gain: 0.12 * (1 - 0.5 * distance) });
  }
  return { layers, reverb: 0, hall: 0.9 };
}
