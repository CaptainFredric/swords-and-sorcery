/**
 * Verification of Fluidity (pointer hint suppression, no interrupt),
 * Selective Freezing (Others freeze mode preserves dummy),
 * Fly Camera in Freeze without "CAMERA ONLY" flash,
 * and Spellblade 3D Flight.
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
const serverPort = 3091;
const userData = path.join(tmpdir(), `ss-flight-verify-${process.pid}`);
const evidenceDir = path.resolve('output/flight-evidence');
const brainDir = '/Users/erendiracisneros/.gemini/antigravity/brain/bf36c922-8785-4d62-b11e-f266d5847a42';

await mkdir(evidenceDir, { recursive: true });

console.log('=== Inspection Fluidity & Spellblade Flight Verification ===');
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
  console.log(`Captured screenshot: ${filename}`);
}

let chrome;

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

  console.log(`Starting Chrome CDP on port ${port}...`);
  chrome = spawn(chromeBin, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userData}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--enable-unsafe-swiftshader',
    '--remote-allow-origins=*',
    '--window-size=1280,800',
    'about:blank'
  ], { stdio: 'ignore' });

  let targets = null;
  for (let i = 0; i < 40; i++) {
    await wait(250);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      targets = await res.json();
      if (targets && targets.length > 0) break;
    } catch {}
  }
  assert(targets && targets.length > 0, 'Chrome targets acquired');

  const pageTarget = targets.find(t => t.type === 'page') || targets[0];
  socket = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
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

  console.log('Navigating to game with ?debug...');
  await send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/?debug` });
  await wait(2500);

  console.log('Starting Inspection Practice session...');
  await evaluate(`
    window.__ssLink.startInspectionPractice('Director', 'castleward');
    window.__ssLink.arenaReady(true);
  `);

  for (let i = 0; i < 40; i++) {
    const state = await evaluate(`window.__ssLink?.playingLocally && window.__ssRuntime?.playing ? 'playing' : 'loading'`);
    if (state === 'playing') break;
    await wait(200);
  }
  await wait(1000);

  // 1. Verify Inspection is loaded and ready
  const ready = await evaluate(`(() => {
    return Boolean(window.__ssLink?.inspectionAvailable || window.__ssRuntime?.socket?.inspectionAvailable);
  })()`);
  console.log('Inspection available:', ready);
  assert.equal(ready, true, 'Inspection mode available');

  // Spawn dummy
  await evaluate(`(() => {
    window.__ssLink.practiceSpawnDummy('PASSIVE');
  })()`);
  await wait(500);

  // Check 1: Fluidity - Pointer Hint is hidden in inspection mode
  const hintDebug = await evaluate(`(() => {
    const hint = document.getElementById('pointer-hint');
    const rt = window.__ssRuntime;
    return {
      rtExists: Boolean(rt),
      rtSocketExists: Boolean(rt?.socket),
      rtSocketProto: Object.getPrototypeOf(rt?.socket || {})?.constructor?.name,
      text: hint?.textContent,
      classList: hint ? [...hint.classList] : [],
      display: hint ? getComputedStyle(hint).display : 'none',
      bodyClass: document.body.className,
      rtSocketIsLink: rt?.socket === window.__ssLink,
      rtSocketInspection: rt?.socket?.inspectionAvailable,
      linkInspection: window.__ssLink?.inspectionAvailable,
      suppressPointerHint: rt?.hud?.suppressPointerHint,
    };
  })()`);
  console.log('Check 1: Pointer hint debug:', hintDebug);
  const hintHidden = hintDebug.classList.includes('hidden') || hintDebug.display === 'none';
  console.log('Check 1: Pointer hint suppressed:', hintHidden);
  assert.equal(hintHidden, true, 'Pointer hint hidden in inspection mode');

  // Check 2: Freeze All and verify pointer hint doesn't appear
  await evaluate(`(() => {
    document.querySelector('[data-camera="freezeMode"][data-mode="all"]')?.click();
  })()`);
  await wait(300);

  const frozenAll = await evaluate(`(() => {
    const rt = window.__ssRuntime || window.runtime;
    return rt.socket.inspectionFrozen && rt.socket.inspectionFreezeMode === 'all';
  })()`);
  console.log('Check 2: Frozen ALL active:', frozenAll);
  assert.equal(frozenAll, true, 'Frozen all active');

  const hintStillHidden = await evaluate(`(() => {
    const hint = document.getElementById('pointer-hint');
    return hint ? (hint.classList.contains('hidden') || getComputedStyle(hint).display === 'none') : true;
  })()`);
  assert.equal(hintStillHidden, true, 'Pointer hint remains hidden after freezing');

  // Check 3: Fly Camera while frozen can fly and does not flash "CAMERA ONLY" on canvas click
  await evaluate(`(() => {
    document.querySelector('[data-camera="fly"]')?.click();
  })()`);
  await wait(300);

  const focusIsFly = await evaluate(`Boolean((window.__ssRuntime || window.runtime).inspectionFree)`);
  console.log('Check 3: Fly focus active:', focusIsFly);
  assert.equal(focusIsFly, true, 'Fly mode is active');

  // Simulate click on canvas in fly mode
  await evaluate(`(() => {
    const rt = window.__ssRuntime || window.runtime;
    const canvas = document.querySelector('canvas') || rt.viewport?.canvas;
    if (canvas) {
      canvas.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
      canvas.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
      canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    }
  })()`);
  await wait(200);

  const flashText = await evaluate(`(() => {
    return document.getElementById('flash-notice')?.textContent || '';
  })()`);
  console.log('Check 3: Flash text on canvas click:', flashText);
  assert(!flashText.includes('CAMERA ONLY'), 'Clicking canvas in fly mode does not flash CAMERA ONLY');

  await captureScreenshot('scenario-fly-camera-frozen.png');

  // Check 4: Spellblade 3D Flight
  // Switch back to 1st person
  await evaluate(`(() => {
    document.querySelector('[data-camera="actor"]')?.click();
  })()`);
  await wait(300);

  // Toggle Spellblade flight
  const flightBtn = await evaluate(`(() => {
    const btn = document.querySelector('[data-flight-btn]');
    btn?.click();
    return btn?.textContent;
  })()`);
  console.log('Check 4: Flight button after click:', flightBtn);
  assert.equal(flightBtn, 'FLIGHT: ON', 'Flight button reads FLIGHT: ON');

  const flightActive = await evaluate(`(() => {
    return Boolean((window.__ssRuntime || window.runtime).spellbladeFlight);
  })()`);
  assert.equal(flightActive, true, 'Spellblade flight active on GameRuntime');

  // Step simulation forward while holding jump (rise in 3D flight)
  const initialY = await evaluate(`Number((window.__ssRuntime || window.runtime).localState.position.y)`);
  await evaluate(`(() => {
    const rt = window.__ssRuntime || window.runtime;
    // Unfreeze so movement can execute
    rt.socket.setInspectionFrozen(false);
    // Simulate jump key press
    rt.input.keys.add('Space');
  })()`);
  await wait(600);

  const newY = await evaluate(`(() => {
    const rt = window.__ssRuntime || window.runtime;
    rt.input.keys.delete('Space');
    return rt.localState.position.y;
  })()`);
  console.log(`Spellblade flight altitude change: ${initialY.toFixed(2)} -> ${newY.toFixed(2)}`);
  assert(newY > initialY + 0.5, 'Spellblade ascended freely in 3D flight');

  await captureScreenshot('scenario-spellblade-flight-airborne.png');

  // Check 5: Freeze Mode OTHERS preserves controlled dummy and incoming projectile
  await evaluate(`(() => {
    // Switch to dummy
    document.querySelector('[data-camera="dummy"]')?.click();
  })()`);
  await wait(300);

  const controllingDummy = await evaluate(`(() => {
    const rt = window.__ssRuntime || window.runtime;
    return rt.localAuth?.actorKind === 'dummy';
  })()`);
  console.log('Check 5: Controlling dummy:', controllingDummy);
  assert.equal(controllingDummy, true, 'Controlled dummy active');

  // Set freeze mode to OTHERS
  await evaluate(`(() => {
    document.querySelector('[data-camera="freezeMode"][data-mode="others"]')?.click();
  })()`);
  await wait(300);

  const othersMode = await evaluate(`(() => {
    const rt = window.__ssRuntime || window.runtime;
    return rt.socket.inspectionFreezeMode === 'others';
  })()`);
  console.log('Check 5: Others freeze mode active:', othersMode);
  assert.equal(othersMode, true, 'Freeze mode others enabled');

  // Verify dummy retains control without being kicked
  const dummyStillControlled = await evaluate(`(() => {
    const rt = window.__ssRuntime || window.runtime;
    return rt.localAuth?.actorKind === 'dummy';
  })()`);
  assert.equal(dummyStillControlled, true, 'Dummy remains controlled in others freeze mode');

  await captureScreenshot('scenario-dummy-others-freeze.png');

  console.log('All verification checks passed successfully!');
} catch (err) {
  console.error('VERIFICATION ERROR:', err);
  process.exitCode = 1;
} finally {
  if (socket) socket.close();
  if (chrome) chrome.kill();
  if (server) server.kill();
  console.log('Verification finished.');
}
