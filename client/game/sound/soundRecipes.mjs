// Recipes for the synthesized combat sounds. Pure data (no Web Audio), so the shape of each sound can be tested:
// every call varies a little (pitch, partial balance, decay) so repeated hits never sound machine-identical.
//
// A recipe is a list of layers the SoundEngine plays at once:
//   noise:  filtered noise burst   { type: 'noise', filter, freq, q, sweepTo?, attack, decay, gain }
//   tone:   pitched oscillator     { type: 'tone', wave, freq, slideTo?, attack, decay, gain }
//   ring:   metallic partials      { type: 'ring', partials: [{ freq, gain, decay, attack? }] }
// any layer may start late by `at` seconds; plus `reverb` (0..1 send to the courtyard) and `hall` (to the long hall).

export function jitter(rand, amount) {
  return 1 + (rand() - 0.5) * 2 * amount;
}

// inharmonic ratios of a struck steel plate (a bell-ish, clangy spectrum)
const PLATE = Object.freeze([1, 1.47, 2.09, 2.76, 3.93, 5.4]);

export function ring(rand, base, { decay = 0.45, gain = 0.2, partials = PLATE.length, bright = 1 } = {}) {
  return {
    type: 'ring',
    partials: PLATE.slice(0, partials).map((ratio, i) => ({
      freq: base * ratio * jitter(rand, 0.012),
      gain: gain * Math.pow(0.72, i) * (i > 2 ? bright : 1) * jitter(rand, 0.15),
      decay: decay * Math.pow(0.78, i) * jitter(rand, 0.12),
    })),
  };
}

/**
 * A sword landing on an armoured body. strike: combo index (0, 1, 2 = the heavy finisher); kill: the blow slew.
 */
export function swordHitRecipe(rand = Math.random, { strike = 0, kill = false } = {}) {
  const heavy = strike >= 2 || kill;
  const base = (heavy ? 430 : 560 - strike * 50) * jitter(rand, 0.06);
  const layers = [
    // the crack of contact
    { type: 'noise', filter: 'highpass', freq: 2600 * jitter(rand, 0.1), q: 0.7, attack: 0.001, decay: 0.035, gain: 0.55 },
    // plate and mail crunching under the edge
    { type: 'noise', filter: 'bandpass', freq: 1100 * jitter(rand, 0.15), q: 1.3, sweepTo: 520, attack: 0.002, decay: 0.11, gain: 0.5 },
    // the weight of the body behind the armour
    { type: 'tone', wave: 'sine', freq: 150 * jitter(rand, 0.08), slideTo: 52, attack: 0.002, decay: heavy ? 0.2 : 0.12, gain: heavy ? 0.9 : 0.7 },
    // steel ringing out
    ring(rand, base, { decay: heavy ? 0.6 : 0.38, gain: heavy ? 0.2 : 0.16, bright: 0.8 }),
  ];
  if (heavy) layers.push({ type: 'tone', wave: 'sine', freq: 72, slideTo: 38, attack: 0.004, decay: 0.32, gain: 0.8 });
  if (kill) {
    // a low toll under the killing blow
    layers.push(ring(rand, 196 * jitter(rand, 0.02), { decay: 1.7, gain: 0.16, partials: 5, bright: 0.6 }));
    layers.push({ type: 'noise', filter: 'lowpass', freq: 420, q: 0.5, attack: 0.003, decay: 0.45, gain: 0.45 });
  }
  return { layers, reverb: kill ? 0.5 : heavy ? 0.32 : 0.22 };
}

/**
 * A blow taken on a raised guard: a sharp TING of edge on edge that rings off the courtyard walls. Each block meets
 * the blade at a slightly different point, so no two ring quite alike.
 */
export function blockRecipe(rand = Math.random, { heavy = false } = {}) {
  const base = (heavy ? 420 : [760, 840, 920][Math.floor(rand() * 3)]) * jitter(rand, 0.06);
  const echo = 0.11 + rand() * 0.03;
  const layers = [
    // the edges meet: a hard, very short click with a glint above it
    { type: 'noise', filter: 'highpass', freq: 4800 * jitter(rand, 0.1), q: 0.9, attack: 0.0005, decay: 0.012, gain: 0.55 },
    { type: 'ring', partials: [{ freq: 5600 * jitter(rand, 0.05), gain: 0.07, decay: 0.05 }, { freq: 7300 * jitter(rand, 0.05), gain: 0.04, decay: 0.03 }] },
    // the TING
    ring(rand, base, { decay: heavy ? 0.75 : 0.6, gain: 0.24, bright: 1.35 }),
    { type: 'tone', wave: 'triangle', freq: 260, slideTo: 130, attack: 0.001, decay: 0.06, gain: 0.28 },
    // and back off the walls, softer
    { ...ring(rand, base, { decay: 0.35, gain: 0.07, partials: 4, bright: 1.1 }), at: echo },
  ];
  if (heavy) layers.push({ type: 'noise', filter: 'lowpass', freq: 600, q: 0.6, attack: 0.002, decay: 0.3, gain: 0.55 });
  return { layers, reverb: heavy ? 0.5 : 0.42, hall: 0.18 };
}

