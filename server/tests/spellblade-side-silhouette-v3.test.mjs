import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const passPath = 'tools/blender/characters/spellblade/authoritative_accuracy_pass_v5.py';
const boundsPath = 'tools/blender/characters/spellblade/blueprint_bounds.py';

test('Spellblade final accuracy pass corrects the authored side silhouette', () => {
  assert.equal(fs.existsSync(passPath), true, 'final side-silhouette pass must exist');
  const source = fs.readFileSync(passPath, 'utf8');
  const bounds = fs.readFileSync(boundsPath, 'utf8');

  assert.match(source, /def _rebuild_shoulders_side_profile\(/);
  assert.match(source, /def _reshape_helmet_side_profile\(/);
  assert.match(source, /def _cant_sword_through_depth\(/);
  assert.match(source, /def apply_concept_accuracy_pass_v5\(/);
  assert.match(source, /vertex\.co\.y \+= .*vertex\.co\.z/);
  assert.match(bounds, /from \.authoritative_accuracy_pass_v5 import apply_concept_accuracy_pass_v5/);
  assert.match(bounds, /rebuilt = apply_concept_accuracy_pass_v5\(rebuilt, armature, materials\)/);
});
