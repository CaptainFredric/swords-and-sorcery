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

test('remote players upgrade fallback visuals to production GLBs without moving network roots', async () => {
  const source = await read('client/game/RemotePlayers.mjs');

  assert.match(source, /createSpellbladeAsset/);
  assert.match(source, /resolveSpellbladeAnimationPlan/);
  assert.match(source, /createRemoteVisualShell/);
  assert.match(source, /upgradeRemoteVisual/);
  assert.match(source, /setRemoteVisualPlan/);
  assert.match(source, /disposeRemoteVisualShell/);
  assert.match(source, /new\s+THREE\.Group\s*\(/);
  assert.match(source, /generation/);
  assert.match(source, /visualKind\s*===\s*['"]fallback['"]/);
  assert.match(source, /createSpellbladeAsset\(\{\s*kind:\s*['"]thirdPerson['"]\s*\}\)/);
  assert.match(source, /\.catch\s*\(/);
  assert.doesNotMatch(source, /scene\.add\(instance\.root\)/);
});

test('menu keeps a stable showcase wrapper while upgrading its fallback to the third-person GLB', async () => {
  const source = await read('client/menu/MenuScene.mjs');

  assert.match(source, /createSpellbladeAsset/);
  assert.match(source, /kind:\s*['"]thirdPerson['"]/);
  assert.match(source, /characterRoot\s*=\s*new\s+THREE\.Group/);
  assert.match(source, /visualKind/);
  assert.match(source, /clip:\s*['"]Idle['"]/);
  assert.match(source, /targetYaw/);
  assert.match(source, /targetPitch/);
  assert.match(source, /dispose\s*\(\)/);
  assert.match(source, /assetInstance\?\.dispose|assetInstance\.dispose/);
});

test('first-person view upgrades to the dedicated GLB without changing the combat presentation API', async () => {
  const weapon = await read('client/game/WeaponView.mjs');
  const runtime = await read('client/game/GameRuntime.mjs');

  assert.match(weapon, /createSpellbladeAsset/);
  assert.match(weapon, /kind:\s*['"]firstPerson['"]/);
  assert.match(weapon, /fallbackVisual/);
  assert.match(weapon, /productionInstance/);
  assert.match(weapon, /resolveWeaponPose/);
  for (const method of ['setAttack', 'setGuard', 'cast', 'dash', 'wallImpact', 'parry', 'update', 'dispose']) {
    assert.match(weapon, new RegExp(`\\b${method}\\s*\\(`));
  }
  assert.match(weapon, /WallImpact|recoilUntil/);
  assert.match(weapon, /Parry|parryUntil/);
  assert.match(runtime, /this\.weapon\.dispose\s*\(\)/);
});
