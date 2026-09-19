import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function source() {
  return readFile(new URL('./WeaponView.mjs', import.meta.url), 'utf8');
}

test('first-person Spellblade uses the faceted armor vocabulary and shared palette', async () => {
  const text = await source();
  assert.match(text, /facetedMesh/);
  assert.match(text, /taperedPrismData/);
  assert.match(text, /wedgeData/);
  assert.match(text, /SPELLBLADE_PALETTE/);
  assert.match(text, /createSpellbladeSword/);
  assert.doesNotMatch(text, /function\s+box\s*\(/);
});

test('first-person rebuild preserves the existing combat presentation API', async () => {
  const text = await source();
  for (const method of ['setAttack', 'setGuard', 'cast', 'dash', 'wallImpact', 'parry', 'update']) {
    assert.match(text, new RegExp(`\\b${method}\\s*\\(`), `missing WeaponView.${method}`);
  }
  assert.match(text, /resolveWeaponPose/);
  assert.match(text, /FIRST_PERSON_WEAPON_SCALE/);
});
