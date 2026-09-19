import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const publicUrl = String(process.env.PUBLIC_URL || '').replace(/\/$/, '');
const chromeBin = String(process.env.CHROME_BIN || '');
const debugPort = Number(process.env.CHROME_DEBUG_PORT || 9222);
if (!publicUrl) throw new Error('PUBLIC_URL is required');
if (!chromeBin) throw new Error('CHROME_BIN is required');

const userDataDir = path.join(os.tmpdir(), `ss-public-structural-${process.pid}`);
const browserErrors = [];
const httpErrors = [];
const evidence = {};
let chrome = null;
let cdp = null;

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function poll(fn, { timeoutMs = 20000, intervalMs = 150, label = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for ${label}.${lastError ? ` Last error: ${lastError.message}` : ''}`);
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
    this.events = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      this.socket = socket;
      const timer = setTimeout(() => reject(new Error('Timed out connecting to Chrome DevTools')), 10000);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(); });
      socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Chrome DevTools WebSocket failed')); });
      socket.addEventListener('message', (event) => {
        const message = JSON.parse(String(event.data));
        if (message.id) {
          const pending = this.pending.get(message.id);
          if (!pending) return;
          this.pending.delete(message.id);
          if (message.error) pending.reject(new Error(`${message.error.message} (${message.error.code})`));
          else pending.resolve(message.result ?? {});
          return;
        }
        for (const listener of this.events.get(message.method) || []) listener(message.params || {});
      });
    });
  }

  on(method, listener) {
    const list = this.events.get(method) || [];
    list.push(listener);
    this.events.set(method, list);
  }

  send(method, params = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error(`CDP socket is not open for ${method}`));
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for CDP ${method}`));
      }, 15000);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
    });
  }

  close() { this.socket?.close(); }
}

async function evaluate(expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Browser evaluation failed');
  return result.result?.value;
}

async function waitReady() {
  await poll(
    () => evaluate(`document.readyState === 'complete' && Boolean(document.querySelector('#player-name'))`),
    { timeoutMs: 20000, label: 'current game shell' },
  );
}

