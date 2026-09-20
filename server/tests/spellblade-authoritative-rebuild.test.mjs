import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const boundsPath = path.join(root, 'tools/blender/characters/spellblade/blueprint_bounds.py');
const modelPath = path.join(root, 'tools/blender/characters/spellblade/authoritative_model_v3.py');

test('final production handoff discards legacy meshes and builds the current authoritative Spellblade', () => {
  const bounds = fs.readFileSync(boundsPath, 'utf8');
  assert.match(bounds, /from \.authoritative_model_v3 import build_authoritative_spellblade_v3/);
  assert.match(bounds, /for obj in tuple\(model\.objects\):/);
  assert.match(bounds, /bpy\.data\.objects\.remove\(obj, do_unlink=True\)/);
  assert.match(bounds, /rebuilt = build_authoritative_spellblade_v3\(armature, materials\)/);
  assert.match(bounds, /return rebuilt/);
});

test('hard-surface authoritative model includes the concept finish pass', () => {
  const source = fs.readFileSync(modelPath, 'utf8');
  for (const symbol of [
    'ConceptChamfer', 'BreastplateRidge', 'VambraceTrim.L', 'VambraceTrim.R',
    'GreaveTrim.L', 'GreaveTrim.R', 'CuisseOuter.L', 'CuisseOuter.R',
    'HeroSword', 'SwordBladeFacet',
  ]) {
    assert.ok(source.includes(`\"${symbol}\"`), `missing ${symbol}`);
  }
  assert.match(source, /build_authoritative_spellblade_v2\(armature, materials\)/);
  assert.match(source, /return _replace_sword_profile\(model, armature\)/);
});
