import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(path) {
  return readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
}

test('Spellblade rest rig uses the concept sheet wide planted stance', async () => {
  const design = await read('tools/blender/characters/spellblade/design.py');

  assert.match(design, /"thigh\.L": \(\(-0\.19, 0\.0, 1\.02\), \(-0\.25, 0\.0, 0\.60\)/);
  assert.match(design, /"shin\.L": \(\(-0\.25, 0\.0, 0\.60\), \(-0\.28, 0\.0, 0\.14\)/);
  assert.match(design, /"foot\.L": \(\(-0\.28, 0\.0, 0\.14\), \(-0\.28, 0\.30, 0\.08\)/);
  assert.match(design, /"thigh\.R": \(\(0\.19, 0\.0, 1\.02\), \(0\.25, 0\.0, 0\.60\)/);
  assert.match(design, /"shin\.R": \(\(0\.25, 0\.0, 0\.60\), \(0\.28, 0\.0, 0\.14\)/);
  assert.match(design, /"foot\.R": \(\(0\.28, 0\.0, 0\.14\), \(0\.28, 0\.30, 0\.08\)/);
});

test('final blueprint uses hard tapered limb cages rather than three-ring sausage segments', async () => {
  const blueprint = await read('tools/blender/characters/spellblade/locked_blueprint.py');

  assert.match(blueprint, /def _hard_segment\(/);
  assert.doesNotMatch(blueprint, /from \.hero_limbs import _segment_shell/);
});
