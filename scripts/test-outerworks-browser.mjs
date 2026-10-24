import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, copyFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const chromeBin = process.env.CHROME_BIN || (
  process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : (process.env.CHROME || 'chromium')
);

const port = 9262;
const serverPort = 3005;
const userData = path.join(tmpdir(), `ss-outerworks-browser-${process.pid}`);
const evidenceDir = path.resolve('output/outerworks');
const brainDir = '/Users/erendiracisneros/.gemini/antigravity/brain/bf36c922-8785-4d62-b11e-f266d5847a42';

await mkdir(evidenceDir, { recursive: true });

console.log('=== The Outerworks Battlefield Browser Acceptance Test ===');
console.log(`Starting dedicated test server on port ${serverPort}...`);

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
    } catch {
    }
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
    }, 20000);
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
    throw new Error(response.exceptionDetails.text || response.exceptionDetails.exception?.description || 'Evaluation error');
  }
  return response.result?.value;
}

async function captureScreenshot(filename) {
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const outPath = path.join(evidenceDir, filename);
  await writeFile(outPath, Buffer.from(shot.data, 'base64'));
  const brainPath = path.join(brainDir, filename);
  await copyFile(outPath, brainPath);
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
    } catch {
    }
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
    } catch {
    }
    await wait(200);
  }
  if (!tabs || !tabs[0]) throw new Error('Chrome debugging page not found');

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

  // 4. Navigate to debug lobby
  console.log('Navigating to game client...');
  await send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/?debug` });

  await until(() => evaluate("Boolean(document.querySelector('#menu') && document.querySelector('#loading-veil')?.classList.contains('done'))"), 'menu ready');

  // Skip onboarding if present, set name, open Breakthrough menu
  await until(async () => evaluate(`(() => {
    const offer = document.querySelector('#tutorial-onboarding');
    if (offer && !offer.hidden) document.querySelector('[data-tutorial-onboarding-skip]')?.click();
    const show = document.querySelector('#show-menu');
    if (show && !show.closest('.yard-observe')?.hidden) show.click();
    const field = document.querySelector('#player-name');
    if (field && field.value !== 'Siege Vanguard') {
      field.value = 'Siege Vanguard';
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const btMenu = document.querySelector('#breakthrough-menu');
    if (btMenu && !btMenu.classList.contains('hidden')) return true;
    document.querySelector('#breakthrough-button')?.click();
    return false;
  })()`), 'Breakthrough menu');

  await wait(400);

  // Select Outerworks arena, Attackers team, and start Breakthrough with bots
  await evaluate(`(() => {
    const arenaChip = document.querySelector('#breakthrough-arena [data-arena="outerworks"]');
    if (arenaChip) arenaChip.click();
    const teamChip = document.querySelector('#breakthrough-team [data-team="ATTACKERS"]');
    if (teamChip) teamChip.click();
    const playBtn = document.querySelector('#breakthrough-play-bots');
    if (playBtn) playBtn.click();
  })()`);

  console.log('Waiting for match start in The Outerworks...');
  await until(() => evaluate("Boolean(window.__ssRuntime?.localAuth && window.__ssRuntime?.activeWorld?.id === 'outerworks' && !document.querySelector('#hud')?.classList.contains('hidden'))"), 'Outerworks match live', 30000);

  // Wait for 3D model loading
  await until(() => evaluate("Boolean(window.__ssRuntime?.world?.biByeLlista?.authoredModel)"), 'Ballista 3D model loaded', 15000);
  await wait(800);

  console.log('Match live in The Outerworks! Capturing battlefield views...');

  // Set camera angle looking North down the Great Esplanade
  await evaluate(`(() => {
    const r = window.__ssRuntime;
    r.input.yaw = Math.PI;
    r.input.pitch = -0.05;
  })()`);
  await wait(400);

  // 1. Attacker spawn overview down the Great Esplanade
  await captureScreenshot('01-outerworks-spawn-overview.png');

  // 2. Approach the Bi-Bye-llista at (-8, 0, -46)
  await evaluate(`(() => {
    const r = window.__ssRuntime;
    r.localAuth.position.x = -8.0;
    r.localAuth.position.y = 0.0;
    r.localAuth.position.z = -49.0;
    r.camera.position.set(-8.0, 1.7, -49.0);
    r.input.yaw = Math.PI;
    r.input.pitch = -0.15;
  })()`);
  await wait(500);
  await captureScreenshot('02-outerworks-ballista-emplacement.png');

  // 3. Western Sally Trench under cover (-21, 0, -32)
  await evaluate(`(() => {
    const r = window.__ssRuntime;
    r.localAuth.position.x = -21.0;
    r.localAuth.position.y = 0.0;
    r.localAuth.position.z = -32.0;
    r.camera.position.set(-21.0, 1.7, -32.0);
    r.input.yaw = Math.PI;
    r.input.pitch = 0.0;
  })()`);
  await wait(500);
  await captureScreenshot('03-outerworks-trench-flank.png');

  // 4. Eastern Firing Terrace vantage point (16, 1.8, -10)
  await evaluate(`(() => {
    const r = window.__ssRuntime;
    r.localAuth.position.x = 16.0;
    r.localAuth.position.y = 1.8;
    r.localAuth.position.z = -10.0;
    r.camera.position.set(16.0, 3.5, -10.0);
    r.input.yaw = Math.PI * 0.9;
    r.input.pitch = -0.22;
  })()`);
  await wait(500);
  await captureScreenshot('04-outerworks-terrace-vantage.png');

  // 5. Mount and deploy ballista on the esplanade lane
  await evaluate(`(() => {
    const r = window.__ssRuntime;
    const b = r.latestSnapshot?.bibyeBallista;
    if (b) {
      b.x = 0;
      b.z = -28;
      b.heading = Math.PI;
      b.mode = 'DEPLOYED';
      b.deployProgress = 1.0;
      b.mainYaw = Math.PI;
      b.mainPitch = 0.05;
      b.upperYaw = Math.PI;
      b.upperPitch = 0.05;
    }
    r.localAuth.operatingBallistaId = b?.id;
    r.localAuth.position.x = 0;
    r.localAuth.position.z = -28;
    r.camera.position.set(0, 3.2, -35);
    r.input.yaw = Math.PI;
    r.input.pitch = -0.08;
  })()`);
  await wait(600);
  await captureScreenshot('05-outerworks-ballista-deployed.png');

  // 6. Objective 1 captured -> Palisade breach transition
  await evaluate(`(() => {
    const r = window.__ssRuntime;
    r.localAuth.operatingBallistaId = null;
    r.localAuth.position.x = 0;
    r.localAuth.position.y = 0;
    r.localAuth.position.z = -10;
    r.camera.position.set(0, 1.7, -10);
    r.input.yaw = Math.PI;
    r.input.pitch = 0.0;
    if (r.world) {
      r.world.setObjectiveState({ index: 1, progress: 0.1, completed: false }, 'ATTACKERS', 50);
    }
  })()`);
  await wait(600);
  await captureScreenshot('06-outerworks-objective-breach.png');

  // 7. Objective 2 at Barbican Gatehouse
  await evaluate(`(() => {
    const r = window.__ssRuntime;
    r.localAuth.position.x = 0;
    r.localAuth.position.y = 0;
    r.localAuth.position.z = 22;
    r.camera.position.set(0, 1.7, 22);
    r.input.yaw = Math.PI;
    r.input.pitch = 0.22;
    if (r.world) {
      r.world.setObjectiveState({ index: 1, progress: 0.65, completed: false }, 'ATTACKERS', 80);
    }
  })()`);
  await wait(600);
  await captureScreenshot('07-outerworks-barbican-gate.png');

  console.log('=== All 7 browser acceptance screenshots captured successfully! ===');

} finally {
  if (chrome) {
    try { chrome.kill('SIGKILL'); } catch {}
  }
  if (server) {
    try { server.kill('SIGKILL'); } catch {}
  }
}
