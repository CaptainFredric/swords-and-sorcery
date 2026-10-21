import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const chromeBin = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9260;
const serverPort = 3002;
const userDataDir = path.join(os.tmpdir(), `ss-bibye-capture-${process.pid}`);
const evidenceDir = path.resolve('docs/evidence/bibye');
await fs.mkdir(evidenceDir, { recursive: true });

console.log('Starting dedicated test server on port ' + serverPort + '...');
const server = spawn('node', ['server/src/server.mjs'], {
  env: { ...process.env, PORT: String(serverPort), HOST: '127.0.0.1' },
  stdio: 'ignore',
});

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

for (let i = 0; i < 50; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${serverPort}/health`);
    if (res.ok) {
      console.log('Server is healthy on port ' + serverPort);
      break;
    }
  } catch {}
  await wait(150);
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

let tabs;
for (let i = 0; i < 40; i++) {
  try {
    const res = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = res.find(t => t.type === 'page');
    if (page) { tabs = [page]; break; }
  } catch {}
  await wait(150);
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

  await until(() => evaluate("Boolean(document.querySelector('#menu') && document.querySelector('#loading-veil')?.classList.contains('done'))"), 'menu ready');

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

  await until(() => evaluate("Boolean(window.__ssRuntime?.localAuth && !document.querySelector('#hud')?.classList.contains('hidden'))"), 'Practice Yard live');
  console.log('Entered Practice Yard!');

  await until(() => evaluate("Boolean(window.__ssRuntime?.world?.biByeLlista?.authoredModel)"), 'Authored GLB loaded');
  console.log('Authored v3.0 Bi-Bye-llista GLB is loaded in renderer!');

  // Setup render hook to bypass first person camera, hide UI overlays, and hook ballista data
  await evaluate(`(() => {
    const r = window.__ssRuntime;
    r.weapon.group.visible = false;
    document.querySelector('#practice-overlay')?.remove();
    document.querySelector('#pointer-hint')?.remove();
    document.querySelector('#hud')?.remove();
    
    const b = r.world.biByeLlista;
    const origUpdate = b.update.bind(b);
    b.update = function(timeSec, ballistaData, projectilesData) {
      const bd = window.__overrideBallistaData || ballistaData;
      const pd = window.__overrideProjData || projectilesData;
      return origUpdate(timeSec, bd, pd);
    };

    const origRender = r.renderer.render.bind(r.renderer);
    r.renderer.render = function(scene, camera) {
      if (r.__customCam) {
        camera.position.set(r.__customCam.pos[0], r.__customCam.pos[1], r.__customCam.pos[2]);
        camera.lookAt(r.__customCam.look[0], r.__customCam.look[1], r.__customCam.look[2]);
      }
      r.weapon.group.visible = false;
      return origRender(scene, camera);
    };
  })()`);

  // Viewpoint 1: Mobile Carriage (steered wheels, traversed upper turret, travel ready)
  console.log('Capturing Viewpoint 1: Mobile Carriage...');
  await evaluate(`(() => {
    const r = window.__ssRuntime;
    window.__overrideBallistaData = {
      x: 9.0, y: 0, z: -14.6,
      heading: -Math.PI / 2, // Facing East (+X)
      yaw: -Math.PI / 2 + 0.38, // Upper launcher traversed
      pitch: 0.14,
      steer: 0.75, // Articulated front/rear wheels
      mode: 'MOBILE',
      state: 'LOADED',
      health: 400,
      maxHealth: 400,
      smallBoltReady: true,
      mainBoltLoaded: true,
    };
    window.__overrideProjData = [];
    r.__customCam = { pos: [13.2, 1.8, -12.0], look: [9.0, 1.1, -14.6] };
  })()`);
  await wait(800);
  await capture('bibye-01-mobile-carriage.png');

  // Viewpoint 2: Deployed Mode (outriggers planted, main turntable elevated & traversed)
  console.log('Capturing Viewpoint 2: Deployed Mode...');
  await evaluate(`(() => {
    const r = window.__ssRuntime;
    window.__overrideBallistaData = {
      x: 9.0, y: 0, z: -14.6,
      heading: -Math.PI / 2,
      yaw: -Math.PI / 2 + 0.35, // Turntable traversed
      pitch: 0.18, // Cradle elevated
      steer: 0,
      mode: 'DEPLOYED',
      state: 'LOADED',
      health: 400,
      maxHealth: 400,
      smallBoltReady: true,
      mainBoltLoaded: true,
    };
    window.__overrideProjData = [];
    // Slightly more side/front angle to show deployed outriggers planted on turf
    r.__customCam = { pos: [12.8, 1.6, -11.5], look: [9.0, 1.1, -14.6] };
  })()`);
  await wait(1000);
  await capture('bibye-02-deployed-mode.png');

  // Viewpoint 3: Two-Stage Volley Discharge
  console.log('Capturing Viewpoint 3: Two-Stage Volley...');
  await evaluate(`(() => {
    const r = window.__ssRuntime;
    window.__overrideBallistaData = {
      x: 9.0, y: 0, z: -14.6,
      heading: -Math.PI / 2,
      yaw: -Math.PI / 2,
      pitch: 0.10,
      steer: 0,
      mode: 'DEPLOYED',
      state: 'FIRING',
      health: 400,
      maxHealth: 400,
      smallBoltReady: false,
      mainBoltLoaded: false,
    };
    window.__overrideProjData = [
      { id: 'shot-frost', subKind: 'conditioning', position: { x: 12.6, y: 1.65, z: -14.6 }, velocity: { x: 48, y: 0.5, z: 0 } },
      { id: 'shot-siege', subKind: 'siege', position: { x: 10.8, y: 1.25, z: -14.6 }, velocity: { x: 55, y: 0.3, z: 0 } }
    ];
    // Camera angle looking across the line of fire
    r.__customCam = { pos: [14.0, 1.7, -11.0], look: [11.0, 1.3, -14.6] };
  })()`);
  await wait(800);
  await capture('bibye-03-firing-volley.png');

  // Viewpoint 4: Destroyed Wreckage
  console.log('Capturing Viewpoint 4: Destroyed Wreck...');
  await evaluate(`(() => {
    const r = window.__ssRuntime;
    window.__overrideBallistaData = {
      x: 9.0, y: 0, z: -14.6,
      heading: -Math.PI / 2,
      yaw: -Math.PI / 2,
      pitch: 0,
      steer: 0,
      mode: 'DESTROYED',
      state: 'SPENT',
      health: 0,
      maxHealth: 400,
      smallBoltReady: false,
      mainBoltLoaded: false,
    };
    window.__overrideProjData = [];
    r.__customCam = { pos: [12.6, 1.4, -12.2], look: [9.0, 0.7, -14.6] };
  })()`);
  // Wait 2.2 seconds for the 1.8s destruction collapse animation to complete
  await wait(2200);
  await capture('bibye-04-wreck-destroyed.png');

  console.log('All 4 viewpoints captured successfully!');
} finally {
  try { ws?.close(); } catch {}
  chrome.kill('SIGTERM');
  server.kill('SIGTERM');
  await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
}
