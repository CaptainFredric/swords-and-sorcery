// Real-browser recordings of the ordinary sword and the Sword Techniques. A real game server, a real Chrome (GPU), the
// Practice inspection yard, the loadout set through the game's own settings (as the Armory sets it), a Training Dummy
// in front of the knight, and the real input path: the mouse button, X and Space on desktop; the ATTACK, TECHNIQUE
// and JUMP touch buttons on a landscape phone (emulated: not a real phone). The canvas is recorded in the page through
// a smaller copy (the full split-view canvas cannot be encoded at the render rate), and a quarter-speed copy of the
// recording is made from it afterwards. Beside them go the authoritative events and, frame by frame, the clip the
// third-person body was playing.
//
//   node scripts/swordsmanship-capture-browser.mjs --scenario slash-tap|slash-chain|riposte|riposte-air|whirl|whirl-gale
//        [--device desktop|phone] [--hold 2.4] [--dummy PASSIVE|GUARDING|none] [--distance 1.9] [--out dir] [--label x]
//        [--remote]   two browsers in one Shared Practice room on the server: the second one's view is what is recorded
//
// Sheets need ImageMagick (magick); frames are kept either way. (It runs on a checkout without the techniques too:
// the slash scenarios need nothing of them.)

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
const scenario = option('--scenario', 'slash-tap');
const device = option('--device', 'desktop');
const remote = flag('--remote');
const technique = scenario.startsWith('riposte') ? 'rigid_riposte' : scenario.startsWith('whirl') ? 'whirl_wind' : null;
const spell = scenario === 'whirl-gale' ? 'gale' : 'fireball';
const holdSec = Number(option('--hold', scenario === 'slash-chain' ? '2.2' : scenario === 'whirl' ? '2.6' : scenario === 'whirl-gale' ? '2.2' : '0.08'));
const afterSec = Number(option('--after', '2.2'));
const dummyMode = option('--dummy', 'PASSIVE');
const distance = Number(option('--distance', scenario.startsWith('riposte') ? '4.4' : scenario.startsWith('whirl') ? '1.5' : '1.9'));
const label = option('--label', `${device}-${scenario}${remote ? '-remote' : ''}`);
const out = option('--out', join('output', 'swordsmanship-capture', label));
const bin = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const size = device === 'phone' ? { width: 844, height: 390, scale: 2, mobile: true, split: false } : { width: 1920, height: 720, scale: 1, mobile: false, split: !remote };

await rm(join(out, 'frames'), { recursive: true, force: true });
await mkdir(join(out, 'frames'), { recursive: true });
const game = createGameServer({ host: '127.0.0.1', port: 0 });
await game.start();
const url = `http://127.0.0.1:${game.address().port}`;
let stage = 'chrome';
const pageErrors = [];
const poll = async (fn, what, ms = 90000) => {
  stage = what;
  if (process.env.CAPTURE_DEBUG) console.log('[STAGE]', what);
  const until = Date.now() + ms;
  while (Date.now() < until) { const v = await fn().catch(() => null); if (v) return v; await sleep(120); }
  throw new Error(`timed out: ${what}`);
};

