import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(path) {
  return readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
}

test('GitHub Pages front door identifies the game and does not pretend multiplayer is already live', async () => {
  const html = await read('site/index.html');
  assert.match(html, /Swords\s*&\s*Sorcery!/i);
  assert.match(html, /First to 10/i);
  assert.match(html, /multiplayer build/i);
  assert.match(html, /github\.com\/CaptainFredric\/swords-and-sorcery/i);
  assert.doesNotMatch(html, /actual gameplay screenshot/i);
});

test('Pages workflow enables Pages and deploys only the dedicated static site directory', async () => {
  const workflow = await read('.github/workflows/pages.yml');
  assert.match(workflow, /pages:\s*write/);
  assert.match(workflow, /id-token:\s*write/);
  assert.match(workflow, /actions\/configure-pages@v5[\s\S]*?enablement:\s*true/);
  assert.match(workflow, /actions\/upload-pages-artifact@v3/);
  assert.match(workflow, /path:\s*site/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
});
