import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const passPath = new URL('../../tools/blender/characters/spellblade/authoritative_final_form.py', import.meta.url);
const boundsPath = new URL('../../tools/blender/characters/spellblade/blueprint_bounds.py', import.meta.url);

test('final Spellblade form pass removes superseded overlays and owns the final helmet side volume', async () => {
  const pass = await readFile(passPath, 'utf8');
  const bounds = await readFile(boundsPath, 'utf8');

  assert.match(pass, /BreastplateFace/);
  assert.match(pass, /PauldronShell\./);
  assert.match(pass, /SwordGuardOuter/);
  assert.match(pass, /def _rebuild_final_helmet/);
  assert.match(pass, /def apply_authoritative_final_form/);
  assert.match(bounds, /apply_authoritative_final_form/);
});
