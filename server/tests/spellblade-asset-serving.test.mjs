import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveStaticFile } from '../src/server.mjs';

const ROOT = path.resolve(process.cwd());
const SPELLBLADE_BASE = '/client/assets/characters/spellblade';

test('static server declares glTF binary MIME for production Spellblade assets', async () => {
  const source = await readFile(new URL('../src/server.mjs', import.meta.url), 'utf8');
  assert.match(source, /['"]\.glb['"]\s*:\s*['"]model\/gltf-binary['"]/);
});

test('runtime and promotion use the server-exposed client namespace for Spellblade assets', async () => {
  const runtime = await readFile(new URL('../../client/game/SpellbladeAssets.mjs', import.meta.url), 'utf8');
  const promotion = await readFile(new URL('../../.github/workflows/promote-spellblade-assets.yml', import.meta.url), 'utf8');

  assert.equal(
    resolveStaticFile(ROOT, `${SPELLBLADE_BASE}/manifest.json`),
    path.join(ROOT, 'client', 'assets', 'characters', 'spellblade', 'manifest.json'),
  );
  assert.match(runtime, /DEFAULT_MANIFEST_URL\s*=\s*['"]\/client\/assets\/characters\/spellblade\/manifest\.json['"]/);
  assert.match(promotion, /base\s*=\s*['"]\/client\/assets\/characters\/spellblade['"]/);
  assert.doesNotMatch(runtime, /['"]\/assets\/characters\/spellblade\/manifest\.json['"]/);
  assert.doesNotMatch(promotion, /base\s*=\s*['"]\/assets\/characters\/spellblade['"]/);
});
