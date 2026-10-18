import test from 'node:test';
import assert from 'node:assert/strict';
import { surfaceHeightAt } from './collision.mjs';
import { BASTION_BREACH } from '../worlds/bastionBreach.mjs';

test('Bastion Breach eastern approach has continuous ground from camp to courtyard', () => {
  // This lane is enclosed by the eastern wall. Without its floor tile, moving into it
  // exposes the background through the ground and the authoritative simulation sees an abyss.
  for (const z of [-25, -18, -11]) {
    for (const x of [8.5, 10, 12, 14.5, 15.4]) {
      assert.equal(
        surfaceHeightAt(x, z, 0.2, BASTION_BREACH),
        0,
        `missing east-approach floor at (x=${x}, z=${z})`,
      );
    }
  }
});

test('Bastion Breach ground does not extend beyond the eastern boundary', () => {
  assert.equal(surfaceHeightAt(18, -18, 0.2, BASTION_BREACH), null);
});
