import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const publicUrl = String(process.env.PUBLIC_URL || '').replace(/\/$/, '');
const chromeBin = String(process.env.CHROME_BIN || '');
const debugPort = Number(process.env.CHROME_DEBUG_PORT || 9222);

if (!publicUrl) throw new Error('PUBLIC_URL is required');
if (!chromeBin) throw new Error('CHROME_BIN is required');

const wsUrl = `${publicUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')}/ws`;
const userDataDir = path.join(os.tmpdir(), `ss-public-capture-${process.pid}`);
const screenshotPath = process.env.ARENA_SCREENSHOT || 'public-game-arena.png';
const browserReportPath = process.env.BROWSER_REPORT || 'public-game-browser-report.json';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function poll(fn, { timeoutMs = 20000, intervalMs = 200, label = 'condition' } = {}) {
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
  const suffix = lastError ? ` Last error: ${lastError.message}` : '';
  throw new Error(`Timed out waiting for ${label}.${suffix}`);
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
      socket.addEventListener('open', () => {
        clearTimeout(timer);
        resolve();
      });
      socket.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('Chrome DevTools WebSocket failed'));
      });
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
        const listeners = this.events.get(message.method) || [];
        for (const listener of listeners) listener(message.params || {});
      });
    });
  }

  on(method, listener) {
    const listeners = this.events.get(method) || [];
    listeners.push(listener);
    this.events.set(method, listeners);
  }

  send(method, params = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(`CDP socket is not open for ${method}`));
    }
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

  close() {
    this.socket?.close();
  }
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Browser evaluation failed');
  }
  return result.result?.value;
}

async function connectBot(roomCode) {
  const socket = new WebSocket(wsUrl);
  let joined = null;
  let latestSnapshot = null;
  let opened = false;

  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Bot WebSocket timed out')), 15000);
    socket.addEventListener('open', () => { opened = true; });
    socket.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('Bot WebSocket failed'));
    });
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.type === 'hello' && opened) {
        socket.send(JSON.stringify({ type: 'joinRoom', code: roomCode, name: 'Iron Witness' }));
      } else if (message.type === 'joined') {
        joined = message;
        clearTimeout(timer);
        resolve(message);
      } else if (message.type === 'snapshot') {
        latestSnapshot = message;
      }
    });
  });

  await ready;
  return {
    socket,
    joined,
    latestSnapshot: () => latestSnapshot,
  };
}

const browserErrors = [];
const httpErrors = [];
let chrome = null;
let cdp = null;
let bot = null;

try {
  chrome = spawn(chromeBin, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    '--window-size=1440,900',
    `--remote-debugging-port=${debugPort}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${userDataDir}`,
    publicUrl,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  chrome.stdout.on('data', (chunk) => process.stdout.write(`[chrome] ${chunk}`));
  chrome.stderr.on('data', (chunk) => process.stderr.write(`[chrome] ${chunk}`));

  const targets = await poll(async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    if (!response.ok) return null;
    const list = await response.json();
    const target = list.find((entry) => entry.type === 'page' && entry.url.startsWith(publicUrl));
    return target ? { list, target } : null;
  }, { timeoutMs: 15000, label: 'Chrome page target' });

  cdp = new CdpClient(targets.target.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Network.enable');

  cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
    browserErrors.push({ type: 'exception', text: exceptionDetails?.text || 'Runtime exception' });
  });
  cdp.on('Log.entryAdded', ({ entry }) => {
    if (entry?.level === 'error') {
      browserErrors.push({
        type: 'console',
        text: entry.text,
        url: entry.url || null,
        lineNumber: entry.lineNumber ?? null,
      });
    }
  });
  cdp.on('Network.responseReceived', ({ response, type }) => {
    if (response?.status >= 400) {
      httpErrors.push({ status: response.status, url: response.url, resourceType: type });
    }
  });

  await poll(
    () => evaluate(cdp, `document.readyState === 'complete' && Boolean(document.querySelector('#player-name'))`),
    { timeoutMs: 20000, label: 'game menu DOM' },
  );

  await sleep(1000);
  await evaluate(cdp, `(() => {
    const input = document.querySelector('#player-name');
    input.value = 'Capture Knight';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#create-room').click();
    return true;
  })()`);

  const roomCode = await poll(async () => {
    const value = await evaluate(cdp, `document.querySelector('#lobby-code')?.textContent?.trim() || ''`);
    return /^[A-Z2-9]{5}$/.test(value) ? value : null;
  }, { timeoutMs: 15000, label: 'private room code' });

  console.log(`Browser created room ${roomCode}`);
  bot = await connectBot(roomCode);
  console.log(`Bot joined as ${bot.joined.playerId}`);

  await poll(
    () => evaluate(cdp, `Boolean(document.querySelector('#hud')) && !document.querySelector('#hud').classList.contains('hidden')`),
    { timeoutMs: 20000, label: 'PLAYING HUD' },
  );

  await sleep(2500);

  const arenaState = await evaluate(cdp, `(() => ({
    title: document.title,
    menuHidden: document.querySelector('#menu')?.classList.contains('hidden'),
    lobbyHidden: document.querySelector('#lobby')?.classList.contains('hidden'),
    hudVisible: !document.querySelector('#hud')?.classList.contains('hidden'),
    canvasCount: document.querySelectorAll('#game-canvas canvas').length,
    pointerHint: document.querySelector('#pointer-hint')?.textContent?.trim() || '',
    bodySize: { width: innerWidth, height: innerHeight },
  }))()`);

  const screenshot = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await fs.writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));

  const report = {
    publicUrl,
    roomCode,
    arenaState,
    browserErrors,
    httpErrors,
    botPlayerId: bot.joined.playerId,
    botSnapshotPlayers: bot.latestSnapshot()?.players?.map((p) => ({ name: p.name, alive: p.alive, position: p.position })) || [],
  };
  await fs.writeFile(browserReportPath, `${JSON.stringify(report, null, 2)}\n`);

  if (!arenaState.hudVisible || arenaState.canvasCount !== 1) {
    throw new Error(`Browser did not reach a rendered arena: ${JSON.stringify(arenaState)}`);
  }
  if (browserErrors.length) {
    throw new Error(`Browser reported errors: ${JSON.stringify({ browserErrors, httpErrors })}`);
  }

  const screenshotStat = await fs.stat(screenshotPath);
  if (screenshotStat.size < 10000) throw new Error(`Arena screenshot is unexpectedly small (${screenshotStat.size} bytes)`);

  console.log('Public arena capture OK:', report);
} finally {
  try { bot?.socket?.close(); } catch {}
  try { cdp?.close(); } catch {}
  if (chrome && !chrome.killed) chrome.kill('SIGTERM');
  await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
}
