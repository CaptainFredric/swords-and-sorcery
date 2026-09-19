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

test('production Spellblade asset worker is pinned, verified, headless and read-only', async () => {
  const workflow = await read('.github/workflows/spellblade-assets.yml');

  assert.match(workflow, /4\.5\.14/);
  assert.match(workflow, /download\.blender\.org/);
  assert.match(workflow, /sha256sum\s+-c/);
  assert.match(workflow, /libegl1/);
  assert.match(workflow, /--background/);
  assert.match(workflow, /tools\/blender\/characters\/spellblade\/build\.py/);
  assert.match(workflow, /scripts\/validate-spellblade-glb\.py/);
  assert.match(workflow, /spellblade-build-report\.json/);
  assert.match(workflow, /permissions:\s*[\s\S]*?contents:\s*read/);
  assert.doesNotMatch(workflow, /contents:\s*write/);
  assert.match(workflow, /upload-artifact/);
});
