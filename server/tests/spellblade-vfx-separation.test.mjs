import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('runtime sorcery is attached per instance and disposed with that instance', () => {
  const assets = readFileSync(new URL('../../client/game/SpellbladeAssets.mjs', import.meta.url), 'utf8');
  assert.match(assets, /createSorceryVolume\(sockets.sorcery\)/);
  assert.match(assets, /sorcery.dispose\(\)/);
});
