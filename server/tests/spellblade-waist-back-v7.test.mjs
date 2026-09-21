import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const passPath = 'tools/blender/characters/spellblade/authoritative_accuracy_pass_v7.py';
const boundsPath = 'tools/blender/characters/spellblade/blueprint_bounds.py';

test('Spellblade v7 authors the waist, rear armor, scarf, and tabards as final-space hero forms', () => {
  assert.equal(fs.existsSync(passPath), true, 'v7 waist/back pass must exist');
  const source = fs.readFileSync(passPath, 'utf8');
  const bounds = fs.readFileSync(boundsPath, 'utf8');

  assert.match(source, /def _rebuild_back_armor\(/);
  assert.match(source, /def _rebuild_waist_and_tabards\(/);
  assert.match(source, /def _rebuild_scarf\(/);
  assert.match(source, /BackSpineRidge/);
  assert.match(source, /Fauld\./);
  assert.match(source, /TabardFront/);
  assert.match(source, /TabardBack/);
  assert.match(source, /def apply_concept_accuracy_pass_v7\(/);
  assert.match(bounds, /from \.authoritative_accuracy_pass_v7 import apply_concept_accuracy_pass_v7/);
  assert.match(bounds, /rebuilt = apply_concept_accuracy_pass_v7\(rebuilt, armature, materials\)/);
});
