// The Sword Technique slot through the real Armory, then into the Practice yard and back: the card is clicked, the
// setting is saved, the yard's knight carries the technique, and a reload still has it. Real Chrome, real clicks.
//
//   node scripts/swordsmanship-armory-browser.mjs [--out dir]
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { createGameServer } from '../server/src/server.mjs';
import { CdpClient } from './browser-cdp.mjs';

const args = process.argv.slice(2);
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : join('output', 'swordsmanship-armory');
const bin = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
await mkdir(out, { recursive: true });
const game = createGameServer({ host: '127.0.0.1', port: 0 });
await game.start();
const url = `http://127.0.0.1:${game.address().port}`;
const profile = await mkdtemp(join(tmpdir(), 'castleward-armory-'));
const chrome = spawn(bin, ['--headless=new', '--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--remote-allow-origins=*', '--window-size=1440,900',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let port = null;
chrome.stderr.on('data', (d) => { const m = String(d).match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/); if (m) port = Number(m[1]); });
const poll = async (fn, what, ms = 90000) => { const until = Date.now() + ms; while (Date.now() < until) { const v = await fn().catch(() => null); if (v) return v; await sleep(120); } throw new Error(`timed out: ${what}`); };
let cdp;
const facts = {};
try {
  await poll(async () => port, 'chrome');
  const page = await poll(async () => (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'), 'page');
  cdp = new CdpClient(page.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const ev = async (expression) => { const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, 30000); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result?.value; };
  const shot = async (name) => { const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 }); await writeFile(join(out, name), Buffer.from(r.data, 'base64')); };
  const click = async (selector) => { const at = await ev(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (!at) throw new Error(`nothing at ${selector}`);
    for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, ...at, button: 'left', clickCount: 1 }); await sleep(350); };
  const open = async () => { await cdp.send('Page.navigate', { url: `${url}/?debug` }); await poll(() => ev("document.querySelector('#loading-veil')?.classList.contains('done')"), 'menu', 120000); await ev("document.querySelector('[data-tutorial-onboarding-skip]')?.click()"); await sleep(500); };
  await open();
  facts.atFirst = await ev("window.__ssSettings.settings.get('loadout.technique')");
  await click('#armory-button');
  await sleep(900);
  await click('#armory-slot-technique');
  await sleep(600);
  facts.cards = await ev("[...document.querySelectorAll('#armory-techniques [data-technique]')].map((c) => ({ id: c.dataset.technique, name: c.querySelector('.spell-name')?.textContent, facts: c.querySelector('em')?.textContent, equipped: c.classList.contains('equipped'), disabled: c.getAttribute('aria-disabled') === 'true' }))");
  await shot('armory-technique-slot.jpg');
  await click('#armory-techniques [data-technique="whirl_like_the_wind"]');
  await sleep(700);
  facts.afterClick = await ev("({ setting: window.__ssSettings.settings.get('loadout.technique'), plaque: document.querySelector('#plaque-name-technique')?.textContent, host: window.__ssLink.local.techniqueId })");
  await shot('armory-whirl-equipped.jpg');
  // into the yard: the knight there carries it
  await ev("window.__ssLink.startInspectionPractice('Armory Check','castleward'); window.__ssLink.arenaReady(true)");
  await poll(() => ev('Boolean(window.__ssRuntime?.playing && window.__ssRuntime?.localAuth)'), 'practice', 120000);
  await sleep(800);
  facts.inPractice = await ev("({ technique: window.__ssRuntime.localAuth.technique, tileShown: !document.querySelector('#technique-ability').hidden, tile: document.querySelector('#technique-ability em')?.textContent })");
  await ev("document.querySelector('#practice-drawer-close')?.click()");
  await sleep(400);
  await shot('practice-hud-technique-tile.jpg');
  // a reload: still chosen
  await open();
  facts.afterReload = await ev("({ setting: window.__ssSettings.settings.get('loadout.technique'), host: window.__ssLink.local.techniqueId })");
  console.log('[ARMORY]', JSON.stringify(facts, null, 1));
  await writeFile(join(out, 'armory.json'), JSON.stringify(facts, null, 1));
  if (facts.afterClick.setting !== 'whirl_like_the_wind' || facts.inPractice.technique !== 'whirl_like_the_wind' || facts.afterReload.setting !== 'whirl_like_the_wind') throw new Error('the technique was not carried');
} catch (error) {
  console.error('[ARMORY FAIL]', error.stack);
  process.exitCode = 1;
} finally {
  cdp?.close(); chrome.kill('SIGTERM'); await game.stop?.(); await sleep(300); await rm(profile, { recursive: true, force: true }).catch(() => {});
  process.exit(process.exitCode ?? 0);
}
