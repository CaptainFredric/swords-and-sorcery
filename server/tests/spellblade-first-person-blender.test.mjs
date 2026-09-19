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

test('Blender first-person source uses a compact arm rig and the shared hero sword', async () => {
  const source = await read('tools/blender/characters/spellblade/first_person.py');

  assert.match(source, /build_hero_sword/);
  assert.doesNotMatch(source, /def\s+build_hero_sword/);
  assert.match(source, /FIRST_PERSON_BONES/);
  for (const bone of [
    'root',
    'upper_arm.L', 'forearm.L', 'hand.L',
    'upper_arm.R', 'forearm.R', 'hand.R',
    'socket_sword', 'socket_sorcery',
  ]) assert.match(source, new RegExp(bone.replace('.', '\\.')));

  for (const clip of [
    'Idle', 'Guard', 'Slash_1', 'Slash_2', 'Slash_3', 'Cast', 'Dash', 'Stagger',
  ]) assert.match(source, new RegExp(clip));

  assert.doesNotMatch(source, /HelmetShell|Breastplate|Greave\.L|Greave\.R/);
});

test('combined Blender build exports and reviews the first-person asset', async () => {
  const source = await read('tools/blender/characters/spellblade/first_person.py');
  const build = await read('tools/blender/characters/spellblade/build.py');

  assert.match(source, /build_first_person_asset/);
  assert.match(build, /build_first_person_asset/);
  assert.match(build, /spellblade-fp\.glb/);
  for (const marker of ['fp-neutral', 'fp-guard', 'fp-slash', 'fp-cast']) {
    assert.match(source + build, new RegExp(marker));
  }
});
