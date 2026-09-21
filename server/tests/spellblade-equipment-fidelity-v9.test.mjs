import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const passPath = new URL('../../tools/blender/characters/spellblade/authoritative_accuracy_pass_v9.py', import.meta.url);
const boundsPath = new URL('../../tools/blender/characters/spellblade/blueprint_bounds.py', import.meta.url);

test('final Spellblade equipment pass preserves concept-specific buckle, boots, gauntlets, and sword fittings', async () => {
  const pass = await readFile(passPath, 'utf8');
  const bounds = await readFile(boundsPath, 'utf8');

  assert.match(pass, /def apply_concept_accuracy_pass_v9/);
  assert.match(pass, /BeltBuckleInset/);
  assert.match(pass, /BootTopPlate\./);
  assert.match(pass, /GauntletFingerPlate\./);
  assert.match(pass, /SwordGuardCap/);
  assert.match(pass, /SwordGemFrame/);
  assert.match(bounds, /apply_concept_accuracy_pass_v9/);
});
