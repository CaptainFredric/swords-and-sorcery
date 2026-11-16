// Which Slash_1 the game really plays, read from the live animator in real Chrome (not from the GLB on disk): the
// hand.R rotation the in-game clip holds at a moment of the follow-through, against the model's own Slash_1 and the
// PR #457 sidecar's. Third and first person.
//   node scripts/spellblade-composition-browser.mjs [--at 0.533]
import { mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { createGameServer } from '../server/src/server.mjs';
import { CdpClient } from './browser-cdp.mjs';
import { loadGlb, localPose } from './lib/glbPose.mjs';

const atFlag = process.argv.indexOf('--at');
const at = atFlag >= 0 ? Number(process.argv[atFlag + 1]) : 0.533;
const dir = new URL('../client/assets/characters/spellblade/', import.meta.url).pathname;
const quatOf = (path, clip, bone) => { const m = loadGlb(path); if (!m.clips.has(clip)) return null; return localPose(m, [{ clip, time: at, weight: 1 }])[m.byName.get(bone)].r.map((v) => +v.toFixed(4)); };
const expected = {
  model: quatOf(`${dir}spellblade.glb`, 'Slash_1', 'hand.R'),
  sidecar: quatOf(`${dir}spellblade-motion.glb`, 'Slash_1', 'hand.R'),
  fpModel: quatOf(`${dir}spellblade-fp.glb`, 'Slash_1', 'hand.R'),
};
const game = createGameServer({ host: '127.0.0.1', port: 0 });
await game.start();
const url = `http://127.0.0.1:${game.address().port}`;
const bin = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = await mkdtemp(join(tmpdir(), 'castleward-composition-'));
const chrome = spawn(bin, ['--headless=new', '--use-angle=metal', '--remote-allow-origins=*', '--window-size=1280,720', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let port = null;
chrome.stderr.on('data', (d) => { const m = String(d).match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/); if (m) port = Number(m[1]); });
const poll = async (fn, what, ms = 120000) => { const until = Date.now() + ms; while (Date.now() < until) { const v = await fn().catch(() => null); if (v) return v; await sleep(150); } throw new Error(`timed out: ${what}`); };
try {
  await poll(async () => port, 'chrome');
  const page = await poll(async () => (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'), 'page');
  const cdp = new CdpClient(page.webSocketDebuggerUrl); await cdp.connect(); await cdp.send('Runtime.enable');
  const ev = async (expression) => { const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, 60000); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result?.value; };
  await cdp.send('Page.navigate', { url: `${url}/?debug` });
  await poll(() => ev("document.querySelector('#loading-veil')?.classList.contains('done')"), 'menu');
  await ev("document.querySelector('[data-tutorial-onboarding-skip]')?.click(); window.__ssLink.startInspectionPractice('Composition','castleward'); window.__ssLink.arenaReady(true)");
  await poll(() => ev('Boolean(window.__ssRuntime?.remotePlayers?.self?.visualInstance?.animator)'), 'third-person knight');
  const read = (path) => ev(`(() => { const a = ${path}; const clip = a?.actions?.get('Slash_1')?.getClip(); if (!clip) return null;
    const track = clip.tracks.find((t) => /hand[._]?R\\.quaternion$/.test(t.name)); if (!track) return { names: clip.tracks.slice(0, 6).map((t) => t.name) };
    const v = track.createInterpolant().evaluate(${at}); return { track: track.name, value: Array.from(v).map((x) => +x.toFixed(4)), manifestOverrides: null }; })()`);
  const tp = await read('window.__ssRuntime.remotePlayers.self.visualInstance.animator');
  const fp = await poll(() => read('window.__ssRuntime.weapon?.productionInstance?.animator'), 'first-person arms', 30000).catch(() => null);
  const sameAs = (v, ref) => ref && v && Math.max(...v.map((x, i) => Math.min(Math.abs(x - ref[i]), Math.abs(x + ref[i])))) < 2e-3;
  const verdict = {
    at, thirdPerson: tp, firstPerson: fp, expected,
    thirdPersonIs: sameAs(tp?.value, expected.model) ? "the model's own Slash_1" : sameAs(tp?.value, expected.sidecar) ? "the PR #457 sidecar's Slash_1" : 'neither',
    firstPersonIs: sameAs(fp?.value, expected.fpModel) ? "the model's own Slash_1" : 'other',
  };
  console.log('[COMPOSITION]', JSON.stringify(verdict));
  cdp.close();
} finally { chrome.kill('SIGTERM'); await game.stop?.(); await sleep(300); await rm(profile, { recursive: true, force: true }).catch(() => {}); process.exit(0); }
