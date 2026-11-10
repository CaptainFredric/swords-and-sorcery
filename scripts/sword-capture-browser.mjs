// Real-browser recordings of the ordinary sword loop. A real game server, a real Chrome (GPU, Metal on macOS), the
// Practice inspection yard in split view (the knight's own first person beside a third-person camera on him), the
// attack held through the real input path (the mouse button on desktop, the ATTACK touch button on a landscape
// phone), and the canvas recorded in the page (a WebM at the render rate, a still every third frame and at each server
// contact). A GIF, a contact sheet and the contacts as shown are written, with the authoritative timeline beside them.
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
// desktop: the knight's own view and the third-person camera side by side, 960x720 each; a landscape phone: his own view
const size = device === 'phone' ? { width: 844, height: 390, scale: 2, mobile: true, split: false } : { width: 1920, height: 720, scale: 1, mobile: false, split: true };
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
const poll = async (fn, what, ms = 90000) => {
  stage = what;
  if (process.env.CAPTURE_DEBUG) console.log('[STAGE]', new Date().toISOString(), what);
  const until = Date.now() + ms;
  while (Date.now() < until) { const v = await fn().catch(() => null); if (v) return v; await sleep(120); }
  throw new Error(`timed out: ${what}`);
};
const evaluate = async (expression, timeoutMs = 30000) => {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, timeoutMs);
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
  cdp.on('Page.javascriptDialogOpening', (e) => { console.warn('[PAGE DIALOG]', e.type, e.message); cdp.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {}); });
  cdp.on('Runtime.exceptionThrown', (e) => console.warn('[PAGE EXCEPTION]', e.exceptionDetails?.exception?.description?.slice(0, 300) ?? e.exceptionDetails?.text));
  cdp.on('Runtime.consoleAPICalled', (e) => { if (e.type === 'error') console.warn('[PAGE ERROR]', e.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300)); });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: size.scale, mobile: size.mobile, ...(size.mobile ? { screenOrientation: { type: 'landscapePrimary', angle: 90 } } : {}) });
  if (size.mobile) await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp.send('Page.navigate', { url: `${url}/?debug${query ? `&${query}` : ''}` });
  await poll(() => evaluate("document.querySelector('#loading-veil')?.classList.contains('done')", 5000), 'menu', 120000)
    .catch(async (e) => { console.warn('[PAGE STATE]', await evaluate("JSON.stringify({veil: document.querySelector('#loading-veil')?.className, ready: document.readyState, title: document.title, text: document.body?.innerText?.slice(0, 200)})").catch((x) => x.message)); throw e; });
  await evaluate("document.querySelector('[data-tutorial-onboarding-skip]')?.click()");
  await evaluate("window.__ssLink.startInspectionPractice('Sword Audit','castleward'); window.__ssLink.arenaReady(true)");
  await poll(() => evaluate('Boolean(window.__ssLink?.playingLocally && window.__ssRuntime?.playing && window.__ssRuntime?.localAuth)', 5000), 'inspection practice running', 120000);
  await sleep(1200);
  await evaluate("document.querySelector('#practice-drawer-close')?.click()");
  const dummy = flag('--dummy') || flag('--dummy-guard');
  if (dummy) {
    await evaluate("window.__ssLink.practiceSpawnDummy('PASSIVE')");
    await sleep(600);
  }
  // the knight faces down an open stretch (and the dummy, if any, 1.9 m ahead); the third-person camera beside him
  await evaluate(`(() => {
    const rt = window.__ssRuntime, link = window.__ssLink, me = rt.localAuth;
    const dummy = rt.latestSnapshot.players.find((p) => p.actorKind === 'dummy');
    if (dummy) {
      link.stageInspectionActor({ actorId: dummy.id, position: { x: me.position.x, y: me.position.y, z: me.position.z - 1.9 }, vitals: { refill: true }, ai: { suspended: true } });
      if (${flag('--dummy-guard')}) link.stageInspectionActor({ actorId: dummy.id, pose: 'guard' });
      // (kept on his feet: his vitals refilled as each chain begins, so ten chains land on him)
      // (a guarding dummy keeps the stamina his guard has left: it is meant to break)
      window.__dummyRefill = setInterval(() => link.stageInspectionActor({ actorId: dummy.id, vitals: ${flag('--dummy-guard')} ? { health: 100 } : { refill: true } }), 2080);
    }
    rt.input.yaw = 0; rt.input.pitch = 0;
    link.stageInspectionActor({ actorId: rt.playerId, position: dummy ? 'face_target' : undefined });
    rt.setInspectionSplit(${size.split});
    const p = rt.localAuth.position;
    // (in front of him and to his left, a little above, looking back at him: both cuts' arcs and the chop read here)
    const c = { x: p.x - 1.35, y: p.y + 1.65, z: p.z - 1.9 };
    rt.flyPose = { position: c, yaw: Math.atan2(-(p.x - c.x), -(p.z - c.z)), pitch: Math.atan2(p.y + 1.15 - c.y, Math.hypot(p.x - c.x, p.z - c.z)) };
    rt.syncInspection();
    // (the canvas is recorded without the page's own overlays either way; on a phone the touch buttons must stay)
    rt.setInspectionUiMode(${size.mobile} ? 'gameplay' : 'clean');
  })()`);
  // real input: focus the canvas (pointer lock, as a player clicks in), then the button
  await cdp.send('Page.bringToFront');
  const centre = await evaluate("(() => { const b = window.__ssRuntime.renderer.domElement.getBoundingClientRect(); return { x: b.x + b.width * 0.25, y: b.y + b.height * 0.5 }; })()");
  if (!size.mobile) {
    for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, ...centre, button: 'left', clickCount: 1 });
    // (a word sent to the page while its pointer lock is changing can go unanswered: let it settle first)
    await sleep(1200);
    if (process.env.CAPTURE_DEBUG) {
      for (let k = 0; k < 6; k += 1) {
        const r = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify({en: window.__ssRuntime.input.enabled, lock: !!document.pointerLockElement, fps: window.__ssRuntime.fps, vis: document.visibilityState})', returnByValue: true }, 3000).catch((e) => ({ error: e.message }));
        console.log('[DEBUG]', k, JSON.stringify(r.result?.value ?? r.error));
        await sleep(700);
      }
    }
    await poll(() => evaluate('window.__ssRuntime.input.enabled', 4000), 'input enabled');
  }
  // the authoritative timeline and the frames' clock, recorded in the page
  stage = 'timeline'; if (process.env.CAPTURE_DEBUG) console.log('[STAGE] timeline');
  await evaluate(`(() => {
    const rt = window.__ssRuntime;
    window.__swordRun = { events: [], frames: [] };
    rt.socket.on('events', (batch) => { for (const e of batch.events) if (['swordSwing','swordHit','swordMiss','attackStarted','attackEnded','block','parry'].includes(e.type) && e.playerId === rt.playerId || e.attackerId === rt.playerId) window.__swordRun.events.push({ type: e.type, strike: e.strikeIndex, at: e.at }); });
    const tick = () => { const a = rt.localAuth; window.__swordRun.frames.push({ wall: performance.now(), server: rt.socket.serverNow(), active: a?.attackActive, startedAt: a?.attackStartedAt, fps: rt.fps }); if (window.__swordRun.frames.length < 4000) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  })()`);
  // the canvas recorded in the page: a WebM at the render rate, and a JPEG every third frame for the GIF and sheet
  stage = 'recorder'; if (process.env.CAPTURE_DEBUG) console.log('[STAGE] recorder');
  await evaluate(`(() => {
    const rt = window.__ssRuntime, canvas = rt.renderer.domElement;
    const rec = window.__swordRec = { chunks: [], stills: [], n: 0, on: true };
    const stream = canvas.captureStream(60);
    rec.recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 4e6 });
    rec.recorder.ondataavailable = (e) => { if (e.data.size) rec.chunks.push(e.data); };
    rec.recorder.start(250);
    const w = ${size.split ? 960 : 844}, h = Math.round(w * canvas.height / canvas.width);
    const still = new OffscreenCanvas(w, h), g = still.getContext('2d');
    // (every third rendered frame, and the frame at each of the server's contacts; taken without holding up the next)
    let busy = false, lastContact = null, lastNow = -Infinity;
    // (the first frame drawn at or after one of the server's contacts)
    const contactNow = () => {
      const a = rt.localAuth, now = rt.socket.serverNow(), before = lastNow;
      lastNow = now;
      if (!a || !Number.isFinite(a.attackStartedAt)) return null;
      for (const c of [0.4, 1.1, 1.8]) { const at = a.attackStartedAt + c; if (before < at && now >= at) return at; }
      return null;
    };
    const grab = () => {
      if (!rec.on) return;
      requestAnimationFrame(grab);
      const contact = contactNow();
      const due = rec.n++ % 3 === 0 || (contact !== null && contact !== lastContact);
      if (!due || (busy && contact === null) || rec.stills.length >= 1400) return;
      if (contact !== null) lastContact = contact;
      busy = true;
      const at = rt.socket.serverNow();
      createImageBitmap(canvas, { resizeWidth: w, resizeHeight: h }).then((bitmap) => {
        g.drawImage(bitmap, 0, 0); bitmap.close();
        // (the crosshair, where the aim is: the first-person view's centre)
        const cx = ${size.split ? 'w / 4' : 'w / 2'}, cy = h / 2;
        g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1.5; g.beginPath();
        g.moveTo(cx - 7, cy); g.lineTo(cx + 7, cy); g.moveTo(cx, cy - 7); g.lineTo(cx, cy + 7); g.stroke();
        return still.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
      }).then((blob) => { rec.stills.push({ at, contact: contact !== null, blob }); busy = false; });
    };
    requestAnimationFrame(grab);
  })()`);
  stage = 'hold'; if (process.env.CAPTURE_DEBUG) console.log('[STAGE] hold');
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
  stage = 'collect'; if (process.env.CAPTURE_DEBUG) console.log('[STAGE] collect');
  // the recording and its stills, out of the page
  await evaluate(`(async () => { const rec = window.__swordRec; rec.on = false; rec.recorder.stop(); await new Promise((r) => setTimeout(r, 400)); })()`);
  const toBase64 = "(blob) => new Promise((r) => { const f = new FileReader(); f.onload = () => r(String(f.result).split(',')[1]); f.readAsDataURL(blob); })";
  // (in slices: a whole recording is too large for one reply)
  const bytes = await evaluate(`(() => { window.__swordRec.blob = new Blob(window.__swordRec.chunks, { type: 'video/webm' }); return window.__swordRec.blob.size; })()`);
  const parts = [];
  for (let from = 0; from < bytes; from += 2_000_000) {
    parts.push(Buffer.from(await evaluate(`(async () => (${toBase64})(window.__swordRec.blob.slice(${from}, ${from + 2_000_000})))()`, 60000), 'base64'));
  }
  await writeFile(join(out, `${label}.webm`), Buffer.concat(parts));
  const stillCount = await evaluate('window.__swordRec.stills.length');
  const frames = [];
  for (let i = 0; i < stillCount; i += 20) {
    const batch = await evaluate(`(async () => Promise.all(window.__swordRec.stills.slice(${i}, ${i + 20}).map(async (s) => ({ at: s.at, contact: s.contact, data: await (${toBase64})(s.blob) }))))()`, 60000);
    frames.push(...batch);
  }
  const run = await evaluate('window.__swordRun');
  const swings = run.events.filter((e) => e.type === 'swordSwing');
  const fps = run.frames.length > 2 ? (run.frames.length - 1) / ((run.frames.at(-1).wall - run.frames[0].wall) / 1000) : 0;
  const summary = { device, chains, label, frames: frames.length, renderFps: +fps.toFixed(1), swings: swings.length,
    strikes: swings.map((s) => s.strike + 1).join(''), hits: run.events.filter((e) => e.type === 'swordHit').length,
    stills: frames.map((f) => ({ at: +f.at.toFixed(3), contact: f.contact })), events: run.events };
  for (let i = 0; i < frames.length; i += 1) await writeFile(join(out, 'frames', `f${String(i).padStart(5, '0')}.jpg`), Buffer.from(frames[i].data, 'base64'));
  await writeFile(join(out, 'timeline.json'), JSON.stringify(summary, null, 1));
  console.log('[SWORD CAPTURE]', JSON.stringify({ ...summary, events: undefined, stills: undefined }));
  if (spawnSync('magick', ['-version']).status === 0 && frames.length) {
    const width = device === 'phone' ? 640 : 960;
    // the GIF at ~20 fps (every still: one rendered frame in three), the sheet one still in three across the first chain
    const pick = (step, n = Infinity) => frames.map((_, i) => i).filter((i) => i % step === 0).slice(0, n).map((i) => join(out, 'frames', `f${String(i).padStart(5, '0')}.jpg`));
    spawnSync('magick', ['-delay', '5', '-loop', '0', ...pick(1), '-resize', `${width}x`, '-layers', 'Optimize', '-fuzz', '3%', join(out, `${label}.gif`)], { stdio: 'inherit' });
    spawnSync('magick', ['montage', '-font', '/System/Library/Fonts/Helvetica.ttc', ...pick(2, 24), '-tile', '4x', '-geometry', `${Math.round(width / 2)}x+2+2`, join(out, `${label}-sheet.jpg`)], { stdio: 'inherit' });
    // and every contact as shown (the frame nearest each server contact), the first six
    const contacts = frames.map((f, i) => (f.contact ? join(out, 'frames', `f${String(i).padStart(5, '0')}.jpg`) : null)).filter(Boolean).slice(0, 6);
    if (contacts.length) spawnSync('magick', ['montage', '-font', '/System/Library/Fonts/Helvetica.ttc', ...contacts, '-tile', '3x', '-geometry', `${Math.round(width / 1.6)}x+2+2`, join(out, `${label}-contacts.jpg`)], { stdio: 'inherit' });
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
