import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const buildPath = path.join(root, 'tools/blender/characters/spellblade/build.py');
const modelPath = path.join(root, 'tools/blender/characters/spellblade/authoritative_model.py');

test('production build uses one authoritative Spellblade model instead of stacked corrective passes', () => {
  const build = fs.readFileSync(buildPath, 'utf8');
  assert.match(build, /from tools\.blender\.characters\.spellblade\.authoritative_model import build_authoritative_spellblade/);
  assert.match(build, /model = build_authoritative_spellblade\(armature, materials\)/);
  assert.doesNotMatch(build, /model = rebuild_reference_match/);
  assert.doesNotMatch(build, /model = rebuild_locked_blueprint/);
  assert.doesNotMatch(build, /model = rebuild_primary_hero_shells/);
  assert.doesNotMatch(build, /model = rebuild_hero_limbs/);
});

test('authoritative model contains the concept-critical primary forms', () => {
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