// one Chrome, one page: { cdp, evaluate, close }
async function browser(name, metrics) {
  const profile = await mkdtemp(join(tmpdir(), `castleward-sword-${name}-`));
  const chrome = spawn(bin, ['--headless=new', '--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--autoplay-policy=no-user-gesture-required',
    '--remote-allow-origins=*', `--window-size=${metrics.width},${metrics.height}`, '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
  { stdio: ['ignore', 'ignore', 'pipe'] });
  let port = null;
  chrome.stderr.on('data', (d) => { const m = String(d).match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/); if (m) port = Number(m[1]); });
  await poll(async () => port, `${name}: chrome debugger port`);
  const page = await poll(async () => (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'), `${name}: page target`);
  const cdp = new CdpClient(page.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  cdp.on('Page.javascriptDialogOpening', () => { cdp.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {}); });
  cdp.on('Runtime.exceptionThrown', (e) => { const text = e.exceptionDetails?.exception?.description?.slice(0, 400) ?? e.exceptionDetails?.text; pageErrors.push(`${name}: ${text}`); console.warn('[PAGE EXCEPTION]', name, text); });
  cdp.on('Runtime.consoleAPICalled', (e) => { if (e.type === 'error') { const text = e.args.map((a) => a.value ?? a.description).join(' ').slice(0, 400); pageErrors.push(`${name}: ${text}`); console.warn('[PAGE ERROR]', name, text); } });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: metrics.width, height: metrics.height, deviceScaleFactor: metrics.scale, mobile: metrics.mobile, ...(metrics.mobile ? { screenOrientation: { type: 'landscapePrimary', angle: 90 } } : {}) });
  if (metrics.mobile) await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const evaluate = async (expression, timeoutMs = 30000) => {
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, timeoutMs);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result?.value;
  };
  await cdp.send('Page.navigate', { url: `${url}/?debug` });
  await poll(() => evaluate("document.querySelector('#loading-veil')?.classList.contains('done')", 5000), `${name}: menu`, 120000);
  await evaluate("document.querySelector('[data-tutorial-onboarding-skip]')?.click()");
  return { name, cdp, evaluate, async close() { cdp.close(); chrome.kill('SIGTERM'); await sleep(200); await rm(profile, { recursive: true, force: true }).catch(() => {}); } };
}

