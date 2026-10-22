import test from 'node:test';
import assert from 'node:assert/strict';
import { PAULDRON_FOLLOW, PAULDRON_RAISED_FOLLOW, PAULDRON_RAISE, pauldronFollow } from './pauldronFollow.mjs';

test('a pauldron turns part of the way with its arm, and further as the arm is raised (the plate stays over the shoulder)', () => {
  // arms down, running, at rest: as before
  for (const turn of [0, 20, 45, PAULDRON_RAISE[0]]) assert.equal(pauldronFollow(turn), PAULDRON_FOLLOW);
  // raised into a high guard or overhead: nearly with the arm
  for (const turn of [PAULDRON_RAISE[1], 140, 180]) assert.equal(pauldronFollow(turn), PAULDRON_RAISED_FOLLOW);
  // and smoothly between, never turning back
  let last = pauldronFollow(PAULDRON_RAISE[0]);
  for (let turn = PAULDRON_RAISE[0]; turn <= PAULDRON_RAISE[1]; turn += 1) {
    const f = pauldronFollow(turn);
    assert.ok(f >= last - 1e-12 && f - last < 0.02);
    last = f;
  }
});
