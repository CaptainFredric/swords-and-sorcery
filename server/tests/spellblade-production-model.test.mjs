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

test('Blender production build captures readable combat action poses', async () => {
  const build = await read('tools/blender/characters/spellblade/build.py');
  for (const marker of [
    'action-guard', 'action-slash-1', 'action-slash-2', 'action-slash-3',
    'action-cast', 'action-dash', 'action-stagger', 'action-death',
  ]) assert.match(build, new RegExp(marker));
});

test('Blender slash clips encode the authoritative strike timing at 30 fps', async () => {
  const animations = await read('tools/blender/characters/spellblade/animations.py');
  assert.match(animations, /ANIMATION_FPS\s*=\s*30/);
  assert.match(animations, /SLASH_DURATIONS_SECONDS\s*=\s*\(0\.72,\s*0\.72,\s*0\.64\)/);
  assert.match(animations, /SLASH_CONTACT_SECONDS\s*=\s*\(0\.40,\s*0\.38,\s*0\.36\)/);
  assert.match(animations, /_seconds_to_frame\(SLASH_CONTACT_SECONDS\[0\]\)/);
  assert.match(animations, /_seconds_to_frame\(SLASH_CONTACT_SECONDS\[1\]\)/);
  assert.match(animations, /_seconds_to_frame\(SLASH_CONTACT_SECONDS\[2\]\)/);
});

test('slash review thumbnails sample the corrected gameplay contact frames', async () => {
  const build = await read('tools/blender/characters/spellblade/build.py');
  assert.match(build, /"action-slash-1": \("Slash_1", 13, "quarter"\)/);
  assert.match(build, /"action-slash-2": \("Slash_2", 12, "quarter"\)/);
  assert.match(build, /"action-slash-3": \("Slash_3", 12, "quarter"\)/);
});
