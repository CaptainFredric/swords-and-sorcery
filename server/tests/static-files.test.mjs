import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import * as serverModule from '../src/server.mjs';

const ROOT = path.resolve(process.cwd());

test('static resolver only exposes client and shared assets', () => {
  assert.equal(typeof serverModule.resolveStaticFile, 'function');
  assert.equal(serverModule.resolveStaticFile(ROOT, '/'), path.join(ROOT, 'client', 'index.html'));
  assert.equal(serverModule.resolveStaticFile(ROOT, '/client/main.mjs'), path.join(ROOT, 'client', 'main.mjs'));
  assert.equal(serverModule.resolveStaticFile(ROOT, '/shared/src/map.mjs'), path.join(ROOT, 'shared', 'src', 'map.mjs'));
  assert.equal(serverModule.resolveStaticFile(ROOT, '/package.json'), null);
  assert.equal(serverModule.resolveStaticFile(ROOT, '/server/src/server.mjs'), null);
});

test('static resolver rejects encoded traversal and malformed URL encoding', () => {
  assert.equal(typeof serverModule.resolveStaticFile, 'function');
  assert.equal(serverModule.resolveStaticFile(ROOT, '/shared/%2e%2e/package.json'), null);
  assert.equal(serverModule.resolveStaticFile(ROOT, '/client/%2e%2e/.env'), null);
  assert.equal(serverModule.resolveStaticFile(ROOT, '/client/%'), null);
});

test('revisioned character assets are cached for good; other files revalidate; the page is never cached', () => {
  const glb = path.join(ROOT, 'client', 'assets', 'characters', 'spellblade', 'spellblade.glb');
  assert.match(serverModule.cacheControlFor(glb, new URLSearchParams('v=0123abcd')), /immutable/);
  assert.equal(serverModule.cacheControlFor(glb, new URLSearchParams('')), 'public, max-age=60');
  assert.equal(serverModule.cacheControlFor(path.join(ROOT, 'client', 'main.mjs'), new URLSearchParams('v=1')), 'public, max-age=60');
  assert.equal(serverModule.cacheControlFor(path.join(ROOT, 'client', 'index.html'), new URLSearchParams('')), 'no-store');
});

test('static server serves precompressed .glb.gz with content-encoding gzip when accepted', async (t) => {
  const game = serverModule.createGameServer({ port: 0, host: '127.0.0.1' });
  await game.start();
  t.after(async () => game.stop());
  const { port } = game.address();
  const http = await import('node:http');

  const rawHeaders = await new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}/client/assets/characters/spellblade/spellblade.glb`, {
      headers: { 'Accept-Encoding': 'identity' },
      agent: false,
    }, (res) => {
      res.on('data', () => {});
      res.on('end', () => resolve(res.headers));
    });
    req.on('error', reject);
  });
  assert.equal(rawHeaders['content-type'], 'model/gltf-binary');
  assert.equal(rawHeaders['content-encoding'], undefined);
  const rawLen = Number(rawHeaders['content-length']);
  assert.ok(rawLen > 2000000);

  const gzHeaders = await new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}/client/assets/characters/spellblade/spellblade.glb`, {
      headers: { 'Accept-Encoding': 'gzip' },
      agent: false,
    }, (res) => {
      res.on('data', () => {});
      res.on('end', () => resolve(res.headers));
    });
    req.on('error', reject);
  });

  assert.equal(gzHeaders['content-encoding'], 'gzip');
  assert.equal(gzHeaders['content-type'], 'model/gltf-binary');
  const gzLen = Number(gzHeaders['content-length']);
  assert.ok(gzLen < 800000, `compressed size ${gzLen} must be well under 800KB (was ${rawLen})`);
});
