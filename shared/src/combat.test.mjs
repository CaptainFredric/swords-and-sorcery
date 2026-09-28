import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GAME,
  SWORD_STRIKE_TIMES,
  getSwordStrikeIndex,
  isCooldownReady,
  resolveSwordVsGuard,
} from './combat.mjs';

test('four sword hits defeat a full-health player, and three hits and a spell do too', () => {
  assert.equal(GAME.swordDamage, 28);
  assert.ok(GAME.swordDamage * 4 >= GAME.maxHealth);
  assert.ok(GAME.swordDamage * 3 < GAME.maxHealth);
});

test('held sword exposes each strike only when its timing threshold is reached', () => {
  assert.deepEqual(SWORD_STRIKE_TIMES, [0.4, 1.1, 1.8]);
  assert.equal(getSwordStrikeIndex(0.39), -1);
  assert.equal(getSwordStrikeIndex(0.4), 0);
  assert.equal(getSwordStrikeIndex(1.09), 0);
  assert.equal(getSwordStrikeIndex(1.1), 1);
  assert.equal(getSwordStrikeIndex(1.8), 2);
});

test('guard started inside 180ms parries instead of draining normal block stamina', () => {
  assert.deepEqual(resolveSwordVsGuard({ guarding: true, guardAgeMs: 179, stamina: 100 }), {
    kind: 'parry', staminaAfter: 100,
  });
  assert.deepEqual(resolveSwordVsGuard({ guarding: true, guardAgeMs: 181, stamina: 100 }), {
    kind: 'block', staminaAfter: 65,
  });
});

test('cooldown readiness uses absolute ready time', () => {
  assert.equal(isCooldownReady(10, 10), true);
  assert.equal(isCooldownReady(10.001, 10), true);
  assert.equal(isCooldownReady(9.999, 10), false);
});
