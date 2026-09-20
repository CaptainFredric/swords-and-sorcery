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

test('production Spellblade preserves the concept silhouette anchors before promotion', async () => {
  const model = await read('tools/blender/characters/spellblade/model.py');
  const design = await read('tools/blender/characters/spellblade/design.py');

  assert.match(model, /VisorStem/);
  assert.match(model, /BreastplateUpper/);
  assert.match(model, /PauldronOuter/);
  assert.match(model, /Crest[\s\S]{0,500}CrimsonCloth/);

  const bladeWidth = Number(design.match(/SWORD_BLADE_WIDTH\s*=\s*([0-9.]+)/)?.[1] ?? NaN);
  const crestHeight = Number(design.match(/CREST_HEIGHT\s*=\s*([0-9.]+)/)?.[1] ?? NaN);
  const pauldronWidth = Number(design.match(/PAULDRON_WIDTH\s*=\s*([0-9.]+)/)?.[1] ?? NaN);
  assert.ok(bladeWidth >= 0.30, `hero sword blade must stay broad; got ${bladeWidth}`);
  assert.ok(crestHeight >= 0.18, `helmet crest must remain a strong vertical read; got ${crestHeight}`);
  assert.ok(pauldronWidth >= 0.44, `pauldrons must preserve the broad shoulder silhouette; got ${pauldronWidth}`);
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

test('slash review thumbnails sample the corrected gameplay contact frames', async () => {
  const build = await read('tools/blender/characters/spellblade/build.py');
  assert.match(build, /"action-slash-1": \("Slash_1", 13, "quarter"\)/);
  assert.match(build, /"action-slash-2": \("Slash_2", 12, "quarter"\)/);
  assert.match(build, /"action-slash-3": \("Slash_3", 12, "quarter"\)/);
});
