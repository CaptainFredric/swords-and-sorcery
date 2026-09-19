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

test('main menu exposes multiplayer, solo and private flows without presenting a web-dashboard card stack', async () => {
  const html = await read('client/index.html');
  assert.match(html, /id=["']quick-play["']/);
  assert.match(html, /id=["']solo-button["']/);
  assert.match(html, /id=["']private-button["']/);
  assert.match(html, /id=["']bot-duel["']/);
  assert.match(html, /id=["']practice-mode["']/);
  assert.match(html, /id=["']menu-spellblade["']/);
});

test('front-door copy identifies Castleward instead of the retired default Keep setting', async () => {
  const html = await read('client/index.html');
  assert.match(html, /CASTLEWARD/i);
  const menuSlice = html.slice(html.indexOf('id="menu"'), html.indexOf('id="hud"'));
  assert.doesNotMatch(menuSlice, /THE SHATTERED KEEP/i);
});

test('Practice tools collapse to a small Esc hint while arena pointer lock is active', async () => {
  const html = await read('client/index.html');
  const css = await read('client/styles.css');
  const hud = await read('client/ui/HUD.mjs');
  assert.match(html, /class=["'][^"']*practice-compact[^"']*["']/i);
  assert.match(html, /ESC FOR TOOLS/i);
  assert.match(css, /\.hud\.pointer-locked\s+\.practice-tools/);
  assert.match(css, /\.hud\.pointer-locked[\s\S]*\.practice-expanded/);
  assert.match(hud, /classList\.toggle\(['"]pointer-locked['"],\s*locked\)/);
});
