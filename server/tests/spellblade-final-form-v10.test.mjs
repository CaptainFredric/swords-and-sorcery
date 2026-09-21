import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const passPath = new URL('../../tools/blender/characters/spellblade/authoritative_final_form.py', import.meta.url);
const boundsPath = new URL('../../tools/blender/characters/spellblade/blueprint_bounds.py', import.meta.url);

test('final Spellblade form pass owns the remaining concept-critical silhouette', async () => {
  const pass = await readFile(passPath, 'utf8');
  const bounds = await readFile(boundsPath, 'utf8');

  assert.match(pass, /BreastplateFace/);
  assert.match(pass, /PauldronShell\./);
  assert.match(pass, /SwordGuardOuter/);
  assert.match(pass, /def _rebuild_final_helmet/);
  assert.match(pass, /def _compact_head_group/);
  assert.match(pass, /def _rebuild_final_shoulders/);
  assert.match(pass, /def _restore_armored_anatomy/);
  assert.match(pass, /def _remove_hip_blocks/);
  assert.match(pass, /def _rebuild_rear_cloth/);
  assert.match(pass, /def _restore_ground_contact/);
  assert.match(pass, /def apply_authoritative_final_form/);
  assert.match(bounds, /apply_authoritative_final_form/);
});
