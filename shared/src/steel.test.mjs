import test from 'node:test';
import assert from 'node:assert/strict';
import { STEEL, callSteel, chipSteel, steelExposure, steelStrength } from './steel.mjs';

test('Sheathed in Steel: strongest when called, wearing off evenly to nothing', () => {
  const steel = callSteel(10);
  assert.equal(steelStrength(steel, 10), 1);
  const quarter = steelStrength(steel, 10 + STEEL.seconds / 4);
  const half = steelStrength(steel, 10 + STEEL.seconds / 2);
  assert.ok(Math.abs(1 - quarter - (quarter - half)) < 1e-9, 'evenly');
  assert.equal(steelStrength(steel, 10 + STEEL.seconds), 0);
  assert.equal(steelStrength(null, 10), 0);
});

test('it turns a spell\'s exposure down as far as it is strong, and what it turns aside wears it', () => {
  const steel = callSteel(10);
  const full = steelExposure(steel, 1, 10);
  assert.ok(full.exposure < 1 && full.exposure > 0, 'a square hit lands like a glancing one, not like nothing');
  assert.ok(Math.abs(full.exposure + full.turned - 1) < 1e-9);
  const later = steelExposure(steel, 1, 10 + STEEL.seconds / 2);
  assert.ok(later.exposure > full.exposure, 'weaker as it wears');
  assert.equal(steelExposure(null, 0.7, 10).exposure, 0.7, 'no armour, nothing turned');
  const chipped = chipSteel(steel, 0.3, 11);
  assert.ok(steelStrength(chipped, 11) < steelStrength(steel, 11));
  assert.equal(chipSteel(steel, 5, 11), null, 'chipped away entirely');
});

test('every blow lands more like a glancing one: a sword\'s cleanness turned down, anything else blunted, evenly as it wears', async () => {
  const { steelQuality, steelBlunt } = await import('./steel.mjs');
  const steel = callSteel(10);
  assert.equal(steelQuality(steel, 1, 10).quality, 0, 'fresh: a clean blow lands as a glancing one');
  const later = steelQuality(steel, 1, 10 + STEEL.seconds / 2);
  assert.ok(Math.abs(later.quality - 0.5) < 1e-9, 'half worn: half of it gets through');
  assert.equal(steelQuality(steel, 0.8, 10 + STEEL.seconds).quality, 0.8, 'worn off: all of it');
  assert.equal(steelQuality(null, 0.7, 10).quality, 0.7);
  assert.equal(steelBlunt(steel, 9, 10).amount, 6, 'a fist blunted as a clean sword blow is (30 to 20)');
  assert.equal(steelBlunt(null, 9, 10).amount, 9);
});
