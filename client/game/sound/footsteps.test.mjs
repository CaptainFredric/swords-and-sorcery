import test from 'node:test';
import assert from 'node:assert/strict';
import { CASTLEWARD } from '../../../shared/worlds/castleward.mjs';
import { SHATTERED_KEEP } from '../../../shared/src/map.mjs';
import { FOOTSTEPS, footfallsCrossed, footstepPlacement, footstepRecipe, gaitFootfall, surfaceAt, variantPicker } from './footsteps.mjs';

test('what is underfoot: grass on the green, earth on the road, stone in the bailey and on the ramps', () => {
  assert.equal(surfaceAt(CASTLEWARD, 0, 0, 0), 'grass');
  assert.equal(surfaceAt(CASTLEWARD, 0, -15, 0), 'earth');
  assert.equal(surfaceAt(CASTLEWARD, 0, 22, 2.5), 'stone');
  assert.equal(surfaceAt(CASTLEWARD, 0, 16, 1.2), 'stone', 'the castle ramp');
  assert.equal(surfaceAt(CASTLEWARD, -7.4, 23, 4), 'stone', 'a wall walk');
  // standing on the green under the bailey's height: the green, not the floor above
  assert.equal(surfaceAt(CASTLEWARD, 14, -15, 0), 'grass', 'the tourney field');
  assert.equal(surfaceAt(SHATTERED_KEEP, 0, 0, 0), 'stone');
});

test('each surface sounds its own, a step has a few variants, and a sprint lands heavier', () => {
  const fixed = () => 0.5;
  const low = (recipe) => recipe.layers.filter((l) => l.type === 'noise').map((l) => l.freq);
  // stone has its hard, bright tap; soft ground is a lower thud
  assert.ok(Math.max(...low(footstepRecipe(fixed, { surface: 'stone' }))) > 2000);
  assert.ok(Math.max(...low(footstepRecipe(fixed, { surface: 'earth' }))) < 2000);
  assert.ok(footstepRecipe(fixed, { surface: 'stone' }).reverb > footstepRecipe(fixed, { surface: 'grass' }).reverb);
  const shapes = new Set([0, 1, 2, 3].map((variant) => JSON.stringify(footstepRecipe(fixed, { surface: 'stone', variant }).layers)));
  assert.equal(shapes.size, 4, 'four different stone steps');
  const loud = (recipe) => Math.max(...recipe.layers.filter((l) => l.gain).map((l) => l.gain));
  assert.ok(loud(footstepRecipe(fixed, { surface: 'grass', heavy: 1 })) > loud(footstepRecipe(fixed, { surface: 'grass', heavy: 0 })));
  // the same step twice still differs a little (pitch and level)
  assert.notDeepEqual(footstepRecipe(Math.random, { surface: 'earth' }), footstepRecipe(Math.random, { surface: 'earth' }));
  const next = variantPicker();
  let last = null;
  for (let i = 0; i < 40; i += 1) {
    const v = next('me');
    assert.notEqual(v, last, 'never the same variant twice running');
    last = v;
  }
});

test('the feet come down with the legs: on each half of the stride, and on each half of the gait clip', () => {
  assert.equal(footfallsCrossed(0.2, 0.45), 0);
  assert.equal(footfallsCrossed(0.45, 0.55), 1, 'a contact at every half');
  assert.equal(footfallsCrossed(0.9, 1.6), 1);
  assert.equal(footfallsCrossed(1, 1), 0, 'standing still');
  assert.equal(gaitFootfall(0.4, 0.55), true);
  assert.equal(gaitFootfall(0.9, 0.05), true, 'round the loop');
  assert.equal(gaitFootfall(0.1, 0.3), false);
  assert.equal(gaitFootfall(undefined, 0.3), false);
});

test("another knight's steps are heard only near him", () => {
  const me = { x: 0, z: 0 };
  assert.equal(footstepPlacement(me, 0, { x: 0, z: -1 }).gain, FOOTSTEPS.other);
  assert.ok(footstepPlacement(me, 0, { x: 0, z: -8 }).gain < FOOTSTEPS.other / 3);
  assert.equal(footstepPlacement(me, 0, { x: 0, z: -FOOTSTEPS.far }), null);
  assert.ok(footstepPlacement(me, 0, { x: 5, z: 0 }).pan > 0.5);
});
