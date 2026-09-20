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

test('final limb authority uses two-section hard-surface cages', async () => {
  const limbs = await read('tools/blender/characters/spellblade/hero_limbs.py');
  const build = await read('tools/blender/characters/spellblade/build.py');

  assert.match(limbs, /Chamfered rectangular cross-section/);
  assert.match(limbs, /rings = \(\s*_segment_ring\(a,[\s\S]*?_segment_ring\(b,/);
  assert.doesNotMatch(limbs, /middle = a\.lerp/);
  assert.match(build, /rebuild_locked_blueprint\(model, armature, materials\)[\s\S]*rebuild_hero_limbs\(model, armature, materials\)/);
});
