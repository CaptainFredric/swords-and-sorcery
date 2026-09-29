// Gale Garner's gust as a body of air, as data (no three.js, so it can be tested): the shapes of its cone of wind and
// of the ribbons twisting round it, for a unit gust along +z from the origin, and how it plays out over its short life.
// galeVolume.mjs builds and draws them.

// the shell of a cone of air: its radius `base + z * tanHalf` along z from 0 to 1 (uv: u round it, v along it)
export function windConeData(tanHalf, { base = 0.02, radial = 40, rings = 18 } = {}) {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= rings; i += 1) {
    const z = i / rings;
    const r = base + z * tanHalf;
    for (let j = 0; j <= radial; j += 1) {
      const a = (j / radial) * Math.PI * 2;
      positions.push(Math.cos(a) * r, Math.sin(a) * r, z);
      uvs.push(j / radial, z);
    }
  }
  for (let i = 0; i < rings; i += 1) {
    for (let j = 0; j < radial; j += 1) {
      const k = i * (radial + 1) + j;
      indices.push(k, k + radial + 1, k + 1, k + 1, k + radial + 1, k + radial + 2);
    }
  }
  return { positions, uvs, indices };
}

// ribbons of air twisting out round the gust's line, all one way (a swirl), each a strip across its own turn; one
// geometry for all of them (aSeed: each ribbon's own 0..1, so their streaks run out a little apart)
export function windRibbonData(tanHalf, { count = 6, samples = 48, random = Math.random } = {}) {
  const positions = [];
  const uvs = [];
  const seeds = [];
  const indices = [];
  for (let n = 0; n < count; n += 1) {
    const seed = (n + random() * 0.8) / count;
    const start = (n / count) * Math.PI * 2 + random() * 0.6;
    const turns = 0.45 + random() * 0.4;
    const out = 0.45 + random() * 0.45;
    const offset = positions.length / 3;
    for (let i = 0; i <= samples; i += 1) {
      const t = i / samples;
      const a = start + turns * Math.PI * 2 * t;
      const r = 0.03 + t * tanHalf * out;
      const width = 0.012 + 0.07 * t;
      // across the strip: round the gust (so from the hand it is seen face on as it sweeps past)
      const cx = Math.cos(a) * r;
      const cy = Math.sin(a) * r;
      const sx = -Math.sin(a) * width;
      const sy = Math.cos(a) * width;
      positions.push(cx - sx, cy - sy, t, cx + sx, cy + sy, t);
      uvs.push(0, t, 1, t);
      seeds.push(seed, seed);
      if (i < samples) {
        const k = offset + i * 2;
        indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
    }
  }
  return { positions, uvs, seeds, indices };
}

// how long the air is seen, and when its front reaches the end of the gust
export const GALE_VOLUME = Object.freeze({ life: 0.62, frontSec: 0.3, ribbonSec: 0.42 });

/**
 * The gust `age` seconds after it was loosed: { front (0..1+, how far out its front is), fade (0..1), head (the
 * ribbons' streak heads), turbulence, done }. The front races out and slows (as a gust does), the air then thins away.
 */
export function galeVolumeAt(age) {
  const { life, frontSec, ribbonSec } = GALE_VOLUME;
  const t = Math.max(0, age);
  const out = Math.min(1, t / frontSec);
  const front = 1.08 * (1 - (1 - out) ** 2.2);
  const fade = t < frontSec ? 1 : Math.max(0, 1 - (t - frontSec) / (life - frontSec)) ** 1.4;
  const head = 1.35 * Math.min(1, t / ribbonSec) ** 0.7;
  return { front, fade, head, turbulence: 0.05 * (1 - Math.min(1, t / life)), done: t >= life };
}
