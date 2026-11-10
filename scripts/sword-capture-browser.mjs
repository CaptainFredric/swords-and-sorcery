// Real-browser recordings of the ordinary sword loop. A real game server, a real Chrome (GPU, Metal on macOS), the
// Practice inspection yard in split view (the knight's own first person beside a third-person camera on him), the
// attack held through the real input path (the mouse button on desktop, the ATTACK touch button on a landscape
// phone), and every rendered frame taken from the compositor (CDP screencast). Frames, a GIF and a contact sheet are
// written, with the authoritative timeline (the server's swings and contacts) beside them.
//
//   node scripts/sword-capture-browser.mjs [--device desktop|phone] [--chains 10] [--dummy] [--out dir] [--label x]
//
// GIFs and sheets need ImageMagick (magick); frames are kept either way.

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { createGameServer } from '../server/src/server.mjs';
import { CdpClient } from './browser-cdp.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const flag = (name) => args.includes(name);
const device = option('--device', 'desktop');
const chains = Number(option('--chains', '10'));
const label = option('--label', `${device}-${chains}-chains`);
const out = option('--out', join('output', 'sword-capture', label));
const query = option('--query', '');
const bin = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const size = device === 'phone' ? { width: 844, height: 390, scale: 2, mobile: true } : { width: 1280, height: 720, scale: 1, mobile: false };
const HOLD_SEC = chains * 2.08 - 0.15;

await mkdir(join(out, 'frames'), { recursive: true });
const game = createGameServer({ host: '127.0.0.1', port: 0 });
await game.start();
const url = `http://127.0.0.1:${game.address().port}`;
const profile = await mkdtemp(join(tmpdir(), 'castleward-sword-capture-'));
const chrome = spawn(bin, ['--headless=new', '--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  '--remote-allow-origins=*', `--window-size=${size.width},${size.height}`, '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
{ stdio: ['ignore', 'ignore', 'pipe'] });
let port = null;
chrome.stderr.on('data', (d) => { const m = String(d).match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/); if (m) port = Number(m[1]); });
let cdp;
let stage = 'chrome';
const poll = async (fn, what, ms = 40000) => {
  stage = what;
  const until = Date.now() + ms;
  while (Date.now() < until) { const v = await fn().catch(() => null); if (v) return v; await sleep(80); }
  throw new Error(`timed out: ${what}`);
};
const evaluate = async (expression) => {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result?.value;
};

