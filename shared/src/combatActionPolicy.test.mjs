import test from 'node:test';
import assert from 'node:assert/strict';
import { combatActionPolicy } from './combatActionPolicy.mjs';

test('coexistence and parry relief require a living committed Chivalry within its exact window', () => {
  const ordinary = { concurrent: false, suppressParryReel: false, projectileGateSec: 0 };
  for (const id of ['sunder', 'vortex', 'chivalry']) {
    const player = { alive: true, ultimateState: { id, phase: 'startup', commitAt: 10.65, until: 19.65 } };
    assert.deepEqual(combatActionPolicy(player, 10.6), ordinary);
    player.ultimateState.phase = 'active';
    assert.deepEqual(combatActionPolicy(player, 19.64), id === 'chivalry'
      ? { concurrent: true, suppressParryReel: true, projectileGateSec: 0.72 } : ordinary);
    assert.deepEqual(combatActionPolicy(player, 19.65), ordinary);
    player.alive = false;
    assert.deepEqual(combatActionPolicy(player, 11), ordinary);
  }
  assert.deepEqual(combatActionPolicy(null, 10), ordinary);
});
