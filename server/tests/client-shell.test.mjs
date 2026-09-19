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

test('front door prioritizes title, play choices and the Spellblade over secondary combat annotations', async () => {
  const html = await read('client/index.html');
  const frontDoor = html.slice(html.indexOf('id="menu-world"'), html.indexOf('id="solo-menu"'));

  assert.match(frontDoor, /id=["']menu-spellblade["']/);
  assert.match(frontDoor, /id=["']quick-play["']/);
  assert.doesNotMatch(frontDoor, /class=["'][^"']*kit-mark/i);
  assert.doesNotMatch(frontDoor, /class=["'][^"']*world-note/i);
});

test('Practice controls collapse out of the combat view while pointer lock is active', async () => {
  const html = await read('client/index.html');
  const css = await read('client/playability.css');
  assert.match(html, /href=["']\/client\/playability\.css["']/i);
  assert.match(css, /\.hud\.pointer-locked\s+\.practice-tools\s*\{/);
  assert.match(css, /\.hud\.pointer-locked\s+\.practice-tools\s+button\s*\{[^}]*display\s*:\s*none/i);
  assert.match(css, /\.hud\.pointer-locked\s+\.practice-tools\s+small\s*\{/);
});

test('Practice tool hint describes the current cursor state instead of telling an already-unlocked player to press Esc', async () => {
  const html = await read('client/index.html');
  const css = await read('client/playability.css');
  const practiceSlice = html.slice(html.indexOf('id="practice-overlay"'), html.indexOf('id="death-card"'));

  assert.match(practiceSlice, /class=["']practice-tools-unlocked-hint["'][^>]*>CLICK ARENA TO RESUME</i);
  assert.match(practiceSlice, /class=["']practice-tools-locked-hint["'][^>]*>ESC FOR TOOLS</i);
  assert.match(css, /\.practice-tools-locked-hint\s*\{[^}]*display\s*:\s*none/i);
  assert.match(css, /\.hud\.pointer-locked\s+\.practice-tools-unlocked-hint\s*\{[^}]*display\s*:\s*none/i);
  assert.match(css, /\.hud\.pointer-locked\s+\.practice-tools-locked-hint\s*\{[^}]*display\s*:\s*block/i);
});
