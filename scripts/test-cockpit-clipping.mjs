import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const chromeBin = process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : (process.env.CHROME_BIN || 'chromium');

const cdpPort = 9299;
const serverPort = 3095;
const evidenceDir = path.resolve('output/cockpit-clipping');
const brainDir = '/Users/erendiracisneros/.gemini/antigravity/brain/bf36c922-8785-4d62-b11e-f266d5847a42';

await mkdir(evidenceDir, { recursive: true });

console.log('Starting server on port ' + serverPort + '...');
const server = spawn('node', ['server/src/server.mjs'], {
  env: { ...process.env, PORT: String(serverPort), HOST: '127.0.0.1' },
  stdio: 'ignore'
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
await sleep(1500);

const userData = path.join(tmpdir(), `ss-cockpit-clip-${process.pid}`);
const chrome = spawn(chromeBin, [
  '--headless=new',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--enable-unsafe-swiftshader',
  '--remote-allow-origins=*',
  '--window-size=1280,800',
  `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=${userData}`,
  'about:blank'
], { stdio: 'ignore' });

let ws;
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
      resolve: val => { clearTimeout(timer); resolve(val); },
      reject: err => { clearTimeout(timer); reject(err); }
    });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) {
    const desc = res.exceptionDetails.exception?.description || res.exceptionDetails.text;
    throw new Error(`Eval failed: ${desc}`);
  }
  return res.result?.value;
}

async function captureScreenshot(name) {
  const result = await send('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(result.data, 'base64');
  const diskPath = path.join(evidenceDir, name);
  await writeFile(diskPath, buf);
  const artifactPath = path.join(brainDir, name);
  try {
    await copyFile(diskPath, artifactPath);
  } catch (e) {
    console.warn('Could not copy to brainDir:', e.message);
  }
  console.log(`Screenshot saved: ${name}`);
}

async function until(fn, name, maxRetries = 200, delayMs = 100) {
  const start = Date.now();
  for (let i = 0; i < maxRetries; i++) {
    try {
      const val = await fn();
      if (val) {
        console.log(`[PASS] ${name} (${Date.now() - start}ms)`);
        return val;
      }
    } catch (e) {}
    await sleep(delayMs);
  }
  throw new Error(`Timeout waiting for: ${name}`);
}

try {
  const target = await until(async () => {
    const res = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
    const list = await res.json();
    return list.find(x => x.type === 'page');
  }, 'Chrome target');

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  ws.onmessage = e => {
    const m = JSON.parse(String(e.data));
    if (!m.id) return;
    const item = pending.get(m.id);
    if (!item) return;
    pending.delete(m.id);
    if (m.error) item.reject(new Error(m.error.message));
    else item.resolve(m.result);
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/?debug` });

  await until(() => evaluate("document.querySelector('#loading-veil')?.classList.contains('done')"), 'Menu ready');
  await evaluate(`
    document.querySelector('#player-name').value = 'CockpitProbe';
    document.querySelector('#solo-button').click();
  `);
  await until(() => evaluate("Boolean(document.querySelector('#practice-mode') && !document.querySelector('#practice-mode').disabled)"), 'Practice entry');
  await evaluate("document.querySelector('#practice-mode').click()");

  await until(() => evaluate("Boolean(window.__ssRuntime?.localAuth && window.__ssRuntime?.playing)"), 'Practice loaded');

  await evaluate(`
    const sel = document.querySelector('#practice-siege-type');
    sel.value = 'fight-and-flight';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('#practice-build-bibye').click();
  `);

  await until(() => evaluate("Boolean(window.__ssRuntime?.latestSnapshot?.fightFlight)"), 'Fight-and-Flight spawned');

  // Walk into mount range
  await evaluate(`(() => {
    const rt = window.__ssRuntime;
    const p = rt.localAuth.position;
    const b = rt.latestSnapshot.fightFlight;
    rt.input.yaw = Math.atan2(-(b.x - p.x), -(b.z - p.z));
    rt.input.enabled = true;
    rt._origMovement = rt.input.movement.bind(rt.input);
    rt.input.movement = () => ({ forward: 1, strafe: 0 });
  })()`);

  await until(async () => {
    const d = await evaluate(`(() => {
      const rt = window.__ssRuntime;
      const p = rt.localAuth.position;
      const m = rt.latestSnapshot.fightFlight;
      return Math.hypot(p.x - m.x, p.z - m.z);
    })()`);
    return d < 2.0;
  }, 'Walk near machine');

  await evaluate(`(() => {
    const rt = window.__ssRuntime;
    rt.input.movement = rt._origMovement;
    rt.input.interact();
  })()`);

  await until(() => evaluate("Boolean(window.__ssRuntime?.localAuth?.operatingFightFlightId)"), 'Mounted on Fight-and-Flight');
  await sleep(400);

  // Hide overlays for clean screenshots
  await evaluate(`(() => {
    for (const id of ['practice-overlay', 'pointer-hint', 'pointer-lock-overlay']) {
      const el = document.getElementById(id);
      if (el) el.style.setProperty('display', 'none', 'important');
    }
  })()`);

  // 1. Neutral aim
  await evaluate("window.__ssRuntime.input.pitch = 0;");
  await sleep(150);
  await captureScreenshot('cockpit-01-neutral.png');

  // 2. 50 deg upward
  await evaluate("window.__ssRuntime.input.pitch = -50 * Math.PI / 180;");
  await sleep(150);
  await captureScreenshot('cockpit-02-up-50deg.png');

  // 3. 50 deg downward
  await evaluate("window.__ssRuntime.input.pitch = 50 * Math.PI / 180;");
  await sleep(150);
  await captureScreenshot('cockpit-03-down-50deg.png');

  // 4. Extreme look limits
  await evaluate("window.__ssRuntime.input.pitch = -65 * Math.PI / 180; window.__ssRuntime.input.yaw += 0.8;");
  await sleep(150);
  await captureScreenshot('cockpit-04-limit-up-yaw.png');

  await evaluate("window.__ssRuntime.input.pitch = 65 * Math.PI / 180; window.__ssRuntime.input.yaw -= 1.6;");
  await sleep(150);
  await captureScreenshot('cockpit-05-limit-down-yaw.png');

  console.log('Cockpit angle captures complete!');
} catch (err) {
  console.error('Test error:', err);
} finally {
  try { ws?.close(); } catch {}
  try { chrome.kill(); } catch {}
  try { server.kill(); } catch {}
}
