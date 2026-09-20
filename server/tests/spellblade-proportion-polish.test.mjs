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

test('concept model receives direct proportion polish without the stale depth overlay pass', async () => {
  const polish = await read('tools/blender/characters/spellblade/concept_polish.py');
  const build = await read('tools/blender/characters/spellblade/build.py');

  assert.match(polish, /def refine_concept_proportions\(/);
  assert.match(polish, /HelmetShell/);
  assert.match(polish, /VisorGlow\.Bar/);
  assert.match(polish, /TabardFront/);
  assert.match(polish, /TabardBack/);
  assert.match(polish, /HeroSword/);
  assert.match(polish, /SorceryCore/);
  assert.match(polish, /ARM_X_COMPRESSION/);

  assert.match(build, /from tools\.blender\.characters\.spellblade\.concept_polish import refine_concept_proportions/);
  assert.match(build, /model = build_concept_model\(armature, materials\)/);
  assert.match(build, /model = refine_concept_proportions\(model\)/);
  assert.doesNotMatch(build, /refine_depth_and_back/);
});