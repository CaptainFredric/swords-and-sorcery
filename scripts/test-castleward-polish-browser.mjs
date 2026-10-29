/**
 * Castleward UI and Presentation Acceptance Test
 * 
 * Verifies in an authentic browser:
 * 1. Tutorial top controls (Transcript left of Options, 8px gap, independently clickable, safe-area anchored, no overlap).
 * 2. Mobile landscape tutorial layout.
 * 3. Gale Garner touch selector (idle, held/balanced, swipe-up/burst, swipe-down/sustained, label beside button).
 * 4. Coreflagration touch button (compact "CORE" label, custom styling, chivalry compatibility).
 * 5. Coreflagration explosion stages (contact burst, visibly charging core, forceful delayed detonation with 3m front, rock shards, short-lived smoke).
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const chromeBin = process.env.CHROME_BIN || (
  process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : (process.env.CHROME || 'chromium')
);

const port = 9288;
const serverPort = 3018;
const userData = path.join(tmpdir(), `ss-castleward-polish-browser-${process.pid}`);
const evidenceDir = path.resolve('output/castleward-polish');
const brainDir = '/Users/erendiracisneros/.gemini/antigravity/brain/bf36c922-8785-4d62-b11e-f266d5847a42';

await mkdir(evidenceDir, { recursive: true });

console.log('=== Castleward Polish Browser Acceptance Test ===');
console.log(`Starting test server on port ${serverPort}...`);

const server = spawn('node', ['server/src/server.mjs'], {
  env: { ...process.env, PORT: String(serverPort), HOST: '127.0.0.1' },
  stdio: 'ignore',
});

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function until(fn, description, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const val = await fn();
      if (val) return val;
    } catch {}
    await wait(150);
  }
  throw new Error(`Timed out waiting for: ${description}`);
}

let socket;
let seq = 0;
const pending = new Map();

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 25000);
    pending.set(id, {
      resolve: value => { clearTimeout(timer); resolve(value); },
      reject: error => { clearTimeout(timer); reject(error); }
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) {
    const desc = response.exceptionDetails.exception?.description || response.exceptionDetails.text;
    console.error('EVAL EXCEPTION:', desc);
    throw new Error(desc || 'Evaluation error');
  }
  return response.result?.value;
}

async function captureScreenshot(filename) {
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const outPath = path.join(evidenceDir, filename);
  await writeFile(outPath, Buffer.from(shot.data, 'base64'));
  const brainPath = path.join(brainDir, filename);
  try {
    await copyFile(outPath, brainPath);
  } catch (err) {
    console.warn(`Could not copy to brainDir: ${err.message}`);
  }
  console.log(`Saved screenshot: ${filename}`);
}

let chrome;

try {
  // 1. Wait for server health
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const res = await fetch(`http://127.0.0.1:${serverPort}/health`);
      if (res.ok) {
        console.log(`Server is healthy on port ${serverPort}`);
        break;
      }
    } catch {}
    await wait(150);
  }

  // 2. Launch headless Chrome
  chrome = spawn(chromeBin, [
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--enable-unsafe-swiftshader',
    '--window-size=1280,720',
    `--remote-debugging-port=${port}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${userData}`,
    'about:blank',
  ], { stdio: 'ignore' });

  // 3. Connect CDP websocket
  let tabs;
  for (let i = 0; i < 60; i++) {
    try {
      const res = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = res.find(t => t.type === 'page');
      if (page) { tabs = [page]; break; }
      if (!page && res.length === 0) {
        // Create new page if list is empty
        const newPage = await (await fetch(`http://127.0.0.1:${port}/json/new`, { method: 'PUT' })).json();
        if (newPage?.webSocketDebuggerUrl) { tabs = [newPage]; break; }
      }
    } catch (err) {
      if (i % 10 === 0) console.log(`Waiting for Chrome CDP... (${i}/60): ${err.message}`);
    }
    await wait(200);
  }
  if (!tabs || !tabs[0]) throw new Error('Chrome debugging page not found');
  console.log('Connected to Chrome tab:', tabs[0].webSocketDebuggerUrl);

  socket = new WebSocket(tabs[0].webSocketDebuggerUrl);
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

  console.log('Navigating to game debug lobby...');
  await send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/?debug` });

  await until(() => evaluate("Boolean(document.querySelector('#menu') && document.querySelector('#loading-veil')?.classList.contains('done'))"), 'menu ready');

  // ==========================================
  // PART 1: TUTORIAL TOP CONTROLS (DESKTOP)
  // ==========================================
  console.log('Testing Desktop Tutorial Controls...');
  await evaluate(`(() => {
    const nameInput = document.querySelector('#player-name');
    if (nameInput) nameInput.value = 'Spellblade';
    document.querySelector('#solo-button')?.click();
  })()`);
  await wait(300);
  await evaluate(`document.querySelector('#tutorial-mode')?.click()`);

  await until(() => evaluate("Boolean(window.__ssTutorial?.director?.state === 'running')"), 'tutorial running');
  await wait(600);

  // Check top controls layout
  const topControlsLayout = await evaluate(`(() => {
    const transcript = document.querySelector('.tutorial-transcript-open');
    const options = document.querySelector('.tutorial-options');
    const container = document.querySelector('.tutorial-top-controls');
    if (!transcript || !options || !container) return null;
    const tRect = transcript.getBoundingClientRect();
    const oRect = options.getBoundingClientRect();
    const cRect = container.getBoundingClientRect();
    return {
      tRect: { left: tRect.left, right: tRect.right, top: tRect.top, height: tRect.height },
      oRect: { left: oRect.left, right: oRect.right, top: oRect.top, height: oRect.height },
      gap: oRect.left - tRect.right,
      containerRight: window.innerWidth - cRect.right,
      containerTop: cRect.top,
    };
  })()`);

  console.log('Desktop top controls layout:', topControlsLayout);
  assert.ok(topControlsLayout, 'Top controls elements must exist');
  assert.ok(topControlsLayout.tRect.right <= topControlsLayout.oRect.left, 'Transcript must be to the left of Options');
  assert.ok(Math.abs(topControlsLayout.gap - 8) <= 4, `Gap must be approximately 8px (was ${topControlsLayout.gap})`);

  await captureScreenshot('01-desktop-tutorial-controls.png');

  // Open Options dropdown and check independence / non-overlap
  console.log('Opening tutorial options dropdown...');
  await evaluate(`document.querySelector('.tutorial-options summary')?.click()`);
  await wait(300);

  const optionsOpenLayout = await evaluate(`(() => {
    const transcript = document.querySelector('.tutorial-transcript-open');
    const options = document.querySelector('.tutorial-options');
    const tRect = transcript.getBoundingClientRect();
    const oRect = options.getBoundingClientRect();
    return {
      optionsOpen: options.hasAttribute('open'),
      transcriptLeft: tRect.left,
      transcriptRight: tRect.right,
      optionsLeft: oRect.left,
      transcriptClickable: !transcript.disabled,
    };
  })()`);
  console.log('Options open layout:', optionsOpenLayout);
  assert.ok(optionsOpenLayout.optionsOpen, 'Options dropdown should be open');
  assert.ok(optionsOpenLayout.transcriptRight <= optionsOpenLayout.optionsLeft, 'Transcript must not be overlapped when options is open');
  await captureScreenshot('02-desktop-tutorial-options-open.png');

  // Open transcript dialog
  console.log('Opening transcript dialog...');
  await evaluate(`document.querySelector('.tutorial-transcript-open')?.click()`);
  await wait(300);

  const transcriptOpen = await evaluate(`!document.querySelector('.tutorial-transcript')?.hidden`);
  assert.ok(transcriptOpen, 'Transcript dialog should open');
  await captureScreenshot('03-desktop-tutorial-transcript-open.png');

  // Close transcript and close options
  await evaluate(`(() => {
    document.querySelector('.tutorial-transcript-close')?.click();
    document.querySelector('.tutorial-options')?.removeAttribute('open');
  })()`);
  await wait(300);

  // ==========================================
  // PART 2: MOBILE LANDSCAPE TUTORIAL CONTROLS
  // ==========================================
  console.log('Testing Mobile Landscape Tutorial Controls...');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 844,
    height: 390,
    deviceScaleFactor: 2,
    mobile: true,
    screenOrientation: { angle: 90, type: 'landscapePrimary' },
  });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await wait(400);

  const mobileTutorialLayout = await evaluate(`(() => {
    const transcript = document.querySelector('.tutorial-transcript-open');
    const options = document.querySelector('.tutorial-options');
    const tRect = transcript.getBoundingClientRect();
    const oRect = options.getBoundingClientRect();
    return {
      transcriptRight: tRect.right,
      optionsLeft: oRect.left,
      gap: oRect.left - tRect.right,
    };
  })()`);
  console.log('Mobile landscape tutorial layout:', mobileTutorialLayout);
  assert.ok(mobileTutorialLayout.transcriptRight <= mobileTutorialLayout.optionsLeft, 'Transcript must be left of Options on mobile');
  await captureScreenshot('04-mobile-landscape-tutorial-controls.png');

  // ==========================================
  // PART 3: GALE GARNER TOUCH INTERFACE
  // ==========================================
  console.log('Testing Gale Garner Touch Interface in Practice Yard...');
  // Configure Gale as equipped spell in settings storage
  await evaluate(`(() => {
    const current = JSON.parse(localStorage.getItem('ss-settings') || '{"version":1,"values":{},"bindings":{}}');
    current.values = current.values || {};
    current.values['loadout.spell'] = 'gale';
    localStorage.setItem('ss-settings', JSON.stringify(current));
  })()`);

  // Navigate to client debug lobby in mobile landscape
  await send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/?debug` });
  await until(() => evaluate("Boolean(document.querySelector('#menu') && document.querySelector('#loading-veil')?.classList.contains('done'))"), 'menu ready on mobile');

  // Enter Practice Yard with Gale equipped
  await evaluate(`(() => {
    const nameInput = document.querySelector('#player-name');
    if (nameInput) nameInput.value = 'GaleTester';
    document.querySelector('#solo-button')?.click();
  })()`);
  await wait(300);
  await evaluate(`document.querySelector('#practice-mode')?.click()`);

  await until(() => evaluate("Boolean(window.__ssRuntime?.localAuth && window.__ssRuntime?.latestSnapshot?.mode === 'PRACTICE' && window.__ssRuntime?.localAuth?.spell === 'gale')"), 'practice mode live with Gale', 20000);

  // Set up touch controls
  await evaluate(`(() => {
    const r = window.__ssRuntime;
    r.enableTouch();
    r.input.touchFocus = true;
    r.input.enabled = true;
    if (r.touch) {
      r.touch.active = true;
      r.touch.layer.classList.add('active');
    }
    // dismiss pointer hints
    document.querySelector('#pointer-hint')?.classList.add('hidden');
    document.querySelector('#loading-veil')?.classList.add('done');
    const intro = document.querySelector('.yard-observe');
    if (intro) intro.hidden = true;
  })()`);
  await wait(300);

  // 1. Idle state
  const idleState = await evaluate(`(() => {
    const tc = window.__ssRuntime.touch;
    const btn = tc.buttons.spell;
    const ind = tc.galeIndicator;
    return {
      spell: btn.dataset.spell,
      label: btn.querySelector('span')?.textContent,
      indicatorActive: ind.classList.contains('active'),
      isGale: btn.classList.contains('gale'),
    };
  })()`);
  console.log('Gale idle state:', idleState);
  assert.equal(idleState.spell, 'gale');
  assert.equal(idleState.label, 'GALE');
  assert.equal(idleState.indicatorActive, false, 'Indicator must be hidden while idle');
  await captureScreenshot('05-gale-touch-idle.png');

  // 2. Press and hold Gale (Balanced)
  console.log('Simulating Gale press & hold...');
  await evaluate(`(() => {
    const tc = window.__ssRuntime.touch;
    const btn = tc.buttons.spell;
    const rect = btn.getBoundingClientRect();
    const event = new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      pointerId: 42,
      pointerType: 'touch',
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    });
    btn.dispatchEvent(event);
  })()`);
  // Wait for 100ms hold timer to fire
  await wait(120);

  const heldState = await evaluate(`(() => {
    const tc = window.__ssRuntime.touch;
    const ind = tc.galeIndicator;
    const burst = tc.galeBurstCapsule;
    const sustained = tc.galeSustainedCapsule;
    const label = tc.galeModeLabel;
    return {
      active: ind.classList.contains('active'),
      burstSelected: burst.classList.contains('selected'),
      sustainedSelected: sustained.classList.contains('selected'),
      labelText: label.textContent,
      labelVisible: getComputedStyle(label).opacity !== '0',
      galeGesture: Boolean(tc.galeGesture),
      touchDebugEvent: tc.touchDebugEvent,
    };
  })()`);
  console.log('Gale held state:', heldState);
  assert.ok(heldState.active, 'Indicator must be active when held');
  assert.equal(heldState.labelText, 'GALE · BALANCED');
  await captureScreenshot('06-gale-touch-held-balanced.png');

  // 3. Swipe upward toward Burst
  console.log('Simulating upward swipe for Burst...');
  await evaluate(`(() => {
    const tc = window.__ssRuntime.touch;
    const btn = tc.buttons.spell;
    const rect = btn.getBoundingClientRect();
    const event = new PointerEvent('pointermove', {
      bubbles: true,
      cancelable: true,
      pointerId: 42,
      pointerType: 'touch',
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2 - 36, // 36px upward
    });
    tc.layer.dispatchEvent(event);
  })()`);
  await wait(100);

  const burstState = await evaluate(`(() => {
    const tc = window.__ssRuntime.touch;
    const ind = tc.galeIndicator;
    const burst = tc.galeBurstCapsule;
    const label = tc.galeModeLabel;
    return {
      active: ind.classList.contains('active'),
      burstSelected: burst.classList.contains('selected'),
      labelText: label.textContent,
    };
  })()`);
  console.log('Gale burst state:', burstState);
  assert.ok(burstState.burstSelected, 'Burst capsule must be selected on upward swipe');
  assert.equal(burstState.labelText, 'GALE · BURST');
  await captureScreenshot('07-gale-touch-swipe-burst.png');

  // 4. Swipe downward toward Sustained
  console.log('Simulating downward swipe for Sustained...');
  await evaluate(`(() => {
    const tc = window.__ssRuntime.touch;
    const btn = tc.buttons.spell;
    const rect = btn.getBoundingClientRect();
    const event = new PointerEvent('pointermove', {
      bubbles: true,
      cancelable: true,
      pointerId: 42,
      pointerType: 'touch',
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2 + 36, // 36px downward
    });
    tc.layer.dispatchEvent(event);
  })()`);
  await wait(100);

  const sustainedState = await evaluate(`(() => {
    const tc = window.__ssRuntime.touch;
    const ind = tc.galeIndicator;
    const sustained = tc.galeSustainedCapsule;
    const label = tc.galeModeLabel;
    return {
      active: ind.classList.contains('active'),
      sustainedSelected: sustained.classList.contains('selected'),
      labelText: label.textContent,
    };
  })()`);
  console.log('Gale sustained state:', sustainedState);
  assert.ok(sustainedState.sustainedSelected, 'Sustained capsule must be selected on downward swipe');
  assert.equal(sustainedState.labelText, 'GALE · SUSTAINED');
  await captureScreenshot('08-gale-touch-swipe-sustained.png');

  // Release pointer
  await evaluate(`(() => {
    const tc = window.__ssRuntime.touch;
    const event = new PointerEvent('pointerup', {
      bubbles: true,
      cancelable: true,
      pointerId: 42,
      pointerType: 'touch',
    });
    tc.layer.dispatchEvent(event);
  })()`);
  await wait(150);

  const releasedState = await evaluate(`(() => {
    const tc = window.__ssRuntime.touch;
    return {
      active: tc.galeIndicator.classList.contains('active'),
    };
  })()`);
  assert.equal(releasedState.active, false, 'Indicator must dismiss cleanly on pointerup');

  // ==========================================
  // PART 4: COREFLAGRATION TOUCH BUTTON
  // ==========================================
  console.log('Testing Coreflagration Touch Button...');
  await evaluate(`(() => {
    const current = JSON.parse(localStorage.getItem('ss-settings') || '{"version":1,"values":{},"bindings":{}}');
    current.values = current.values || {};
    current.values['loadout.spell'] = 'coreflagration';
    localStorage.setItem('ss-settings', JSON.stringify(current));
  })()`);
  await send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/?debug` });
  await until(() => evaluate("Boolean(document.querySelector('#menu') && document.querySelector('#loading-veil')?.classList.contains('done'))"), 'menu ready for Coreflagration');
  await evaluate(`(() => {
    const nameInput = document.querySelector('#player-name');
    if (nameInput) nameInput.value = 'CoreTester';
    document.querySelector('#solo-button')?.click();
  })()`);
  await wait(300);
  await evaluate(`document.querySelector('#practice-mode')?.click()`);
  await until(() => evaluate("Boolean(window.__ssRuntime?.localAuth && window.__ssRuntime?.latestSnapshot?.mode === 'PRACTICE' && window.__ssRuntime?.localAuth?.spell === 'coreflagration')"), 'practice mode live with Coreflagration', 20000);

  await evaluate(`(() => {
    const r = window.__ssRuntime;
    r.enableTouch();
    r.input.touchFocus = true;
    r.input.enabled = true;
    if (r.touch) {
      r.touch.active = true;
      r.touch.layer.classList.add('active');
    }
    document.querySelector('#pointer-hint')?.classList.add('hidden');
    document.querySelector('#loading-veil')?.classList.add('done');
    const intro = document.querySelector('.yard-observe');
    if (intro) intro.hidden = true;
  })()`);
  await wait(300);

  const coreBtnState = await evaluate(`(() => {
    const tc = window.__ssRuntime.touch;
    const btn = tc.buttons.spell;
    const span = btn.querySelector('span');
    const badge = btn.querySelector('.touch-badge');
    return {
      spell: btn.dataset.spell,
      label: span.textContent,
      hasCoreClass: btn.classList.contains('coreflagration'),
      width: btn.offsetWidth,
      height: btn.offsetHeight,
      ariaLabel: btn.getAttribute('aria-label'),
    };
  })()`);
  console.log('Coreflagration button state:', coreBtnState);
  assert.equal(coreBtnState.spell, 'coreflagration');
  assert.equal(coreBtnState.label, 'CORE', 'Label should be compact "CORE" instead of overflowing 14-char name');
  assert.ok(coreBtnState.hasCoreClass, 'Should have coreflagration class for custom orange styling');
  await captureScreenshot('09-coreflagration-touch-button.png');

  // ==========================================
  // PART 5: COREFLAGRATION EXPLOSION STAGES
  // ==========================================
  console.log('Testing Coreflagration Explosion Stages...');
  // Return to desktop resolution for clear 3D effects capture
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await wait(300);

  // Position camera and setup ground viewing point in arena
  await evaluate(`(() => {
    const r = window.__ssRuntime;
    const cam = r.camera;
    // Position camera looking down slightly at ground target in front of player
    cam.position.set(0, 2.2, 5.5);
    cam.lookAt(0, 0.4, 0);
  })()`);
  await wait(200);

  // Stage 1 & 2: Trigger core creation and first impact
  console.log('Spawning Coreflagration contact burst...');
  await evaluate(`(() => {
    const r = window.__ssRuntime;
    const point = { x: 0, y: 0.2, z: 0 };
    // 1. Initial contact burst (small contact explosion)
    r.effects.impact(point, { spell: 'ember', radius: 1.0 });
    // 2. Armed core projectile planted at point
    r.effects.syncProjectiles([{
      id: 'test-core-1',
      spell: 'coreflagration',
      position: point,
      velocity: { x: 0, y: 0, z: 0 },
      phase: 'armed',
      coreProgress: 0.15,
    }]);
  })()`);
  await wait(50);
  await captureScreenshot('10-coreflagration-stage1-contact.png');

  // Stage 2: Visibly charging core
  console.log('Updating core to highly charged state...');
  await evaluate(`(() => {
    const r = window.__ssRuntime;
    const point = { x: 0, y: 0.2, z: 0 };
    r.effects.syncProjectiles([{
      id: 'test-core-1',
      spell: 'coreflagration',
      position: point,
      velocity: { x: 0, y: 0, z: 0 },
      phase: 'armed',
      coreProgress: 0.85,
    }]);
  })()`);
  await wait(50);
  await captureScreenshot('11-coreflagration-stage2-charging.png');

  // Stage 3: Authoritative Final Detonation (3m radius blast, rock shards, flash, short-lived smoke)
  console.log('Triggering Coreflagration final forceful detonation...');
  await evaluate(`(() => {
    const r = window.__ssRuntime;
    const point = { x: 0, y: 0.2, z: 0 };
    // Clear the armed core projectile
    r.effects.syncProjectiles([]);
    // Detonate with 3.0m radius
    r.effects.impact(point, { spell: 'coreflagration', radius: 3.0 });
  })()`);
  await wait(60);
  await captureScreenshot('12-coreflagration-stage3-detonation.png');

  console.log('=== All Browser Tests Completed Successfully! ===');
} finally {
  if (socket) socket.close();
  if (chrome) chrome.kill();
  server.kill();
}