/** A clean parry: a high, singing ring that hangs in the air. */
export function parryRecipe(rand = Math.random) {
  return {
    layers: [
      { type: 'noise', filter: 'highpass', freq: 4200, q: 0.9, attack: 0.001, decay: 0.025, gain: 0.5 },
      ring(rand, 1180 * jitter(rand, 0.03), { decay: 1.1, gain: 0.22, bright: 1.2 }),
      { type: 'tone', wave: 'sine', freq: 880, slideTo: 1760, attack: 0.01, decay: 0.3, gain: 0.12 },
    ],
    reverb: 0.45,
  };
}

/** A sword cutting air. */
export function swingRecipe(rand = Math.random, { strike = 0 } = {}) {
  const low = (420 + strike * 60) * jitter(rand, 0.08);
  return {
    layers: [
      { type: 'noise', filter: 'bandpass', freq: low, q: 1.6, sweepTo: low * (strike === 2 ? 3.4 : 4.2), attack: 0.06, decay: 0.16, gain: strike === 2 ? 0.55 : 0.42 },
    ],
    reverb: 0.08,
  };
}

/** Steel on stone. */
export function wallClangRecipe(rand = Math.random) {
  return {
    layers: [
      { type: 'noise', filter: 'highpass', freq: 2200, q: 0.7, attack: 0.001, decay: 0.05, gain: 0.6 },
      ring(rand, 820 * jitter(rand, 0.05), { decay: 0.5, gain: 0.2, bright: 1.1 }),
      { type: 'noise', filter: 'lowpass', freq: 380, q: 0.5, attack: 0.002, decay: 0.12, gain: 0.4 },
    ],
    reverb: 0.35,
  };
}

/** The blow you take, heard from inside the helm: muffled and heavy. */
export function hurtRecipe(rand = Math.random, { heavy = false } = {}) {
  return {
    layers: [
      { type: 'noise', filter: 'lowpass', freq: 700 * jitter(rand, 0.1), q: 0.8, attack: 0.002, decay: 0.16, gain: 0.75 },
      { type: 'tone', wave: 'sine', freq: 110, slideTo: 40, attack: 0.003, decay: heavy ? 0.3 : 0.2, gain: 0.9 },
      ring(rand, 300 * jitter(rand, 0.05), { decay: 0.3, gain: 0.08, partials: 3 }),
    ],
    reverb: 0.12,
  };
}

/** A fireball bursting: a deep boom that rolls out, and the fire crackling after it. */
export function fireballImpactRecipe(rand = Math.random) {
  const layers = [
    { type: 'noise', filter: 'lowpass', freq: 1100 * jitter(rand, 0.1), q: 0.6, sweepTo: 160, attack: 0.004, decay: 0.75, gain: 0.85 },
    { type: 'tone', wave: 'sine', freq: 92, slideTo: 32, attack: 0.004, decay: 0.55, gain: 0.9 },
    { type: 'noise', filter: 'highpass', freq: 2800, q: 0.6, attack: 0.002, decay: 0.25, gain: 0.3 },
  ];
  for (let i = 0; i < 6; i += 1) {
    layers.push({ type: 'noise', filter: 'bandpass', freq: 3000 * jitter(rand, 0.3), q: 3, at: 0.12 + i * 0.07 + rand() * 0.05, attack: 0.001, decay: 0.02, gain: 0.12 * (1 - i / 7) });
  }
  return { layers, reverb: 0.45, hall: 0.2 };
}

/** Frostfire breaking: ice shattering, its shards ringing as they scatter, a cold hiss after. */
export function frostImpactRecipe(rand = Math.random) {
  const layers = [
    { type: 'noise', filter: 'highpass', freq: 4200, q: 0.8, attack: 0.001, decay: 0.06, gain: 0.5 },
    { type: 'tone', wave: 'sine', freq: 140, slideTo: 60, attack: 0.003, decay: 0.2, gain: 0.5 },
    { type: 'noise', filter: 'bandpass', freq: 5200, q: 1.2, sweepTo: 2600, attack: 0.01, decay: 0.45, gain: 0.18 },
  ];
  for (let i = 0; i < 7; i += 1) {
    layers.push({ type: 'ring', at: rand() * 0.18, partials: [{ freq: 2400 + rand() * 3200, gain: 0.05, decay: 0.12 + rand() * 0.15 }, { freq: 4000 + rand() * 3000, gain: 0.03, decay: 0.08 }] });
  }
  return { layers, reverb: 0.4, hall: 0.18 };
}

