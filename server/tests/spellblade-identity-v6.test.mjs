import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const passPath = 'tools/blender/characters/spellblade/authoritative_accuracy_pass_v6.py';
const boundsPath = 'tools/blender/characters/spellblade/blueprint_bounds.py';

test('Spellblade identity pass authors chest, stance, helmet face, and a three-dimensional sword', () => {
  assert.equal(fs.existsSync(passPath), true, 'v6 identity pass must exist');
  const source = fs.readFileSync(passPath, 'utf8');
  const bounds = fs.readFileSync(boundsPath, 'utf8');

  assert.match(source, /def _rebuild_chest_identity\(/);
  assert.match(source, /def _spread_armored_stance\(/);
  assert.match(source, /def _rebuild_helmet_face_identity\(/);
  assert.match(source, /def _rebuild_three_dimensional_sword\(/);
  assert.match(source, /def apply_concept_accuracy_pass_v6\(/);
  assert.match(source, /width_axis = Vector/);
  assert.match(source, /thickness_axis = axis\.cross\(width_axis\)/);
  assert.match(bounds, /from \.authoritative_accuracy_pass_v6 import apply_concept_accuracy_pass_v6/);
  assert.match(bounds, /rebuilt = apply_concept_accuracy_pass_v6\(rebuilt, armature, materials\)/);
});
