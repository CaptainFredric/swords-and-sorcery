import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(path) {
  try {
    return await readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
  } catch {
    return '';
  }
}

test('Spellblade arms and legs are replaced by true faceted volumes', async () => {
  const limbs = await read('tools/blender/characters/spellblade/hero_limbs.py');
  const build = await read('tools/blender/characters/spellblade/build.py');

  assert.match(limbs, /def _segment_shell\(/,
    'diagonal arm armor should be built around the limb axis');
  assert.match(limbs, /def _arm_shells\(/);
  assert.match(limbs, /def _leg_shells\(/);
  assert.match(limbs, /def rebuild_hero_limbs\(/);
  assert.match(limbs, /UpperArmPlate\.\{side\}/);
  assert.match(limbs, /Vambrace\.\{side\}/);
  assert.match(limbs, /Gauntlet\.\{side\}/);
  assert.match(limbs, /Cuisse\.\{side\}/);
  assert.match(limbs, /KneePlate\.\{side\}/);
  assert.match(limbs, /Greave\.\{side\}/);
  assert.match(limbs, /Boot\.\{side\}/);
  assert.match(limbs, /\(0\.005, center_x, 0\.155, 0\.355, -0\.090, 0\.012\)/,
    'the rebuilt boot sole must meet the ground plane without burying the foot');
  assert.match(limbs, /_replace_named\(/,
    'limb shells must replace the old traced plates rather than stack over them');

  assert.match(build, /from tools\.blender\.characters\.spellblade\.hero_limbs import rebuild_hero_limbs/);
  assert.match(build, /model = rebuild_primary_hero_shells\(model, armature, materials\)/);
  assert.match(build, /model = rebuild_hero_limbs\(model, armature, materials\)/);
});
