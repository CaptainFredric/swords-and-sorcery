import test from 'node:test';
import assert from 'node:assert/strict';
import { chillPresentation, elementalProfile, gatherEnvelope } from './elementalVfxModel.mjs';
import { CONJURED, SPELLS } from '../../shared/src/spells.mjs';

test('conjured visuals scale with each shared size and strength while remaining bounded', () => {
  const full = elementalProfile('fireball');
  let previous = null;
  for (const spell of ['ember', 'vortexFire', 'vortexBlaze']) {
    const profile = elementalProfile(spell);
    assert.equal(profile.size, CONJURED[spell].size);
    assert.equal(profile.strength, CONJURED[spell].shove);
    assert.ok(profile.fragmentCount < full.fragmentCount);
    assert.ok(profile.smokeCount <= full.smokeCount);
    assert.ok(profile.trailLife <= full.trailLife);
    assert.ok(profile.maxTrailSamples <= 4);
    if (previous) assert.ok(profile.fragmentCount > previous.fragmentCount);
    previous = profile;
  }
});

test('frost keeps its bolt silhouette and distinct material values', () => {
  const frost = elementalProfile('frostfire');
  const fire = elementalProfile('fireball');
  assert.ok(frost.coreScale[2] > frost.coreScale[0] * 2);
  assert.deepEqual(fire.coreScale, [1, 1, 1]);
  assert.notEqual(frost.core, fire.core);
  assert.notEqual(frost.shell, fire.shell);
  assert.ok(frost.frontOpacity <= 0.2);
  assert.ok(fire.frontOpacity <= 0.2);
  assert.ok(frost.denseReach < 0.3 && fire.denseReach < 0.3);
});

test('gather ramps smoothly over shared cast duration and ends at release', () => {
  for (const spell of ['fireball', 'frostfire']) {
    const duration = SPELLS[spell].gatherSec;
    assert.equal(gatherEnvelope(0, duration).scale, 0.24);
    assert.ok(gatherEnvelope(duration / 2, duration).scale > 0.5);
    assert.equal(gatherEnvelope(duration, duration).scale, 1);
    assert.deepEqual(gatherEnvelope(duration * 2, duration), gatherEnvelope(duration, duration));
  }
  assert.ok(Number.isFinite(gatherEnvelope(0, 0).scale));
});

test('chilled dust and attached crystals thin continuously as the victim thaws', () => {
  const cold = chillPresentation(1);
  const thaw = chillPresentation(0.25);
  const clear = chillPresentation(0);
  assert.ok(cold.opacity > thaw.opacity);
  assert.ok(cold.dustRate > thaw.dustRate);
  assert.ok(cold.mistRate > thaw.mistRate);
  assert.equal(clear.opacity, 0);
  assert.equal(clear.dustRate, 0);
  assert.equal(clear.mistRate, 0);
  assert.deepEqual(chillPresentation(Infinity), clear);
  assert.deepEqual(chillPresentation(-1), clear);
});
