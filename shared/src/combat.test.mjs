import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GAME,
  GUARD_PROFILES,
  SWORD_CHAIN,
  SWORD_STRIKE_TIMES,
  getSwordStrikeIndex,
  guardBlockCost,
  guardProfile,
  isCooldownReady,
  nextChainStep,
  resolveSwordVsGuard,
} from './combat.mjs';

test('with the current damage, four clean sword hits fell a full-health Spellblade and three do not', () => {
  assert.ok(GAME.swordDamage * 4 >= GAME.maxHealth);
  assert.ok(GAME.swordDamage * 3 < GAME.maxHealth);
});

test('a strike is exposed from its contact time on, in order', () => {
  const [first, second, third] = SWORD_STRIKE_TIMES;
  assert.ok(first < second && second < third);
  assert.equal(getSwordStrikeIndex(first - 0.01), -1);
  assert.equal(getSwordStrikeIndex(first), 0);
  assert.equal(getSwordStrikeIndex(second - 0.01), 0);
  assert.equal(getSwordStrikeIndex(second), 1);
  assert.equal(getSwordStrikeIndex(third), 2);
});

test('guard started inside 180ms parries instead of draining normal block stamina', () => {
  assert.deepEqual(resolveSwordVsGuard({ guarding: true, guardAgeMs: 179, stamina: 100 }), {
    kind: 'parry', staminaAfter: 100,
  });
  assert.deepEqual(resolveSwordVsGuard({ guarding: true, guardAgeMs: 181, stamina: 100 }), {
    kind: 'block', staminaAfter: 78,
  });
});

test('a blow on the guard costs a part of the bar, from data a class can change; several blows break it', () => {
  const spellblade = guardProfile('spellblade');
  assert.equal(guardProfile(undefined), spellblade, 'every knight is a Spellblade until there are others');
  // blocks until the bar is gone, then the break (a whole chain of three does not break a full guard)
  let stamina = spellblade.capacity;
  const kinds = [];
  while (kinds.at(-1) !== 'guardBreak' && kinds.length < 20) {
    const result = resolveSwordVsGuard({ guarding: true, guardAgeMs: 500, stamina, profile: spellblade });
    kinds.push(result.kind);
    stamina = result.staminaAfter;
  }
  assert.ok(kinds.length > 3, `a full guard takes ${kinds.length} blows to break`);
  assert.ok(kinds.slice(0, -1).every((kind) => kind === 'block'));
  // a heavier guard of another kind of knight, paying less per blow: only the profile differs
  const bulwark = { capacity: 140, blockShare: 0.15 };
  assert.equal(resolveSwordVsGuard({ guarding: true, guardAgeMs: 500, stamina: 140, profile: bulwark }).staminaAfter, 119);
  assert.ok(Object.isFrozen(GUARD_PROFILES) && Object.isFrozen(GUARD_PROFILES.spellblade));
});

test('the sword chain: committed strikes land, and each next swing is a decision as it would begin', () => {
  const [contact] = SWORD_STRIKE_TIMES;
  const second = SWORD_CHAIN.starts[1];
  // one strike committed: it lands at its contact, then the next swing's moment comes
  assert.equal(nextChainStep({ committed: 1, landed: 0 }, contact - 0.01), null);
  assert.deepEqual(nextChainStep({ committed: 1, landed: 0 }, contact), { kind: 'land', strike: 0, at: contact });
  assert.equal(nextChainStep({ committed: 1, landed: 1 }, second - 0.01), null);
  assert.deepEqual(nextChainStep({ committed: 1, landed: 1 }, second), { kind: 'commit', strike: 1, at: second });
  // a strike always lands before the next is decided, even when a long step passes both
  assert.deepEqual(nextChainStep({ committed: 1, landed: 0 }, second + 0.2), { kind: 'land', strike: 0, at: contact });
  // all three in and landed: nothing more (the chain is done)
  assert.equal(nextChainStep({ committed: 3, landed: 3 }, 5), null);
  // every strike's swing begins before it lands, and after the one before it has landed
  SWORD_STRIKE_TIMES.forEach((contact, i) => {
    assert.ok(SWORD_CHAIN.starts[i] < contact);
    if (i > 0) assert.ok(SWORD_CHAIN.starts[i] > SWORD_STRIKE_TIMES[i - 1]);
  });
});

test('cooldown readiness uses absolute ready time', () => {
  assert.equal(isCooldownReady(10, 10), true);
  assert.equal(isCooldownReady(10.001, 10), true);
  assert.equal(isCooldownReady(9.999, 10), false);
});