try {
  await poll(async () => port, 'chrome debugger port');
  const page = await poll(async () => (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'), 'page target');
  cdp = new CdpClient(page.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  cdp.on('Runtime.exceptionThrown', (e) => console.warn('[PAGE EXCEPTION]', e.exceptionDetails?.exception?.description?.slice(0, 300) ?? e.exceptionDetails?.text));
  cdp.on('Runtime.consoleAPICalled', (e) => { if (e.type === 'error') console.warn('[PAGE ERROR]', e.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300)); });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: size.scale, mobile: size.mobile, ...(size.mobile ? { screenOrientation: { type: 'landscapePrimary', angle: 90 } } : {}) });
  if (size.mobile) await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp.send('Page.navigate', { url: `${url}/?debug${query ? `&${query}` : ''}` });
  await poll(() => evaluate("document.querySelector('#loading-veil')?.classList.contains('done')"), 'menu', 60000)
    .catch(async (e) => { console.warn('[PAGE STATE]', await evaluate("JSON.stringify({veil: document.querySelector('#loading-veil')?.className, ready: document.readyState, title: document.title, text: document.body?.innerText?.slice(0, 200)})").catch((x) => x.message)); throw e; });
  await evaluate("document.querySelector('[data-tutorial-onboarding-skip]')?.click()");
  await evaluate("window.__ssLink.startInspectionPractice('Sword Audit','castleward'); window.__ssLink.arenaReady(true)");
  await poll(() => evaluate('Boolean(window.__ssLink?.playingLocally && window.__ssRuntime?.playing && window.__ssRuntime?.localAuth)'), 'inspection practice running', 60000);
  await sleep(1200);
  await evaluate("document.querySelector('#practice-drawer-close')?.click()");
  const dummy = flag('--dummy');
  if (dummy) {
    await evaluate("window.__ssLink.practiceSpawnDummy('PASSIVE')");
    await sleep(600);
  }
  // the knight faces down an open stretch (and the dummy, if any, 1.9 m ahead); the third-person camera beside him
  await evaluate(`(() => {
    const rt = window.__ssRuntime, link = window.__ssLink, me = rt.localAuth;
    const dummy = rt.latestSnapshot.players.find((p) => p.actorKind === 'dummy');
    if (dummy) link.stageInspectionActor({ actorId: dummy.id, position: { x: me.position.x, y: me.position.y, z: me.position.z - 1.9 }, vitals: true, ai: false });
    rt.input.yaw = 0; rt.input.pitch = 0;
    link.stageInspectionActor({ actorId: rt.playerId, position: dummy ? 'face_target' : undefined });
    rt.setInspectionSplit(true);
    const p = rt.localAuth.position;
    // (front-left of him, at chest height, looking back at him: both cuts' arcs and the chop read from here)
    rt.flyPose = { position: { x: p.x - 2.6, y: p.y + 1.7, z: p.z - 2.4 }, yaw: Math.atan2(-2.6, -2.4) + Math.PI, pitch: -0.12 };
    rt.syncInspection();
  })()`);
  // real input: focus the canvas (pointer lock, as a player clicks in), then the button
  await cdp.send('Page.bringToFront');
  const centre = await evaluate("(() => { const b = window.__ssRuntime.renderer.domElement.getBoundingClientRect(); return { x: b.x + b.width * 0.25, y: b.y + b.height * 0.5 }; })()");
  if (!size.mobile) {
    for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, ...centre, button: 'left', clickCount: 1 });
    await poll(() => evaluate('window.__ssRuntime.input.enabled'), 'input enabled');
  }
  // the authoritative timeline and the frames' clock, recorded in the page
  await evaluate(`(() => {
    const rt = window.__ssRuntime;
    window.__swordRun = { events: [], frames: [] };
    rt.socket.on('events', (batch) => { for (const e of batch.events) if (['swordSwing','swordHit','swordMiss','attackStarted','attackEnded','block','parry'].includes(e.type) && e.playerId === rt.playerId || e.attackerId === rt.playerId) window.__swordRun.events.push({ type: e.type, strike: e.strikeIndex, at: e.at }); });
    const tick = () => { const a = rt.localAuth; window.__swordRun.frames.push({ wall: performance.now(), server: rt.socket.serverNow(), active: a?.attackActive, startedAt: a?.attackStartedAt, fps: rt.fps }); if (window.__swordRun.frames.length < 4000) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  })()`);
  const frames = [];
  cdp.on('Page.screencastFrame', async ({ data, sessionId, metadata }) => {
    frames.push({ data, t: metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: size.width * size.scale, maxHeight: size.height * size.scale, everyNthFrame: 1 });
  await sleep(500);
  const pressedAt = Date.now() / 1000;
  if (size.mobile) {
    const button = await evaluate("(() => { const b = document.querySelector('[data-action=attack]')?.getBoundingClientRect(); return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null; })()");
    if (!button) throw new Error('no ATTACK touch button');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...button, id: 1 }] });
    await sleep(HOLD_SEC * 1000);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...centre, button: 'left', buttons: 1, clickCount: 1 });
    await sleep(HOLD_SEC * 1000);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...centre, button: 'left', buttons: 0, clickCount: 1 });
  }
  await sleep(1400);
  await cdp.send('Page.stopScreencast');
  const run = await evaluate('window.__swordRun');
  const swings = run.events.filter((e) => e.type === 'swordSwing');
  const fps = run.frames.length > 2 ? (run.frames.length - 1) / ((run.frames.at(-1).wall - run.frames[0].wall) / 1000) : 0;
  const summary = { device, chains, label, pressedAt, frames: frames.length, renderFps: +fps.toFixed(1), swings: swings.length,
    strikes: swings.map((s) => s.strike + 1).join(''), hits: run.events.filter((e) => e.type === 'swordHit').length, events: run.events };
  for (let i = 0; i < frames.length; i += 1) await writeFile(join(out, 'frames', `f${String(i).padStart(5, '0')}.jpg`), Buffer.from(frames[i].data, 'base64'));
  await writeFile(join(out, 'timeline.json'), JSON.stringify(summary, null, 1));
  console.log('[SWORD CAPTURE]', JSON.stringify({ ...summary, events: undefined }));
  if (spawnSync('magick', ['-version']).status === 0 && frames.length) {
    const width = device === 'phone' ? 640 : 720;
    // the GIF at ~20 fps (every third screencast frame of ~60), the sheet one frame in nine
    const pick = (step) => frames.map((_, i) => i).filter((i) => i % step === 0).map((i) => join(out, 'frames', `f${String(i).padStart(5, '0')}.jpg`));
    spawnSync('magick', ['-delay', '5', '-loop', '0', ...pick(3), '-resize', `${width}x`, '-layers', 'Optimize', join(out, `${label}.gif`)], { stdio: 'inherit' });
    spawnSync('magick', ['montage', ...pick(9).slice(0, 48), '-tile', '6x', '-geometry', `${Math.round(width / 2.4)}x+2+2`, join(out, `${label}-sheet.jpg`)], { stdio: 'inherit' });
  }
} catch (error) {
  console.error('[SWORD CAPTURE FAIL]', stage, error.stack);
  process.exitCode = 1;
} finally {
  cdp?.close();
  chrome.kill('SIGTERM');
  await game.stop?.();
  await sleep(300);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
  process.exit(process.exitCode ?? 0);
}
