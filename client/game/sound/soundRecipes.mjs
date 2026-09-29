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
 * A sword landing on an armoured body. strike: combo index (0, 1, 2 = the heavy third strike); kill: the blow slew.
 */
export function swordHitRecipe(rand = Math.random, { strike = 0, kill = false, quality = 1, impact = 0 } = {}) {
  const heavy = strike >= 2 || kill;
  const base = (heavy ? 430 : 560 - strike * 50) * jitter(rand, 0.06);
  const q = Math.max(0, Math.min(1, Number.isFinite(quality) ? quality : 1));
  const crash = Math.max(0, Math.min(1, Number(impact) || 0));
  // a clean cut bites; a glancing one skates across the plate with a scrape and less of a thump
  const bite = 0.35 + 0.65 * q;
  const layers = [
    // the crack of contact
    { type: 'noise', filter: 'highpass', freq: 2600 * jitter(rand, 0.1), q: 0.7, attack: 0.001, decay: 0.035, gain: 0.55 * (0.6 + 0.4 * q) },
    // plate and mail crunching under the edge
    { type: 'noise', filter: 'bandpass', freq: 1100 * jitter(rand, 0.15), q: 1.3, sweepTo: 520, attack: 0.002, decay: 0.11, gain: 0.5 * bite },
    // the weight of the body behind the armour (heavier when the two crashed together)
    { type: 'tone', wave: 'sine', freq: 150 * jitter(rand, 0.08), slideTo: 52, attack: 0.002, decay: heavy ? 0.2 : 0.12, gain: (heavy ? 0.9 : 0.7) * bite * (1 + 0.35 * crash) },
    // steel ringing out
    ring(rand, base, { decay: heavy ? 0.6 : 0.38, gain: heavy ? 0.2 : 0.16, bright: 0.8 }),
  ];
  if (q < 0.6) {
    // the edge sliding off: a bright scrape that falls away (a genuinely glancing blow, the low end of the range)
    layers.push({ type: 'noise', filter: 'bandpass', freq: 3400 * jitter(rand, 0.1), q: 2.2, sweepTo: 1800, attack: 0.004, decay: 0.09 + 0.08 * (1 - q), gain: 0.28 * (1 - q) + 0.08 });
  }
  if (crash > 0.3) layers.push({ type: 'noise', filter: 'lowpass', freq: 260, q: 0.6, attack: 0.002, decay: 0.12, gain: 0.35 * crash });
  if (heavy) layers.push({ type: 'tone', wave: 'sine', freq: 72, slideTo: 38, attack: 0.004, decay: 0.32, gain: 0.8 });
  if (kill) {
    // a low toll under the killing blow
    layers.push(ring(rand, 196 * jitter(rand, 0.02), { decay: 1.7, gain: 0.16, partials: 5, bright: 0.6 }));
    layers.push({ type: 'noise', filter: 'lowpass', freq: 420, q: 0.5, attack: 0.003, decay: 0.45, gain: 0.45 });
  }
  return { layers, reverb: kill ? 0.5 : heavy ? 0.32 : 0.22 };
}

/**
 * A blow taken on a raised guard: the edges meet with a sharp TING, slide a finger's width with a scrape, and the
 * braced arm behind the guard takes the weight (a short clank and a thump under the ring); then it rings off the
 * courtyard walls. Each block meets the blade at a slightly different point, so no two ring quite alike. `heavy`: two
 * full swings meeting (the menu round's big exchanges); a guard that breaks has its own sound (guardBreakRecipe).
 */
