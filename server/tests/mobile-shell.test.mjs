import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import * as serverModule from '../src/server.mjs';

const ROOT = path.resolve(process.cwd());

async function read(file) {
  return readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
}

test('the page is set up for phones: safe-area viewport, home-screen app, landscape manifest', async () => {
  const html = await read('client/index.html');
  assert.match(html, /name=["']viewport["'][^>]*viewport-fit=cover/);
  assert.match(html, /rel=["']manifest["']\s+href=["']\/client\/manifest\.webmanifest["']/);
  assert.match(html, /href=["']\/client\/mobile\.css["']/);
  const manifest = JSON.parse(await read('client/manifest.webmanifest'));
  assert.equal(manifest.orientation, 'landscape');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.display, 'fullscreen');
});

test('the server hands the manifest out with its own content type', () => {
  assert.equal(serverModule.resolveStaticFile(ROOT, '/client/manifest.webmanifest'), path.join(ROOT, 'client', 'manifest.webmanifest'));
  assert.match(serverModule.mimeFor('client/manifest.webmanifest'), /^application\/manifest\+json/);
});

test('portrait phones are asked to turn to landscape, with a way to carry on', async () => {
  const html = await read('client/index.html');
  const css = await read('client/mobile.css');
  assert.match(html, /id=["']rotate-prompt["']/);
  assert.match(html, /id=["']rotate-dismiss["']/);
  assert.match(css, /@media \(orientation: portrait\) and \(hover: none\) and \(pointer: coarse\)/);
  assert.match(css, /body:not\(\.portrait-ok\) \.rotate-prompt/);
});

test('How to Play lists touch controls on touch devices and Sprint on the keyboard', async () => {
  const html = await read('client/index.html');
  const how = html.slice(html.indexOf('id="how-panel"'), html.indexOf('id="lobby"'));
  assert.match(how, /class=["']controls-grid key-controls-grid["'][\s\S]*SHIFT[\s\S]*Sprint/);
  assert.match(how, /class=["']controls-grid touch-controls-grid["'][\s\S]*LEFT THUMB[\s\S]*RIGHT THUMB/);
  assert.match(html, /STAMINA/);
});

test('touch play enters the arena without pointer lock and leaves it through the same path', async () => {
  const input = await read('client/game/InputController.mjs');
  const runtime = await read('client/game/GameRuntime.mjs');
  const main = await read('client/main.mjs');
  assert.match(input, /requestPointerLock\(\) \{[\s\S]*if \(this\.touch\) this\.#setTouchFocus\(true\)/);
  assert.match(input, /releaseFocus\(\) \{/);
  assert.match(runtime, /enableTouch\(\) \{[\s\S]*new TouchControls/);
  assert.match(runtime, /!preservePointerLock\) this\.input\.releaseFocus\(\)/);
  assert.match(main, /isTouchPrimary\(\)/);
  assert.match(main, /runtime\?\.releasePointer\(\)/);
});
