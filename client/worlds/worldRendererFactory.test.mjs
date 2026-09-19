import test from 'node:test';
import assert from 'node:assert/strict';
import { rendererKeyForWorld } from './WorldRendererFactory.mjs';

test('world renderer selection is explicit', () => {
  assert.equal(rendererKeyForWorld('castleward'), 'castleward');
  assert.equal(rendererKeyForWorld('shattered-keep'), 'shattered-keep');
  assert.throws(() => rendererKeyForWorld('unknown'), /Unsupported world/);
});
