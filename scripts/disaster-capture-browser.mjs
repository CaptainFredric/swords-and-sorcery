// Real-browser recordings of All-Natural Disaster. A real game server, a real Chrome (GPU), the Practice inspection
// yard, the Disaster equipped with the infusion stages asked for (through the yard's own Practice command), a dummy in
// front of the knight, and the ultimate pressed through the real input path (the R key on desktop, the ULTIMATE touch
// button on a landscape phone). The canvas is recorded in the page (a WebM at the render rate and a still every third
// frame); beside it go the authoritative events, and, frame by frame, the third-person clip the body was playing and
// what the elemental effects had on screen.
//
//   node scripts/disaster-capture-browser.mjs --tiers fire=2,frost=2 [--device desktop|phone] [--form ground|aerial]
//        [--hold 1.2] [--dummy PASSIVE|GUARDING|none] [--after 5] [--walk-in] [--strike-back] [--out dir] [--label x]
//
//   --hold        seconds the key is held (a Full Lightning aim is held this long; otherwise a tap)
//   --self-conduct the player's knight is given Shocking Conduct and swings at the dummy (its discharge into him)
//   --walk-in     the dummy is stood outside the blow and walked into its field a second later
//
// Sheets need ImageMagick (magick); frames are kept either way.

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
const form = option('--form', 'ground');
const tiers = Object.fromEntries(option('--tiers', '').split(',').filter(Boolean).map((pair) => { const [k, v] = pair.split('='); return [k, Number(v)]; }));
const holdSec = Number(option('--hold', tiers.lightning === 2 ? '1.2' : '0.08'));
const afterSec = Number(option('--after', '5'));
const dummyMode = option('--dummy', 'PASSIVE');
const label = option('--label', `${device}-${form}-${Object.entries(tiers).map(([k, v]) => `${k}${v}`).join('-') || 'simple'}`);
const out = option('--out', join('output', 'disaster-capture', label));
const bin = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// desktop: the player's own view (which the Disaster takes outside for its reveal) beside a fixed camera on the yard;
// a landscape phone: the player's own view, touch buttons and all
const size = device === 'phone' ? { width: 844, height: 390, scale: 2, mobile: true, split: false } : { width: 1920, height: 720, scale: 1, mobile: false, split: true };

await rm(join(out, 'frames'), { recursive: true, force: true });
await mkdir(join(out, 'frames'), { recursive: true });
const game = createGameServer({ host: '127.0.0.1', port: 0 });
await game.start();
const url = `http://127.0.0.1:${game.address().port}`;
const profile = await mkdtemp(join(tmpdir(), 'castleward-disaster-capture-'));
const chrome = spawn(bin, ['--headless=new', '--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--autoplay-policy=no-user-gesture-required',
  '--remote-allow-origins=*', `--window-size=${size.width},${size.height}`, '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
{ stdio: ['ignore', 'ignore', 'pipe'] });
let port = null;
chrome.stderr.on('data', (d) => { const m = String(d).match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/); if (m) port = Number(m[1]); });
let cdp;
let stage = 'chrome';
const poll = async (fn, what, ms = 90000) => {
  stage = what;
  if (process.env.CAPTURE_DEBUG) console.log('[STAGE]', what);
  const until = Date.now() + ms;
  while (Date.now() < until) { const v = await fn().catch(() => null); if (v) return v; await sleep(120); }
  throw new Error(`timed out: ${what}`);
};
const evaluate = async (expression, timeoutMs = 30000) => {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, timeoutMs);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result?.value;
};
const pageErrors = [];

