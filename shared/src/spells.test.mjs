import assert from 'node:assert/strict';
import test from 'node:test';
import { blastDamage, blastDistance, burnFrom, chillScale, DEFAULT_SPELL, isSpell, SPELLS, spellFor, strongerChill } from './spells.mjs';

test('a direct Fireball is about 28 all told: 18 at once, 10 more as it burns; Frostfire hits a little lighter', () => {
  const fire = SPELLS.fireball;
  assert.equal(fire.directDamage + fire.burn.damage, 28);
  assert.ok(SPELLS.frostfire.directDamage < fire.directDamage);
  assert.ok(fire.radius > 2, 'a wide blast');
  assert.ok(SPELLS.frostfire.radius < fire.radius, 'frost bites tighter');
  assert.equal(spellFor('nonsense').id, DEFAULT_SPELL);
  assert.ok(isSpell('frostfire') && !isSpell('toString'));
});

test('the blast eases off only a little from its heart to its edge, and stops there', () => {
  for (const spell of Object.values(SPELLS)) {
    assert.equal(blastDamage(spell, 0), spell.directDamage);
    assert.equal(blastDamage(spell, spell.radius), spell.edgeDamage);
    assert.ok(spell.edgeDamage >= spell.directDamage * 0.7, `${spell.id}: a slight falloff, not a cliff`);
    const middle = blastDamage(spell, spell.radius / 2);
    assert.ok(middle < spell.directDamage && middle > spell.edgeDamage);
    assert.ok(spell.directDamage - middle < middle - spell.edgeDamage, 'the heart holds its force; the loss comes near the edge');
    assert.equal(blastDamage(spell, spell.radius + 0.01), 0);
  }
});

test('a blast measures to the nearest part of a body: at someone\'s feet or chest it is on them', () => {
  const standing = { x: 0, y: 0, z: 0 };
  assert.equal(blastDistance({ x: 0.3, y: 0.05, z: 0 }, standing), 0, 'at their feet');
  assert.equal(blastDistance({ x: 0, y: 1.2, z: 0.2 }, standing), 0, 'in their chest');
  assert.ok(Math.abs(blastDistance({ x: 2.4, y: 1, z: 0 }, standing) - 2) < 1e-9, 'beside them: from their side, not their middle');
  assert.ok(Math.abs(blastDistance({ x: 0, y: 3.75, z: 0 }, standing) - 1.6) < 1e-9, 'over their head');
});

test('fire clings only near the heart of the blast: every lick the same, fewer of them further out', () => {
  const fire = SPELLS.fireball;
  const direct = burnFrom(fire, 0, 'a', 10);
  assert.equal(direct.perLick * direct.licksLeft, fire.burn.damage);
  assert.ok(Math.abs(direct.nextAt - (10 + fire.burn.seconds / fire.burn.licks)) < 1e-9);
  assert.ok(Math.abs(direct.until - (10 + fire.burn.seconds)) < 1e-9);
  assert.equal(direct.attackerId, 'a');
  const near = burnFrom(fire, fire.radius * fire.burn.reach * 0.5, 'a', 10);
  assert.equal(near.perLick, direct.perLick);
  assert.ok(near.licksLeft < direct.licksLeft && near.licksLeft >= 1);
  assert.ok(near.until < direct.until, 'a shorter burn');
  assert.equal(burnFrom(fire, fire.radius * fire.burn.reach, 'a', 10), null, 'nothing at the burn\'s reach');
  assert.equal(burnFrom(fire, fire.radius, 'a', 10), null, 'the edge of the blast only scorches');
  assert.equal(burnFrom(SPELLS.frostfire, 0, 'a', 10), null, 'cold never burns');
});

test('a chill is heaviest the moment it lands and thaws evenly to nothing; a weaker one never replaces a colder', () => {
  const chill = { slow: 0.5, startedAt: 10, until: 13 };
  assert.equal(chillScale(chill, 10), 0.5);
  assert.ok(Math.abs(chillScale(chill, 11.5) - 0.75) < 1e-9);
  assert.equal(chillScale(chill, 13), 1);
  assert.equal(chillScale(null, 11), 1);
  assert.equal(chillScale({ slow: 0.5, startedAt: 10, until: 10 }, 10), 1, 'a chill with no length does nothing');
  const fading = { slow: 0.55, startedAt: 10, until: 13 };
  const fresh = { slow: 0.55, startedAt: 12.5, until: 15.5 };
  assert.equal(strongerChill(fading, fresh, 12.5), fresh, 'a fresh chill is colder than a fading one');
  assert.equal(strongerChill(fresh, { slow: 0.2, startedAt: 12.6, until: 15.6 }, 12.6), fresh);
  assert.equal(strongerChill(null, fresh, 12.5), fresh);
});
