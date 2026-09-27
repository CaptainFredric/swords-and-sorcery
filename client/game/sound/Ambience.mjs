// The air around Castleward: wind that rises and falls, banners that snap when it gusts, and now and then the bell
// of the keep. One control value (the gust, 0..1) drives every layer of the wind, so a gust swells the rumble, lifts
// the howl's pitch and brings out the hiss together, the way real wind does.

import { bellTollRecipe, clothFlapRecipe } from './atmosphereRecipes.mjs';

export const AMBIENCE_SCENES = Object.freeze({
  // the menu: the courtyard at dusk, the bell soon after you arrive
  menu: { wind: 1, flaps: 1, bell: { first: [6, 12], every: [70, 130], strikes: [2, 3], gain: 0.2 } },
  // a match: quieter, so blows and footsteps stay clear
  arena: { wind: 0.62, flaps: 0.7, bell: { first: [35, 70], every: [110, 180], strikes: [1, 3], gain: 0.12 } },
  silent: { wind: 0, flaps: 0, bell: null },
});

const between = (rand, [low, high]) => low + rand() * (high - low);

/** The next shift of the wind: mostly a moving breeze, now and then a real gust. */
export function planGust(rand = Math.random) {
  const strong = rand() < 0.22;
  return strong
    ? { strength: 0.7 + rand() * 0.3, rampSec: 1.2 + rand() * 1.2, holdSec: 1 + rand() * 1.5 }
    : { strength: 0.2 + rand() * 0.35, rampSec: 2 + rand() * 3, holdSec: 2.5 + rand() * 4 };
}

/** Banners only snap in a real gust, and not every time. */
export function flapsForGust(rand, gust, sceneFlaps) {
  if (gust.strength < 0.62 || rand() > sceneFlaps) return [];
  const count = rand() < 0.4 ? 2 : 1;
  return Array.from({ length: count }, (_, i) => ({
    delay: gust.rampSec * (0.4 + rand() * 0.4) + i * (0.6 + rand() * 0.6),
    pan: (rand() * 2 - 1) * 0.8,
    strength: gust.strength,
  }));
}

// a loop of soft (pink) stereo noise whose ends are blended so the seam never clicks
function windNoise(ctx, seconds = 6) {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const fade = Math.floor(rate * 0.1);
  const buffer = ctx.createBuffer(2, length, rate);
  for (let channel = 0; channel < 2; channel += 1) {
    const raw = new Float32Array(length + fade);
    let b0 = 0; let b1 = 0; let b2 = 0;
    for (let i = 0; i < raw.length; i += 1) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      raw[i] = (b0 + b1 + b2 + white * 0.1848) * 0.2;
    }
    const data = buffer.getChannelData(channel);
    data.set(raw.subarray(0, length));
    for (let i = 0; i < fade; i += 1) {
      const t = i / fade;
      data[i] = raw[length + i] * Math.cos((t * Math.PI) / 2) + raw[i] * Math.sin((t * Math.PI) / 2);
    }
  }
  return buffer;
}

export class Ambience {
  constructor(engine, { rand = Math.random } = {}) {
    this.engine = engine;
    this.rand = rand;
    this.scene = 'silent';
    this.nodes = null;
    this.timer = null;
    this.nextGustAt = 0;
    this.nextBellAt = Infinity;
  }

  setScene(name) {
    if (!AMBIENCE_SCENES[name] || name === this.scene) return;
    this.scene = name;
    this.engine.onReady(() => this.#enter());
  }

  #enter() {
    const engine = this.engine;
    if (!this.nodes) this.#build();
    const scene = AMBIENCE_SCENES[this.scene];
    const now = engine.now;
    this.nodes.level.gain.setTargetAtTime(scene.wind, now, 1.2);
    this.nextBellAt = scene.bell ? now + between(this.rand, scene.bell.first) : Infinity;
    if (!this.timer && !engine.offline) this.timer = setInterval(() => this.update(engine.now), 250);
  }

  #build() {
    const ctx = this.engine.ctx;
    const noise = ctx.createBufferSource();
    noise.buffer = windNoise(ctx);
    noise.loop = true;
    const gust = ctx.createConstantSource();
    gust.offset.value = 0.3;
    const level = ctx.createGain();
    level.gain.value = 0;
    level.connect(this.engine.buses.ambience);
    // pink noise is mostly rumble below hearing: take it out before it eats the headroom
    const floor = ctx.createBiquadFilter();
    floor.type = 'highpass';
    floor.frequency.value = 55;
    floor.Q.value = 0.7;
    noise.connect(floor);

    // a layer: filtered noise whose loudness (and optionally pitch) follows the gust
    const layer = (type, freq, q, base, perGust, freqPerGust = 0, wobble = null) => {
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const amp = ctx.createGain();
      amp.gain.value = base;
      const depth = ctx.createGain();
      depth.gain.value = perGust;
      gust.connect(depth).connect(amp.gain);
      if (freqPerGust) {
        const sweep = ctx.createGain();
        sweep.gain.value = freqPerGust;
        gust.connect(sweep).connect(filter.frequency);
      }
      if (wobble) {
        const lfo = ctx.createOscillator();
        lfo.frequency.value = wobble.rate;
        const lfoDepth = ctx.createGain();
        lfoDepth.gain.value = wobble.depth;
        lfo.connect(lfoDepth).connect(filter.frequency);
        lfo.start();
      }
      floor.connect(filter).connect(amp).connect(level);
    };
    // the body of the wind, the whoosh that rises with a gust, a thin whistle over the walls, grass hiss
    layer('lowpass', 180, 0.5, 0.06, 0.1);
    layer('bandpass', 340, 1.4, 0.05, 0.9, 480, { rate: 0.13, depth: 50 });
    layer('bandpass', 950, 8, 0, 0.3, 700, { rate: 0.21, depth: 110 });
    layer('highpass', 2800, 0.5, 0.03, 0.1);

    noise.start();
    gust.start();
    this.nodes = { noise, gust, level };
  }

  /** One step of the weather: the realtime timer calls it; a demo render calls it in a loop. */
  update(now) {
    if (!this.nodes) return;
    const scene = AMBIENCE_SCENES[this.scene];
    if (now >= this.nextGustAt) {
      const gust = planGust(this.rand);
      this.nodes.gust.offset.setTargetAtTime(gust.strength, now, gust.rampSec / 3);
      this.nextGustAt = now + gust.rampSec + gust.holdSec;
      if (scene.wind > 0) {
        for (const flap of flapsForGust(this.rand, gust, scene.flaps)) {
          this.engine.play(clothFlapRecipe(this.rand, { strength: flap.strength }), {
            bus: 'ambience', pan: flap.pan, gain: 0.55 * scene.wind, at: now + flap.delay,
          });
        }
      }
    }
    if (scene.bell && now >= this.nextBellAt) {
      const strikes = Math.round(between(this.rand, scene.bell.strikes));
      // the keep stands off to one side of the courtyard
      this.engine.play(bellTollRecipe(this.rand, { strikes }), { bus: 'ambience', pan: 0.35, gain: scene.bell.gain, at: now + 0.05 });
      this.nextBellAt = now + between(this.rand, scene.bell.every);
    }
  }
}