const browsers = [];
try {
  const actor = await browser('actor', size);
  browsers.push(actor);
  const ev = actor.evaluate;
  // the loadout, through the game's own settings (what the Armory's cards set): carried into the yard from there
  const equipped = await ev(`(() => { const s = window.__ssSettings.settings; const has = (id) => { try { s.get(id); return true; } catch { return false; } };
    s.set('loadout.spell', ${JSON.stringify(spell)});
    if (${JSON.stringify(technique)} && has('loadout.technique')) s.set('loadout.technique', ${JSON.stringify(technique)});
    return { spell: s.get('loadout.spell'), technique: has('loadout.technique') ? s.get('loadout.technique') : null }; })()`);
  let viewer = null;
  if (remote) {
    // a Shared Practice room on the server; a second browser joins it by its code, and its view is recorded
    await poll(() => ev("window.__ssLink.status === 'online' || window.__ssLink.hosting === 'remote' || window.__ssLink.remote?.connected", 4000), 'actor online', 30000).catch(() => null);
    await ev("window.__ssLink.createSharedPracticeRoom('Actor','castleward')");
    const code = await poll(() => ev('window.__ssLink.roomCode', 4000), 'shared practice room');
    await ev('window.__ssLink.arenaReady(true)');
    viewer = await browser('viewer', { width: 1280, height: 720, scale: 1, mobile: false });
    browsers.push(viewer);
    await viewer.evaluate(`window.__ssLink.joinRoom(${JSON.stringify(code)}, 'Viewer')`);
    await poll(() => viewer.evaluate(`window.__ssLink.roomCode === ${JSON.stringify(code)}`, 4000), 'viewer joined');
    await viewer.evaluate('window.__ssLink.arenaReady(true)');
    for (const b of [actor, viewer]) await poll(() => b.evaluate('Boolean(window.__ssRuntime?.playing && window.__ssRuntime?.localAuth && window.__ssRuntime.latestSnapshot?.players.length >= 2)', 5000), `${b.name}: in the shared yard`, 120000);
  } else {
    await ev("window.__ssLink.startInspectionPractice('Sword Audit','castleward'); window.__ssLink.arenaReady(true)");
    await poll(() => ev('Boolean(window.__ssLink?.playingLocally && window.__ssRuntime?.playing && window.__ssRuntime?.localAuth)', 5000), 'inspection practice running', 120000);
  }
  await sleep(1200);
  for (const b of browsers) await b.evaluate("document.querySelector('#practice-drawer-close')?.click()");
  const carried = await ev('({ technique: window.__ssRuntime.localAuth.technique ?? null, spell: window.__ssRuntime.localAuth.spell })');

  if (!remote) {
    if (dummyMode !== 'none') { await ev(`window.__ssLink.practiceSpawnDummy(${JSON.stringify(dummyMode)})`); await sleep(600); }
    // the knight is turned down the longest stretch of real floor from where he stands, the dummy stood on that line
    await ev(`(async () => {
      const { surfaceHeightAt } = await import('/shared/src/collision.mjs');
      const rt = window.__ssRuntime, link = window.__ssLink, me = rt.localAuth, world = link.local.room.world;
      let best = { yaw: 0, run: -1 };
      for (let k = 0; k < 16; k += 1) {
        const yaw = k * Math.PI / 8;
        let run = 0;
        while (run < 40 && surfaceHeightAt(me.position.x - Math.sin(yaw) * (run + 1), me.position.z - Math.cos(yaw) * (run + 1), me.position.y + 1, world) !== null
          && Math.abs(surfaceHeightAt(me.position.x - Math.sin(yaw) * (run + 1), me.position.z - Math.cos(yaw) * (run + 1), me.position.y + 1, world) - me.position.y) < 0.3) run += 1;
        if (run > best.run) best = { yaw, run };
      }
      const yaw = best.yaw, f = { x: -Math.sin(yaw), z: -Math.cos(yaw) }, r = { x: Math.cos(yaw), z: -Math.sin(yaw) };
      window.__yard = { yaw, f, r, run: best.run };
      const dummy = rt.latestSnapshot.players.find((p) => p.actorKind === 'dummy');
      rt.input.yaw = yaw; rt.input.pitch = 0;
      if (dummy) {
        link.stageInspectionActor({ actorId: dummy.id, position: { x: me.position.x + f.x * ${distance}, y: me.position.y, z: me.position.z + f.z * ${distance} }, vitals: { refill: true } });
        link.stageInspectionActor({ actorId: dummy.id, position: 'face_target' });
      }
      rt.setInspectionSplit(${size.split});
      const p = rt.localAuth.position;
      // (off the knight's left side and a little ahead, looking back across him: the cut read side-on, the lunge along it)
      const lunge = ${scenario.startsWith('riposte')};
      const c = { x: p.x - r.x * (lunge ? 4.4 : 3.0) + f.x * (lunge ? 2.6 : 1.5), y: p.y + (lunge ? 2.3 : 1.7), z: p.z - r.z * (lunge ? 4.4 : 3.0) + f.z * (lunge ? 2.6 : 1.5) };
      const aim = { x: p.x + f.x * (lunge ? 2.4 : 0.5), y: p.y + ${scenario === 'whirl-gale' || scenario === 'riposte-air' ? 2.6 : 1.05}, z: p.z + f.z * (lunge ? 2.4 : 0.5) };
      rt.flyPose = { position: c, yaw: Math.atan2(-(aim.x - c.x), -(aim.z - c.z)), pitch: Math.atan2(aim.y - c.y, Math.hypot(aim.x - c.x, aim.z - c.z)) };
      rt.syncInspection();
      rt.setInspectionUiMode(${size.mobile} ? 'gameplay' : 'clean');
    })()`);
  } else {
    // each looks at the other (the viewer keeps looking: its aim follows the actor every frame)
    await ev(`(() => { const rt = window.__ssRuntime, me = rt.localAuth, other = rt.latestSnapshot.players.find((p) => p.id !== rt.playerId && p.actorKind === 'human');
      rt.input.yaw = Math.atan2(-(other.position.x - me.position.x), -(other.position.z - me.position.z)); rt.input.pitch = 0;
      window.__apart = Math.hypot(other.position.x - me.position.x, other.position.z - me.position.z); })()`);
    await viewer.evaluate(`(() => { const rt = window.__ssRuntime; const follow = () => { requestAnimationFrame(follow); const me = rt.localAuth, other = rt.latestSnapshot?.players.find((p) => p.id !== rt.playerId && p.actorKind === 'human'); if (!me || !other) return;
      const shown = rt.remotePlayers?.shells?.get?.(other.id)?.root?.position ?? other.position;
      rt.input.yaw = Math.atan2(-(shown.x - me.position.x), -(shown.z - me.position.z)); rt.input.pitch = Math.atan2((shown.y ?? 0) - me.position.y, Math.max(1, Math.hypot(shown.x - me.position.x, shown.z - me.position.z))) * 0.8; }; follow(); })()`);
  }
  const approach = async () => {
    // the viewer walks up to the actor (W held, its aim already following them) and stops a few metres short
    if (!viewer) return;
    const apart = () => viewer.evaluate(`(() => { const rt = window.__ssRuntime, me = rt.localAuth, other = rt.latestSnapshot.players.find((p) => p.id !== rt.playerId && p.actorKind === 'human'); return Math.hypot(other.position.x - me.position.x, other.position.z - me.position.z); })()`);
    const want = Number(option('--apart', scenario.startsWith('riposte') ? '5.2' : scenario.startsWith('whirl') ? '3.4' : '3.2'));
    if (await apart() <= want) return;
    await viewer.cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 });
    await poll(async () => (await apart()) <= want, 'viewer walked up', 30000).catch(() => null);
    await viewer.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 });
    await sleep(400);
    // (the actor turns to face them where they now stand)
    await ev(`(() => { const rt = window.__ssRuntime, me = rt.localAuth, other = rt.latestSnapshot.players.find((p) => p.id !== rt.playerId && p.actorKind === 'human');
      rt.input.yaw = Math.atan2(-(other.position.x - me.position.x), -(other.position.z - me.position.z)); rt.input.pitch = 0; })()`);
  };
  for (const b of browsers) {
    await b.cdp.send('Page.bringToFront');
    const centre = await b.evaluate("(() => { const r = window.__ssRuntime.renderer.domElement.getBoundingClientRect(); return { x: r.x + r.width * 0.25, y: r.y + r.height * 0.5 }; })()");
    b.centre = centre;
    if (!(b === actor && size.mobile)) {
      for (const type of ['mousePressed', 'mouseReleased']) await b.cdp.send('Input.dispatchMouseEvent', { type, ...centre, button: 'left', clickCount: 1 });
      await sleep(900);
      await poll(() => b.evaluate('window.__ssRuntime.input.enabled', 4000), `${b.name}: input enabled`);
    }
  }
  await approach();
  await sleep(2600); // (the click's own sword swing over, the yard settled)

  // the authoritative events and each frame's clip, in the page whose view is recorded and in the actor's
  const watch = `(() => {
    const rt = window.__ssRuntime;
    const run = window.__swordRun = { events: [], frames: [], on: true };
    const wanted = /^(technique|swordTechnique|sword|attack|parry|block|guardBreak|damage|dash|staggerBreak)/;
    rt.socket.on('events', (batch) => { for (const e of batch.events) if (wanted.test(e.type)) run.events.push(JSON.parse(JSON.stringify(e))); });
    const tick = () => {
      if (!run.on) return;
      requestAnimationFrame(tick);
      const a = rt.localAuth;
      const other = rt.latestSnapshot?.players.find((p) => p.id !== rt.playerId && p.actorKind === 'human');
      const shell = ${remote ? 'rt.remotePlayers?.shells?.get?.(other?.id)' : 'rt.remotePlayers?.self'};
      const animator = shell?.visualInstance?.animator;
      const dummy = rt.latestSnapshot?.players.find((p) => p.actorKind === 'dummy');
      run.frames.push({ wall: performance.now(), server: rt.socket.serverNow(), clip: animator?.activeClip ?? null, time: animator?.activeAction?.time ?? null,
        technique: a?.swordTechnique ? { ...a.swordTechnique } : null, prowess: a?.prowess ?? null, y: a?.position?.y ?? null, x: a?.position?.x ?? null, z: a?.position?.z ?? null,
        other: other ? { technique: other.swordTechnique ? { id: other.swordTechnique.id, revolutions: other.swordTechnique.revolutions } : null, health: other.health, x: other.position.x, z: other.position.z } : null,
        dummy: dummy ? { health: dummy.health } : null, motion: shell?.visualInstance?.motionSha256 ?? null });
    };
    requestAnimationFrame(tick);
  })()`;
  for (const b of browsers) await b.evaluate(watch);
  const camera = viewer ?? actor;
  await camera.evaluate(`(() => {
    const rt = window.__ssRuntime, canvas = rt.renderer.domElement;
    const rec = window.__swordRec = { chunks: [] };
    const copy = document.createElement('canvas');
    copy.width = ${size.split ? 1280 : 844}; copy.height = Math.round(copy.width * canvas.height / canvas.width / 2) * 2;
    const cg = copy.getContext('2d', { alpha: false });
    rec.on = true;
    const mirror = () => { if (!rec.on) return; requestAnimationFrame(mirror); cg.drawImage(canvas, 0, 0, copy.width, copy.height); };
    requestAnimationFrame(mirror);
    rec.recorder = new MediaRecorder(copy.captureStream(60), { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 6e6 });
    rec.recorder.ondataavailable = (e) => { if (e.data.size) rec.chunks.push(e.data); };
    rec.recorder.start(250);
    rec.startedAt = rt.socket.serverNow();
  })()`);
  await sleep(500);

  // --- the real input
  const touchAt = (action) => ev(`(() => { const r = document.querySelector('.touch-btn[data-action="${action}"]')?.getBoundingClientRect(); return r && r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`);
  const key = (down, k, code, vk) => actor.cdp.send('Input.dispatchKeyEvent', { type: down ? 'rawKeyDown' : 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
  const attack = async (down) => {
    if (size.mobile) {
      if (!down) return actor.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      const at = await touchAt('attack'); if (!at) throw new Error('no ATTACK touch button');
      return actor.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...at, id: 1 }] });
    }
    return actor.cdp.send('Input.dispatchMouseEvent', { type: down ? 'mousePressed' : 'mouseReleased', ...actor.centre, button: 'left', buttons: down ? 1 : 0, clickCount: 1 });
  };
  let techniqueTouch = null;
  const press = async (down) => {
    if (size.mobile) {
      if (!down) return actor.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      techniqueTouch = await touchAt('technique'); if (!techniqueTouch) throw new Error('no TECHNIQUE touch button');
      return actor.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...techniqueTouch, id: 1 }] });
    }
    return key(down, 'x', 'KeyX', 88);
  };
  const jump = async (down) => {
    if (size.mobile) {
      // the thumb holding TECHNIQUE is slid onto JUMP (and stays down)
      const at = await touchAt('jump'); if (!at) throw new Error('no JUMP touch button');
      if (techniqueTouch) { for (let k = 1; k <= 6; k += 1) { await actor.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: techniqueTouch.x + (at.x - techniqueTouch.x) * k / 6, y: techniqueTouch.y + (at.y - techniqueTouch.y) * k / 6, id: 1 }] }); await sleep(16); } return null; }
      return actor.cdp.send('Input.dispatchTouchEvent', { type: down ? 'touchStart' : 'touchEnd', touchPoints: down ? [{ ...at, id: 2 }] : [] });
    }
    return key(down, ' ', 'Space', 32);
  };
  stage = 'input';
  if (scenario === 'slash-tap' || scenario === 'slash-chain') {
    await attack(true); await sleep(holdSec * 1000); await attack(false);
  } else if (scenario === 'riposte') {
    await press(true); await sleep(80); await press(false);
  } else if (scenario === 'riposte-air') {
    await jump(true); await sleep(330); await press(true); await sleep(80); await press(false); await jump(false);
  } else if (scenario === 'whirl') {
    await press(true); await sleep(holdSec * 1000); await press(false);
  } else if (scenario === 'whirl-gale') {
    await press(true); await sleep(350); await jump(true); await sleep(holdSec * 1000); if (!size.mobile) await jump(false); await press(false);
  } else throw new Error(`unknown scenario ${scenario}`);
  await sleep(afterSec * 1000);

  stage = 'collect';
  await camera.evaluate(`(async () => { const rec = window.__swordRec; rec.on = false; rec.recorder.stop(); await new Promise((r) => setTimeout(r, 400)); })()`);
  for (const b of browsers) await b.evaluate('window.__swordRun.on = false');
  const toBase64 = "(blob) => new Promise((r) => { const f = new FileReader(); f.onload = () => r(String(f.result).split(',')[1]); f.readAsDataURL(blob); })";
  const pull = async (name, file) => {
    const bytes = await camera.evaluate(`(() => { const rec = window.__swordRec; rec.${name} ??= new Blob(rec.chunks, { type: 'video/webm' }); return rec.${name}.size; })()`);
    const parts = [];
    for (let from = 0; from < bytes; from += 2_000_000) parts.push(Buffer.from(await camera.evaluate(`(async () => (${toBase64})(window.__swordRec.${name}.slice(${from}, ${from + 2_000_000})))()`, 60000), 'base64'));
    await writeFile(join(out, file), Buffer.concat(parts));
    return bytes;
  };
  const bytes = await pull('blob', `${label}.webm`);
  // stills from the recording itself, and a quarter-speed copy of it re-recorded as it is played back slowly
  stage = 'stills';
  await camera.evaluate(`(async () => {
    const rec = window.__swordRec;
    const video = document.createElement('video');
    video.muted = true; video.src = URL.createObjectURL(rec.blob);
    await new Promise((r) => { video.onloadeddata = r; });
    const w = ${size.split ? 1280 : 844}, h = Math.round(w * video.videoHeight / video.videoWidth / 2) * 2;
    const slow = document.createElement('canvas'); slow.width = w; slow.height = h;
    const sg = slow.getContext('2d', { alpha: false });
    const still = new OffscreenCanvas(${size.split ? 960 : 844}, Math.round(${size.split ? 960 : 844} * h / w)), g = still.getContext('2d');
    const chunks = [];
    const recorder = new MediaRecorder(slow.captureStream(60), { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 6e6 });
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const pending = [];
    let seen = 0;
    video.playbackRate = 0.25;
    recorder.start(250);
    await new Promise((done) => {
      video.onended = done;
      const onFrame = (_, meta) => {
        sg.drawImage(video, 0, 0, w, h);
        if (seen++ % 2 === 0 && pending.length < 500) {
          g.drawImage(video, 0, 0, still.width, still.height);
          const at = rec.startedAt + meta.mediaTime;
          pending.push(still.convertToBlob({ type: 'image/jpeg', quality: 0.82 }).then((blob) => ({ at, blob })));
        }
        video.requestVideoFrameCallback(onFrame);
      };
      video.requestVideoFrameCallback(onFrame);
      video.play();
      setTimeout(done, 140000);
    });
    recorder.stop();
    await new Promise((r) => setTimeout(r, 500));
    rec.slow = new Blob(chunks, { type: 'video/webm' });
    rec.stills = (await Promise.all(pending)).sort((x, y) => x.at - y.at);
  })()`, 200000);
  await pull('slow', `${label}-quarter-speed.webm`);
  const stillCount = await camera.evaluate('window.__swordRec.stills.length');
  const frames = [];
  for (let i = 0; i < stillCount; i += 20) frames.push(...await camera.evaluate(`(async () => Promise.all(window.__swordRec.stills.slice(${i}, ${i + 20}).map(async (s) => ({ at: s.at, data: await (${toBase64})(s.blob) }))))()`, 60000));
  for (let i = 0; i < frames.length; i += 1) await writeFile(join(out, 'frames', `f${String(i).padStart(5, '0')}.jpg`), Buffer.from(frames[i].data, 'base64'));
  const run = await actor.evaluate('window.__swordRun');
  const seen = viewer ? await viewer.evaluate('window.__swordRun') : null;
  const shown = (seen ?? run).frames;
  const clips = [];
  for (const f of shown) if (f.clip && clips.at(-1)?.clip !== f.clip) clips.push({ clip: f.clip, from: +f.server.toFixed(3) });
  const fps = shown.length > 2 ? (shown.length - 1) / ((shown.at(-1).wall - shown[0].wall) / 1000) : 0;
  const count = (events) => Object.fromEntries(Object.entries(events.reduce((m, e) => { const k = e.type === 'damage' ? `damage:${e.source}` : e.type; m[k] = (m[k] ?? 0) + 1; return m; }, {})).sort());
  const first = (type) => run.events.find((e) => e.type === type);
  const start = first('swordTechniqueStarted') ?? first('attackStarted') ?? first('swordSwing');
  const ys = run.frames.map((f) => f.y).filter(Number.isFinite);
  const at0 = run.frames.find((f) => f.server >= (start?.at ?? 0)) ?? run.frames[0], atEnd = run.frames.at(-1);
  const summary = {
    scenario, device, remote, label, equipped, carried, renderFps: +fps.toFixed(1), stills: frames.length, videoBytes: bytes,
    emulated: size.mobile ? 'landscape phone emulated in desktop Chrome: not a real phone' : null,
    motionSidecar: shown.find((f) => f.motion)?.motion ?? null,
    clips,
    events: count(run.events), eventsSeenByViewer: seen ? count(seen.events) : null,
    damage: run.events.filter((e) => e.type === 'damage').map((e) => ({ source: e.source, amount: e.amount })),
    technique: { hits: run.events.filter((e) => e.type === 'swordTechniqueHit').map((e) => ({ clean: e.clean, revolution: e.revolution ?? null })), end: first('swordTechniqueEnded') ?? null,
      revolutions: run.events.filter((e) => e.type === 'techniqueRevolution').map((e) => ({ revolution: e.revolution, prowess: e.prowess })) },
    travelled: at0 && atEnd ? +Math.hypot(atEnd.x - at0.x, atEnd.z - at0.z).toFixed(2) : null,
    climbed: ys.length ? +(Math.max(...ys) - ys[0]).toFixed(2) : null,
    viewerSawTechnique: seen ? seen.frames.some((f) => f.other?.technique) : null,
    worstFrameGapMs: Math.round(Math.max(0, ...shown.slice(1).map((f, i) => f.wall - shown[i].wall))),
    stillTimes: frames.map((f) => +f.at.toFixed(3)), startAt: start?.at ?? null,
    pageErrors,
  };
  await writeFile(join(out, 'timeline.json'), JSON.stringify({ ...summary, actorEvents: run.events, viewerEvents: seen?.events ?? null, frames: shown.map((f) => ({ ...f, wall: undefined })) }, null, 1));
  console.log('[SWORD CAPTURE]', JSON.stringify({ ...summary, stillTimes: undefined }));
  if (spawnSync('magick', ['-version']).status === 0 && frames.length) {
    // the sheet: from a moment before the action began, every still (a thirtieth of a second apart at full rate)
    const from = Math.max(0, frames.findIndex((f) => f.at >= (start?.at ?? 0) - Number(option('--lead', '0.1'))));
    const every = Number(option('--every', '1'));
    const picked = frames.map((_, i) => i).filter((i) => i >= from && (i - from) % every === 0).slice(0, Number(option('--sheet', '24'))).map((i) => join(out, 'frames', `f${String(i).padStart(5, '0')}.jpg`));
    spawnSync('magick', ['montage', '-font', '/System/Library/Fonts/Helvetica.ttc', ...picked, '-tile', device === 'phone' ? '4x' : remote ? '4x' : '3x', '-geometry', `${device === 'phone' ? 422 : remote ? 480 : 640}x+2+2`, '-background', '#111', join(out, `${label}-sheet.jpg`)], { stdio: 'inherit' });
  }
} catch (error) {
  console.error('[SWORD CAPTURE FAIL]', stage, error.stack);
  process.exitCode = 1;
} finally {
  for (const b of browsers) await b.close().catch(() => {});
  await game.stop?.();
  await sleep(300);
  process.exit(process.exitCode ?? 0);
}