async function visible(selector) {
  return evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); return Boolean(el) && !el.classList.contains('hidden'); })()`);
}

async function waitVisible(selector, timeoutMs = 20000) {
  await poll(() => visible(selector), { timeoutMs, label: `${selector} visible` });
}

async function setName(name) {
  await evaluate(`(() => {
    const input = document.querySelector('#player-name');
    input.value = ${JSON.stringify(name)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return input.value;
  })()`);
}

async function click(selector) {
  const clicked = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    el.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`Missing element ${selector}`);
}

async function capture(file) {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  await fs.writeFile(file, Buffer.from(result.data, 'base64'));
  const stat = await fs.stat(file);
  if (stat.size < 10000) throw new Error(`${file} is unexpectedly small (${stat.size} bytes)`);
}

async function snapshotUi() {
  return evaluate(`(() => ({
    title: document.title,
    menuVisible: !document.querySelector('#menu')?.classList.contains('hidden'),
    soloVisible: !document.querySelector('#solo-menu')?.classList.contains('hidden'),
    privateVisible: !document.querySelector('#private-menu')?.classList.contains('hidden'),
    lobbyVisible: !document.querySelector('#lobby')?.classList.contains('hidden'),
    hudVisible: !document.querySelector('#hud')?.classList.contains('hidden'),
    practiceVisible: !document.querySelector('#practice-overlay')?.classList.contains('hidden'),
    matchInfo: document.querySelector('#match-info')?.textContent?.trim() || '',
    lobbyState: document.querySelector('#lobby-state')?.textContent?.trim() || '',
    lobbyMode: document.querySelector('#lobby-mode')?.textContent?.trim() || '',
    lobbyWorld: document.querySelector('#lobby-world')?.textContent?.trim() || '',
    roomCode: document.querySelector('#lobby-code')?.textContent?.trim() || '',
    canvasCount: document.querySelectorAll('#game-canvas canvas').length,
    menuCanvasCount: document.querySelectorAll('#menu-spellblade canvas').length,
    pointerHint: document.querySelector('#pointer-hint')?.textContent?.trim() || '',
  }))()`);
}

async function resetToFreshMenu() {
  await evaluate(`(() => {
    localStorage.removeItem('ss-session-token');
    localStorage.removeItem('ss-room-code');
    sessionStorage.clear();
    return true;
  })()`);
  await cdp.send('Page.navigate', { url: publicUrl });
  await waitReady();
  await waitVisible('#menu');
  await sleep(350);
}

try {
  chrome = spawn(chromeBin, [
    '--headless=new',
    '--no-sandbox',
    '--hide-scrollbars',
    '--window-size=1440,900',
    `--remote-debugging-port=${debugPort}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${userDataDir}`,
    publicUrl,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  chrome.stdout.on('data', (chunk) => process.stdout.write(`[chrome] ${chunk}`));
  chrome.stderr.on('data', (chunk) => process.stderr.write(`[chrome] ${chunk}`));

  const target = await poll(async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    if (!response.ok) return null;
    const list = await response.json();
    return list.find((entry) => entry.type === 'page' && entry.url.startsWith(publicUrl)) || null;
  }, { timeoutMs: 15000, label: 'Chrome page target' });

  cdp = new CdpClient(target.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Network.enable');

  cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
    browserErrors.push({ type: 'exception', text: exceptionDetails?.text || 'Runtime exception' });
  });
  cdp.on('Log.entryAdded', ({ entry }) => {
    if (entry?.level === 'error') browserErrors.push({ type: 'console', text: entry.text, url: entry.url || null, lineNumber: entry.lineNumber ?? null });
  });
  cdp.on('Network.responseReceived', ({ response, type }) => {
    if (response?.status >= 400) httpErrors.push({ status: response.status, url: response.url, resourceType: type });
  });

  await waitReady();
  await waitVisible('#menu');
  await sleep(1000);
  evidence.menu = await snapshotUi();
  if (evidence.menu.menuCanvasCount !== 1) throw new Error(`Menu Spellblade canvas missing: ${JSON.stringify(evidence.menu)}`);
  await capture('public-game-menu.png');

  // One-browser Practice.
  await setName('Public Tester');
  await click('#solo-button');
  await waitVisible('#solo-menu');
  await click('#practice-mode');
  await waitVisible('#hud');
  await waitVisible('#practice-overlay');
  await poll(async () => (await snapshotUi()).matchInfo.includes('UNTIMED'), { timeoutMs: 10000, label: 'untimed Practice HUD' });
  await sleep(1000);
  evidence.practice = await snapshotUi();
  await capture('public-game-practice.png');

  await click('#practice-guarding');
  await sleep(1200);
  evidence.practiceDummy = await snapshotUi();
  await capture('public-game-practice-dummy.png');

  // Fresh one-browser Bot Duel.
  await resetToFreshMenu();
  await setName('Public Duelist');
  await click('#solo-button');
  await waitVisible('#solo-menu');
  await click('#bot-duel');
  await waitVisible('#hud', 25000);
  await poll(async () => (await snapshotUi()).matchInfo.includes('FIRST TO 10'), { timeoutMs: 10000, label: 'Bot Duel match HUD' });
  await sleep(1000);
  evidence.botDuel = await snapshotUi();
  await capture('public-game-bot-duel.png');

  // Fresh Quick Match: a single public player must wait rather than fake-start.
  await resetToFreshMenu();
  await setName('Public FFA');
  await click('#quick-play');
  await waitVisible('#lobby');
  await poll(async () => /WAITING/i.test((await snapshotUi()).lobbyState), { timeoutMs: 10000, label: 'single-player FFA waiting state' });
  evidence.ffaWaiting = await snapshotUi();
  if (evidence.ffaWaiting.lobbyMode !== 'FREE-FOR-ALL') throw new Error(`Quick Match was not FFA: ${JSON.stringify(evidence.ffaWaiting)}`);
  if (evidence.ffaWaiting.lobbyWorld !== 'CASTLEWARD') throw new Error(`Quick Match was not Castleward: ${JSON.stringify(evidence.ffaWaiting)}`);
  await capture('public-game-ffa-waiting.png');

  const report = { publicUrl, evidence, browserErrors, httpErrors };
  await fs.writeFile('public-game-browser-report.json', `${JSON.stringify(report, null, 2)}\n`);

  if (browserErrors.length || httpErrors.length) {
    throw new Error(`Public browser reported errors: ${JSON.stringify({ browserErrors, httpErrors })}`);
  }
  if (!evidence.practice.hudVisible || !evidence.practice.practiceVisible) throw new Error('Practice did not render the expected HUD/tools');
  if (!evidence.botDuel.hudVisible) throw new Error('Bot Duel did not reach active play');
  if (!evidence.ffaWaiting.lobbyVisible || evidence.ffaWaiting.hudVisible) throw new Error('One-human FFA did not remain in the waiting lobby');

  console.log('Public structural browser verification OK:', JSON.stringify(report, null, 2));
} finally {
  try { cdp?.close(); } catch {}
  if (chrome && !chrome.killed) chrome.kill('SIGTERM');
  await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
}
