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

test('hero silhouette replaces box-overlay read with authored faceted shells', async () => {
  const hero = await read('tools/blender/characters/spellblade/hero_silhouette.py');
  const build = await read('tools/blender/characters/spellblade/build.py');

  for (const marker of [
    'VisorMask', 'VisorHeroBar', 'VisorHeroStem', 'ChestHeroShell',
    'PauldronHeroShell.{side}', 'ForearmHeroShell.{side}',
    'CuisseHeroShell.{side}', 'GreaveHeroShell.{side}', 'BootHeroShell.{side}',
  ]) assert.match(hero, new RegExp(marker.replaceAll('.', '\\.').replaceAll('{', '\\{').replaceAll('}', '\\}')));

  assert.match(hero, /for side, sign in \(\("L", -1\.0\), \("R", 1\.0\)\)/,
    'hero shell families must be emitted for both left and right sides');
  assert.match(hero, /def refine_hero_silhouette\(/);
  assert.match(build, /from tools\.blender\.characters\.spellblade\.hero_silhouette import refine_hero_silhouette/);
  assert.match(build, /model = refine_hero_silhouette\(armature, model\)/);
});
