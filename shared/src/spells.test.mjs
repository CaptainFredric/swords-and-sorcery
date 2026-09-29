import assert from 'node:assert/strict';
import test from 'node:test';
import { blastDamage, blastDistance, burnFrom, chillFrom, chillScale, DEFAULT_SPELL, isSpell, SPELLS, spellExposure, spellFor, strongerChill } from './spells.mjs';
import { GAME } from './combat.mjs';

test('a direct Fireball, burn and all, stands in for about one clean sword blow; Frostfire hits a little lighter', () => {
  const fire = SPELLS.fireball;
  assert.ok(Math.abs(fire.directDamage + fire.burn.damage - GAME.swordDamage) <= GAME.swordDamage * 0.15);
  assert.ok(SPELLS.frostfire.directDamage < fire.directDamage);
  assert.ok(fire.radius > 2, 'a wide blast');
  assert.ok(SPELLS.frostfire.radius < fire.radius, 'frost bites tighter');
  assert.equal(spellFor('nonsense').id, DEFAULT_SPELL);
  assert.ok(isSpell('frostfire') && !isSpell('toString'));
});

test('exposure: 1 at the heart of a blast, falling to 0 at its edge; the damage eases off only a little, then stops', () => {
  for (const spell of Object.values(SPELLS).filter((s) => s.radius)) {
    assert.equal(spellExposure(spell, 0), 1);
    assert.equal(spellExposure(spell, spell.radius), 0);
    assert.equal(spellExposure(spell, spell.radius + 0.01), 0);
    assert.ok(Math.abs(spellExposure(spell, spell.radius / 2) - 0.5) < 1e-9);
    assert.equal(blastDamage(spell, 1), spell.directDamage);
    assert.equal(blastDamage(spell, 1e-6), spell.edgeDamage);
    assert.ok(spell.edgeDamage >= spell.directDamage * 0.7, `${spell.id}: a slight falloff, not a cliff`);
    const middle = blastDamage(spell, 0.5);
    assert.ok(middle < spell.directDamage && middle > spell.edgeDamage);
    assert.ok(spell.directDamage - middle < middle - spell.edgeDamage, 'the heart holds its force; the loss comes near the edge');
    assert.equal(blastDamage(spell, 0), 0);
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
  const direct = burnFrom(fire, 1, 'a', 10);
  assert.equal(direct.perLick * direct.licksLeft, fire.burn.damage);
  assert.ok(Math.abs(direct.nextAt - (10 + fire.burn.seconds / fire.burn.licks)) < 1e-9);
  assert.ok(Math.abs(direct.until - (10 + fire.burn.seconds)) < 1e-9);
  assert.equal(direct.attackerId, 'a');
  const near = burnFrom(fire, 1 - fire.burn.reach * 0.5, 'a', 10);
  assert.equal(near.perLick, direct.perLick);
  assert.ok(near.licksLeft < direct.licksLeft && near.licksLeft >= 1);
  assert.ok(near.until < direct.until, 'a shorter burn');
  assert.equal(burnFrom(fire, 1 - fire.burn.reach, 'a', 10), null, 'nothing at the burn\'s reach');
  assert.equal(burnFrom(fire, 0.05, 'a', 10), null, 'the edge of the blast only scorches');
  assert.equal(burnFrom(SPELLS.frostfire, 1, 'a', 10), null, 'cold never burns');
});

test('frost bites harder and longer the more directly it caught; a glancing frost still chills, a little', () => {
  const frost = SPELLS.frostfire;
  const direct = chillFrom(frost, 1, 10);
  const glancing = chillFrom(frost, 0.2, 10);
  assert.equal(direct.slow, frost.chill.slow);
  assert.ok(Math.abs(direct.until - 10 - frost.chill.seconds) < 1e-9);
  assert.ok(glancing.slow > 0 && glancing.slow < direct.slow, 'less cold');
  assert.ok(glancing.until > 10 && glancing.until < direct.until, 'and for less long');
  assert.equal(chillFrom(frost, 0, 10), null, 'outside the blast');
  assert.equal(chillFrom(SPELLS.fireball, 1, 10), null, 'fire does not chill');
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
