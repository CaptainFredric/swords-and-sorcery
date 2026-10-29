/**
 * Verification of Inspection Yard on Mobile Touch Viewport
 * Specifically tests button responsiveness, FREEZE ALL selection,
 * selective freeze modes, and panel collapse prevention.
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

const port = 9297;
const serverPort = 3090;
const userData = path.join(tmpdir(), `ss-mobile-inspector-verify-${process.pid}`);
const evidenceDir = path.resolve('output/inspection-evidence');
const brainDir = '/Users/erendiracisneros/.gemini/antigravity/brain/bf36c922-8785-4d62-b11e-f266d5847a42';

await mkdir(evidenceDir, { recursive: true });

console.log('=== Mobile Inspection Yard Touch Verification ===');
console.log(`Starting test server on port ${serverPort}...`);

const server = spawn('node', ['server/src/server.mjs'], {
  env: { ...process.env, PORT: String(serverPort), HOST: '127.0.0.1' },
  stdio: 'ignore',
});

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

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

async function run() {
  try {
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        const res = await fetch(`http://127.0.0.1:${serverPort}/health`);
        if (res.ok) {
          console.log(`Server healthy on port ${serverPort}`);
          break;
        }
      } catch {}
      await wait(150);
    }

    // Launch headless Chrome
    chrome = spawn(chromeBin, [
      '--headless=new',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--enable-unsafe-swiftshader',
      '--window-size=844,390',
      `--remote-debugging-port=${port}`,
      '--remote-allow-origins=*',
      `--user-data-dir=${userData}`,
      'about:blank',
    ], { stdio: 'ignore' });

    let tabs;
    for (let i = 0; i < 60; i++) {
      try {
        const res = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        const page = res.find(t => t.type === 'page');
        if (page) { tabs = [page]; break; }
        if (!page && res.length === 0) {
          const newPage = await (await fetch(`http://127.0.0.1:${port}/json/new`, { method: 'PUT' })).json();
          if (newPage?.webSocketDebuggerUrl) { tabs = [newPage]; break; }
        }
      } catch (err) {
        if (i % 10 === 0) console.log(`Waiting for Chrome CDP... (${i}/60)`);
      }
      await wait(200);
    }

    assert.ok(tabs?.[0]?.webSocketDebuggerUrl, 'Chrome page target missing');
    socket = new WebSocket(tabs[0].webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });

    socket.addEventListener('message', event => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });

    await send('Page.enable');
    await send('Runtime.enable');
    await send('DOM.enable');

    // Emulate Mobile Device (iPhone landscape: 844x390, touch enabled)
    await send('Emulation.setDeviceMetricsOverride', {
      width: 844,
      height: 390,
      deviceScaleFactor: 2,
      mobile: true,
      screenOrientation: { type: 'landscapePrimary', angle: 90 },
    });
    await send('Emulation.setTouchEmulationEnabled', {
      enabled: true,
      maxTouchPoints: 5,
    });

    console.log('Navigating to game with ?debug...');
    await send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/?debug` });

    console.log('Waiting for game page load...');
    await wait(2500);

    // Verify touch-ui is active on body
    const isTouchUi = await evaluate(`document.body.classList.contains('touch-ui')`);
    console.log(`Document body has touch-ui: ${isTouchUi}`);

    // Start Inspection Practice
    console.log('Starting Inspection Practice session...');
    await evaluate(`
      window.__ssLink.startInspectionPractice('MobileDirector', 'castleward');
      window.__ssLink.arenaReady(true);
    `);

    for (let i = 0; i < 40; i++) {
      const state = await evaluate(`window.__ssLink?.playingLocally && window.__ssRuntime?.playing ? 'playing' : 'loading'`);
      if (state === 'playing') break;
      await wait(200);
    }

    await wait(1000);
    console.log('Game playing. Checking initial freeze state...');

    const initialMode = await evaluate(`window.__ssLink.inspectionFreezeMode`);
    const initialFrozen = await evaluate(`window.__ssLink.inspectionFrozen`);
    console.log(`Initial freeze mode: ${initialMode}, frozen: ${initialFrozen}`);
    assert.equal(initialMode, 'none');
    assert.equal(initialFrozen, false);

    // 1. Click "ALL" freeze mode button
    console.log('Clicking "FREEZE ALL" button in mobile inspector...');
    const freezeAllResult = await evaluate(`(() => {
      const allBtn = document.querySelector('[data-camera="freezeMode"][data-mode="all"]');
      if (!allBtn) return { found: false };
      allBtn.click();
      return {
        found: true,
        ariaPressed: allBtn.getAttribute('aria-pressed'),
        freezeMode: window.__ssLink.inspectionFreezeMode,
        frozen: window.__ssLink.inspectionFrozen,
        detailsOpen: document.querySelector('.inspection-camera-tools')?.open,
      };
    })()`);

    console.log('Freeze ALL click result:', freezeAllResult);
    assert.equal(freezeAllResult.found, true, 'ALL button must exist');
    assert.equal(freezeAllResult.freezeMode, 'all', 'Freeze mode must be "all"');
    assert.equal(freezeAllResult.frozen, true, 'Simulation must be frozen');
    assert.equal(freezeAllResult.ariaPressed, 'true', 'ALL button must have aria-pressed="true"');
    assert.equal(freezeAllResult.detailsOpen, true, 'Details panel must NOT collapse on mobile tap');

    await wait(300);
    await captureScreenshot('scenario-mobile-freeze-all.png');

    // 2. Click "OTHERS" freeze mode button
    console.log('Clicking "FREEZE OTHERS" button in mobile inspector...');
    const freezeOthersResult = await evaluate(`(() => {
      const btn = document.querySelector('[data-camera="freezeMode"][data-mode="others"]');
      if (!btn) return { found: false };
      btn.click();
      return {
        found: true,
        ariaPressed: btn.getAttribute('aria-pressed'),
        freezeMode: window.__ssLink.inspectionFreezeMode,
        detailsOpen: document.querySelector('.inspection-camera-tools')?.open,
      };
    })()`);

    console.log('Freeze OTHERS click result:', freezeOthersResult);
    assert.equal(freezeOthersResult.found, true);
    assert.equal(freezeOthersResult.freezeMode, 'others');
    assert.equal(freezeOthersResult.ariaPressed, 'true');
    assert.equal(freezeOthersResult.detailsOpen, true);

    // 3. Click "ACTOR" freeze mode button
    console.log('Clicking "FREEZE ACTOR" button in mobile inspector...');
    const freezeActorResult = await evaluate(`(() => {
      const btn = document.querySelector('[data-camera="freezeMode"][data-mode="actor"]');
      if (!btn) return { found: false };
      btn.click();
      return {
        found: true,
        ariaPressed: btn.getAttribute('aria-pressed'),
        freezeMode: window.__ssLink.inspectionFreezeMode,
        detailsOpen: document.querySelector('.inspection-camera-tools')?.open,
      };
    })()`);

    console.log('Freeze ACTOR click result:', freezeActorResult);
    assert.equal(freezeActorResult.found, true);
    assert.equal(freezeActorResult.freezeMode, 'actor');
    assert.equal(freezeActorResult.ariaPressed, 'true');
    assert.equal(freezeActorResult.detailsOpen, true);

    // 4. Click "LIVE" button to return to running
    console.log('Clicking "LIVE" button in mobile inspector...');
    const liveResult = await evaluate(`(() => {
      const btn = document.querySelector('[data-camera="freezeMode"][data-mode="none"]');
      if (!btn) return { found: false };
      btn.click();
      return {
        found: true,
        ariaPressed: btn.getAttribute('aria-pressed'),
        freezeMode: window.__ssLink.inspectionFreezeMode,
        frozen: window.__ssLink.inspectionFrozen,
        detailsOpen: document.querySelector('.inspection-camera-tools')?.open,
      };
    })()`);

    console.log('LIVE click result:', liveResult);
    assert.equal(liveResult.found, true);
    assert.equal(liveResult.freezeMode, 'none');
    assert.equal(liveResult.frozen, false);
    assert.equal(liveResult.ariaPressed, 'true');
    assert.equal(liveResult.detailsOpen, true);

    // 5. Test switching actor to DUMMY and back to YOU
    console.log('Clicking DUMMY actor button in mobile inspector...');
    const dummyResult = await evaluate(`(() => {
      const btn = document.querySelector('[data-camera="dummy"]');
      if (!btn) return { found: false };
      btn.click();
      return {
        found: true,
        detailsOpen: document.querySelector('.inspection-camera-tools')?.open,
        controlledDummy: window.__ssRuntime.localAuth?.actorKind === 'dummy',
      };
    })()`);

    console.log('DUMMY button click result:', dummyResult);
    assert.equal(dummyResult.found, true);
    assert.equal(dummyResult.detailsOpen, true, 'Details panel must not collapse on actor switch');

    // Return to YOU
    const actorResult = await evaluate(`(() => {
      const btn = document.querySelector('[data-camera="actor"]');
      if (!btn) return { found: false };
      btn.click();
      return {
        found: true,
        detailsOpen: document.querySelector('.inspection-camera-tools')?.open,
        controlledDummy: window.__ssRuntime.localAuth?.actorKind === 'dummy',
      };
    })()`);
    assert.equal(actorResult.found, true);
    assert.equal(actorResult.detailsOpen, true, 'Details panel must not collapse when selecting YOU');

    // 6. Test freeze toggle button in toolbar
    console.log('Clicking toolbar FREEZE button in mobile inspector...');
    const freezeToolbarResult = await evaluate(`(() => {
      const btn = document.querySelector('.inspection-toolbar-row [data-camera="freeze"]');
      if (!btn) return { found: false };
      btn.click();
      return {
        found: true,
        text: btn.textContent,
        frozen: window.__ssLink.inspectionFrozen,
        detailsOpen: document.querySelector('.inspection-camera-tools')?.open,
      };
    })()`);

    console.log('Toolbar FREEZE click result:', freezeToolbarResult);
    assert.equal(freezeToolbarResult.found, true);
    assert.equal(freezeToolbarResult.frozen, true, 'Toolbar FREEZE must freeze the match');
    assert.equal(freezeToolbarResult.text, 'RESUME', 'Toolbar FREEZE text must flip to RESUME');
    assert.equal(freezeToolbarResult.detailsOpen, true, 'Details panel must not collapse on toolbar FREEZE');

    await wait(300);
    await captureScreenshot('scenario-mobile-toolbar-frozen.png');

    console.log('\n✅ All mobile inspector verification checks passed successfully!');
  } finally {
    if (chrome) chrome.kill('SIGTERM');
    if (server) server.kill('SIGTERM');
  }
}

run().catch(err => {
  console.error('\n❌ Verification failed:', err);
  if (chrome) chrome.kill('SIGTERM');
  if (server) server.kill('SIGTERM');
  process.exit(1);
});
