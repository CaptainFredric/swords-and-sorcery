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

test('Blender production model encodes the concept hero pieces and animated production stage', async () => {
  const model = await read('tools/blender/characters/spellblade/model.py');
  const build = await read('tools/blender/characters/spellblade/build.py');

  for (const name of [
    'HelmetShell', 'HelmetJaw', 'Visor', 'Crest', 'Breastplate',
    'Pauldron.L', 'Pauldron.R', 'Gauntlet.L', 'Gauntlet.R',
    'Greave.L', 'Greave.R', 'Boot.L', 'Boot.R',
    'TabardFront', 'TabardBack', 'HeroSword',
  ]) assert.match(model, new RegExp(name.replace('.', '\\.')));

  assert.match(model, /VisorGlow/);
  assert.match(model, /SorceryAccent/);
  assert.match(model, /build_third_person_model/);
  assert.match(build, /third-person-animated/);
  assert.match(build, /build_actions/);
  assert.doesNotMatch(build, /visualStage["']\s*:\s*["']rig-proxy["']/);
});
