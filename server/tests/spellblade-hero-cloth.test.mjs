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

test('Spellblade hero cloth is rebuilt as folded depth geometry before final polish', async () => {
  const cloth = await read('tools/blender/characters/spellblade/hero_cloth.py');
  const build = await read('tools/blender/characters/spellblade/build.py');

  assert.match(cloth, /def rebuild_hero_cloth\(/);
  assert.match(cloth, /def _folded_panel\(/);
  assert.match(cloth, /TabardFront/);
  assert.match(cloth, /TabardBack/);
  assert.match(cloth, /center_fold/);
  assert.match(cloth, /_replace_named\(/);

  assert.match(build, /from tools\.blender\.characters\.spellblade\.hero_cloth import rebuild_hero_cloth/);
  assert.match(build, /model = rebuild_hero_cloth\(model, armature, materials\)/);
  assert.ok(
    build.indexOf('rebuild_hero_cloth(model, armature, materials)') < build.indexOf('refine_concept_proportions(model)'),
    'folded cloth must be authored before the final concept polish'
  );
});
