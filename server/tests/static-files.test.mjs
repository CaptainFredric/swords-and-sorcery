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