try {
  await poll(async () => port, 'chrome debugger port');
  const page = await poll(async () => (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'), 'page target');
  cdp = new CdpClient(page.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  cdp.on('Page.javascriptDialogOpening', () => { cdp.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {}); });
  cdp.on('Runtime.exceptionThrown', (e) => { const text = e.exceptionDetails?.exception?.description?.slice(0, 400) ?? e.exceptionDetails?.text; pageErrors.push(text); console.warn('[PAGE EXCEPTION]', text); });
  cdp.on('Runtime.consoleAPICalled', (e) => { if (e.type === 'error') { const text = e.args.map((a) => a.value ?? a.description).join(' ').slice(0, 400); pageErrors.push(text); console.warn('[PAGE ERROR]', text); } });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: size.scale, mobile: size.mobile, ...(size.mobile ? { screenOrientation: { type: 'landscapePrimary', angle: 90 } } : {}) });
  if (size.mobile) await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp.send('Page.navigate', { url: `${url}/?debug` });
  await poll(() => evaluate("document.querySelector('#loading-veil')?.classList.contains('done')", 5000), 'menu', 120000);
  await evaluate("document.querySelector('[data-tutorial-onboarding-skip]')?.click()");
  // (the Disaster equipped before the yard is entered, as the Armory would have it)
  await evaluate("window.__ssLink.local.loadout(window.__ssLink.local.spell, 'one_hit_of_wonders')");
  await evaluate("window.__ssLink.startInspectionPractice('Disaster Audit','castleward'); window.__ssLink.arenaReady(true)");
  await poll(() => evaluate('Boolean(window.__ssLink?.playingLocally && window.__ssRuntime?.playing && window.__ssRuntime?.localAuth)', 5000), 'inspection practice running', 120000);
  await sleep(1200);
  await evaluate("document.querySelector('#practice-drawer-close')?.click()");
  // the stages asked for, set through the yard's own Practice command
  await poll(() => evaluate("window.__ssRuntime.localAuth?.ultimate === 'one_hit_of_wonders'", 4000), 'Disaster equipped');
  for (const [element, tier] of Object.entries(tiers)) await evaluate(`window.__ssLink.practiceOneHit({ action: 'level', element: ${JSON.stringify(element)}, tier: ${tier} })`);
  await evaluate("window.__ssLink.practiceOneHit({ action: 'enabled', enabled: true })");
  await poll(() => evaluate(`(() => { const s = window.__ssRuntime.localAuth?.practiceOneHit?.stages ?? {}; return ${JSON.stringify(Object.entries(tiers))}.every(([k, v]) => (s[k] ?? 0) === v); })()`, 4000), 'stages set');
  if (dummyMode !== 'none') { await evaluate(`window.__ssLink.practiceSpawnDummy(${JSON.stringify(dummyMode)})`); await sleep(600); }
  const distance = Number(option('--distance', flag('--walk-in') ? 7 : form === 'aerial' ? 7 : 1.9));
  // the knight is turned to face down the longest stretch of real floor from where he stands (the yard's spawn is
  // near an edge: a teleport or a shoved dummy must have ground to arrive on), the dummy stood on that line
  await evaluate(`(async () => {
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
    rt.input.yaw = yaw; rt.input.pitch = ${Number(option('--pitch', form === 'aerial' ? '-0.6' : '0'))};
    if (dummy) {
      link.stageInspectionActor({ actorId: dummy.id, position: { x: me.position.x + f.x * ${distance}, y: me.position.y, z: me.position.z + f.z * ${distance} }, vitals: { refill: true } });
      link.stageInspectionActor({ actorId: dummy.id, position: 'face_target' });
    }
    rt.setInspectionSplit(${size.split});
    const p = rt.localAuth.position;
    // (off the knight's left and a little behind and above, looking across him and the dummy)
    const c = { x: p.x - r.x * 5.4 - f.x * 1.6, y: p.y + ${form === 'aerial' ? 3.8 : 2.2}, z: p.z - r.z * 5.4 - f.z * 1.6 };
    const aim = { x: p.x + f.x * 1.0, y: p.y + ${form === 'aerial' ? 3.2 : 0.7}, z: p.z + f.z * 1.0 };
    rt.flyPose = { position: c, yaw: Math.atan2(-(aim.x - c.x), -(aim.z - c.z)), pitch: Math.atan2(aim.y - c.y, Math.hypot(aim.x - c.x, aim.z - c.z)) };
    rt.syncInspection();
    rt.setInspectionUiMode(${size.mobile} ? 'gameplay' : 'clean');
    return best;
  })()`);
  await cdp.send('Page.bringToFront');
  const centre = await evaluate("(() => { const b = window.__ssRuntime.renderer.domElement.getBoundingClientRect(); return { x: b.x + b.width * 0.25, y: b.y + b.height * 0.5 }; })()");
  if (!size.mobile) {
    for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, ...centre, button: 'left', clickCount: 1 });
    await sleep(1200);
    await poll(() => evaluate('window.__ssRuntime.input.enabled', 4000), 'input enabled');
  }
  await sleep(1600); // (the click's own sword swing over, the yard settled)
  // the authoritative events, and each frame's clip and effects
  await evaluate(`(() => {
    const rt = window.__ssRuntime;
    const run = window.__disasterRun = { events: [], frames: [], on: true };
    const wanted = /^(oneHit|ultimate|rupture|groundStrike|actionInterrupted|steelExtended|death|swordHit|block)/;
    rt.socket.on('events', (batch) => { for (const e of batch.events) if (wanted.test(e.type) || (e.type === 'damage' && /one_hit|rupture|backlash|ground_fire/.test(e.source))) run.events.push(JSON.parse(JSON.stringify(e))); });
    const tick = () => {
      if (!run.on) return;
      requestAnimationFrame(tick);
      const a = rt.localAuth, animator = rt.remotePlayers.self?.visualInstance?.animator;
      const dummy = rt.latestSnapshot?.players.find((p) => p.actorKind === 'dummy');
      run.frames.push({ wall: performance.now(), server: rt.socket.serverNow(), phase: a?.ultimateState?.phase ?? null, commitAt: a?.ultimateState?.commitAt ?? null,
        clip: animator?.activeClip ?? null, time: animator?.activeAction?.time ?? null, outside: Boolean(rt.inspectionBodyOutside ?? rt.disasterReveal),
        census: rt.oneHitEffects?.elements?.census?.() ?? null, fps: rt.fps,
        dummy: dummy ? { health: dummy.health, guard: dummy.guardStamina, shaken: Boolean(dummy.shaken), blustered: Boolean(dummy.blustered), conduct: dummy.electricalBacklash?.initial ?? 0,
          frost: dummy.oneHitFrostSlow?.depth ?? 0, field: dummy.oneHitField?.strength ?? 0 } : null });
    };
    requestAnimationFrame(tick);
  })()`);
  await evaluate(`(() => {
    const rt = window.__ssRuntime, canvas = rt.renderer.domElement;
    const rec = window.__disasterRec = { chunks: [], stills: [] };
    // (recorded through a smaller copy drawn after each of the game's frames: the in-page encoder cannot keep up with
    // the full split-view canvas and drops most of it)
    const copy = document.createElement('canvas');
    copy.width = ${size.split ? 1280 : 844}; copy.height = Math.round(copy.width * canvas.height / canvas.width / 2) * 2;
    const cg = copy.getContext('2d', { alpha: false });
    rec.on = true;
    const mirror = () => { if (!rec.on) return; requestAnimationFrame(mirror); cg.drawImage(canvas, 0, 0, copy.width, copy.height); };
    requestAnimationFrame(mirror);
    rec.recorder = new MediaRecorder(copy.captureStream(60), { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 5e6 });
    rec.recorder.ondataavailable = (e) => { if (e.data.size) rec.chunks.push(e.data); };
    rec.recorder.start(250);
    rec.startedAt = rt.socket.serverNow();
  })()`);
  await sleep(500);
  if (form === 'aerial') {
    await evaluate("window.__ssLink.practiceOneHit({ action: 'aerial' })");
    await poll(() => evaluate('window.__ssRuntime.localAuth.grounded === false && window.__ssRuntime.localAuth.position.y > 3', 3000), 'lifted for the aerial form', 6000);
  }
  if (flag('--incoming')) {
    // a real enemy Fireball thrown at the knight as the wind-up begins (Half Gale's wind is to turn it)
    await evaluate(`(async () => {
      const combat = await import('/shared/sim/combat.mjs');
      const room = window.__ssLink.local.room, rt = window.__ssRuntime;
      const dummy = [...room.players.values()].find((p) => p.actorKind === 'dummy');
      const me = room.players.get(rt.playerId);
      dummy.spell = 'fireball'; dummy.spellReadyAt = 0;
      window.__throw = () => {
        const d = { x: me.position.x - dummy.position.x, y: 0.02, z: me.position.z - dummy.position.z }, l = Math.hypot(d.x, d.z);
        dummy.yaw = Math.atan2(-d.x, -d.z); dummy.input.yaw = dummy.yaw; dummy.input.pitch = 0;
        return combat.tryCastSpell(room, dummy.id, { x: d.x / l, y: 0.02, z: d.z / l }, window.__ssLink.local.now());
      };
    })()`);
  }
  // the real input
  const press = async (down) => {
    if (size.mobile) {
      if (!down) return cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      const at = await evaluate(`(() => { const r = document.querySelector('.touch-btn[data-action="ultimate"]')?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`);
      if (!at) throw new Error('no ULTIMATE touch button');
      return cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...at, id: 1 }] });
    }
    return cdp.send('Input.dispatchKeyEvent', { type: down ? 'rawKeyDown' : 'keyUp', key: 'r', code: 'KeyR', windowsVirtualKeyCode: 82 });
  };
  stage = 'press';
  if (flag('--self-conduct')) {
    // Shocking Conduct on the player's own knight (the status is staged on the room, as a struck knight would carry
    // it; the swing is the real mouse button): his next blow that would land on the dummy shocks him instead
    await evaluate(`(() => { const room = window.__ssLink.local.room, rt = window.__ssRuntime; const me = room.players.get(rt.playerId);
      const dummy = [...room.players.values()].find((p) => p.actorKind === 'dummy');
      me.electricalBacklash = { at: window.__ssLink.local.now(), initial: 12, sourceId: dummy.id };
      room.events.push({ type: 'oneHitConduct', playerId: me.id, sourceId: dummy.id, initial: 12, at: window.__ssLink.local.now() }); })()`);
    await sleep(1400);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...centre, button: 'left', buttons: 1, clickCount: 1 });
    await sleep(700);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...centre, button: 'left', buttons: 0, clickCount: 1 });
  } else {
    if (flag('--incoming')) await evaluate('window.__throw()');
    await press(true);
    await sleep(holdSec * 1000);
    await press(false);
  }
  if (flag('--walk-in')) {
    // (the dummy, untouched by the blow, is stood in its field a second after it landed)
    await poll(() => evaluate("window.__disasterRun.events.some((e) => e.type === 'oneHitImpact')", 4000), 'impact', 8000);
    await sleep(1000);
    await evaluate(`(() => { const rt = window.__ssRuntime, me = rt.localAuth, dummy = rt.latestSnapshot.players.find((p) => p.actorKind === 'dummy');
      const y = window.__yard; window.__ssLink.stageInspectionActor({ actorId: dummy.id, position: { x: me.position.x + y.f.x * 1.7 + y.r.x * 0.4, y: me.position.y, z: me.position.z + y.f.z * 1.7 + y.r.z * 0.4 } }); })()`);
  }
  if (flag('--strike-back')) {
    // (the struck dummy, carrying the Conduct, swings at the knight: the sim's own attack, on the room)
    await poll(() => evaluate("window.__disasterRun.events.some((e) => e.type === 'oneHitConduct')", 4000), 'Conduct applied', 8000);
    await sleep(1500);
    await evaluate(`(async () => {
      const combat = await import('/shared/sim/combat.mjs');
      const room = window.__ssLink.local.room, rt = window.__ssRuntime;
      const dummy = [...room.players.values()].find((p) => p.actorKind === 'dummy'), me = room.players.get(rt.playerId);
      const y = window.__yard;
      // (stood a sword's length in front of the knight, facing him)
      dummy.position = { x: me.position.x + y.f.x * 1.7, y: me.position.y, z: me.position.z + y.f.z * 1.7 }; dummy.velocity = { x: 0, y: 0, z: 0 };
      dummy.yaw = y.yaw + Math.PI; dummy.input.yaw = dummy.yaw; dummy.staggerUntil = -Infinity; dummy.oneHitFrozenUntil = -Infinity;
      combat.beginAttack(room, dummy.id, window.__ssLink.local.now());
    })()`);
  }
  await sleep(afterSec * 1000);
  stage = 'collect';
  await evaluate(`(async () => { const rec = window.__disasterRec; window.__disasterRun.on = false; rec.on = false; rec.recorder.stop(); await new Promise((r) => setTimeout(r, 400)); })()`);
  const toBase64 = "(blob) => new Promise((r) => { const f = new FileReader(); f.onload = () => r(String(f.result).split(',')[1]); f.readAsDataURL(blob); })";
  const bytes = await evaluate(`(() => { window.__disasterRec.blob = new Blob(window.__disasterRec.chunks, { type: 'video/webm' }); return window.__disasterRec.blob.size; })()`);
  const parts = [];
  for (let from = 0; from < bytes; from += 2_000_000) parts.push(Buffer.from(await evaluate(`(async () => (${toBase64})(window.__disasterRec.blob.slice(${from}, ${from + 2_000_000})))()`, 60000), 'base64'));
  await writeFile(join(out, `${label}.webm`), Buffer.concat(parts));
  // stills, taken from the recording itself once the run is over (nothing is grabbed while the game is drawing):
  // the video is played back in the page and every other frame of it kept
  stage = 'stills';
  await evaluate(`(async () => {
    const rec = window.__disasterRec;
    const video = document.createElement('video');
    video.muted = true; video.src = URL.createObjectURL(rec.blob);
    await new Promise((r) => { video.onloadeddata = r; });
    const w = ${size.split ? 960 : 844}, h = Math.round(w * video.videoHeight / video.videoWidth);
    const still = new OffscreenCanvas(w, h), g = still.getContext('2d');
    const pending = [];
    let seen = 0;
    video.playbackRate = 0.5;
    await new Promise((done) => {
      video.onended = done;
      const onFrame = (_, meta) => {
        if (seen++ % 3 === 0 && pending.length < 400) {
          g.drawImage(video, 0, 0, w, h);
          const at = rec.startedAt + meta.mediaTime;
          pending.push(still.convertToBlob({ type: 'image/jpeg', quality: 0.8 }).then((blob) => ({ at, blob })));
        }
        video.requestVideoFrameCallback(onFrame);
      };
      video.requestVideoFrameCallback(onFrame);
      video.play();
      setTimeout(done, 100000);
    });
    rec.stills = (await Promise.all(pending)).sort((x, y) => x.at - y.at);
  })()`, 150000);
  const stillCount = await evaluate('window.__disasterRec.stills.length');
  const frames = [];
  for (let i = 0; i < stillCount; i += 20) frames.push(...await evaluate(`(async () => Promise.all(window.__disasterRec.stills.slice(${i}, ${i + 20}).map(async (s) => ({ at: s.at, data: await (${toBase64})(s.blob) }))))()`, 60000));
  const run = await evaluate('window.__disasterRun');
  for (let i = 0; i < frames.length; i += 1) await writeFile(join(out, 'frames', `f${String(i).padStart(5, '0')}.jpg`), Buffer.from(frames[i].data, 'base64'));
  // what the body played, against the room's commit
  const commit = run.events.find((e) => e.type === 'oneHitCommitted')?.at ?? null;
  const impact = run.events.find((e) => e.type === 'oneHitImpact');
  const clips = [];
  for (const f of run.frames) if (f.clip && clips.at(-1)?.clip !== f.clip) clips.push({ clip: f.clip, from: +f.server.toFixed(3) });
  const atCommit = commit === null ? null : run.frames.find((f) => f.server >= commit);
  const peak = (key) => Math.max(0, ...run.frames.map((f) => f.census?.[key] ?? 0));
  const fps = run.frames.length > 2 ? (run.frames.length - 1) / ((run.frames.at(-1).wall - run.frames[0].wall) / 1000) : 0;
  const last = run.frames.at(-1);
  const summary = {
    device, form, tiers, label, renderFps: +fps.toFixed(1), stills: frames.length, videoBytes: bytes, commitAt: commit,
    clips, clipAtCommit: atCommit ? { clip: atCommit.clip, time: +(atCommit.time ?? 0).toFixed(3), lateBy: +(atCommit.server - commit).toFixed(3) } : null,
    impact: impact ? { form: impact.form, radius: impact.radius, struck: impact.struck ?? null } : null,
    peakEffects: { glow: peak('glow'), rock: peak('rock'), smoke: peak('smoke'), bolts: peak('bolts'), fields: peak('fields'), ice: peak('ice'), fractures: peak('fractures') },
    effectsAtEnd: last?.census ?? null, dummyAtEnd: last?.dummy ?? null,
    eventTypes: Object.fromEntries(Object.entries(run.events.reduce((m, e) => { const k = e.type === 'damage' ? `damage:${e.source}` : e.type; m[k] = (m[k] ?? 0) + 1; return m; }, {})).sort()),
    decisive: run.events.filter((e) => e.type === 'damage' && e.source === 'one_hit_of_wonders').map((e) => e.amount),
    stillTimes: frames.map((f) => +f.at.toFixed(3)),
    worstFrameGapMs: Math.round(Math.max(0, ...run.frames.slice(1).map((f, i) => f.wall - run.frames[i].wall))),
    pageErrors,
  };
  await writeFile(join(out, 'timeline.json'), JSON.stringify({ ...summary, events: run.events, frames: run.frames.map((f) => ({ ...f, wall: undefined })) }, null, 1));
  console.log('[DISASTER CAPTURE]', JSON.stringify(summary));
  if (spawnSync('magick', ['-version']).status === 0 && frames.length) {
    // the sheet: from just before the commit, every other still (about a tenth of a second apart), 24 of them
    const first = commit === null ? 0 : Math.max(0, frames.findIndex((f) => f.at >= commit - Number(option('--lead', '0.95'))));
    const picked = frames.map((_, i) => i).filter((i) => i >= first && (i - first) % Number(option('--every', '2')) === 0).slice(0, Number(option('--sheet', '24'))).map((i) => join(out, 'frames', `f${String(i).padStart(5, '0')}.jpg`));
    spawnSync('magick', ['montage', '-font', '/System/Library/Fonts/Helvetica.ttc', ...picked, '-tile', device === 'phone' ? '3x' : '2x', '-geometry', `${device === 'phone' ? 422 : 960}x+2+2`, '-background', '#111', join(out, `${label}-sheet.jpg`)], { stdio: 'inherit' });
  }
} catch (error) {
  console.error('[DISASTER CAPTURE FAIL]', stage, error.stack);
  process.exitCode = 1;
} finally {
  cdp?.close();
  chrome.kill('SIGTERM');
  await game.stop?.();
  await sleep(300);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
  process.exit(process.exitCode ?? 0);
}