export function blockRecipe(rand = Math.random, { heavy = false } = {}) {
  const base = (heavy ? 420 : [760, 840, 920][Math.floor(rand() * 3)]) * jitter(rand, 0.06);
  const echo = 0.11 + rand() * 0.03;
  const layers = [
    // the edges meet: a hard, very short click with a glint above it
    { type: 'noise', filter: 'highpass', freq: 4800 * jitter(rand, 0.1), q: 0.9, attack: 0.0005, decay: 0.012, gain: 0.62 },
    { type: 'ring', partials: [{ freq: 5600 * jitter(rand, 0.05), gain: 0.08, decay: 0.05 }, { freq: 7300 * jitter(rand, 0.05), gain: 0.05, decay: 0.03 }] },
    // the TING
    ring(rand, base, { decay: heavy ? 0.75 : 0.62, gain: 0.28, bright: 1.35 }),
    // the edges slide along each other
    { type: 'noise', filter: 'bandpass', freq: 3400 * jitter(rand, 0.1), q: 3.2, sweepTo: 1700, attack: 0.004, decay: 0.075, gain: 0.24, at: 0.006 },
    // the weight of the blow stopped by a braced arm: the blades' own clank, and a thump behind them
    ring(rand, base * 0.41, { decay: 0.2, gain: 0.14, partials: 3, bright: 0.7 }),
    { type: 'tone', wave: 'triangle', freq: 260, slideTo: 130, attack: 0.001, decay: 0.06, gain: 0.3 },
    { type: 'tone', wave: 'sine', freq: 150 * jitter(rand, 0.06), slideTo: 62, attack: 0.002, decay: 0.12, gain: 0.35 },
    // and back off the walls, softer
    { ...ring(rand, base, { decay: 0.35, gain: 0.07, partials: 4, bright: 1.1 }), at: echo },
  ];
  if (heavy) layers.push({ type: 'noise', filter: 'lowpass', freq: 600, q: 0.6, attack: 0.002, decay: 0.3, gain: 0.55 });
  return { layers, reverb: heavy ? 0.5 : 0.42, hall: 0.18 };
}

/**
 * A guard broken: PER-CUNK. A bright crack as the blow lands; then, a beat later, the guard caves (a low clang of
 * plate driven into plate, a crunch and a thud as the arm gives way); then a rattle of mail and buckles as he
 * staggers, and the courtyard throws it all back.
 */
export function guardBreakRecipe(rand = Math.random) {
  const give = 0.03 + rand() * 0.012;
  const low = 185 * jitter(rand, 0.05);
  const layers = [
    // PER: the blow lands on the guard
    { type: 'noise', filter: 'highpass', freq: 3000 * jitter(rand, 0.1), q: 0.8, attack: 0.0006, decay: 0.022, gain: 0.65 },
    ring(rand, 540 * jitter(rand, 0.05), { decay: 0.32, gain: 0.2, bright: 1.25 }),
    // CUNK: the guard caves in
    { ...ring(rand, low, { decay: 1.15, gain: 0.28, partials: 6, bright: 0.95 }), at: give },
    { type: 'noise', filter: 'bandpass', freq: 1050 * jitter(rand, 0.1), q: 1.4, sweepTo: 260, attack: 0.003, decay: 0.24, gain: 0.72, at: give },
    { type: 'tone', wave: 'triangle', freq: 190, slideTo: 88, attack: 0.002, decay: 0.11, gain: 0.34, at: give },
    { type: 'tone', wave: 'sine', freq: 96 * jitter(rand, 0.05), slideTo: 40, attack: 0.003, decay: 0.3, gain: 0.66, at: give },
    { type: 'noise', filter: 'lowpass', freq: 520, q: 0.6, attack: 0.004, decay: 0.34, gain: 0.4, at: give },
  ];
  // the rattle of mail and buckles
  for (let i = 0; i < 3; i += 1) {
    const fade = 1 - i * 0.2;
    layers.push({
      type: 'ring',
      at: give + 0.09 + i * (0.055 + rand() * 0.04),
      partials: [
        { freq: 2300 + rand() * 1600, gain: 0.045 * fade, decay: 0.06 + rand() * 0.04 },
        { freq: 3600 + rand() * 1800, gain: 0.03 * fade, decay: 0.04 + rand() * 0.03 },
      ],
    });
  }
  return { layers, reverb: 0.55, hall: 0.24 };
}

/**
 * A sword drawn from its scabbard, for the moment a fight is joined: steel hissing along the throat of the sheath,
 * quicker as it comes, then the point clears it and the blade sings.
 */
