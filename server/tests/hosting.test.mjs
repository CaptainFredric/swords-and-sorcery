import test from 'node:test';
import assert from 'node:assert/strict';
import { appUrl } from '../../client/appUrl.mjs';
import { gameServerUrl } from '../../client/network/GameSocket.mjs';

test('the game finds its own files from the server root and from a sub-path (GitHub Pages)', () => {
  const saved = globalThis.document;
  try {
    globalThis.document = { baseURI: 'https://captainfredric.github.io/swords-and-sorcery/' };
    assert.equal(appUrl('/client/assets/voice/manifest.json'), 'https://captainfredric.github.io/swords-and-sorcery/client/assets/voice/manifest.json');
    globalThis.document = { baseURI: 'https://swords-and-sorcery.onrender.com/?room=ABCDE' };
    assert.equal(appUrl('/client/assets/characters/spellblade/spellblade.glb?v=abc'), 'https://swords-and-sorcery.onrender.com/client/assets/characters/spellblade/spellblade.glb?v=abc');
    assert.equal(appUrl('https://cdn.example/x.js'), 'https://cdn.example/x.js', 'absolute URLs are left alone');
  } finally {
    globalThis.document = saved;
  }
});

test('the client plays on its own host unless the page names a game server', () => {
  const page = (content) => ({ querySelector: (selector) => (content && selector === 'meta[name="ss-game-server"]' ? { content } : null) });
  assert.equal(gameServerUrl(page(null), { protocol: 'https:', host: 'swords-and-sorcery.onrender.com' }), 'wss://swords-and-sorcery.onrender.com/ws');
  assert.equal(gameServerUrl(page(null), { protocol: 'http:', host: 'localhost:3001' }), 'ws://localhost:3001/ws');
  assert.equal(gameServerUrl(page('wss://swords-and-sorcery.onrender.com/ws'), { protocol: 'https:', host: 'captainfredric.github.io' }), 'wss://swords-and-sorcery.onrender.com/ws');
});
