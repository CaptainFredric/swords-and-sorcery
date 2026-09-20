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
  const source = await read('client/game/SpellbladeAssets.mjs');

  assert.match(source, /GLTFLoader/);
  assert.match(source, /SkeletonUtils/);
  assert.match(source, /clone\s*\(/);
  assert.match(source, /sourceRevision/);
  assert.match(source, /VisorGlow/);
  assert.match(source, /SorceryAccent/);
  assert.match(source, /material\.clone\s*\(/);
  assert.match(source, /dispose\s*\(/);
  assert.match(source, /uncache|stopAllAction|AnimationMixer/);
  assert.doesNotMatch(source, /geometry\.dispose\s*\(/);
});