export function unsheatheRecipe(rand = Math.random) {
  const clear = 0.36 + rand() * 0.05;
  const base = 1480 * jitter(rand, 0.04);
  return {
    layers: [
      // the draw: steel on the scabbard's throat, rising as the blade speeds up
      { type: 'noise', filter: 'bandpass', freq: 1900 * jitter(rand, 0.08), q: 2.2, sweepTo: 6200, attack: clear * 0.85, decay: 0.12, gain: 0.34 },
      { type: 'noise', filter: 'highpass', freq: 5200, q: 0.8, attack: clear * 0.9, decay: 0.08, gain: 0.12 },
      // the leather and wood of the sheath, low beneath it
      { type: 'noise', filter: 'lowpass', freq: 520, q: 0.7, attack: 0.05, decay: clear * 0.7, gain: 0.16 },
      // the point clears: a click, then the SHING
      { type: 'noise', filter: 'highpass', freq: 3800, q: 0.9, attack: 0.0008, decay: 0.02, gain: 0.4, at: clear },
      { ...ring(rand, base, { decay: 1.3, gain: 0.16, bright: 1.3 }), at: clear },
      { type: 'tone', wave: 'sine', freq: base * 2.02, slideTo: base * 2.06, attack: 0.004, decay: 0.9, gain: 0.05, at: clear },
    ],
    reverb: 0.4,
    hall: 0.15,
  };
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

/** The gauntlet thrown: a short, low rush of a fist through the air (no blade to sing). */
export function gauntletSwingRecipe(rand = Math.random) {
  const low = 280 * jitter(rand, 0.08);
  return {
    layers: [
      { type: 'noise', filter: 'bandpass', freq: low, q: 1.2, sweepTo: low * 2.6, attack: 0.025, decay: 0.09, gain: 0.34 },
      // the plate of the arm shifting as it goes
      ring(rand, 1900 * jitter(rand, 0.06), { decay: 0.05, gain: 0.03, partials: 2 }),
    ],
    reverb: 0.05,
  };
}

/**
 * The gauntlet landing: guarded, steel on steel (a dull knock, no ring to speak of); on the body, a heavy thud into
 * plate with a short clank, lighter than a sword's bite.
 */
export function gauntletHitRecipe(rand = Math.random, { guarded = false } = {}) {
  if (guarded) {
    return {
      layers: [
        { type: 'noise', filter: 'bandpass', freq: 1500 * jitter(rand, 0.08), q: 1.4, attack: 0.001, decay: 0.03, gain: 0.34 },
        ring(rand, 610 * jitter(rand, 0.05), { decay: 0.16, gain: 0.1, partials: 3, bright: 0.8 }),
        { type: 'tone', wave: 'sine', freq: 130, slideTo: 70, attack: 0.002, decay: 0.08, gain: 0.26 },
      ],
      reverb: 0.1,
    };
  }
  return {
    layers: [
      // the knuckles of the gauntlet on plate
      { type: 'noise', filter: 'bandpass', freq: 900 * jitter(rand, 0.1), q: 1.1, attack: 0.001, decay: 0.035, gain: 0.46 },
      ring(rand, 470 * jitter(rand, 0.06), { decay: 0.14, gain: 0.1, partials: 3, bright: 0.7 }),
      // and the weight of it: a thud through the body
      { type: 'tone', wave: 'sine', freq: 110 * jitter(rand, 0.06), slideTo: 52, attack: 0.002, decay: 0.14, gain: 0.5 },
      { type: 'noise', filter: 'lowpass', freq: 240, q: 0.6, attack: 0.002, decay: 0.08, gain: 0.34 },
    ],
    reverb: 0.1,
  };
}

/** The spell's key pressed while it cools and nothing is in reach: a dull, quiet no. */
export function deniedRecipe() {
  return {
    layers: [
      { type: 'noise', filter: 'lowpass', freq: 520, q: 0.8, attack: 0.002, decay: 0.05, gain: 0.22 },
      { type: 'tone', wave: 'triangle', freq: 190, slideTo: 150, attack: 0.002, decay: 0.07, gain: 0.12 },
    ],
    reverb: 0.02,
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
  // the Gale's breath drawn in (its release, the whoosh, is played as it goes: galeReleaseRecipe)
  if (spell === 'gale') return galeGatherRecipe(rand, { seconds: release });
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

/**
 * Sheathe in Steel: the magic hand clenches (leather and mail drawing tight), the plate settles hard (a restrained
 * CHINK over a short low KLANG of the whole harness), and a thin shimmer runs with the glint over the steel.
 */
export function steelCallRecipe(rand = Math.random) {
  return {
    layers: [
      { type: 'noise', filter: 'bandpass', freq: 900 * jitter(rand, 0.1), q: 1.2, attack: 0.004, decay: 0.07, gain: 0.22 },
      { ...ring(rand, 1850 * jitter(rand, 0.03), { decay: 0.16, gain: 0.2, partials: 4, bright: 1.2 }), at: 0.012 },
      { ...ring(rand, 520 * jitter(rand, 0.03), { decay: 0.38, gain: 0.11, partials: 5, bright: 0.8 }), at: 0.035 },
      { ...ring(rand, 4300 * jitter(rand, 0.05), { decay: 0.34, gain: 0.045, partials: 3 }), at: 0.08 },
    ],
    reverb: 0.12,
  };
}

/**
 * A blow landing on Sheathed in Steel, as hard as the plate still is (`strength` 0..1, sliding evenly between):
 * fresh, a bright ringing KLANG; half worn, a shorter TANG with the edge scraping off; nearly gone, a dull clunk, more
 * body than ring. `local`: my own plate, heard from inside it: punchier (a harder crack, a thump in the chest, less of
 * the courtyard) than what anyone else hears of it.
 */
export function steelClangRecipe(rand = Math.random, { strength = 1, local = false } = {}) {
  const s = Math.max(0, Math.min(1, Number.isFinite(strength) ? strength : 1));
  const base = (420 + 780 * s) * jitter(rand, 0.05);
  const punch = local ? 1.25 : 1;
  const layers = [
    // the strike on the plate
    { type: 'noise', filter: 'highpass', freq: (2200 + 2800 * s) * jitter(rand, 0.1), q: 0.8, attack: 0.0005, decay: 0.01 + 0.02 * s, gain: (0.35 + 0.35 * s) * punch },
    // the plate ringing: long and bright when fresh, short and dark when worn
    ring(rand, base, { decay: 0.14 + 0.8 * s * s, gain: 0.12 + 0.16 * s, bright: 0.5 + 0.9 * s }),
    // the weight behind it: a clunk, most of the sound once the plate is worn
    { type: 'noise', filter: 'lowpass', freq: 700 + 500 * s, q: 0.7, attack: 0.002, decay: 0.07 + 0.05 * (1 - s), gain: (0.2 + 0.4 * (1 - s)) * punch },
    { type: 'tone', wave: 'sine', freq: 160 * jitter(rand, 0.06), slideTo: 70, attack: 0.002, decay: 0.09, gain: (0.25 + 0.3 * (1 - s)) * punch },
  ];
  // fresh plate sings a glint above the ring
  if (s > 0.55) layers.push({ type: 'ring', partials: [{ freq: 5200 * jitter(rand, 0.06), gain: 0.05 * s, decay: 0.25 * s }, { freq: 6900 * jitter(rand, 0.06), gain: 0.03 * s, decay: 0.16 * s }] });
  // the edge scraping off it: loudest half worn (a TANG with a scrape)
  const scrape = 4 * s * (1 - s);
  if (scrape > 0.2) layers.push({ type: 'noise', filter: 'bandpass', freq: 3200 * jitter(rand, 0.1), q: 2.4, sweepTo: 1400, attack: 0.004, decay: 0.12, gain: 0.26 * scrape, at: 0.006 });
  // inside the helm: a thump in the chest
  if (local) layers.push({ type: 'tone', wave: 'sine', freq: 88 * jitter(rand, 0.05), slideTo: 44, attack: 0.003, decay: 0.16, gain: 0.45 });
  return { layers, reverb: local ? 0.14 : 0.22 + 0.12 * s };
}

/** A quick follow-on blow on the plate (a second within a clang's ring): a small tick, never another full clang. */
export function steelTickRecipe(rand = Math.random, { strength = 1 } = {}) {
  const s = Math.max(0, Math.min(1, Number.isFinite(strength) ? strength : 1));
  return {
    layers: [
      ring(rand, (700 + 700 * s) * jitter(rand, 0.06), { decay: 0.06 + 0.08 * s, gain: 0.05, partials: 3, bright: 0.8 }),
      { type: 'noise', filter: 'bandpass', freq: 2400, q: 1.4, attack: 0.001, decay: 0.02, gain: 0.08 },
    ],
    reverb: 0.1,
  };
}

// the high, soft notes of wind chimes stirring (a pentatonic handful, so any few of them sit together)
const CHIMES = Object.freeze([1568, 1760, 2093, 2349, 2637, 3136]);

/**
 * Gale Garner gathering: a calm breath of air drawn in (a soft wind swelling, rising a little in pitch), delicate wind
 * chimes stirring in it, and a light run of wooden notes climbing under them (a little xylophone, struck softly).
 * `seconds`: how long the gather lasts.
 */
export function galeGatherRecipe(rand = Math.random, { seconds = 0.5 } = {}) {
  const chimes = [];
  for (let i = 0; i < 5; i += 1) {
    chimes.push({
      ...ring(rand, CHIMES[Math.floor(rand() * CHIMES.length)], { decay: 1.1 + rand() * 0.6, gain: 0.03 + rand() * 0.015, partials: 3, bright: 0.7 }),
      at: rand() * seconds * 0.85,
    });
  }
  // the wooden notes: a bar's clear fundamental with its bright fourth harmonic, short, climbing the scale
  const first = Math.floor(rand() * 2);
  for (let i = 0; i < 3; i += 1) {
    const freq = CHIMES[first + i] / 2;
    chimes.push({
      type: 'ring',
      at: seconds * (0.12 + i * 0.24) + rand() * 0.02,
      partials: [{ freq, gain: 0.05, decay: 0.22 }, { freq: freq * 3.93, gain: 0.018, decay: 0.07 }],
    });
  }
  return {
    layers: [
      { type: 'noise', filter: 'bandpass', freq: 380 * jitter(rand, 0.08), q: 0.9, sweepTo: 950, attack: seconds * 0.85, decay: 0.2, gain: 0.2 },
      { type: 'noise', filter: 'highpass', freq: 2600, q: 0.6, attack: seconds * 0.7, decay: 0.15, gain: 0.045 },
      ...chimes,
    ],
    reverb: 0.25,
    hall: 0.1,
  };
}

/**
 * Gale Garner let go: an abrupt, heavy WHOOSH. A rush of air falling in pitch, the weight of it (a low roar and a
 * thump you feel), a hiss at its edge, and the air it leaves still tumbling after.
 */
export function galeReleaseRecipe(rand = Math.random) {
  return {
    layers: [
      { type: 'noise', filter: 'bandpass', freq: 2100 * jitter(rand, 0.1), q: 0.8, sweepTo: 240, attack: 0.004, decay: 0.5, gain: 0.8 },
      { type: 'noise', filter: 'lowpass', freq: 620, q: 0.6, sweepTo: 120, attack: 0.006, decay: 0.42, gain: 0.72 },
      { type: 'tone', wave: 'sine', freq: 84 * jitter(rand, 0.06), slideTo: 36, attack: 0.003, decay: 0.3, gain: 0.7 },
      { type: 'noise', filter: 'highpass', freq: 4200, q: 0.7, attack: 0.002, decay: 0.12, gain: 0.18 },
      // the air it leaves tumbling after it
      { type: 'noise', filter: 'bandpass', freq: 700 * jitter(rand, 0.1), q: 1.1, sweepTo: 380, attack: 0.05, decay: 0.45, gain: 0.22, at: 0.12 },
    ],
    reverb: 0.28,
  };
}
