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

test('front-door copy stays player-facing instead of exposing implementation notes or forced medieval jargon', async () => {
  const html = await read('client/index.html');
  const menuSlice = html.slice(html.indexOf('id="menu"'), html.indexOf('id="lobby"'));

  assert.doesNotMatch(menuSlice, /No second tab|No second device|authoritative|CURRENT GROUND|CALL YOUR RIVALS|MUSTERING|Every route is reachable on foot/i);
  assert.match(menuSlice, /Find a public match/i);
  assert.match(menuSlice, /Fight a bot or practice/i);
  assert.match(menuSlice, /Create or join a room/i);
});

test('Practice controls collapse out of the combat view while pointer lock is active', async () => {
  const css = await read('client/styles.css');
  assert.match(css, /\.hud\.pointer-locked\s+\.practice-tools\s*\{/);
  assert.match(css, /\.hud\.pointer-locked\s+\.practice-tools\s+button\s*\{[^}]*display\s*:\s*none/i);
  assert.match(css, /\.hud\.pointer-locked\s+\.practice-tools\s+small\s*\{/);
});
