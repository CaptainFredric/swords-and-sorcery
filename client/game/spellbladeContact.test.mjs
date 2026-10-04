import test from 'node:test';
import assert from 'node:assert/strict';
import { bootSide, soleContactOffset } from './spellbladeContact.mjs';

test('moving crouch preserves the lowest sole even when the support leg changes', () => {
  for (const [before, after] of [
    [[.002, .12], [-.4, .1]],
    [[.12, .002], [.18, .25]],
    [[.002, .1], [.12, -.2]],
  ]) {
    const offset = soleContactOffset(before, after);
    assert.ok(Math.abs(Math.min(...after) + offset - Math.min(...before)) < 1e-9);
  }
});

test('contact compensation leaves equal soles alone and ignores incomplete measurements', () => {
  assert.equal(soleContactOffset([.002, .1], [.002, .1]), 0);
  assert.equal(soleContactOffset([], []), 0);
  assert.equal(soleContactOffset([NaN, .1], [.1, .2]), 0);
});

test('sole binding recognizes Blender names and every split glTF boot primitive', () => {
  for (const name of ['Boot.L', 'BootL', 'BootL_1', 'BootL_2']) assert.equal(bootSide(name), 'L');
  for (const name of ['Boot.R', 'BootR', 'BootR_1', 'BootR_2']) assert.equal(bootSide(name), 'R');
  for (const name of ['GauntletL', 'BootTrimR', 'BootRubbish']) assert.equal(bootSide(name), null);
});
