import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GAME,
  GUARD_PROFILES,
  MELEE_CONTACT,
  bladeAngleAt,
  closingImpact,
  meleeAlignment,
  meleeContactQuality,
  meleePhase,
  swordDamageFor,
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

test('contact quality: a legal hit lands for 19 to 30; a normally centred one reliably near 28, dead centre 30', () => {
  const deg = Math.PI / 180;
  const reach = GAME.swordRange;
  const damage = (angleDeg, share, dt = 0) => swordDamageFor(meleeContactQuality({ angle: angleDeg * deg, distance: reach * share, dt }));
  assert.equal(GAME.swordGlance, 19);
  assert.equal(GAME.swordDamage, 30);
  // dead centre, on the strong of the blade, in the heart of the swing: the cleanest
  assert.equal(damage(0, 0.5), 30);
  assert.equal(damage(10, 0.6, 0.03), 30, 'not a pinpoint: a little off the middle is still the cleanest');
  // normally centred at any ordinary fighting distance, anywhere in the swing: 28 or better, reliably
  for (let a = 0; a <= 20; a += 1) {
    for (let share = 0.4; share <= 0.85; share += 0.05) {
      for (let dt = -MELEE_CONTACT.window.early; dt <= MELEE_CONTACT.window.late; dt += 0.01) {
        assert.ok(damage(a, share, dt) >= 28, `centred (${a} degrees, ${share.toFixed(2)} of the reach, ${dt.toFixed(2)} s): ${damage(a, share, dt)}`);
      }
    }
  }
  // an ordinary good hit, off the middle or out at the tip: in the middle of the range
  assert.ok(damage(35, 0.6) >= 24 && damage(35, 0.6) <= 28, `off the middle: ${damage(35, 0.6)}`);
  assert.ok(damage(0, 1) >= 26 && damage(0, 1) < 30, `the very tip: ${damage(0, 1)}`);
  // the arc's very edge is a genuinely glancing touch: the least a legal hit does, never less
  assert.equal(damage(MELEE_CONTACT.arcHalfDeg, 1, -MELEE_CONTACT.window.early), GAME.swordGlance);
  assert.equal(swordDamageFor(0), GAME.swordGlance);
  assert.equal(swordDamageFor(-3), GAME.swordGlance);
  // alignment decides: tapering evenly across the arc (no step anywhere, no hidden line)
  let last = 1;
  for (let a = 0; a <= MELEE_CONTACT.arcHalfDeg; a += 1) {
    const q = meleeAlignment(a * deg, reach * 0.5, reach);
    assert.ok(q <= last + 1e-12 && last - q < 0.05, `a smooth taper at ${a} degrees`);
    last = q;
  }
  // the phase only a little: the heart of the swing is strongest, and the whole live stretch costs a point or so
  assert.ok(meleePhase(-MELEE_CONTACT.window.early) < meleePhase(0) && meleePhase(MELEE_CONTACT.window.late) < meleePhase(0));
  for (let dt = -MELEE_CONTACT.window.early; dt <= MELEE_CONTACT.window.late; dt += 0.005) {
    assert.ok(meleePhase(dt) >= 0.9, `the swing's timing is never a sweet spot (${dt.toFixed(3)} s)`);
    assert.ok(damage(0, 0.5) - damage(0, 0.5, dt) <= 1);
  }
  // the blade crosses the arc through the live stretch, and is at the middle at the contact
  assert.equal(bladeAngleAt(0, 0), 0);
  assert.ok(Math.sign(bladeAngleAt(0, -0.05)) === -Math.sign(bladeAngleAt(0, 0.05)), 'from one side to the other');
  assert.ok(Math.sign(bladeAngleAt(0, -0.05)) === -Math.sign(bladeAngleAt(1, -0.05)), 'the backhand the other way');
  // closing speed: nothing when standing or parting, up to a full collision
  assert.equal(closingImpact(0), 0);
  assert.equal(closingImpact(-4), 0);
  assert.ok(closingImpact(4) > 0 && closingImpact(4) < 1 && closingImpact(50) === 1);
});
