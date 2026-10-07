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
/**
 * The cleanest contact there is (a blow caught dead centre, a spell square on): a short, crisp chink laid over the
 * blow's own sound, a little higher than it. Precision, not a jackpot.
 */
export function preciseRecipe(rand = Math.random) {
  const base = 2900 * jitter(rand, 0.04);
  return {
    layers: [
      { type: 'noise', filter: 'highpass', freq: 5200, q: 0.8, attack: 0.0005, decay: 0.008, gain: 0.16 },
      { type: 'ring', partials: [{ freq: base, gain: 0.07, decay: 0.09 }, { freq: base * 1.5, gain: 0.035, decay: 0.06 }, { freq: base * 2.2, gain: 0.02, decay: 0.04 }] },
    ],
    reverb: 0.12,
  };
}

/** The blade biting timber: a hard wooden thunk and a split of wood, a little ring off the steel. */
export function woodThunkRecipe(rand = Math.random) {
  return {
    layers: [
      { type: 'noise', filter: 'bandpass', freq: 1400 * jitter(rand, 0.12), q: 1.2, attack: 0.001, decay: 0.04, gain: 0.55 },
      { type: 'tone', wave: 'triangle', freq: 190 * jitter(rand, 0.08), slideTo: 110, attack: 0.001, decay: 0.12, gain: 0.55 },
      { type: 'noise', filter: 'lowpass', freq: 520, q: 0.6, attack: 0.002, decay: 0.1, gain: 0.45 },
      ring(rand, 1200 * jitter(rand, 0.05), { decay: 0.16, gain: 0.05, partials: 3 }),
    ],
    reverb: 0.25,
  };
}

/** The blade taken by something soft (a hedge, canvas, straw): a muffled thump and a rustle, no ring. */
export function softStrikeRecipe(rand = Math.random) {
  return {
    layers: [
      { type: 'noise', filter: 'bandpass', freq: 2600 * jitter(rand, 0.15), q: 0.6, sweepTo: 1400, attack: 0.004, decay: 0.16, gain: 0.3 },
      { type: 'noise', filter: 'lowpass', freq: 420, q: 0.5, attack: 0.003, decay: 0.1, gain: 0.4 },
    ],
    reverb: 0.15,
  };
}

// what a struck surface is, for its sound and what flies off it
export function strikeSurface(material) {
  if (material === 'timber' || material === 'wood') return 'wood';
  if (material === 'hedge' || material === 'cloth' || material === 'straw') return 'soft';
  return 'stone';
}

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

/**
 * The blow you take, heard from inside the helm: the edge biting the plate (a hard crack), the plate clanking round you,
 * a thud in the chest, the mail shaking, and the breath knocked out of you. Heavier blows (`heavy`, or a big `amount`)
 * land deeper, with a low whump under them.
 */
