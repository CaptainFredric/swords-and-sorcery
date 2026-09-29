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

// wavy lines of wind: strips running out from the hand along the cone, most of them out toward its edge (they fill out
// its sides), each rippling from side to side as it goes, wider and further the further out. One geometry for all of
// them. aSeed: each line's own 0..1 (its streak runs out a little apart); aTint: 1 a green line, 0 a white one; aWave:
// the way round the gust it ripples, times how far (the shader sets the ripple flowing)
export function windWaveData(tanHalf, { count = 14, samples = 40, random = Math.random } = {}) {
  const positions = [];
  const uvs = [];
  const seeds = [];
  const tints = [];
  const waves = [];
  const indices = [];
  for (let n = 0; n < count; n += 1) {
    const seed = random();
    const tint = n % 2;
    const around = (n / count) * Math.PI * 2 + (random() - 0.5) * 0.5;
    // out toward the sides, mostly: a share of the cone's angle
    const out = 0.45 + 0.55 * Math.sqrt(random());
    const cycles = 1.6 + random() * 1.4;
    const phase = random() * Math.PI * 2;
    const offset = positions.length / 3;
    for (let i = 0; i <= samples; i += 1) {
      const t = i / samples;
      const sway = Math.sin(t * cycles * Math.PI * 2 + phase) * 0.28 * t * tanHalf;
      const a = around + sway / Math.max(1e-3, t * tanHalf * out + 0.02);
      const r = 0.02 + t * tanHalf * out;
      const width = 0.004 + 0.022 * t;
      const cx = Math.cos(a) * r;
      const cy = Math.sin(a) * r;
      // across the line: round the gust (it lies in the cone's side, seen from the hand and from the side alike)
      const wx = -Math.sin(a) * width;
      const wy = Math.cos(a) * width;
      positions.push(cx - wx, cy - wy, t, cx + wx, cy + wy, t);
      uvs.push(0, t, 1, t);
      seeds.push(seed, seed);
      tints.push(tint, tint);
      const wave = 0.05 * t;
      waves.push(-Math.sin(a) * wave, Math.cos(a) * wave, 0, -Math.sin(a) * wave, Math.cos(a) * wave, 0);
      if (i < samples) {
        const k = offset + i * 2;
        indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
    }
  }
  return { positions, uvs, seeds, tints, waves, indices };
}

// wisps of air: small curls (a spiral of a turn and a half, tightening), tumbling out through the gust. Each lies in
// a plane along the gust's way, so it reads as a curl rolling out; aCenter: its middle (the shader turns it about
// that and carries it out), aSeed, aTint as the wavy lines
export function windWispData(tanHalf, { count = 18, samples = 26, random = Math.random } = {}) {
  const positions = [];
  const uvs = [];
  const seeds = [];
  const tints = [];
  const centers = [];
  const indices = [];
  for (let n = 0; n < count; n += 1) {
    const seed = random();
    const tint = n % 3 === 0 ? 0 : 1;
    const along = 0.12 + 0.7 * random();
    const around = random() * Math.PI * 2;
    const out = 0.25 + 0.75 * Math.sqrt(random());
    const r0 = 0.02 + along * tanHalf * out;
    const center = [Math.cos(around) * r0, Math.sin(around) * r0, along];
    const size = 0.022 + 0.035 * random();
    // the curl's plane: the gust's way (z) and outward from its line
    const ox = Math.cos(around);
    const oy = Math.sin(around);
    const turn = random() * Math.PI * 2;
    const offset = positions.length / 3;
    for (let i = 0; i <= samples; i += 1) {
      const t = i / samples;
      const a = turn + t * Math.PI * 3;
      const radius = size * (1 - 0.65 * t);
      const width = size * 0.18 * (1 - 0.5 * t);
      const u = Math.cos(a);
      const v = Math.sin(a);
      // on the curl: outward by u, along the gust by v; its width runs round the gust
      const px = center[0] + ox * u * radius;
      const py = center[1] + oy * u * radius;
      const pz = center[2] + v * radius;
      const wx = -oy * width;
      const wy = ox * width;
      positions.push(px - wx, py - wy, pz, px + wx, py + wy, pz);
      uvs.push(0, t, 1, t);
      seeds.push(seed, seed);
      tints.push(tint, tint);
      centers.push(...center, ...center);
      if (i < samples) {
        const k = offset + i * 2;
        indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
    }
  }
  return { positions, uvs, seeds, tints, centers, indices };
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
