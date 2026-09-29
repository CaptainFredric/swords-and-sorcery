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
