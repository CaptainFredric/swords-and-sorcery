import assert from 'node:assert/strict';
import test from 'node:test';
import { flapsForGust, planGust } from './Ambience.mjs';
import { BELL_PARTIALS, bellTollRecipe, clothFlapRecipe, gateRecipe, uiClankRecipe, warDrumRecipe } from './atmosphereRecipes.mjs';

function seeded(seed = 7) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const mainRingBase = (recipe) => recipe.layers.filter((layer) => layer.type === 'ring').at(-1).partials[0].freq;

test('a menu button clanks: a tick, then the brass lands a moment later; back sits lower than confirm', () => {
  const rand = seeded(3);
  const press = uiClankRecipe(rand, { variant: 'press' });
  assert.ok(press.layers.some((layer) => layer.at > 0.01 && layer.at < 0.03), 'two-part clank');
  const back = mainRingBase(uiClankRecipe(seeded(3), { variant: 'back' }));
  const confirm = mainRingBase(uiClankRecipe(seeded(3), { variant: 'confirm' }));
  assert.ok(back < mainRingBase(uiClankRecipe(seeded(3))) && mainRingBase(uiClankRecipe(seeded(3))) < confirm);
  const last = Math.max(...press.layers.map((layer) => (layer.at ?? 0) + (layer.decay ?? Math.max(...(layer.partials ?? []).map((p) => p.decay)))));
  assert.ok(last < 0.35, 'short enough not to smear fast clicking');
});

test('the bell of the keep tolls in D with a minor-third tierce, and distance takes the shimmer off', () => {
  const toll = bellTollRecipe(seeded(), { strikes: 3, spacing: 3 });
  const rings = toll.layers.filter((layer) => layer.type === 'ring');
  assert.equal(rings.length, 3);
  assert.ok(Math.abs(rings[1].at - 3) < 0.2 && Math.abs(rings[2].at - 6) < 0.3);
  assert.equal(BELL_PARTIALS.find((p) => p.ratio === 1.2).ratio, 1.2, 'minor third above the prime');
  const hum = rings[0].partials[0].freq;
  assert.ok(Math.abs(hum - 73.4) < 0.5, 'hum on D2');
  const near = bellTollRecipe(seeded(), { strikes: 1, distance: 0 }).layers[0].partials;
  const far = bellTollRecipe(seeded(), { strikes: 1, distance: 1 }).layers[0].partials;
  assert.ok(far.at(-1).gain < near.at(-1).gain * 0.6);
  assert.ok(toll.hall > 0.5, 'it rings out in the hall');
});

test('gusts: mostly a breeze, sometimes strong and quick; only a real gust makes the banners snap', () => {
  const rand = seeded(11);
  const gusts = Array.from({ length: 400 }, () => planGust(rand));
  const strong = gusts.filter((gust) => gust.strength >= 0.7);
  assert.ok(strong.length > 40 && strong.length < 150, `${strong.length} strong gusts of 400`);
  for (const gust of gusts) assert.ok(gust.strength >= 0.2 && gust.strength <= 1);
  assert.ok(Math.max(...strong.map((g) => g.rampSec)) < Math.min(...gusts.filter((g) => g.strength < 0.6).map((g) => g.rampSec)) + 1.5);
  assert.deepEqual(flapsForGust(rand, { strength: 0.5, rampSec: 2 }, 1), []);
  const flaps = flapsForGust(() => 0.1, { strength: 0.9, rampSec: 2 }, 1);
  assert.ok(flaps.length >= 1 && flaps.length <= 2);
  assert.ok(flaps.every((flap) => flap.delay > 0 && Math.abs(flap.pan) <= 0.8));
});

test('a banner flaps in a run that rises and falls', () => {
  const recipe = clothFlapRecipe(seeded(5), { strength: 1 });
  const flaps = recipe.layers.filter((layer) => layer.filter === 'bandpass');
  assert.ok(flaps.length >= 5);
  for (let i = 1; i < flaps.length; i += 1) assert.ok(flaps[i].at > flaps[i - 1].at);
  const middle = flaps[Math.floor(flaps.length / 2)].gain;
  assert.ok(middle > flaps[0].gain * 0.9 || middle > flaps.at(-1).gain * 0.9);
});

test('the countdown drum grows heavier, and the gate runs its chain for about as long as the gate opens', () => {
  const light = warDrumRecipe(seeded(), { weight: 0.6 });
  const heavy = warDrumRecipe(seeded(), { weight: 1.3 });
  assert.ok(heavy.layers[0].decay > light.layers[0].decay && heavy.layers[0].gain > light.layers[0].gain);
  const gate = gateRecipe(seeded());
  const lastAt = Math.max(...gate.layers.map((layer) => layer.at ?? 0));
  assert.ok(lastAt > 0.9 && lastAt < 1.6, `gate locks open at ${lastAt.toFixed(2)} s`);
});
