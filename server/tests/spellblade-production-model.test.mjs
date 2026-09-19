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

test('Blender production build captures readable combat action poses', async () => {
  const build = await read('tools/blender/characters/spellblade/build.py');
  for (const marker of [
    'action-guard', 'action-slash-1', 'action-slash-2', 'action-slash-3',
    'action-cast', 'action-dash', 'action-stagger', 'action-death',
  ]) assert.match(build, new RegExp(marker));
});

test('Blender slash clips encode the authoritative strike timing at 30 fps', async () => {
  const animations = await read('tools/blender/characters/spellblade/animations.py');
  assert.match(animations, /ANIMATION_FPS\s*=\s*30/);
  assert.match(animations, /SLASH_DURATIONS_SECONDS\s*=\s*\(0\.72,\s*0\.72,\s*0\.64\)/);
  assert.match(animations, /SLASH_CONTACT_SECONDS\s*=\s*\(0\.40,\s*0\.38,\s*0\.36\)/);
  assert.match(animations, /_seconds_to_frame\(SLASH_CONTACT_SECONDS\[0\]\)/);
  assert.match(animations, /_seconds_to_frame\(SLASH_CONTACT_SECONDS\[1\]\)/);
  assert.match(animations, /_seconds_to_frame\(SLASH_CONTACT_SECONDS\[2\]\)/);
});
