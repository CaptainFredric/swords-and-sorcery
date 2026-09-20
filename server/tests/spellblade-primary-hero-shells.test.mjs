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

test('primary Spellblade armor is rebuilt as deliberate 3D faceted shells', async () => {
  const shells = await read('tools/blender/characters/spellblade/hero_shells.py');
  const build = await read('tools/blender/characters/spellblade/build.py');

  assert.match(shells, /def rebuild_primary_hero_shells\(/);
  assert.match(shells, /def _ring_shell\(/,
    'hero pieces need authored depth rings rather than front-profile slabs');
  assert.match(shells, /HelmetShell/);
  assert.match(shells, /HelmetJaw/);
  assert.match(shells, /Breastplate/);
  assert.match(shells, /BackArmor/);
  assert.match(shells, /Pauldron\.\{side\}/);
  assert.match(shells, /PauldronLower\.\{side\}/);
  assert.match(shells, /FaceRecess/);
  assert.match(shells, /Crest/);
  assert.match(shells, /_replace_named\(/,
    'new hero shells should replace, not stack over, the legacy traced pieces');

  assert.match(build, /from tools\.blender\.characters\.spellblade\.hero_shells import rebuild_primary_hero_shells/);
  assert.match(build, /model = refine_concept_proportions\(model\)/);
  assert.match(build, /model = rebuild_primary_hero_shells\(model, armature, materials\)/);
});
