import test from 'node:test';
import assert from 'node:assert/strict';
import {
  localWeaponReleaseForEvent,
  localWeaponReleaseForSnapshot,
  canPresentLocalAction,
} from './localActionPresentation.mjs';

test('authoritative local events release weapon poses that the server has cancelled', () => {
  const me = 'me';
  assert.deepEqual(localWeaponReleaseForEvent({ type: 'spellCast', playerId: me }, me), { attack: true, guard: true });
  assert.deepEqual(localWeaponReleaseForEvent({ type: 'attackStarted', playerId: me }, me), { attack: false, guard: true });
  assert.deepEqual(localWeaponReleaseForEvent({ type: 'guardStarted', playerId: me }, me), { attack: true, guard: false });
  assert.deepEqual(localWeaponReleaseForEvent({ type: 'swordWorldImpact', playerId: me }, me), { attack: true, guard: false });
  assert.deepEqual(localWeaponReleaseForEvent({ type: 'parry', attackerId: me, defenderId: 'them' }, me), { attack: true, guard: false });
  assert.deepEqual(localWeaponReleaseForEvent({ type: 'guardBreak', attackerId: 'them', defenderId: me }, me), { attack: false, guard: true });
  assert.deepEqual(localWeaponReleaseForEvent({ type: 'death', victimId: me }, me), { attack: true, guard: true });
  assert.deepEqual(localWeaponReleaseForEvent({ type: 'matchEnded' }, me), { attack: true, guard: true });
});

test('remote combat events do not alter the local first-person pose', () => {
  assert.equal(localWeaponReleaseForEvent({ type: 'spellCast', playerId: 'them' }, 'me'), null);
  assert.equal(localWeaponReleaseForEvent({ type: 'parry', attackerId: 'a', defenderId: 'b' }, 'me'), null);
  assert.equal(localWeaponReleaseForEvent({ type: 'guardBreak', attackerId: 'a', defenderId: 'b' }, 'me'), null);
});

test('optimistic local presentation obeys authoritative incapacitation and cooldown constraints', () => {
  const ready = { alive: true, staggerUntil: 0, guardStamina: 100 };
  const staggered = { ...ready, staggerUntil: 12 };
  const exhausted = { ...ready, guardStamina: 0 };
  const dead = { ...ready, alive: false };
  const movementReady = { dashReadyAt: 8 };
  const movementCooling = { dashReadyAt: 15 };

  assert.equal(canPresentLocalAction('attack', ready, movementReady, 10), true);
  assert.equal(canPresentLocalAction('guard', ready, movementReady, 10), true);
  assert.equal(canPresentLocalAction('dash', ready, movementReady, 10), true);
  assert.equal(canPresentLocalAction('attack', staggered, movementReady, 10), false);
  assert.equal(canPresentLocalAction('guard', exhausted, movementReady, 10), false);
  assert.equal(canPresentLocalAction('dash', ready, movementCooling, 10), false);
  assert.equal(canPresentLocalAction('attack', dead, movementReady, 10), false);
});

test('snapshots roll back poses that are impossible under authoritative state', () => {
  const ready = { alive: true, staggerUntil: 0, guardStamina: 100 };
  assert.equal(localWeaponReleaseForSnapshot(ready, 10), null);
  assert.deepEqual(localWeaponReleaseForSnapshot({ ...ready, alive: false }, 10), { attack: true, guard: true });
  assert.deepEqual(localWeaponReleaseForSnapshot({ ...ready, staggerUntil: 11 }, 10), { attack: true, guard: true });
  assert.deepEqual(localWeaponReleaseForSnapshot({ ...ready, guardStamina: 0 }, 10), { attack: false, guard: true });
});

test('a Blazing Vortex has both hands from the moment it is lit to the end of its recovery: nothing else is shown in them', async () => {
  const { handsTaken } = await import('./localActionPresentation.mjs');
  const ready = { alive: true, staggerUntil: 0, guardStamina: 100, spellReadyAt: 0 };
  const state = { position: { x: 0, y: 0, z: 0 }, dashReadyAt: 0 };
  const lit = { ...ready, ultimateState: { id: 'vortex', phase: 'startup', commitAt: 10.9 } };
  const spinning = { ...ready, ultimateState: { id: 'vortex', phase: 'active', commitAt: 10, until: 14.5 } };
  const recovering = { ...ready, ultimateState: null, recoverUntil: 10.5 };
  for (const auth of [lit, spinning, recovering]) {
    assert.equal(handsTaken(auth, 10.2), true);
    for (const action of ['attack', 'guard', 'cast', 'dash']) assert.equal(canPresentLocalAction(action, auth, state, 10.2), false, `${action} is not shown`);
    assert.deepEqual(localWeaponReleaseForSnapshot(auth, 10.2), { attack: true, guard: true }, 'and what was held is let go');
  }
  // after it, and all through a Sunder, the hands are the knight's own
  assert.equal(handsTaken(recovering, 10.6), false);
  assert.equal(canPresentLocalAction('attack', recovering, state, 10.6), true);
  const sundering = { ...ready, ultimateState: { id: 'sunder', phase: 'active', commitAt: 10, until: 18 } };
  assert.equal(handsTaken(sundering, 10.2), false);
  assert.equal(canPresentLocalAction('attack', sundering, state, 10.2), true);
  assert.equal(localWeaponReleaseForSnapshot(sundering, 10.2), null);
});
