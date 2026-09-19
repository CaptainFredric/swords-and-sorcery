import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(path) {
  return readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
}

test('client shell suppresses the browser default favicon request until branded medieval icon exists', async () => {
  const html = await read('client/index.html');
  assert.match(html, /<link\s+rel=["']icon["']\s+href=["']data:,["']\s*\/?>/i);
});
