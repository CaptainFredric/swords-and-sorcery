import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = (process.env.PUBLIC_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const chromeBin = process.env.CHROME_BIN || 'chromium';
const port = 9238;
const userData = await mkdtemp(join(tmpdir(), 'ss-joystick-chrome-'));
const chrome = spawn(chromeBin, [
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader',
  '--remote-allow-origins=*', '--window-size=820,450',
  '--remote-debugging-port=' + port, '--user-data-dir=' + userData, 'about:blank',
], { stdio: 'ignore' });
let socket;
let seq = 0;
const pending = new Map();
function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function until(fn, description) {
  for (let n = 0; n < 100; n++) {
    try { const value = await fn(); if (value) return value; } catch { /* page still loading */ }
    await wait(150);
  }
  throw new Error('Timed out: ' + description);
}
function send(method, params = {}) {
  const id = ++seq;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 15000);
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); },
      reject: error => { clearTimeout(timer); reject(error); } });
  });
}
async function evaluate(expression) {
  const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
  return response.result?.value;
}
function touch(type, x, y) {
  return send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
}
function rectEqual(a, b) {
  return ['left', 'top', 'width', 'height'].every(k => Math.abs(a[k] - b[k]) < 0.5);
}
try {
  const target = await until(async () => {
    const result = await fetch('http://127.0.0.1:' + port + '/json/list');
    return (await result.json()).find(tab => tab.type === 'page');
  }, 'Chrome debugging page');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  socket.onmessage = message => {
    const payload = JSON.parse(String(message.data));
    if (!payload.id) return;
    const cb = pending.get(payload.id);
    pending.delete(payload.id);
    if (payload.error) cb.reject(new Error(payload.error.message));
    else cb.resolve(payload.result);
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 780, height: 360, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  await send('Page.navigate', { url: base + '/?debug' });
  await until(() => evaluate("document.readyState === 'complete' && Boolean(document.querySelector('#game-shell'))"), 'game page');
  await evaluate("window.__stickProbe = null; (async () => { const { TouchControls } = await import('./client/game/TouchControls.mjs'); const root = document.createElement('div'); root.style.cssText = 'position:fixed;inset:0;z-index:999;pointer-events:none'; document.body.append(root); const input = { gateHeldAction: (_action, requested) => requested, allowAction: () => true }; const controls = new TouchControls(root, input); controls.setActive(true); window.__stickProbe = { controls, root }; })().catch(error => { window.__stickProbeError = String(error); })");
  await until(async () => { const state = await evaluate("({ ready: Boolean(window.__stickProbe?.controls?.stickBase), error: window.__stickProbeError || null })"); if (state.error) throw new Error(state.error); return state.ready; }, 'touch layer');
  const info = await evaluate("(() => { const c = window.__stickProbe.controls; const r = c.stickBase.getBoundingClientRect(); const l = c.layer.getBoundingClientRect(); return {ring:{left:r.left,top:r.top,width:r.width,height:r.height}, layer:{left:l.left,top:l.top,width:l.width,height:l.height}, client:{width:c.layer.clientWidth,height:c.layer.clientHeight}, hit:Boolean(document.elementFromPoint(r.left+r.width*.7,r.top+r.height*.5)?.closest('.touch-stick'))}; })()");
  assert.ok(info.layer.width > 600 && info.layer.height > 280, 'touch layer must cover the viewport');
  assert.ok(info.hit, 'displayed joystick must be a real touch target');
  const x = info.ring.left + info.ring.width * .7;
  const y = info.ring.top + info.ring.height * .5;
  await touch('touchStart', x, y);
  await until(() => evaluate('Boolean(window.__stickProbe.controls.stick)'), 'joystick press');
  const pressed = await evaluate("(() => { const c=window.__stickProbe.controls; const r=c.stickBase.getBoundingClientRect(); return {rect:{left:r.left,top:r.top,width:r.width,height:r.height}, move:c.movement()}; })()");
  assert.ok(rectEqual(info.ring, pressed.rect), 'outer ring moved on first touch');
  assert.equal(pressed.move.forward, 0, 'stationary thumb must be neutral');
  await touch('touchMove', x, y - 54);
  const dragging = await evaluate("(() => { const c=window.__stickProbe.controls; const r=c.stickBase.getBoundingClientRect(); return {rect:{left:r.left,top:r.top,width:r.width,height:r.height}, move:c.movement()}; })()");
  assert.ok(dragging.move.forward > .9, 'drag must produce forward movement');
  assert.ok(rectEqual(info.ring, dragging.rect), 'outer ring moved during drag');
  await touch('touchEnd', x, y - 54);
  assert.equal(await evaluate('window.__stickProbe.controls.movement().forward'), 0);
  // Even a zero-sized transient layout must never force the ring to the old (66,66) clamp.
  await evaluate("(() => { const c=window.__stickProbe.controls; Object.defineProperty(c.layer,'clientWidth',{configurable:true,get:()=>0}); Object.defineProperty(c.layer,'clientHeight',{configurable:true,get:()=>0}); c.layer.getBoundingClientRect=()=>({left:0,top:0,width:0,height:0}); })()");
  await touch('touchStart', x, y);
  await until(() => evaluate('Boolean(window.__stickProbe.controls.stick)'), 'joystick press with invalid geometry');
  await touch('touchMove', x, y - 54);
  const invalid = await evaluate("(() => { const c=window.__stickProbe.controls; const r=c.stickBase.getBoundingClientRect(); return {rect:{left:r.left,top:r.top,width:r.width,height:r.height}, forward:c.movement().forward}; })()");
  assert.ok(rectEqual(info.ring, invalid.rect), 'zero-sized input geometry teleported the ring');
  assert.ok(invalid.forward > .9, 'touch delta must work despite zero-sized layer');
  await touch('touchEnd', x, y - 54);
  assert.equal(await evaluate('window.__stickProbe.controls.movement().forward'), 0);
  console.log('Mobile Chromium touch PASS', JSON.stringify({ info, dragging, invalid }));

  // This probe alone is not sufficient: it bypasses InputController, GameRuntime,
  // and the host's movement transport. Drive an actual local Practice session.
  await evaluate("window.__stickProbe.controls.dispose(); window.__stickProbe.root.remove(); window.__stickProbe = null");
  await until(() => evaluate("Boolean(document.querySelector('#menu'))"), 'menu loaded');
  await until(() => evaluate("Boolean(document.querySelector('#loading-veil')?.classList.contains('done'))"), 'menu ready');
  await until(async () => evaluate("(() => { const offer = document.querySelector('#tutorial-onboarding'); if (offer && !offer.hidden) document.querySelector('[data-tutorial-onboarding-skip]')?.click(); const show = document.querySelector('#show-menu'); if (show && !show.closest('.yard-observe')?.hidden) show.click(); const field = document.querySelector('#player-name'); if (field && field.value !== 'Mobile Inspector') { field.value = 'Mobile Inspector'; field.dispatchEvent(new Event('input', { bubbles: true })); } const soloMenu = document.querySelector('#solo-menu'); if (soloMenu && !soloMenu.classList.contains('hidden')) return true; document.querySelector('#solo-button')?.click(); return false; })()"), 'Solo menu');
  await evaluate("document.querySelector('#practice-mode').click()");
  await until(() => evaluate("Boolean(window.__ssRuntime?.touch && window.__ssRuntime?.localAuth && !document.querySelector('#hud').classList.contains('hidden'))"), 'live local Practice runtime');
  const preFocus = await evaluate("(() => { const r=window.__ssRuntime; return {playing:r.playing,touchFocus:r.input.touchFocus,touchActive:r.touch.active,inputEnabled:r.input.enabled,suspended:r.input.suspended,world:r.worldId}; })()");
  // Focus without issuing browser pointer lock; mobile touch uses touchFocus instead.
  await evaluate("window.__ssRuntime.input.requestPointerLock()");
  await until(() => evaluate("Boolean(window.__ssRuntime.input.enabled && window.__ssRuntime.touch.active)"), 'arena touch focus');
  const pre = await evaluate("(() => { const r=window.__ssRuntime;const t=r.touch;const b=t.stickBase.getBoundingClientRect();return {ring:{left:b.left,top:b.top,width:b.width,height:b.height},position:{...r.localState.position},playing:r.playing,inputEnabled:r.input.enabled,touchFocus:r.input.touchFocus};})()");
  const tx = pre.ring.left + pre.ring.width*.7;
  const ty = pre.ring.top + pre.ring.height*.5;
  assert.ok(tx > 0 && ty > 0, 'live gameplay ring must be onscreen');
  await touch('touchStart', tx, ty);
  await until(() => evaluate('Boolean(window.__ssRuntime.touch.stick)'), 'live input press');
  await touch('touchMove', tx, ty-54);
  const live = await evaluate("(() => {const r=window.__ssRuntime;const t=r.touch;return {movement:r.input.movement(),raw:t.stickState,stick:t.stick,enabled:r.input.enabled,focus:r.input.touchFocus,active:t.active,blocked:[...(r.input.blockedHolds||[])],last:r.lastSentInput,position:{...r.localState.position}};})()");
  assert.ok(live.raw.forward > .7, 'raw joystick must produce directional input: '+JSON.stringify(live));
  assert.ok(live.movement.forward > .7, 'game input must pass movement intent: '+JSON.stringify(live));
  await wait(350);
  const network = await evaluate("(() => {const r=window.__ssRuntime;return {last:r.lastSentInput,position:{...r.localState.position},movement:r.input.movement(),playing:r.playing};})()");
  assert.ok(network.last?.forward > .7, 'actual game loop must transmit forward intent: '+JSON.stringify(network));
  await touch('touchEnd', tx, ty-54);
  await until(() => evaluate('window.__ssRuntime.input.movement().forward===0'), 'live joystick release');
  const post = await evaluate("(() => {const r=window.__ssRuntime;return {touchFocus:r.input.touchFocus,enabled:r.input.enabled,last:r.lastSentInput,position:{...r.localState.position}};})()");
  console.log('Full game mobile movement PASS', JSON.stringify({preFocus,pre,live,network,post}));

} finally {
  try { socket?.close(); } catch { /* no socket */ }
  chrome.kill('SIGTERM');
  await rm(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
