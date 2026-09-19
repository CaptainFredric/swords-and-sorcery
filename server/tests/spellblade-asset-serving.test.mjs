import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('static server declares glTF binary MIME for production Spellblade assets', async () => {
  const source = await readFile(new URL('../src/server.mjs', import.meta.url), 'utf8');
  assert.match(source, /['"]\.glb['"]\s*:\s*['"]model\/gltf-binary['"]/);
});