/** A lick of the burn a Fireball leaves: a small flare and a crackle. */
export function burnLickRecipe(rand = Math.random) {
  return {
    layers: [
      { type: 'noise', filter: 'bandpass', freq: 900 * jitter(rand, 0.2), q: 1, sweepTo: 1800, attack: 0.02, decay: 0.14, gain: 0.3 },
      { type: 'noise', filter: 'bandpass', freq: 3200 * jitter(rand, 0.3), q: 3, at: 0.03 + rand() * 0.04, attack: 0.001, decay: 0.02, gain: 0.14 },
      { type: 'noise', filter: 'bandpass', freq: 2600 * jitter(rand, 0.3), q: 3, at: 0.09 + rand() * 0.05, attack: 0.001, decay: 0.02, gain: 0.1 },
    ],
    reverb: 0.12,
  };
}

/** Where a sound sits: pan (-1 left .. 1 right) and loudness, from the listener's position and facing. */
export function spatialize(listener, yaw, source) {
  if (!listener || !source) return { pan: 0, gain: 1 };
  const dx = source.x - listener.x;
  const dz = source.z - listener.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.5) return { pan: 0, gain: 1 };
  // camera right for this yaw (three.js: forward is (-sin, -cos))
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);
  const pan = Math.max(-1, Math.min(1, ((dx * rightX + dz * rightZ) / distance) * 0.85));
  const gain = Math.max(0.12, Math.min(1, 6 / (distance + 3)));
  return { pan, gain };
}

/** Layered under the blow that slays: a low toll, a boom and a long tail in the courtyard. */
export function killRecipe(rand = Math.random) {
  return {
    layers: [
      ring(rand, 196 * jitter(rand, 0.02), { decay: 1.8, gain: 0.18, partials: 5, bright: 0.6 }),
      { type: 'noise', filter: 'lowpass', freq: 420, q: 0.5, attack: 0.003, decay: 0.5, gain: 0.5 },
      { type: 'tone', wave: 'sine', freq: 70, slideTo: 32, attack: 0.004, decay: 0.45, gain: 0.85 },
    ],
    reverb: 0.55,
  };
}

/**
 * Gathering a spell in the palm (release: seconds until it flies). Fire roars up into the hand and leaves with a
 * whoomp; frost draws in a cold hiss and glassy tones, and leaves with a crack of ice.
 */
export function castRecipe(rand = Math.random, { spell = 'fireball', release = 0.3 } = {}) {
  if (spell === 'frostfire') {
    return {
      layers: [
        { type: 'noise', filter: 'bandpass', freq: 2400 * jitter(rand, 0.1), q: 2, sweepTo: 5200, attack: 0.18, decay: 0.16, gain: 0.3 },
        {
          type: 'ring',
          partials: [
            { freq: 1568 * jitter(rand, 0.02), gain: 0.05, decay: 0.5, attack: 0.15 },
            { freq: 2349 * jitter(rand, 0.02), gain: 0.04, decay: 0.45, attack: 0.18 },
            { freq: 3136 * jitter(rand, 0.02), gain: 0.03, decay: 0.35, attack: 0.2 },
          ],
        },
        { type: 'noise', filter: 'highpass', freq: 3600, q: 0.8, at: release, attack: 0.002, decay: 0.05, gain: 0.35 },
        { type: 'tone', wave: 'sine', freq: 220, slideTo: 110, at: release, attack: 0.003, decay: 0.08, gain: 0.25 },
      ],
      reverb: 0.3,
      hall: 0.12,
    };
  }
  return {
    layers: [
      { type: 'noise', filter: 'bandpass', freq: 300 * jitter(rand, 0.1), q: 1.1, sweepTo: 1400, attack: 0.12, decay: 0.2, gain: 0.45 },
      { type: 'noise', filter: 'highpass', freq: 4000, q: 0.5, attack: 0.05, decay: 0.25, gain: 0.12 },
      { type: 'tone', wave: 'sine', freq: 180, slideTo: 90, attack: 0.02, decay: 0.25, gain: 0.3 },
      { type: 'noise', filter: 'lowpass', freq: 700, q: 0.7, sweepTo: 240, at: release, attack: 0.01, decay: 0.2, gain: 0.45 },
      { type: 'tone', wave: 'sine', freq: 120, slideTo: 55, at: release, attack: 0.005, decay: 0.16, gain: 0.4 },
    ],
    reverb: 0.2,
  };
}

/** A short burst of armoured speed. */
export function dashRecipe(rand = Math.random) {
  return {
    layers: [
      { type: 'noise', filter: 'bandpass', freq: 700 * jitter(rand, 0.1), q: 0.9, sweepTo: 2600, attack: 0.02, decay: 0.16, gain: 0.45 },
      { type: 'tone', wave: 'sine', freq: 120, slideTo: 60, attack: 0.005, decay: 0.1, gain: 0.35 },
    ],
    reverb: 0.1,
  };
}
