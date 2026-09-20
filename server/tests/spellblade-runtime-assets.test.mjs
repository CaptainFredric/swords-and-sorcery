import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(path) {
  try {
    return await readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
  } catch {
    return '';
  }
}

test('browser import map pins Spellblade GLTF addons to the exact Three.js runtime version', async () => {
  const html = await read('client/index.html');
  const version = '0.169.0';

  assert.match(html, new RegExp(`three@${version.replaceAll('.', '\\.')}/build/three\\.module\\.js`));
  assert.match(html, new RegExp(`three@${version.replaceAll('.', '\\.')}/examples/jsm/loaders/GLTFLoader\\.js`));
  assert.match(html, new RegExp(`three@${version.replaceAll('.', '\\.')}/examples/jsm/utils/SkeletonUtils\\.js`));
  assert.match(html, /"three\/addons\/loaders\/GLTFLoader\.js"/);
  assert.match(html, /"three\/addons\/utils\/SkeletonUtils\.js"/);
});

test('runtime asset layer uses cached GLTF loading, skinned cloning, isolated mutable materials, and explicit disposal', async () => {
  const assets = await read('client/game/SpellbladeAssets.mjs');
  const animator = await read('client/game/SpellbladeAnimator.mjs');
  const source = `${assets}\n${animator}`;

  assert.match(assets, /GLTFLoader/);
  assert.match(assets, /SkeletonUtils/);
  assert.match(assets, /clone\s*\(/);
  assert.match(assets, /sourceRevision/);
  assert.match(assets, /VisorGlow/);
  assert.match(assets, /SorceryAccent/);
  assert.match(assets, /material\.clone\s*\(/);
  assert.match(source, /dispose\s*\(/);
  assert.match(animator, /AnimationMixer/);
  assert.match(animator, /stopAllAction/);
  assert.match(animator, /uncacheRoot/);
  assert.doesNotMatch(assets, /geometry\.dispose\s*\(/);
});

test('migration manifest disables production GLB requests until reviewed assets are promoted', async () => {
  const assets = await read('client/game/SpellbladeAssets.mjs');
  const manifestText = await read('client/assets/characters/spellblade/manifest.json');

  assert.ok(manifestText, 'migration manifest must exist so browser does not request a missing file');
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.enabled, false);
  assert.match(assets, /enabled\s*===\s*false/);
  assert.match(assets, /return\s+null/);
});
