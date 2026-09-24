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

test('focused Spellblade polish uses authored polygon silhouettes for the face and waist', async () => {
  const refinement = await read('tools/blender/characters/spellblade/concept_refinement.py');

  assert.match(refinement, /def _profile_slab\(/);
  for (const marker of [
    'HelmetFaceFrame.L', 'HelmetFaceFrame.R', 'HelmetBrowCowl.L', 'HelmetBrowCowl.R',
    'HelmetChin', 'BeltBuckle', 'WaistPouch.L', 'WaistPouch.R',
    'TabardHeroPanel', 'TabardTrim.L', 'TabardTrim.R', 'TabardSigilStem',
  ]) assert.match(refinement, new RegExp(marker.replace('.', '\\.')));

  assert.doesNotMatch(refinement, /["']VisorCrossbar["']/,
    'the old duplicate glowing face bar makes the helmet read as a pale rectangle');
  assert.match(refinement, /_replace_material\(war_belt, materials\["Leather"\]\)/,
    'the belt core should read as leather with brass hardware, not one solid gold bar');
});
