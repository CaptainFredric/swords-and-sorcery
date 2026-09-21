import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const passPath = new URL('../../tools/blender/characters/spellblade/authoritative_accuracy_pass_v3.py', import.meta.url);
const boundsPath = new URL('../../tools/blender/characters/spellblade/blueprint_bounds.py', import.meta.url);

test('final Spellblade pass rebuilds concept-critical hard-surface forms and removes baked sorcery', async () => {
  const pass = await readFile(passPath, 'utf8');
  const bounds = await readFile(boundsPath, 'utf8');

  assert.match(pass, /def apply_concept_accuracy_pass_v3/);
  assert.match(pass, /PauldronShell\./);
  assert.match(pass, /BreastplateFace/);
  assert.match(pass, /BootInstepTrim\./);
  assert.match(pass, /GauntletBackplate\./);
  assert.match(pass, /SwordGuardOuter/);

  assert.match(bounds, /apply_concept_accuracy_pass_v3/);
  assert.match(bounds, /_remove_modeled_sorcery\(rebuilt\)/);
});
