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
    kind: 'block', staminaAfter: 78,
  });
});

test('a blow on the guard costs between a quarter and a fifth of the bar, from data a class can change', () => {
  const spellblade = guardProfile('spellblade');
  assert.equal(guardProfile(undefined), spellblade, 'every knight is a Spellblade until there are others');
  const share = guardBlockCost(spellblade) / spellblade.capacity;
  assert.ok(share >= 0.2 && share <= 0.25, `a blow takes ${share} of the bar`);
  // a full guard holds four blows and breaks on the fifth
  let stamina = spellblade.capacity;
  const kinds = [];
  for (let blow = 0; blow < 5; blow += 1) {
    const result = resolveSwordVsGuard({ guarding: true, guardAgeMs: 500, stamina, profile: spellblade });
    kinds.push(result.kind);
    stamina = result.staminaAfter;
  }
  assert.deepEqual(kinds, ['block', 'block', 'block', 'block', 'guardBreak']);
  // a heavier guard of another kind of knight, paying less per blow: only the profile differs
  const bulwark = { capacity: 140, blockShare: 0.15 };
  assert.equal(resolveSwordVsGuard({ guarding: true, guardAgeMs: 500, stamina: 140, profile: bulwark }).staminaAfter, 119);
  assert.ok(Object.isFrozen(GUARD_PROFILES) && Object.isFrozen(GUARD_PROFILES.spellblade));
});

test('the sword chain: committed strikes land, and each next swing is a decision as it would begin', () => {
  assert.deepEqual(SWORD_CHAIN.starts, [0, 0.72, 1.44]);
  // one strike committed: it lands at 0.4, then the next swing's moment comes at 0.72
  assert.equal(nextChainStep({ committed: 1, landed: 0 }, 0.39), null);
  assert.deepEqual(nextChainStep({ committed: 1, landed: 0 }, 0.4), { kind: 'land', strike: 0, at: 0.4 });
  assert.equal(nextChainStep({ committed: 1, landed: 1 }, 0.71), null);
  assert.deepEqual(nextChainStep({ committed: 1, landed: 1 }, 0.72), { kind: 'commit', strike: 1, at: 0.72 });
  // a strike always lands before the next is decided, even when a long step passes both
  assert.deepEqual(nextChainStep({ committed: 1, landed: 0 }, 0.9), { kind: 'land', strike: 0, at: 0.4 });
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
