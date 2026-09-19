import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseHeldInputs } from './inputRelease.mjs';

test('releasing arena focus clears movement and held combat state on both network and local presentation', () => {
  const network = [];
  const local = [];
  const controller = {
    keys: new Set(['KeyW', 'Space', 'Tab']),
    attackHeld: true,
    guardHeld: true,
    scoreboardHeld: true,
    socket: {
      attack: (down) => network.push(['attack', down]),
      guard: (down) => network.push(['guard', down]),
    },
    onAttackLocal: (down) => local.push(['attack', down]),
    onGuardLocal: (down) => local.push(['guard', down]),
  };

  releaseHeldInputs(controller);

  assert.equal(controller.keys.size, 0);
  assert.equal(controller.attackHeld, false);
  assert.equal(controller.guardHeld, false);
  assert.equal(controller.scoreboardHeld, false);
  assert.deepEqual(network, [['attack', false], ['guard', false]]);
  assert.deepEqual(local, [['attack', false], ['guard', false]]);
});
