import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(path) {
  return readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
}

test('Render blueprint uses the free web-service plan and waits for CI before deploy', async () => {
  const blueprint = await read('render.yaml');

  assert.match(blueprint, /type:\s*web/);
  assert.match(blueprint, /runtime:\s*docker/);
  assert.match(blueprint, /plan:\s*free/);
  assert.match(blueprint, /healthCheckPath:\s*\/health/);
  assert.match(blueprint, /autoDeployTrigger:\s*checksPass/);
  assert.match(blueprint, /HOST[\s\S]*?0\.0\.0\.0/);
});

test('README exposes an explicit one-click Render deploy for this repository', async () => {
  const readme = await read('README.md');
  assert.match(
    readme,
    /https:\/\/render\.com\/deploy\?repo=https:\/\/github\.com\/CaptainFredric\/swords-and-sorcery/
  );
  assert.match(readme, /free web service/i);
  assert.match(readme, /cold start/i);
});

test('Pages points at the verified public multiplayer deployment', async () => {
  const config = await read('site/config.js');
  assert.match(
    config,
    /SWORDS_SORCERY_PLAY_URL\s*=\s*['"]https:\/\/swords-and-sorcery\.onrender\.com['"]/
  );
});

test('manual public verifier fingerprints the current grounded Castleward solo and first-person build', async () => {
  const workflow = await read('.github/workflows/public-render-check.yml');
  const capture = await read('scripts/capture-public-arena.mjs');

  assert.match(workflow, /FIRST_PERSON_WEAPON_SCALE/);
  assert.match(workflow, /0\\\.74|0\.74/);
  assert.match(workflow, /Find a public match/i);
  assert.match(workflow, /CLICK ARENA TO RESUME/i);
  assert.match(workflow, /ESC FOR TOOLS/i);
  assert.match(workflow, /castlewardTerrain\.mjs/i);
  assert.match(workflow, /buildCastlewardTerrainSkirts/);
  assert.match(workflow, /playability\.css/i);
  assert.match(workflow, /practice-tools \.practice-tools-locked-hint/);
  assert.match(workflow, /live-main\.mjs/);
  assert.match(workflow, /live-game-socket\.mjs/);
  assert.match(workflow, /ENTER ARENA/i);
  assert.match(workflow, /arenaReady/);
  assert.match(workflow, /! grep -qi 'kit-mark'/i);
  assert.match(workflow, /! grep -qi 'world-note'/i);
  assert.doesNotMatch(workflow, /yawTowardKeep/);

  assert.match(capture, /public-game-menu\.png/);
  assert.match(capture, /public-game-practice\.png/);
  assert.match(capture, /public-game-practice-dummy\.png/);
  assert.match(capture, /public-game-bot-duel-waiting\.png/);
  assert.match(capture, /public-game-bot-duel\.png/);
  assert.match(capture, /public-game-ffa-waiting\.png/);
  assert.match(capture, /trustedClick/);
  assert.match(capture, /pointerLocked/);
  assert.match(capture, /BOT_DUEL[\s\S]*WAITING|WAITING[\s\S]*BOT_DUEL/i);
  assert.match(capture, /Castleward|CASTLEWARD/);
  assert.match(workflow, /public-game-bot-duel-waiting\.png/);
});

test('pull requests capture front and rotated Spellblade browser evidence', async () => {
  const workflow = await read('.github/workflows/visual-review.yml').catch(() => '');
  const capture = await read('scripts/capture-public-arena.mjs');

  assert.match(workflow, /pull_request/);
  assert.match(workflow, /client\/game\/\*\*/);
  assert.match(workflow, /spellblade-visual-review/);
  assert.match(workflow, /capture-public-arena\.mjs/);
  assert.match(capture, /trustedDrag/);
  assert.match(capture, /public-game-menu-back\.png/);
  assert.match(capture, /waitForMenuScene/);
  assert.match(capture, /menuCanvasCount\s*===\s*1/);
});
