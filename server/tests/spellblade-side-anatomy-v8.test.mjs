import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const passPath = 'tools/blender/characters/spellblade/authoritative_accuracy_pass_v8.py';
const boundsPath = 'tools/blender/characters/spellblade/blueprint_bounds.py';

test('Spellblade v8 replaces the blocky helmet and shoulder side silhouettes', () => {
  assert.equal(fs.existsSync(passPath), true, 'v8 side anatomy pass must exist');
  const source = fs.readFileSync(passPath, 'utf8');
  const bounds = fs.readFileSync(boundsPath, 'utf8');

  assert.match(source, /def _prism_yz\(/);
  assert.match(source, /def _rebuild_helmet_side_shell\(/);
  assert.match(source, /def _rebuild_layered_shoulders\(/);
  assert.match(source, /HelmetShell/);
  assert.match(source, /HelmetJaw/);
  assert.match(source, /PauldronLower\./);
  assert.match(source, /def apply_concept_accuracy_pass_v8\(/);
  assert.match(bounds, /from \.authoritative_accuracy_pass_v8 import apply_concept_accuracy_pass_v8/);
  assert.match(bounds, /rebuilt = apply_concept_accuracy_pass_v8\(rebuilt, armature, materials\)/);
});
