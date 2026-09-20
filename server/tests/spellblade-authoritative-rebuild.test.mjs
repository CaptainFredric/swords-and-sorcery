import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const boundsPath = path.join(root, 'tools/blender/characters/spellblade/blueprint_bounds.py');
const modelPath = path.join(root, 'tools/blender/characters/spellblade/authoritative_model_v2.py');

test('final production handoff discards legacy visual meshes and builds the measured authoritative Spellblade', () => {
  const bounds = fs.readFileSync(boundsPath, 'utf8');
  assert.match(bounds, /from \.authoritative_model_v2 import build_authoritative_spellblade_v2/);
  assert.match(bounds, /for obj in tuple\(model\.objects\):/);
  assert.match(bounds, /bpy\.data\.objects\.remove\(obj, do_unlink=True\)/);
  assert.match(bounds, /rebuilt = build_authoritative_spellblade_v2\(armature, materials\)/);
  assert.match(bounds, /return rebuilt/);
});

test('measured authoritative model contains the concept-critical primary forms', () => {
  const source = fs.readFileSync(modelPath, 'utf8');
  for (const symbol of [
    'HelmetShell', 'HelmetJaw', 'FaceRecess', 'Visor', 'Crest', 'CrimsonScarf',
    'Breastplate', 'BackArmor', 'Pauldron.L', 'Pauldron.R',
    'UpperArmPlate.L', 'UpperArmPlate.R', 'Vambrace.L', 'Vambrace.R',
    'Gauntlet.L', 'Gauntlet.R', 'Cuisse.L', 'Cuisse.R',
    'KneePlate.L', 'KneePlate.R', 'Greave.L', 'Greave.R',
    'Boot.L', 'Boot.R', 'Belt', 'BeltBuckle', 'TabardFront', 'TabardBack',
    'HeroSword', 'SwordGuard', 'SwordGem', 'SorceryCore',
  ]) {
    assert.ok(source.includes(`\"${symbol}\"`), `missing ${symbol}`);
  }
  assert.match(source, /return ModelParts\(objects=tuple\(parts\), materials=materials\)/);
});
