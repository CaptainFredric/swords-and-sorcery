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

test('Pages workflow publishes the game client (and the landing page at /about/), pointed at the game server', async () => {
  const workflow = await read('.github/workflows/pages.yml');
  assert.match(workflow, /pages:\s*write/);
  assert.match(workflow, /id-token:\s*write/);
  assert.match(workflow, /actions\/configure-pages@v5[\s\S]*?enablement:\s*true/);
  assert.match(workflow, /cp -R client shared _site\//);
  assert.match(workflow, /name=\\"ss-game-server\\"/);
  assert.match(workflow, /cp -R site\/\. _site\/about\//);
  assert.match(workflow, /actions\/upload-pages-artifact@v3[\s\S]*?path:\s*_site/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  // a page served from a sub-path finds its own files: nothing in it points at the site's root
  const html = await read('client/index.html');
  assert.doesNotMatch(html, /(href|src)=["']\/client\//);
});