export function hurtRecipe(rand = Math.random, { heavy = false, amount = 25 } = {}) {
  const weight = Math.max(0.8, Math.min(1.2, 0.7 + (Number(amount) || 0) / 60));
  const layers = [
    // the edge biting the plate
    { type: 'noise', filter: 'bandpass', freq: 2200 * jitter(rand, 0.12), q: 1.4, attack: 0.0008, decay: 0.03, gain: 0.5 * weight },
    // the plate round you clanking, a dull ring and a brighter one over it
    ring(rand, 250 * jitter(rand, 0.06), { decay: 0.24, gain: 0.15, partials: 5, bright: 0.7 }),
    ring(rand, 610 * jitter(rand, 0.06), { decay: 0.1, gain: 0.07, partials: 3 }),
    // the weight of it in the chest, and the muffled knock through the padding
    { type: 'tone', wave: 'sine', freq: 124 * jitter(rand, 0.05), slideTo: 42, attack: 0.002, decay: heavy ? 0.34 : 0.24, gain: 0.95 * weight },
    { type: 'noise', filter: 'lowpass', freq: 650 * jitter(rand, 0.1), q: 0.8, attack: 0.002, decay: 0.18, gain: 0.7 * weight },
    // the breath knocked out
    { type: 'noise', filter: 'bandpass', freq: 950 * jitter(rand, 0.1), q: 1.1, sweepTo: 480, attack: 0.01, decay: 0.13, gain: 0.14, at: 0.025 },
  ];
  // the mail shaking
  for (let i = 0; i < 5; i += 1) {
    layers.push({ type: 'ring', at: 0.02 + rand() * 0.11, partials: [{ freq: 3600 + rand() * 2400, gain: 0.028, decay: 0.035 + rand() * 0.03 }] });
  }
  if (heavy) {
    layers.push({ type: 'tone', wave: 'sine', freq: 62, slideTo: 34, attack: 0.004, decay: 0.36, gain: 0.7 });
    layers.push({ type: 'noise', filter: 'lowpass', freq: 300, q: 0.6, attack: 0.003, decay: 0.28, gain: 0.45 });
  }
  return { layers, reverb: 0.1 };
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

// --- the menu round's Slush (client/menu/tour): a knight frozen, melted down, scooped up and drunk ------------------

/** Ice closing over a knight: a run of small glassy cracks, quickening, over a low creak; a clear ting as it sets. */
export function freezeRecipe(rand = Math.random, { seconds = 0.45 } = {}) {
  const layers = [
    { type: 'noise', filter: 'bandpass', freq: 1400, q: 2.5, sweepTo: 600, attack: 0.05, decay: seconds, gain: 0.12 },
    { type: 'tone', wave: 'triangle', freq: 96, slideTo: 72, attack: 0.04, decay: seconds * 0.9, gain: 0.08 },
  ];
  for (let i = 0; i < 11; i += 1) {
    // the cracks come faster as the ice closes
    const at = seconds * (1 - (1 - i / 11) ** 1.6) + rand() * 0.02;
    layers.push({ type: 'noise', filter: 'highpass', freq: 3000 + rand() * 3500, q: 0.9, at, attack: 0.001, decay: 0.015 + rand() * 0.02, gain: 0.08 + rand() * 0.06 });
    if (i % 3 === 0) layers.push({ type: 'ring', at, partials: [{ freq: 3200 + rand() * 2800, gain: 0.025, decay: 0.08 + rand() * 0.06 }] });
  }
  layers.push({ type: 'ring', at: seconds, partials: [{ freq: 2650 * jitter(rand, 0.04), gain: 0.07, decay: 0.45 }, { freq: 5400 * jitter(rand, 0.04), gain: 0.035, decay: 0.22 }] });
  return { layers, reverb: 0.3, hall: 0.1 };
}

/** Fire on ice: a hard sizzle as it lands, a hiss of steam running on while the statue goes soft. */
export function meltHissRecipe(rand = Math.random, { seconds = 1 } = {}) {
  const layers = [
    { type: 'noise', filter: 'highpass', freq: 3600, q: 0.7, sweepTo: 2200, attack: 0.01, decay: seconds, gain: 0.26 },
    { type: 'noise', filter: 'bandpass', freq: 6200, q: 1.4, attack: 0.004, decay: 0.25, gain: 0.18 },
  ];
  // the sizzle: little spits through the hiss
  for (let i = 0; i < 9; i += 1) {
    layers.push({ type: 'noise', filter: 'bandpass', freq: 2400 + rand() * 3000, q: 4, at: rand() * seconds * 0.8, attack: 0.001, decay: 0.02 + rand() * 0.02, gain: 0.08 });
  }
  return { layers, reverb: 0.2 };
}

/** The statue giving way: a soft wet slump, chunks of ice knocking down into it, a last slosh. */
export function slushCollapseRecipe(rand = Math.random) {
  const layers = [
    { type: 'noise', filter: 'lowpass', freq: 420, q: 0.9, attack: 0.03, decay: 0.32, gain: 0.42 },
    { type: 'tone', wave: 'sine', freq: 82, slideTo: 48, attack: 0.02, decay: 0.28, gain: 0.3 },
    { type: 'noise', filter: 'bandpass', freq: 900, q: 1.2, sweepTo: 500, at: 0.08, attack: 0.02, decay: 0.3, gain: 0.2 },
    // the slosh as it settles
    { type: 'noise', filter: 'bandpass', freq: 700, q: 2, sweepTo: 1100, at: 0.42, attack: 0.03, decay: 0.18, gain: 0.14 },
  ];
  for (let i = 0; i < 6; i += 1) {
    const at = 0.04 + rand() * 0.38;
    layers.push({ type: 'noise', filter: 'bandpass', freq: 1800 + rand() * 2200, q: 3, at, attack: 0.001, decay: 0.03, gain: 0.08 + rand() * 0.05 });
    layers.push({ type: 'ring', at, partials: [{ freq: 1900 + rand() * 1800, gain: 0.02, decay: 0.06 }] });
  }
  return { layers, reverb: 0.22 };
}

/** A vesselful scooped up: its rim scraped through the slush (pewter rings a little; a pail knocks) and a wet gather. */
export function scoopRecipe(rand = Math.random, { kind = 'cup' } = {}) {
  const pewter = kind !== 'pail';
  return {
    layers: [
      { type: 'noise', filter: 'bandpass', freq: pewter ? 2600 : 1300, q: 2.2, sweepTo: pewter ? 1700 : 900, attack: 0.02, decay: 0.2, gain: 0.16 },
      { type: 'noise', filter: 'lowpass', freq: 650, q: 1.1, at: 0.05, attack: 0.02, decay: 0.2, gain: 0.26 },
      { type: 'noise', filter: 'bandpass', freq: 1200, q: 2.5, sweepTo: 800, at: 0.15, attack: 0.01, decay: 0.12, gain: 0.12 },
      pewter
        ? { type: 'ring', at: 0.01, partials: [{ freq: 1480 * jitter(rand, 0.03), gain: 0.03, decay: 0.25 }, { freq: 3900 * jitter(rand, 0.03), gain: 0.015, decay: 0.12 }] }
        : { type: 'tone', wave: 'sine', freq: 190, slideTo: 150, at: 0.01, attack: 0.002, decay: 0.07, gain: 0.12 },
    ],
    reverb: 0.15,
  };
}

/** The vessel taken from his belt, or put back: a pewter clink, or the knock of a little wooden pail. */
export function vesselRecipe(rand = Math.random, { kind = 'cup' } = {}) {
  if (kind === 'pail') {
    return {
      layers: [
        { type: 'tone', wave: 'sine', freq: 230 * jitter(rand, 0.05), slideTo: 180, attack: 0.002, decay: 0.08, gain: 0.32 },
        { type: 'noise', filter: 'bandpass', freq: 1100, q: 2, attack: 0.001, decay: 0.04, gain: 0.2 },
        { type: 'ring', at: 0.02, partials: [{ freq: 980 * jitter(rand, 0.05), gain: 0.04, decay: 0.12 }] },
      ],
      reverb: 0.12,
    };
  }
  return {
    layers: [
      { type: 'noise', filter: 'highpass', freq: 3000, q: 0.8, attack: 0.001, decay: 0.012, gain: 0.16 },
      { type: 'ring', partials: [{ freq: 1720 * jitter(rand, 0.03), gain: 0.12, decay: 0.32 }, { freq: 4300 * jitter(rand, 0.03), gain: 0.06, decay: 0.16 }, { freq: 6900 * jitter(rand, 0.03), gain: 0.024, decay: 0.08 }] },
    ],
    reverb: 0.14,
  };
}

/** What was left in the vessel, tipped out onto the ground: a small wet splat. */
export function splashRecipe(rand = Math.random) {
  return {
    layers: [
      { type: 'noise', filter: 'lowpass', freq: 900, q: 1, attack: 0.005, decay: 0.12, gain: 0.38 },
      { type: 'noise', filter: 'bandpass', freq: 2200 * jitter(rand, 0.15), q: 1.5, at: 0.02, attack: 0.002, decay: 0.08, gain: 0.16 },
      { type: 'noise', filter: 'bandpass', freq: 1500, q: 3, at: 0.11 + rand() * 0.04, attack: 0.002, decay: 0.03, gain: 0.08 },
    ],
    reverb: 0.12,
  };
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

/**
 * A Steel dash ram: a hardened knight slammed bodily into another. THUNK -> KLANG -> rattle. At the contact a very
 * short, hard plate-on-plate crack and the plates' crunch; under it the armoured body's THUD (the mass of it); over it
 * a struck-steel KLANG (the reward: brief, strong, more armour than handbell, gone in about half a second); then the
 * victim's harness rattling as it is thrown back, and a little scrape as the two come apart.
 *
 * kind: 'body' (the full ram), 'guard' (braced: a flatter, broader clash of plate on a guard, the body's thud cut short;
 * `broken`, it caves in), 'steel' (hardened plate on hardened plate: a double crack and two resonances a little apart,
 * beating: denser and more metallic, not louder). strength: the ram's (0..1): full plate rings longest and hits
 * deepest; worn plate is mostly the collision. heard: 'near' (anyone else, from where it happened), 'rammer' (my own:
 * inside the helm, harder and drier), 'victim' (on me: more of the body blow and the rattle of my own harness).
 */
export function steelRamRecipe(rand = Math.random, { strength = 1, kind = 'body', broken = false, heard = 'near' } = {}) {
  const s = Math.max(0, Math.min(1, Number.isFinite(strength) ? strength : 1));
  const guard = kind === 'guard';
  const steel = kind === 'steel';
  const rammer = heard === 'rammer';
  const victim = heard === 'victim';
  const crackGain = (0.42 + 0.22 * s) * (rammer ? 1.25 : 1);
  const thudGain = (0.45 + 0.4 * s) * (guard ? 0.55 : 1) * (victim ? 1.3 : 1) * (steel ? 0.85 : 1);
  const bellGain = (0.1 + 0.13 * s) * (guard ? 0.8 : 1) * (victim ? 0.85 : 1) * (steel ? 0.82 : 1);
  // (the KLANG's length: -40 dB at about half of it)
  const bellDecay = (0.36 + 0.54 * s) * (guard ? 0.7 : 1);
  const base = (500 + 230 * s) * jitter(rand, 0.05);
  const layers = [
    // the crack: plate meeting plate, over in a hundredth of a second
    { type: 'noise', filter: 'highpass', freq: 3000 * jitter(rand, 0.1), q: 0.8, attack: 0.0004, decay: 0.013, gain: crackGain },
    // the plates' crunch, mid-weighted (the physical part of it)
    { type: 'noise', filter: 'bandpass', freq: 1350 * jitter(rand, 0.08), q: 1.2, attack: 0.001, decay: 0.05, gain: 0.38 + 0.1 * s },
    ring(rand, 1180 * jitter(rand, 0.05), { decay: 0.09, gain: 0.15, partials: 6, bright: 1.15 }),
    // THUNK: the armoured body's weight behind it
    { type: 'tone', wave: 'sine', freq: 98 * jitter(rand, 0.05), slideTo: 40, attack: 0.002, decay: guard ? 0.12 : 0.22, gain: thudGain },
    { type: 'noise', filter: 'lowpass', freq: 320, q: 0.7, attack: 0.002, decay: guard ? 0.08 : 0.14, gain: thudGain * 0.65 },
    // KLANG: struck steel, the reward (an armour's ring, not a bell's: its upper modes damped)
    { ...ring(rand, base, { decay: bellDecay, gain: bellGain, partials: 6, bright: 0.9 + 0.35 * s }), at: 0.004 },
    { ...ring(rand, base * 2.71, { decay: bellDecay * 0.45, gain: bellGain * 0.32, partials: 3, bright: 1.1 }), at: 0.004 },
  ];
  if (steel) {
    // hardened on hardened: a second crack a breath later, and a second resonance a little apart from the first, the
    // two beating against each other
    layers.push({ type: 'noise', filter: 'highpass', freq: 4200 * jitter(rand, 0.1), q: 0.9, attack: 0.0004, decay: 0.01, gain: crackGain * 0.7, at: 0.0045 });
    layers.push({ ...ring(rand, base * 1.028, { decay: bellDecay * 0.95, gain: bellGain * 0.9, partials: 6, bright: 1.2 }), at: 0.006 });
    layers.push({ type: 'ring', at: 0.004, partials: [{ freq: 4650 * jitter(rand, 0.04), gain: 0.05 * s, decay: 0.3 * s + 0.05 }, { freq: 4790 * jitter(rand, 0.04), gain: 0.04 * s, decay: 0.28 * s + 0.05 }] });
  } else if (s > 0.5) {
    // fresh plate sings a glint over the ring
    layers.push({ type: 'ring', at: 0.004, partials: [{ freq: 5100 * jitter(rand, 0.06), gain: 0.04 * s, decay: 0.22 * s }] });
  }
  if (guard) {
    // a guard taking it: a broad, flat clash of plate on plate (they stopped me), and the braced arm behind it
    layers.push({ type: 'noise', filter: 'bandpass', freq: 880 * jitter(rand, 0.08), q: 0.9, attack: 0.001, decay: 0.07, gain: 0.5 });
    layers.push(ring(rand, 760 * jitter(rand, 0.05), { decay: 0.32, gain: 0.13, partials: 5, bright: 1.1 }));
    layers.push({ type: 'tone', wave: 'triangle', freq: 260, slideTo: 130, attack: 0.001, decay: 0.06, gain: 0.3 });
    if (broken) {
      // and it caves in
      const give = 0.03 + rand() * 0.01;
      layers.push({ ...ring(rand, 185 * jitter(rand, 0.05), { decay: 0.9, gain: 0.22, partials: 6, bright: 0.95 }), at: give });
      layers.push({ type: 'noise', filter: 'bandpass', freq: 1050 * jitter(rand, 0.1), q: 1.4, sweepTo: 260, attack: 0.003, decay: 0.22, gain: 0.55, at: give });
      layers.push({ type: 'tone', wave: 'sine', freq: 96 * jitter(rand, 0.05), slideTo: 40, attack: 0.003, decay: 0.26, gain: 0.5, at: give });
    }
  }
  // the harness thrown back: an irregular rattle of plate and buckles, thinning
  const rattles = victim ? 6 : 4;
  for (let i = 0; i < rattles; i += 1) {
    const at = 0.045 + i * (0.028 + rand() * 0.03);
    const fade = (1 - i / (rattles + 1)) * (victim ? 1.4 : 1) * (guard ? 0.7 : 1);
    layers.push({
      type: 'ring', at,
      partials: [
        { freq: 1900 + rand() * 2200, gain: 0.05 * fade, decay: 0.035 + rand() * 0.04 },
        { freq: 3300 + rand() * 2000, gain: 0.03 * fade, decay: 0.025 + rand() * 0.03 },
      ],
    });
    layers.push({ type: 'noise', filter: 'bandpass', freq: 2600 * jitter(rand, 0.2), q: 2.2, attack: 0.001, decay: 0.018, gain: 0.08 * fade, at });
  }
  // the two coming apart: a short scrape of steel along steel
  layers.push({ type: 'noise', filter: 'bandpass', freq: 2900 * jitter(rand, 0.1), q: 2.4, sweepTo: 1300, attack: 0.006, decay: 0.16, gain: 0.1 * (0.4 + 0.6 * s), at: 0.08 });
  // inside my own helm: the jolt in my chest
  if (rammer || victim) layers.push({ type: 'tone', wave: 'sine', freq: 84 * jitter(rand, 0.05), slideTo: 42, attack: 0.003, decay: 0.16, gain: victim ? 0.5 : 0.38 });
  // (a little of the courtyard: a ram should be heard once, not ring round the walls)
  return { layers, reverb: rammer || victim ? 0.12 : 0.16 + 0.06 * s, hall: rammer || victim ? 0 : 0.04 };
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

// --- Sunder All That Rusts and balance ---------------------------------------------------------------------------

/**
 * The brace into Sunder: a sudden drop (the floor falling out from under the moment: a deep note plunging, the air
 * rushing down after it), over by the time the brace takes hold, leaving a breath of silence for the bell
 * (sunderDongRecipe, at the commit).
 */
export function sunderDropRecipe(rand = Math.random) {
  return {
    layers: [
      { type: 'tone', wave: 'sine', freq: 190 * jitter(rand, 0.03), slideTo: 30, attack: 0.008, decay: 0.46, gain: 0.95 },
      { type: 'tone', wave: 'triangle', freq: 380 * jitter(rand, 0.03), slideTo: 60, attack: 0.008, decay: 0.38, gain: 0.16 },
      // the air rushing down after it
      { type: 'noise', filter: 'bandpass', freq: 2600, q: 1.1, sweepTo: 170, attack: 0.02, decay: 0.42, gain: 0.34 },
      // and the harness drawn tight under it
      { type: 'noise', filter: 'lowpass', freq: 240, q: 0.7, attack: 0.015, decay: 0.38, gain: 0.45 },
    ],
    reverb: 0.25,
  };
}

// a great bell's partials, as ratios of its strike note: the hum an octave below, the minor-third tierce, the
// quint, the nominal an octave above, and the bright ones over it (with how long each rings, relative)
const BELL = Object.freeze([
  [0.5, 0.12, 1.35], [1, 0.18, 1.1], [1.19, 0.12, 0.95], [1.51, 0.08, 0.7], [2, 0.2, 0.85], [2.66, 0.08, 0.5], [4.01, 0.06, 0.32], [5.34, 0.035, 0.22], [6.73, 0.025, 0.16], [8.25, 0.015, 0.12],
]);

/**
 * Sunder taken hold: DONG. One great bell struck once (the clapper's knock, a low thump under it, and the bell
 * ringing on through the first seconds of it), heard across the field.
 */
export function sunderDongRecipe(rand = Math.random) {
  const strikeNote = 110 * jitter(rand, 0.01);
  return {
    layers: [
      { type: 'noise', filter: 'highpass', freq: 1900, q: 0.8, attack: 0.0006, decay: 0.03, gain: 0.5 },
      { type: 'tone', wave: 'sine', freq: 74, slideTo: 42, attack: 0.002, decay: 0.3, gain: 0.6 },
      { type: 'ring', partials: BELL.map(([ratio, gain, decay]) => ({ freq: strikeNote * ratio * jitter(rand, 0.004), gain: gain * jitter(rand, 0.08), decay: 3.2 * decay, attack: 0.003 })) },
      // the clapper's metal, a moment of it
      ring(rand, 1250 * jitter(rand, 0.04), { decay: 0.18, gain: 0.07, partials: 3, bright: 0.6 }),
    ],
    reverb: 0.55,
    hall: 0.4,
  };
}

/** Under a Sundering blow: the low-frequency weight of it (a deep whump and the air it moves), laid under the hit. */
export function sunderForceRecipe(rand = Math.random) {
  return {
    layers: [
      { type: 'tone', wave: 'sine', freq: 72 * jitter(rand, 0.06), slideTo: 30, attack: 0.002, decay: 0.42, gain: 1.0 },
      { type: 'noise', filter: 'lowpass', freq: 300, q: 0.6, attack: 0.002, decay: 0.3, gain: 0.7 },
      { type: 'noise', filter: 'bandpass', freq: 900, q: 0.8, attack: 0.001, decay: 0.08, gain: 0.3 },
    ],
    reverb: 0.3,
  };
}

/**
 * A Sundering slam into the ground: the weight of it (a hard crack, a deep thud) and the rock giving way under it (a
 * crunch, then rubble crumbling and stones skittering down, thinning out, and the low grumble of it settling). No
 * ring: the iron rings only on a knight (sunderRingRecipe).
 */
export function groundSlamRecipe(rand = Math.random) {
  const layers = [
    { type: 'noise', filter: 'highpass', freq: 2200, q: 0.7, attack: 0.0004, decay: 0.03, gain: 0.7 },
    { type: 'tone', wave: 'sine', freq: 92 * jitter(rand, 0.05), slideTo: 34, attack: 0.002, decay: 0.55, gain: 0.95 },
    { type: 'noise', filter: 'lowpass', freq: 360, q: 0.7, attack: 0.002, decay: 0.42, gain: 0.7 },
    // the rock giving way
    { type: 'noise', filter: 'bandpass', freq: 850 * jitter(rand, 0.1), q: 1.3, sweepTo: 280, attack: 0.003, decay: 0.3, gain: 0.55, at: 0.008 },
    { type: 'noise', filter: 'lowpass', freq: 220, q: 0.5, attack: 0.08, decay: 0.8, gain: 0.32, at: 0.05 },
    // a gravelly bed under the falling stones
    { type: 'noise', filter: 'bandpass', freq: 1600, q: 0.9, sweepTo: 700, attack: 0.03, decay: 0.7, gain: 0.16, at: 0.05 },
  ];
  const stones = 24;
  for (let i = 0; i < stones; i += 1) {
    layers.push({
      type: 'noise', filter: 'bandpass', freq: 500 + rand() * 2600, q: 2 + rand() * 3, attack: 0.001, decay: 0.03 + rand() * 0.07,
      gain: (0.55 - i * 0.017) * (0.6 + rand() * 0.4), at: 0.05 + Math.pow(i / stones, 1.5) * 0.9 + rand() * 0.03,
    });
  }
  return { layers, reverb: 0.45, hall: 0.25 };
}

// the inharmonic modes of a struck bar of iron (an anvil's clang)
const ANVIL = Object.freeze([[1, 0.24, 1.6], [2.76, 0.2, 1.3], [5.4, 0.14, 1.0], [8.93, 0.08, 0.7], [13.34, 0.04, 0.45]]);

/**
 * A Sundering blow on a knight: iron struck like an anvil, ringing on, its bright ting riding over it (laid over the
 * blow's own sound and its weight). light: the ground's rupture catching them, a smaller, shorter ring.
 */
export function sunderRingRecipe(rand = Math.random, { light = false } = {}) {
  const base = (light ? 360 : 285) * jitter(rand, 0.04);
  const scale = light ? 0.55 : 1;
  const ring = light ? 0.5 : 1;
  return {
    layers: [
      { type: 'ring', partials: ANVIL.map(([ratio, gain, decay]) => ({ freq: base * ratio * jitter(rand, 0.01), gain: gain * scale * jitter(rand, 0.12), decay: decay * ring * jitter(rand, 0.1) })) },
      { type: 'ring', partials: [{ freq: 2150 * jitter(rand, 0.03), gain: 0.13 * scale, decay: 2.6 * ring }, { freq: 3380 * jitter(rand, 0.03), gain: 0.06 * scale, decay: 1.8 * ring }] },
      { type: 'noise', filter: 'highpass', freq: 3000, q: 0.7, attack: 0.0004, decay: 0.02, gain: 0.35 * scale },
    ],
    reverb: 0.4,
    hall: 0.22,
  };
}

/** A fissure running: a gravelly crackle and a low grumble as it goes. */
export function ruptureRunRecipe(rand = Math.random, { seconds = 0.7 } = {}) {
  const layers = [
    { type: 'noise', filter: 'lowpass', freq: 260, q: 0.6, attack: 0.05, decay: seconds, gain: 0.45 },
  ];
  for (let i = 0; i < 7; i += 1) {
    layers.push({ type: 'noise', filter: 'bandpass', freq: (1100 + rand() * 1400), q: 3, attack: 0.001, decay: 0.03, gain: 0.18 + rand() * 0.12, at: (i / 7) * seconds + rand() * 0.04 });
  }
  return { layers, reverb: 0.3 };
}

/** Balance lost: plate clattering as the knight stumbles, a heavy step caught, the breath knocked out. */
export function staggerBreakRecipe(rand = Math.random) {
  const layers = [
    { type: 'tone', wave: 'sine', freq: 110 * jitter(rand, 0.06), slideTo: 48, attack: 0.002, decay: 0.3, gain: 0.8 },
    { type: 'noise', filter: 'lowpass', freq: 500, q: 0.6, attack: 0.003, decay: 0.22, gain: 0.5 },
    { type: 'noise', filter: 'bandpass', freq: 900, q: 1.2, sweepTo: 420, attack: 0.01, decay: 0.16, gain: 0.18, at: 0.05 },
  ];
  for (let i = 0; i < 4; i += 1) {
    layers.push({ type: 'ring', at: 0.04 + i * (0.06 + rand() * 0.05), partials: [
      { freq: 1900 + rand() * 1800, gain: 0.05 * (1 - i * 0.18), decay: 0.07 },
      { freq: 3200 + rand() * 1600, gain: 0.03 * (1 - i * 0.18), decay: 0.05 },
    ] });
  }
  return { layers, reverb: 0.4, hall: 0.16 };
}

/** Near the break: the harness creaking under strain, low, like a held breath (my own balance only). */
export function staggerStrainRecipe(rand = Math.random) {
  return {
    layers: [
      { type: 'tone', wave: 'sine', freq: 58, slideTo: 52, attack: 0.02, decay: 0.2, gain: 0.5 },
      { type: 'noise', filter: 'bandpass', freq: 520 * jitter(rand, 0.1), q: 6, sweepTo: 440, attack: 0.03, decay: 0.2, gain: 0.08 },
    ],
    reverb: 0.1,
  };
}

/** The meter full: a restrained brass note, once (it is ready, not shouting). */
export function ultimateReadyRecipe(rand = Math.random) {
  const base = 392 * jitter(rand, 0.01);
  return {
    layers: [
      { type: 'ring', partials: [{ freq: base, gain: 0.07, decay: 1.1 }, { freq: base * 2.01, gain: 0.035, decay: 0.8 }, { freq: base * 3.02, gain: 0.015, decay: 0.5 }] },
      { type: 'tone', wave: 'sine', freq: base / 2, attack: 0.05, decay: 0.9, gain: 0.08 },
    ],
    reverb: 0.35,
  };
}

/** The brace broken before it took hold: the harness slackening, a dull clank. */
export function ultimateFizzleRecipe(rand = Math.random) {
  return {
    layers: [
      { type: 'noise', filter: 'bandpass', freq: 800, q: 1.5, sweepTo: 280, attack: 0.005, decay: 0.25, gain: 0.3 },
      ring(rand, 210 * jitter(rand, 0.05), { decay: 0.25, gain: 0.1, partials: 3, bright: 0.6 }),
    ],
    reverb: 0.25,
  };
}

// --- Blazing Vortex ------------------------------------------------------------------------------------------------

/**
 * The Vortex lit: a breath drawn up into flame (a rush of air rising with the turn as it gathers, a low note climbing
 * under it), done as the spin takes hold. `seconds`: how long the startup lasts.
 */
export function vortexIgniteRecipe(rand = Math.random, { seconds = 0.9 } = {}) {
  return {
    layers: [
      { type: 'noise', filter: 'bandpass', freq: 260 * jitter(rand, 0.06), q: 1.1, sweepTo: 2300, attack: seconds * 0.85, decay: 0.16, gain: 0.3 },
      { type: 'tone', wave: 'sine', freq: 120 * jitter(rand, 0.03), slideTo: 380, attack: seconds * 0.8, decay: 0.18, gain: 0.16 },
      { type: 'noise', filter: 'highpass', freq: 3400, q: 0.6, attack: seconds * 0.9, decay: 0.1, gain: 0.05 },
    ],
    reverb: 0.2,
  };
}

/**
 * The star at the sword's point: the Vortex's own signature. A bright crystalline TING (a hard glassy strike high
 * up), its twinkle a breath later (a second, higher note, as a star catches the light twice), and a short magical
 * resonance under them that rings on a moment. Made to be unmistakable beside everything else in a fight; nothing
 * else in the game uses it.
 */
export function vortexStarRecipe(rand = Math.random) {
  const note = 2637 * jitter(rand, 0.006);
  const strike = (freq, gain, decay, at = 0) => ({
    type: 'ring', at,
    partials: [
      { freq, gain, decay },
      { freq: freq * 2.004, gain: gain * 0.55, decay: decay * 0.6 },
      { freq: freq * 2.99, gain: gain * 0.3, decay: decay * 0.4 },
      { freq: freq * 4.23, gain: gain * 0.14, decay: decay * 0.25 },
    ],
  });
  return {
    layers: [
      // the strike itself: a glassy tick
      { type: 'noise', filter: 'highpass', freq: 7000, q: 0.7, attack: 0.0005, decay: 0.018, gain: 0.3 },
      strike(note, 0.3, 0.75),
      // the twinkle: the same star, a fifth up, a breath later, and once more, fainter
      { type: 'noise', filter: 'highpass', freq: 8000, q: 0.7, attack: 0.0005, decay: 0.012, gain: 0.16, at: 0.085 },
      strike(note * 1.498, 0.2, 0.6, 0.085),
      strike(note * 2.0, 0.1, 0.45, 0.17),
      // the resonance under it: a soft bell an octave and more below, swelling a little and ringing on
      { type: 'ring', partials: [{ freq: note / 3, gain: 0.1, decay: 0.9, attack: 0.02 }, { freq: note / 2, gain: 0.07, decay: 0.7, attack: 0.02 }] },
      { type: 'tone', wave: 'sine', freq: note / 6, attack: 0.03, decay: 0.5, gain: 0.07 },
    ],
    reverb: 0.5,
    hall: 0.25,
  };
}

/** The fire catching as the spin takes hold: a soft, heavy whoomph. */
export function vortexCatchRecipe(rand = Math.random) {
  return {
    layers: [
      { type: 'noise', filter: 'lowpass', freq: 900 * jitter(rand, 0.08), q: 0.6, sweepTo: 220, attack: 0.02, decay: 0.42, gain: 0.55 },
      { type: 'tone', wave: 'sine', freq: 112 * jitter(rand, 0.04), slideTo: 54, attack: 0.01, decay: 0.34, gain: 0.5 },
      { type: 'noise', filter: 'bandpass', freq: 1700, q: 0.9, sweepTo: 700, attack: 0.03, decay: 0.3, gain: 0.16 },
    ],
    reverb: 0.3,
  };
}

/**
 * One turn of the burning blade: the edge cutting the air as it comes round (a short rising rush) and the flame
 * fluttering after it. Played once a turn, so the spin has a beat rather than a roar. `rate`: how fast it is turning
 * (radians a second): faster, the rush is shorter, higher and a little quieter (many turns a second must not become
 * one unbroken noise); slower, it is longer, lower and heavier.
 */
export function vortexWhooshRecipe(rand = Math.random, { rate = 2 * Math.PI * 3.25 } = {}) {
  const turns = Math.max(1.5, Math.min(5, rate / (2 * Math.PI)));
  const pace = turns / 3.25;
  const low = 430 * pace ** 0.6 * jitter(rand, 0.1);
  const length = 1 / Math.max(0.75, pace);
  return {
    layers: [
      { type: 'noise', filter: 'bandpass', freq: low, q: 1.5, sweepTo: low * 3.6, attack: 0.07 * length, decay: 0.11 * length, gain: 0.3 / pace ** 0.5 },
      { type: 'noise', filter: 'lowpass', freq: 340 * jitter(rand, 0.1), q: 0.7, attack: 0.05 * length, decay: 0.13 * length, gain: 0.2 / pace },
    ],
    reverb: 0.06,
  };
}

/**
 * A Vortex's fire let go. `size` (beside a Fireball: an ember 0.45, the fire's own 0.9): an ember is a small spit; the
 * larger are real launches, lower and fuller, with a thump of air behind them.
 */
export function emberRecipe(rand = Math.random, { size = 0.45 } = {}) {
  const weight = Math.max(0, Math.min(1, (size - 0.45) / 0.45));
  const layers = [
    { type: 'noise', filter: 'bandpass', freq: (1300 - 500 * weight) * jitter(rand, 0.12), q: 1.2, sweepTo: 480 - 200 * weight, attack: 0.004, decay: 0.1 + 0.1 * weight, gain: 0.3 + 0.12 * weight },
    { type: 'tone', wave: 'triangle', freq: (560 - 240 * weight) * jitter(rand, 0.08), slideTo: 210 - 90 * weight, attack: 0.003, decay: 0.09 + 0.07 * weight, gain: 0.1 + 0.06 * weight },
  ];
  if (weight > 0.2) {
    // the air it pushes, and the roar of it going
    layers.push({ type: 'tone', wave: 'sine', freq: 120 * jitter(rand, 0.06), slideTo: 55, attack: 0.004, decay: 0.16, gain: 0.34 * weight });
    layers.push({ type: 'noise', filter: 'lowpass', freq: 520, q: 0.6, sweepTo: 200, attack: 0.01, decay: 0.2, gain: 0.26 * weight });
  }
  return { layers, reverb: 0.1 + 0.08 * weight };
}

/**
 * A Vortex's fire bursting. An ember: a short crack and puff. The larger: a real burst, with a low thump under the
 * crack, the fire's own the heaviest (still a size down from a Fireball's roar).
 */
export function emberImpactRecipe(rand = Math.random, { size = 0.45 } = {}) {
  const weight = Math.max(0, Math.min(1, (size - 0.45) / 0.45));
  const layers = [
    { type: 'noise', filter: 'highpass', freq: 2200 * jitter(rand, 0.1), q: 0.7, attack: 0.001, decay: 0.04, gain: 0.3 + 0.12 * weight },
    { type: 'noise', filter: 'lowpass', freq: (700 + 300 * weight) * jitter(rand, 0.1), q: 0.6, sweepTo: 240 - 90 * weight, attack: 0.004, decay: 0.2 + 0.16 * weight, gain: 0.42 + 0.2 * weight },
    { type: 'tone', wave: 'sine', freq: (130 - 40 * weight) * jitter(rand, 0.06), slideTo: 60 - 22 * weight, attack: 0.003, decay: 0.14 + 0.16 * weight, gain: 0.3 + 0.45 * weight },
  ];
  // the flame breaking up after it
  if (weight > 0.2) layers.push({ type: 'noise', filter: 'bandpass', freq: 1500 * jitter(rand, 0.1), q: 0.9, sweepTo: 600, attack: 0.02, decay: 0.24, gain: 0.14 * weight, at: 0.03 });
  return { layers, reverb: 0.2 + 0.1 * weight };
}

/**
 * A Vortex's blade clipping stone as it comes round: a short bright SHING of steel skating off it and a knock, lighter
 * and quicker than a blade stopped dead (wallClangRecipe): the spin goes on.
 */
export function vortexScrapeRecipe(rand = Math.random) {
  const note = 1450 * jitter(rand, 0.12);
  return {
    layers: [
      { type: 'noise', filter: 'highpass', freq: 3000 * jitter(rand, 0.1), q: 0.7, attack: 0.001, decay: 0.03, gain: 0.34 },
      { type: 'noise', filter: 'bandpass', freq: 3800 * jitter(rand, 0.1), q: 2.4, sweepTo: 2200, attack: 0.003, decay: 0.11, gain: 0.2 },
      ring(rand, note, { decay: 0.3, gain: 0.13, partials: 4, bright: 0.85 }),
      { type: 'tone', wave: 'sine', freq: 190 * jitter(rand, 0.08), slideTo: 90, attack: 0.002, decay: 0.07, gain: 0.3 },
    ],
    reverb: 0.25,
  };
}

/** The burning blade biting a body as it comes round: a sword's cut with the fire's hiss on it. */
export function vortexCutRecipe(rand = Math.random) {
  const cut = swordHitRecipe(rand, { strike: 0, quality: 0.9 });
  cut.layers.push({ type: 'noise', filter: 'highpass', freq: 3800 * jitter(rand, 0.1), q: 0.8, attack: 0.004, decay: 0.12, gain: 0.16 });
  return cut;
}

/** The Vortex run out: the spin winding down (a rush falling away) and the fire guttering. */
export function vortexEndRecipe(rand = Math.random) {
  return {
    layers: [
      { type: 'noise', filter: 'bandpass', freq: 1600 * jitter(rand, 0.08), q: 1.1, sweepTo: 240, attack: 0.03, decay: 0.6, gain: 0.44 },
      { type: 'tone', wave: 'sine', freq: 300 * jitter(rand, 0.04), slideTo: 90, attack: 0.02, decay: 0.55, gain: 0.2 },
      { type: 'noise', filter: 'lowpass', freq: 420, q: 0.6, attack: 0.05, decay: 0.45, gain: 0.3, at: 0.1 },
    ],
    reverb: 0.2,
  };
}
