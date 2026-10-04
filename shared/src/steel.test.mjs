import test from 'node:test';
import assert from 'node:assert/strict';
import { STEEL, callSteel, steelBlunt, steelExposure, steelQuality, steelStrength, steelTakes } from './steel.mjs';
import { GAME } from './combat.mjs';
import { SPELLS, blastDamage, burnFrom, chillFrom } from './spells.mjs';

test('Sheathed in Steel: fully hardened for a while from the call, then wearing off evenly to nothing', () => {
  const steel = callSteel(10);
  assert.equal(steelStrength(steel, 10), 1);
  assert.equal(steelStrength(steel, 10 + STEEL.fullSec - 0.01), 1, 'full the whole while');
  const quarter = steelStrength(steel, 10 + STEEL.fullSec + STEEL.fadeSec / 4);
  const half = steelStrength(steel, 10 + STEEL.fullSec + STEEL.fadeSec / 2);
  assert.ok(Math.abs(0.75 - quarter) < 1e-9 && Math.abs(0.5 - half) < 1e-9, 'evenly');
  assert.equal(steelStrength(steel, 10 + STEEL.fullSec + STEEL.fadeSec), 0);
  assert.equal(steelStrength(null, 10), 0);
});

test('the first blow taken while fully hardened holds it a little longer; no other blow changes the clock', () => {
  // struck at once: full until the usual moment all the same
  const early = steelTakes(callSteel(10), 10.2);
  assert.equal(early.fullUntil, 10 + STEEL.fullSec);
  // struck late in the full stretch: held full for a while after that blow
  const late = steelTakes(callSteel(10), 14.5);
  assert.equal(late.fullUntil, 14.5 + STEEL.holdSec);
  assert.equal(steelStrength(late, 16.4), 1);
  // later blows never hold it again (a crowd hitting it cannot keep it full)
  assert.equal(steelTakes(late, 16.4).fullUntil, late.fullUntil);
  // a first blow that comes only as it wears off changes nothing either
  const fading = steelTakes(callSteel(10), 16);
  assert.equal(fading.fullUntil, 10 + STEEL.fullSec);
  assert.equal(steelTakes(fading, 15).fullUntil, fading.fullUntil, 'and it cannot count again');
  // blows never wear it faster
  assert.equal(steelStrength(steelTakes(callSteel(10), 11), 12.5), steelStrength(callSteel(10), 12.5));
});

test('every blow lands more like a glancing one: a sword\'s cleanness, a spell\'s exposure, anything else blunted', () => {
  const steel = callSteel(10);
  assert.equal(steelQuality(steel, 1, 10).quality, 0, 'fully hardened: every sword blow is the most glancing');
  const halfway = 10 + STEEL.fullSec + STEEL.fadeSec / 2;
  assert.ok(Math.abs(steelQuality(steel, 1, halfway).quality - 0.5) < 1e-9, 'half worn: half its cleanness gets through');
  assert.equal(steelQuality(steel, 0.8, 10 + STEEL.fullSec + STEEL.fadeSec).quality, 0.8, 'worn off: all of it');
  assert.equal(steelQuality(null, 0.7, 10).quality, 0.7);
  const spell = steelExposure(steel, 1, 10);
  assert.ok(spell.exposure < 1 && spell.exposure > 0 && Math.abs(spell.exposure + spell.turned - 1) < 1e-9);
  assert.ok(steelExposure(steel, 1, halfway).exposure > spell.exposure, 'weaker as it wears');
  assert.equal(steelBlunt(steel, 30, 10).amount, GAME.swordGlance, 'a blow blunted as a clean sword blow is');
  assert.equal(steelBlunt(null, 9, 10).amount, 9);
});

test('full Steel maps positive spell exposure to its edge and fades back to actual exposure', () => {
  const steel = callSteel(10);
  const epsilon = 0.001;
  for (const exposure of [1, 0.5, 0.05]) {
    assert.equal(steelExposure(steel, exposure, 10).exposure, epsilon);
    const half = steelExposure(steel, exposure, 10 + STEEL.fullSec + STEEL.fadeSec / 2);
    assert.ok(Math.abs(half.exposure - (epsilon + exposure) / 2) < 1e-9);
    assert.equal(steelExposure(steel, exposure, 10 + STEEL.fullSec + STEEL.fadeSec).exposure, exposure);
  }
  assert.equal(steelExposure(steel, 0, 10).exposure, 0);
  assert.equal(steelExposure(steel, 0.0001, 10).exposure, 0.0001, 'armour never increases an already weaker edge contact');
});


test('full Steel leaves edge blast damage, suppresses a fresh burn and leaves only edge chill', () => {
  const exposure = steelExposure(callSteel(10), 1, 10).exposure;
  assert.equal(blastDamage(SPELLS.fireball, exposure), SPELLS.fireball.edgeDamage);
  assert.equal(blastDamage(SPELLS.frostfire, exposure), SPELLS.frostfire.edgeDamage);
  assert.equal(burnFrom(SPELLS.fireball, exposure, 'a', 10), null);
  const chill = chillFrom(SPELLS.frostfire, exposure, 10);
  assert.ok(chill.slow > 0 && chill.slow < 0.221);
  assert.ok(chill.until > 11.5 && chill.until < 11.502);
  for (const spell of [SPELLS.fireball, SPELLS.frostfire]) {
    assert.equal(blastDamage(spell, steelExposure(callSteel(10), 0, 10).exposure), 0);
  }
});
