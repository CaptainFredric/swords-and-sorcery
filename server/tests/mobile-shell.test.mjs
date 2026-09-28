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
  // page-relative, so the same page works at the server's root and from a sub-path (GitHub Pages)
  assert.match(html, /rel=["']manifest["']\s+href=["']client\/manifest\.webmanifest["']/);
  assert.match(html, /rel=["']apple-touch-icon["']\s+href=["']client\/assets\/icons\/icon-180\.png["']/);
  assert.match(html, /href=["']client\/mobile\.css["']/);
  const manifest = JSON.parse(await read('client/manifest.webmanifest'));
  assert.equal(manifest.orientation, 'landscape');
  assert.equal(manifest.start_url, '../', 'the app root, relative to the manifest in /client/');
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'maskable'));
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192'));
  assert.equal(manifest.display, 'fullscreen');
});

test('the server hands the manifest out with its own content type', () => {
  assert.equal(serverModule.resolveStaticFile(ROOT, '/client/manifest.webmanifest'), path.join(ROOT, 'client', 'manifest.webmanifest'));
  assert.match(serverModule.mimeFor('client/manifest.webmanifest'), /^application\/manifest\+json/);
});

test('portrait phones are asked to turn to landscape, can lie the game sideways, or carry on', async () => {
  const html = await read('client/index.html');
  const css = await read('client/mobile.css');
  const styles = await read('client/styles.css');
  assert.match(html, /id=["']rotate-prompt["']/);
  assert.match(html, /id=["']rotate-sideways["']/);
  assert.match(html, /id=["']rotate-dismiss["']/);
  // the shell's own shape decides (it can lie sideways on a portrait screen), on touch screens only
  assert.match(styles, /#game-shell \{ container: app \/ size; \}/);
  assert.match(css, /@media \(hover: none\) and \(pointer: coarse\) \{\s*@container app \(orientation: portrait\)/);
  assert.match(css, /body:not\(\.portrait-ok\) \.rotate-prompt/);
  assert.match(css, /html\[data-turn="90"\] #game-shell \{ transform: translateX\(var\(--turn-h\)\) rotate\(90deg\); \}/);
  assert.match(css, /html\[data-turn="-90"\] #game-shell \{ transform: translateY\(var\(--turn-w\)\) rotate\(-90deg\); \}/);
});

test('touch screens keep a pull on the game from refreshing the page an app holds it in', async () => {
  const main = await read('client/main.mjs');
  const guard = await read('client/ui/pullGuard.mjs');
  const css = await read('client/mobile.css');
  assert.match(main, /function useTouchUi\(\) \{[\s\S]*?guardPullToRefresh\(\);[\s\S]*?\n\}/, 'turned on with the touch UI');
  // drags are claimed (not passively watched), except where a list really scrolls or a field takes them
  assert.match(guard, /addEventListener\('touchmove'[\s\S]*?preventDefault\(\)[\s\S]*?\{ passive: false \}/);
  assert.match(guard, /closest\?\.\('input, textarea, select'\)/);
  // the page rests one pixel down, the game fixed in place above it
  assert.match(guard, /scrollTop = 1/);
  assert.match(css, /html\.pull-guard body \{ height: calc\(100% \+ 1px\); \}/);
  assert.match(css, /html\.pull-guard #game-shell \{ position: fixed; left: 0; top: 0; \}/);
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
