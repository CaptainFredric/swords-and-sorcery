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

test('asset worker validates a substantial rendered first-person slash blade', async () => {
  const validator = await read('scripts/validate-spellblade-fp-render.py');
  const workflow = await read('.github/workflows/spellblade-assets.yml');

  assert.match(validator, /spellblade-fp-slash\.png/);
  assert.match(validator, /sword/i);
  assert.match(validator, /visibility/i);
  const threshold = validator.match(/MIN_SWORD_VISIBILITY_PIXELS\s*=\s*(\d+)/);
  assert.ok(threshold, 'render validator must declare a sword visibility threshold');
  assert.ok(Number(threshold[1]) >= 1200, 'slash blade must occupy a substantial readable region, not a tiny edge fragment');
  assert.match(workflow, /validate-spellblade-fp-render\.py/);
});
