import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { REQUIRED_SPELLBLADE_RIG_KEYS } from './spellbladeDesign.mjs';

async function readModel() {
  return readFile(new URL('./SpellbladeModel.mjs', import.meta.url), 'utf8');
}

test('faceted Spellblade preserves every animation and menu rig key', async () => {
  const source = await readModel();
  const userDataStart = source.indexOf('root.userData');
  assert.ok(userDataStart >= 0, 'SpellbladeModel must assign root.userData');
  const userData = source.slice(userDataStart);

  for (const key of REQUIRED_SPELLBLADE_RIG_KEYS) {
    assert.match(userData, new RegExp(`\\b${key}\\b`), `missing rig key ${key}`);
  }
});

test('major Spellblade silhouette is constructed with faceted geometry rather than a local box helper', async () => {
  const source = await readModel();
  assert.match(source, /facetedMesh/);
  assert.match(source, /taperedPrismData/);
  assert.match(source, /wedgeData/);
  assert.doesNotMatch(source, /function\s+box\s*\(/);
});

test('hero armor and cloth pieces have stable names for browser visual debugging', async () => {
  const source = await readModel();
  for (const name of [
    'helmet-shell', 'visor', 'crest', 'left-pauldron', 'right-pauldron',
    'front-tabard', 'back-tabard', 'left-boot', 'right-boot',
  ]) {
    assert.match(source, new RegExp(name));
  }
});
