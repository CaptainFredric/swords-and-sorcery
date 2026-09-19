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
  for (const name of ['helmet-shell', 'visor', 'crest', 'front-tabard', 'back-tabard']) {
    assert.match(source, new RegExp(name));
  }

  assert.match(source, /name:\s*`\$\{side\s*<\s*0\s*\?\s*'left'\s*:\s*'right'\}-pauldron`/);
  assert.match(source, /const\s+sideName\s*=\s*side\s*<\s*0\s*\?\s*'left'\s*:\s*'right'/);
  assert.match(source, /name:\s*`\$\{sideName\}-boot`/);
  assert.match(source, /buildArm\(visual,\s*-0\.54,\s*materials,\s*-1\)/);
  assert.match(source, /buildArm\(visual,\s*0\.54,\s*materials,\s*1\)/);
  assert.match(source, /buildLeg\(visual,\s*-0\.22,\s*materials,\s*-1\)/);
  assert.match(source, /buildLeg\(visual,\s*0\.22,\s*materials,\s*1\)/);
});
