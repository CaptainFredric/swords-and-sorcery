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

test('Sprint action exclusions follow Chivalry only inside its living active window', async () => {
  const { combatBlocksSprint } = await import('./combatActionPolicy.mjs');
  const p = { alive: true, guarding: true, attackActive: true, castEndsAt: 12,
    ultimateState: { id: 'chivalry', phase: 'active', until: 19 } };
  assert.equal(combatBlocksSprint(p, 11), false);
  assert.equal(combatBlocksSprint(p, 19), true);
  assert.equal(combatBlocksSprint({ ...p, alive: false }, 11), true);
  assert.equal(combatBlocksSprint({ ...p, staggerUntil: 12 }, 11), true);
  assert.equal(combatBlocksSprint({ ...p, ultimateState: { id: 'chivalry', phase: 'startup', commitAt: 12 } }, 11), true);
  for (const action of ['guarding', 'attacking', 'casting']) {
    const ordinary = { alive: true };
    assert.equal(combatBlocksSprint(ordinary, 11, { [action]: true }), true, action);
    assert.equal(combatBlocksSprint(p, 11, { [action]: true }), false, action);
  }
});
