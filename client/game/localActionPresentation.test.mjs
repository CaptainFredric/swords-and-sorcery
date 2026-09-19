import test from 'node:test';
import assert from 'node:assert/strict';
import {
  localWeaponReleaseForEvent,
  localWeaponReleaseForSnapshot,
  canPresentLocalAction,
} from './localActionPresentation.mjs';

test('authoritative local events release weapon poses that the server has cancelled', () => {
  const me = 'me';
  assert.deepEqual(localWeaponReleaseForEvent({ type: 'fireballCast', playerId: me }, me), { attack: true, guard: true });
  assert.deepEqual(localWeaponReleaseForEvent({ type: 'attackStarted', playerId: me }, me), { attack: false, guard: true });
  assert.deepEqual(localWeaponReleaseForEvent({ type: 'guardStarted', playerId: me }, me), { attack: true, guard: false });
  assert.deepEqual(localWeaponReleaseForEvent({ type: 'swordWorldImpact', playerId: me }, me), { attack: true, guard: false });
  assert.deepEqual(localWeaponReleaseForEvent({ type: 'parry', attackerId: me, defenderId: 'them' }, me), { attack: true, guard: false });
  assert.deepEqual(localWeaponReleaseForEvent({ type: 'guardBreak', attackerId: 'them', defenderId: me }, me), { attack: false, guard: true });
  assert.deepEqual(localWeaponReleaseForEvent({ type: 'death', victimId: me }, me), { attack: true, guard: true });
  assert.deepEqual(localWeaponReleaseForEvent({ type: 'matchEnded' }, me), { attack: true, guard: true });
});

test('remote combat events do not alter the local first-person pose', () => {
  assert.equal(localWeaponReleaseForEvent({ type: 'fireballCast', playerId: 'them' }, 'me'), null);
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
