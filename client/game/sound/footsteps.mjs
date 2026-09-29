// Footsteps: a knight in plate on the ground under him. Each step is one of a few variants for the surface, with a
// faint clink of armour and a little variation in pitch and level, so no two sound alike:
//   stone (the bailey, the wall walks, the ramps, the keep): a hard heel-to-toe tap with a little grit;
//   grass: a muffled thud and a brush of blades;
//   earth (the roads, the village): a thud and a crunch.
// When they fall comes from the legs themselves, so the rhythm follows the actual speed: the first person's stride
// (distance travelled) for my own, the gait clip's phase for everyone else. Other knights' steps are heard only near
// them. Pure recipes and helpers (no Web Audio): the runtime plays them.

import { jitter } from './soundRecipes.mjs';

export const FOOTSTEPS = Object.freeze({
  own: 0.3,          // my own steps, under everything else
  other: 0.5,        // another knight's, at arm's length (then falling off with distance)
  near: 2,           // metres: full level this close
  far: 14,           // metres: not heard beyond this
  landing: 0.55,     // coming down from a jump: both feet, heavier
});

// how each floor material sounds underfoot
const SURFACE_OF = Object.freeze({ stone: 'stone', limestone: 'stone', arcane: 'stone', timber: 'stone', grass: 'grass', earth: 'earth' });

/** The surface under a point: 'stone', 'grass' or 'earth' (a ramp or stair is stone; nothing known: earth). */
export function surfaceAt(world, x, z, y = 0) {
  let best = null;
  let height = -Infinity;
  for (const floor of world?.floors ?? []) {
    const halfX = floor.size[0] / 2;
    const halfZ = floor.size[2] / 2;
    if (Math.abs(x - floor.center[0]) > halfX || Math.abs(z - floor.center[2]) > halfZ) continue;
    const top = floor.y ?? floor.center[1] + floor.size[1] / 2;
    if (top <= y + 0.65 && top > height + 1e-6) {
      height = top;
      best = SURFACE_OF[floor.material] ?? 'earth';
    }
  }
  for (const ramp of world?.ramps ?? []) {
    if (x < ramp.minX || x > ramp.maxX || z < ramp.minZ || z > ramp.maxZ) continue;
    const t = ramp.axis === 'z' ? (z - ramp.minZ) / (ramp.maxZ - ramp.minZ) : (x - ramp.minX) / (ramp.maxX - ramp.minX);
    const top = ramp.startY + (ramp.endY - ramp.startY) * Math.max(0, Math.min(1, t));
    if (top <= y + 0.65 && top >= height - 0.05) {
      height = top;
      best = 'stone';
    }
  }
  return best ?? 'earth';
}

// the variants: how the foot comes down (a heel then the toe, flat, a scuff, a heavier plant)
const VARIANTS = 4;

/**
 * One footstep. surface: 'stone' | 'grass' | 'earth'; heavy: 0..1 (a sprint, a landing); variant: 0..3 (which of the
 * surface's variants: the caller cycles them so the same one never comes twice running).
 */
