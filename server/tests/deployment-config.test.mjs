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
