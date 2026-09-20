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
  const source = await read('tools/blender/characters/spellblade/concept_refinement.py');
  for (const marker of [
    'VisorMask', 'VisorHeroBar', 'VisorHeroStem', 'ChestHeroShell',
    'PauldronHeroShell.L', 'PauldronHeroShell.R',
    'ForearmHeroShell.L', 'ForearmHeroShell.R',
    'CuisseHeroShell.L', 'CuisseHeroShell.R',
    'GreaveHeroShell.L', 'GreaveHeroShell.R',
    'BootHeroShell.L', 'BootHeroShell.R',
  ]) assert.match(source, new RegExp(marker.replace('.', '\\.')));

  assert.match(source, /def _hero_silhouette_refinement\(/);
  assert.match(source, /additions\.extend\(_hero_silhouette_refinement\(armature, model\)\)/);
});
