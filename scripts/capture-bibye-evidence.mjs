import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const chromeBin = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9255;
const userDataDir = path.join(os.tmpdir(), `ss-bibye-evidence-${process.pid}`);
const evidenceDir = path.resolve('docs/evidence/bibye');
await fs.mkdir(evidenceDir, { recursive: true });

// Start local server if not already running
let server = null;
let serverPort = 3001;
try {
  await fetch(`http://127.0.0.1:${serverPort}/health`);
  console.log(`Server already responsive on port ${serverPort}`);
} catch {
  console.log('Starting local server...');
  server = spawn('node', ['server/src/server.mjs'], {
    env: { ...process.env, PORT: String(serverPort), HOST: '127.0.0.1' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${serverPort}/health`);
      if (res.ok) break;
    } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
}

const chrome = spawn(chromeBin, [
  '--headless=new',
  '--no-sandbox',
  '--enable-unsafe-swiftshader',
  '--disable-dev-shm-usage',
  '--window-size=1280,720',
  `--remote-debugging-port=${port}`,
  '--remote-allow-origins=*',
  `--user-data-dir=${userDataDir}`,
  'about:blank',
], { stdio: 'ignore' });

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

let tabs;
for (let i = 0; i < 40; i++) {
  try {
    const res = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = res.find(t => t.type === 'page');
    if (page) { tabs = [page]; break; }
  } catch {}
  await wait(150);
}

if (!tabs || !tabs[0]) {
  throw new Error('Chrome CDP page tab not found');
}

const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let seq = 0;
const pending = new Map();

ws.onmessage = (msg) => {
  const d = JSON.parse(msg.data);
  if (d.id && pending.has(d.id)) {
    const p = pending.get(d.id);
    pending.delete(d.id);
    if (d.error) p.reject(new Error(d.error.message));
    else p.resolve(d.result);
  }
};

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expr) {
  const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (res?.exceptionDetails) {
    throw new Error(res.exceptionDetails.text || 'Runtime exception');
  }
  return res?.result?.value;
}

async function until(fn, label, timeout = 25000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      const val = await fn();
      if (val) return val;
    } catch {}
    await wait(150);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function capture(filename) {
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const outPath = path.join(evidenceDir, filename);
  await fs.writeFile(outPath, Buffer.from(shot.data, 'base64'));
  console.log(`Saved screenshot: ${outPath}`);
}

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/?debug` });

  await until(() => evaluate("Boolean(document.querySelector('#menu') && document.querySelector('#loading-veil')?.classList.contains('done'))"), 'menu load');

  // Skip tutorial onboarding if present, set player name, open Practice Yard
  await until(async () => evaluate(`(() => {
    const offer = document.querySelector('#tutorial-onboarding');
    if (offer && !offer.hidden) document.querySelector('[data-tutorial-onboarding-skip]')?.click();
    const show = document.querySelector('#show-menu');
    if (show && !show.closest('.yard-observe')?.hidden) show.click();
    const field = document.querySelector('#player-name');
    if (field && field.value !== 'Capture Knight') {
      field.value = 'Capture Knight';
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const soloMenu = document.querySelector('#solo-menu');
    if (soloMenu && !soloMenu.classList.contains('hidden')) return true;
    document.querySelector('#solo-button')?.click();
    return false;
  })()`), 'Solo menu');

  await wait(300);
  await evaluate("document.querySelector('#practice-mode').click()");

  await until(() => evaluate("Boolean(window.__ssRuntime?.localAuth && !document.querySelector('#hud').classList.contains('hidden'))"), 'Practice Yard live');
  console.log('Entered Practice Yard!');

  // Wait for authored GLB to load in renderer
  await until(() => evaluate("Boolean(window.__ssRuntime?.world?.biByeLlista?.authoredModel)"), 'Bi-Bye-llista authored GLB loaded');
  console.log('Authored v3.0 Bi-Bye-llista GLB loaded into scene!');

  // Setup spectator camera angle to showcase the ballista clearly
  // Ballista default position: x: 9.2, y: 0, z: -14.6
  // We place camera at x: 4.8, y: 2.1, z: -12.2 looking at ballista center
  await evaluate(`(() => {
    const r = window.__ssRuntime;
    const cam = r.camera;
    // Set custom third-person perspective overlooking the ballista and range
    cam.position.set(4.6, 2.2, -12.4);
    cam.lookAt(9.2, 1.4, -14.6);
    r.cameraRigOverride = true;
    // Force camera stay during frames
    const origUpdate = r.world.biByeLlista.update.bind(r.world.biByeLlista);
  })()`);

  await wait(600);

  // 1. Capture Mobile Mode (6-wheeled carriage)
  console.log('Capturing Viewpoint 1: Mobile Carriage...');
  await evaluate(`(() => {
    const r = window.__ssRuntime;
    r.camera.position.set(4.6, 2.0, -12.2);
    r.camera.lookAt(9.2, 1.3, -14.6);
  })()`);
  await wait(300);
  await capture('bibye-01-mobile-carriage.png');

  // 2. Capture Deployed Mode (outriggers planted, turntable elevated)
  console.log('Capturing Viewpoint 2: Deployed Mode...');
  await evaluate(`(() => {
    const bl = window.__ssRuntime.room?.biByeLlista;
    if (bl) {
      bl.mode = 'DEPLOYED';
      bl.yaw = -Math.PI / 2 + 0.18;
      bl.pitch = 0.15;
    }
  })()`);
  await wait(500);
  await capture('bibye-02-deployed-mode.png');

  // 3. Capture Firing Volley (projectiles in air)
  console.log('Capturing Viewpoint 3: Two-Stage Volley Discharge...');
  await evaluate(`(() => {
    const r = window.__ssRuntime;
    const bl = r.room?.biByeLlista;
    if (bl) {
      bl.mode = 'DEPLOYED';
      bl.state = 'FIRING';
      bl.yaw = -Math.PI / 2;
      bl.pitch = 0.08;
    }
    // Spawn visual test projectiles in flight
    r.latestSnapshot.bibyeProjectiles = [
      {
        id: 'cap-cond-1',
        subKind: 'conditioning',
        position: { x: 12.8, y: 1.55, z: -14.6 },
        velocity: { x: 48, y: 0.8, z: 0 },
      },
      {
        id: 'cap-siege-1',
        subKind: 'siege',
        position: { x: 10.6, y: 1.25, z: -14.6 },
        velocity: { x: 55, y: 0.5, z: 0 },
      }
    ];
    r.camera.position.set(6.2, 1.9, -11.5);
    r.camera.lookAt(12.5, 1.4, -14.6);
  })()`);
  await wait(400);
  await capture('bibye-03-firing-volley.png');

  // 4. Capture Destroyed Wreck
  console.log('Capturing Viewpoint 4: Destroyed Wreckage...');
  await evaluate(`(() => {
    const r = window.__ssRuntime;
    const bl = r.room?.biByeLlista;
    if (bl) {
      bl.mode = 'DESTROYED';
      bl.state = 'SPENT';
      bl.health = 0;
    }
    r.latestSnapshot.bibyeProjectiles = [];
    r.camera.position.set(6.5, 1.8, -12.6);
    r.camera.lookAt(9.2, 0.8, -14.6);
  })()`);
  await wait(600);
  await capture('bibye-04-wreck-destroyed.png');

  console.log('All 4 visual evidence viewpoints successfully captured!');
} finally {
  try { ws?.close(); } catch {}
  chrome.kill('SIGTERM');
  if (server) server.kill('SIGTERM');
  await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
}
