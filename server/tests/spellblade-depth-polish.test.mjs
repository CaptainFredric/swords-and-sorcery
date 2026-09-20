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

test('production Spellblade authors back armor, cape, and side depth instead of exposing the blockout', async () => {
  const source = await read('tools/blender/characters/spellblade/depth_polish.py');
  const build = await read('tools/blender/characters/spellblade/build.py');

  for (const marker of [
    'BackHeroPlate', 'CapeHeroBack', 'CapeHeroTrim.{side}',
    'HelmetSideShell.{side}', 'TorsoSideShell.{side}',
    'BootSideShell.{side}', 'ShoulderBadge.{side}',
  ]) assert.match(source, new RegExp(marker.replaceAll('.', '\\.').replaceAll('{', '\\{').replaceAll('}', '\\}')));

  assert.match(source, /def _profile_slab_yz\(/);
  assert.match(source, /def refine_depth_and_back\(/);
  assert.match(build, /from tools\.blender\.characters\.spellblade\.depth_polish import refine_depth_and_back/);
  assert.match(build, /model = refine_depth_and_back\(armature, model\)/);
});
