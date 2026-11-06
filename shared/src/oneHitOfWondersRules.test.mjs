import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ONE_HIT_RULES, ONE_HIT_FIRST_INFUSION_DAMAGE, lineOfConductDamage,
  oneHitInfusionDamageBonus, oneHitDecisiveDamage,
  oneHitAttackForm, oneHitPostArrivalWindup, oneHitTeleportReach,
} from './oneHitOfWondersRules.mjs';

test('Line of Conduct declines from 20 near to an asymptotic 12 without a distance cap', () => {
  assert.equal(lineOfConductDamage(0), 20);
  assert.equal(lineOfConductDamage(5), 18);
  assert.equal(lineOfConductDamage(12), 16);
  assert.equal(lineOfConductDamage(24), 15);
  assert.equal(lineOfConductDamage(60), 13);
  assert.equal(lineOfConductDamage(Infinity), 12);
  assert.throws(() => lineOfConductDamage(-1), RangeError);
  assert.throws(() => lineOfConductDamage(NaN), RangeError);
  for (let d = 1, previous = 20; d < 1000000; d *= 1.35) {
    const next = lineOfConductDamage(d);
    assert.ok(next <= previous && next >= 12 && next <= 20);
    previous = next;
  }
});

test('each first infusion contributes exactly once, including when fully charged', () => {
  assert.deepEqual(ONE_HIT_FIRST_INFUSION_DAMAGE, { fire: 13, frost: 11, gale: 8, lightning: 12 });
  assert.equal(oneHitInfusionDamageBonus({}), 0);
  assert.equal(oneHitInfusionDamageBonus({ fire: 1 }), 13);
  assert.equal(oneHitInfusionDamageBonus({ fire: 2 }), 13);
  assert.equal(oneHitInfusionDamageBonus({ fire: 2, frost: 1, gale: 2, lightning: 2 }), 44);
  assert.equal(oneHitDecisiveDamage(28, { fire: 2, frost: 1, gale: 2, lightning: 2 }), 72);
  assert.throws(() => oneHitDecisiveDamage(-2, {}), RangeError);
});

test('ground/aerial variant is fixed at execution, full Gale required in air', () => {
  assert.equal(oneHitAttackForm({ grounded: true, galeTier: 0 }), 'ground');
  assert.equal(oneHitAttackForm({ grounded: true, galeTier: 2 }), 'ground');
  assert.equal(oneHitAttackForm({ grounded: false, galeTier: 1 }), null);
  assert.equal(oneHitAttackForm({ grounded: false, galeTier: 2 }), 'aerial');
});

test('full-Lightning teleported aerial slash skips SECOND windup', () => {
  assert.equal(oneHitPostArrivalWindup({ form:'aerial', lightningTier: 2, teleported: true }), 0);
  assert.equal(oneHitPostArrivalWindup({ form:'aerial', lightningTier: 2, teleported: false }), ONE_HIT_RULES.aerialWindupSec);
  assert.equal(oneHitPostArrivalWindup({ form:'aerial', lightningTier: 1, teleported: false }), ONE_HIT_RULES.aerialWindupSec);
  assert.equal(oneHitPostArrivalWindup({ form:'ground', lightningTier: 2, teleported: true }), null);
});

test('charged teleport has no maximum range and sharply diminishing reach per second', () => {
  assert.equal(oneHitTeleportReach(0), 0);
  assert.ok(oneHitTeleportReach(1) > 9.3);
  assert.ok(oneHitTeleportReach(50) > oneHitTeleportReach(20));
  assert.ok(oneHitTeleportReach(500) > oneHitTeleportReach(50));
  assert.ok(oneHitTeleportReach(1) - oneHitTeleportReach(0) > oneHitTeleportReach(20) - oneHitTeleportReach(19));
  assert.throws(() => oneHitTeleportReach(-1), RangeError);
});