export function footstepRecipe(rand = Math.random, { surface = 'earth', heavy = 0, variant = 0 } = {}) {
  const v = ((variant % VARIANTS) + VARIANTS) % VARIANTS;
  const weight = 1 + 0.35 * heavy;
  const pitch = jitter(rand, 0.08) * (1 - 0.08 * heavy);
  const level = jitter(rand, 0.15);
  const layers = [];
  const toe = v === 0 ? 0.035 + rand() * 0.02 : v === 2 ? 0.05 : 0.018;
  if (surface === 'stone') {
    // the heel's hard tap, the toe after it, the body's weight under them, and a little grit
    layers.push({ type: 'noise', filter: 'bandpass', freq: 2300 * pitch, q: 1.3, attack: 0.001, decay: 0.028, gain: 0.34 * level * weight });
    if (v !== 1) layers.push({ type: 'noise', filter: 'bandpass', freq: 3100 * pitch, q: 1.5, attack: 0.001, decay: 0.02, gain: 0.2 * level, at: toe });
    layers.push({ type: 'noise', filter: 'lowpass', freq: 190 * pitch, q: 0.6, attack: 0.002, decay: 0.05 + 0.03 * heavy, gain: 0.32 * level * weight });
    if (v === 2) layers.push({ type: 'noise', filter: 'bandpass', freq: 2800 * pitch, q: 0.9, sweepTo: 1500 * pitch, attack: 0.004, decay: 0.07, gain: 0.1 * level });
  } else if (surface === 'grass') {
    // a soft thud through turf, and the blades brushing the sabaton
    layers.push({ type: 'noise', filter: 'lowpass', freq: 260 * pitch, q: 0.5, attack: 0.004, decay: 0.07 + 0.03 * heavy, gain: 0.42 * level * weight });
    layers.push({ type: 'noise', filter: 'bandpass', freq: 3600 * pitch, q: 0.7, sweepTo: 2400 * pitch, attack: 0.006, decay: v === 2 ? 0.1 : 0.07, gain: 0.07 * level, at: v === 0 ? 0.01 : 0 });
    if (v === 3) layers.push({ type: 'noise', filter: 'lowpass', freq: 180 * pitch, q: 0.5, attack: 0.003, decay: 0.05, gain: 0.2 * level, at: toe });
  } else {
    // packed earth: a thud and a gritty crunch
    layers.push({ type: 'noise', filter: 'lowpass', freq: 320 * pitch, q: 0.5, attack: 0.003, decay: 0.06 + 0.03 * heavy, gain: 0.4 * level * weight });
    layers.push({ type: 'noise', filter: 'bandpass', freq: 1500 * pitch, q: 1.2, attack: 0.002, decay: 0.045, gain: 0.13 * level * weight, at: v === 1 ? 0 : 0.008 });
    if (v !== 1) layers.push({ type: 'noise', filter: 'bandpass', freq: 1900 * pitch, q: 1.4, attack: 0.002, decay: 0.03, gain: 0.08 * level, at: toe });
  }
  // plate settling on the step: a faint, high clink (two small partials)
  const clink = 2600 * jitter(rand, 0.1);
  layers.push({ type: 'ring', partials: [
    { freq: clink, gain: 0.035 * level * weight, decay: 0.05 },
    { freq: clink * 1.47, gain: 0.02 * level, decay: 0.035 },
  ], at: 0.004 + rand() * 0.012 });
  return { layers, reverb: surface === 'stone' ? 0.07 : 0.03 };
}

/** How many footfalls a stride count passed on its way from `from` to `to` (the first person lands on each half). */
export function footfallsCrossed(from, to) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return 0;
  return Math.floor(to + 0.5) - Math.floor(from + 0.5);
}

/** Whether a gait clip's phase (0..1 over two steps, starting on a contact) passed a footfall from `from` to `to`. */
export function gaitFootfall(from, to) {
  if (!Number.isFinite(from) || !Number.isFinite(to)) return false;
  const moved = ((to - from) % 1 + 1) % 1;
  if (moved <= 0 || moved > 0.5) return false;
  return Math.floor((from + moved) * 2) > Math.floor(from * 2);
}

/**
 * Where another knight's step is heard: { pan, gain } or null beyond earshot. listener/source: { x, z }; yaw: the
 * listener's facing (three.js: forward is (-sin, -cos)).
 */
export function footstepPlacement(listener, yaw, source, steps = FOOTSTEPS) {
  if (!listener || !source) return null;
  const dx = source.x - listener.x;
  const dz = source.z - listener.z;
  const distance = Math.hypot(dx, dz);
  if (!(distance < steps.far)) return null;
  const falloff = steps.near / Math.max(steps.near, distance);
  const edge = Math.max(0, Math.min(1, (steps.far - distance) / (steps.far * 0.3)));
  const pan = distance < 0.5 ? 0 : Math.max(-1, Math.min(1, ((dx * Math.cos(yaw) - dz * Math.sin(yaw)) / distance) * 0.8));
  return { pan, gain: steps.other * falloff * edge };
}

/** A walker's variants in turn, never the same twice running: variant(key) → 0..3. */
export function variantPicker(rand = Math.random) {
  const last = new Map();
  return (key) => {
    let pick = Math.floor(rand() * VARIANTS);
    if (pick === last.get(key)) pick = (pick + 1 + Math.floor(rand() * (VARIANTS - 1))) % VARIANTS;
    last.set(key, pick);
    return pick;
  };
}
