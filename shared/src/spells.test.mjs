import assert from 'node:assert/strict';
import test from 'node:test';
import { blastDamage, burnFrom, chillScale, DEFAULT_SPELL, isSpell, SPELLS, spellFor, strongerChill } from './spells.mjs';

test('a direct Fireball is about 28 all told: 18 at once, 10 more as it burns; Frostfire hits a little lighter', () => {
  const fire = SPELLS.fireball;
  assert.equal(fire.directDamage + fire.burn.damage, 28);
  assert.ok(SPELLS.frostfire.directDamage < fire.directDamage);
  assert.ok(fire.radius > 2, 'a wide blast');
  assert.ok(SPELLS.frostfire.radius < fire.radius, 'frost bites tighter');
  assert.equal(spellFor('nonsense').id, DEFAULT_SPELL);
  assert.ok(isSpell('frostfire') && !isSpell('toString'));
});

test('the blast falls off from its heart to its edge, and stops there', () => {
  const fire = SPELLS.fireball;
  assert.equal(blastDamage(fire, 0), fire.directDamage);
  assert.equal(blastDamage(fire, fire.radius), fire.edgeDamage);
  assert.ok(blastDamage(fire, fire.radius / 2) < fire.directDamage && blastDamage(fire, fire.radius / 2) > fire.edgeDamage);
  assert.equal(blastDamage(fire, fire.radius + 0.01), 0);
});

test('a burn comes in equal licks, lighter for a glancing blast, and cold never burns', () => {
  const fire = SPELLS.fireball;
  const direct = burnFrom(fire, fire.directDamage, 'a', 10);
  assert.equal(direct.perLick * direct.licksLeft, fire.burn.damage);
  assert.ok(Math.abs(direct.nextAt - (10 + fire.burn.seconds / fire.burn.licks)) < 1e-9);
  assert.equal(direct.attackerId, 'a');
  const glancing = burnFrom(fire, fire.edgeDamage, 'a', 10);
  assert.ok(glancing.perLick * glancing.licksLeft < direct.perLick * direct.licksLeft);
  assert.equal(burnFrom(SPELLS.frostfire, 15, 'a', 10), null);
  assert.equal(burnFrom(fire, 0, 'a', 10), null);
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
