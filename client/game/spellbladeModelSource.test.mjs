import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { REQUIRED_SPELLBLADE_RIG_KEYS } from './spellbladeDesign.mjs';

async function readFallback() {
  return readFile(new URL('./SpellbladeFallback.mjs', import.meta.url), 'utf8');
}

test('faceted fallback preserves every animation and menu rig key during GLB migration', async () => {
  const source = await readFallback();
  const userDataStart = source.indexOf('root.userData');
  assert.ok(userDataStart >= 0, 'SpellbladeFallback must assign root.userData');
  const userData = source.slice(userDataStart);

  for (const key of REQUIRED_SPELLBLADE_RIG_KEYS) {
    assert.match(userData, new RegExp(`\\b${key}\\b`), `missing rig key ${key}`);
  }
});

test('procedural fallback silhouette is constructed with faceted geometry rather than a local box helper', async () => {
  const source = await readFallback();
  assert.match(source, /facetedMesh/);
  assert.match(source, /taperedPrismData/);
  assert.match(source, /wedgeData/);
  assert.doesNotMatch(source, /function\s+box\s*\(/);
});

test('fallback hero armor and cloth pieces keep stable names for browser visual debugging', async () => {
  const source = await readFallback();
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

test('fallback retains the final concept sculpting details while production GLB migrates in', async () => {
  const source = await readFallback();
  for (const name of [
    'helmet-chin',
    'front-tabard-left-tail',
    'front-tabard-right-tail',
    'magic-wisp-a',
    'magic-wisp-b',
    'magic-wisp-c',
  ]) {
    assert.match(source, new RegExp(name), `missing concept detail ${name}`);
  }
  assert.match(source, /name:\s*`\$\{side\s*<\s*0\s*\?\s*'left'\s*:\s*'right'\}-pauldron-overplate`/);
  assert.match(source, /name:\s*`\$\{sideName\}-boot-toe`/);
});
