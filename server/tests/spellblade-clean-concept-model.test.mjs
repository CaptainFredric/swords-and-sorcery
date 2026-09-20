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

test('production third-person Spellblade is built from the traced concept model rather than layered over the blockout', async () => {
  const source = await read('tools/blender/characters/spellblade/concept_model.py');
  const build = await read('tools/blender/characters/spellblade/build.py');

  assert.match(source, /def build_concept_model\(/);
  assert.match(source, /DETAIL_HEAD_TRACE_PX/);
  assert.match(source, /DETAIL_SHOULDER_TRACE_PX/);
  assert.match(source, /DETAIL_BOOT_TRACE_PX/);
  assert.match(source, /VisorGlow\.Bar/);
  assert.match(source, /VisorGlow\.Stem/);
  assert.match(source, /ChestFacet\.L/);
  assert.match(source, /ChestFacet\.R/);
  assert.match(source, /PauldronTrim\.L/);
  assert.match(source, /PauldronTrim\.R/);
  assert.match(source, /TabardSigil/);

  for (const marker of [
    'HelmetShell', 'HelmetJaw', 'Visor', 'Crest', 'Breastplate',
    'Pauldron.L', 'Pauldron.R', 'Gauntlet.L', 'Gauntlet.R',
    'Greave.L', 'Greave.R', 'Boot.L', 'Boot.R',
    'TabardFront', 'TabardBack', 'HeroSword',
  ]) assert.match(source, new RegExp(marker.replaceAll('.', '\\.')));

  assert.match(build, /from tools\.blender\.characters\.spellblade\.concept_model import build_concept_model/);
  assert.match(build, /model = build_concept_model\(armature, materials\)/);
  assert.doesNotMatch(build, /model = build_third_person_model\(armature, materials\)/);
  assert.doesNotMatch(build, /model = refine_concept_silhouette\(armature, model\)/);
  assert.doesNotMatch(build, /model = refine_hero_silhouette\(armature, model\)/);
  assert.doesNotMatch(build, /model = refine_depth_and_back\(armature, model\)/);
  assert.doesNotMatch(build, /model = refine_traced_concept_geometry\(armature, model\)/);
});
