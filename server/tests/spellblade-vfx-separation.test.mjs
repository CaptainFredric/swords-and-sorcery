import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const blueprintBounds = readFileSync(
  new URL('../../tools/blender/characters/spellblade/blueprint_bounds.py', import.meta.url),
  'utf8',
);


test('final Spellblade build applies the latest concept-accuracy pass', () => {
  assert.match(
    blueprintBounds,
    /from \.authoritative_accuracy_pass_v2 import apply_concept_accuracy_pass_v2/,
  );
  assert.match(
    blueprintBounds,
    /rebuilt = apply_concept_accuracy_pass_v2\(rebuilt, armature, materials\)/,
  );
});


test('base Spellblade exports no modeled sorcery geometry', () => {
  assert.match(blueprintBounds, /def _remove_modeled_sorcery\(/);
  assert.match(
    blueprintBounds,
    /obj\.name == "SorceryCore" or obj\.name\.startswith\("SorceryShard"\)/,
  );
  assert.match(blueprintBounds, /rebuilt = _remove_modeled_sorcery\(rebuilt\)/);
});
