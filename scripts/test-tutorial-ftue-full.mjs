import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const chromeBin = process.env.CHROME_BIN || (
  process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : (process.env.CHROME || 'chromium')
);
const port = 9270;
const serverPort = 3010;
const userData = path.join(tmpdir(), `ss-tutorial-full-${process.pid}`);
const evidenceDir = path.resolve('output/tutorial-full');
await mkdir(evidenceDir, { recursive: true });

console.log('Starting dedicated test server on port', serverPort);
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
    console.error('EXCEPTION DETAILS:', JSON.stringify(response.exceptionDetails, null, 2));
    throw new Error(response.exceptionDetails.text || response.exceptionDetails.exception?.description || 'Evaluation error');
  }
  return response.result?.value;
}

async function captureScreenshot(filename) {
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const outPath = path.join(evidenceDir, filename);
  await writeFile(outPath, Buffer.from(shot.data, 'base64'));
  console.log(`Saved screenshot: ${outPath}`);
  return outPath;
}

let chrome;

try {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const res = await fetch(`http://127.0.0.1:${serverPort}/health`);
      if (res.ok) { console.log('Server is healthy'); break; }
    } catch {}
    await wait(150);
  }

  chrome = spawn(chromeBin, [
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--window-size=1280,720',
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
    } catch {}
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
    if (payload.method === 'Runtime.consoleAPICalled') {
      console.log('BROWSER CONSOLE:', payload.params?.args?.map(a => a.value ?? a.description).join(' '));
    }
    if (payload.method === 'Runtime.exceptionThrown') {
      console.error('BROWSER UNCAUGHT EXCEPTION:', payload.params?.exceptionDetails?.exception?.description || payload.params?.exceptionDetails?.text);
    }
    if (!payload.id) return;
    const cb = pending.get(payload.id);
    pending.delete(payload.id);
    if (payload.error) cb.reject(new Error(payload.error.message));
    else cb.resolve(payload.result);
  };

  await send('Page.enable');
  await send('Runtime.enable');

  console.log('Navigating to game...');
  await send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/?debug` });

  // Wait for loading veil to lift
  for (let i = 0; i < 60; i++) {
    const lifted = await evaluate(`Boolean(document.querySelector('#loading-veil.done'))`);
    if (lifted) break;
    await wait(250);
  }
  await wait(500);

  // Set name, open Solo menu, and click Tutorial
  await evaluate(`(() => {
    const nameInput = document.querySelector('#player-name');
    if (nameInput) nameInput.value = 'Spellblade';
    for (const f of document.querySelectorAll('input[type="text"], #player-name')) f.value = 'Spellblade';
    document.querySelector('#solo-button')?.click();
  })()`);
  await wait(400);
  await evaluate(`(() => {
    document.querySelector('#tutorial-mode')?.click();
  })()`);

  for (let i = 0; i < 40; i++) {
    const active = await evaluate(`Boolean(window.__ssTutorial?.director?.state === 'running')`);
    if (active) break;
    await wait(250);
  }
  console.log('Tutorial session running!');

  // Wait for arena gate
  for (let i = 0; i < 40; i++) {
    const gateHidden = await evaluate(`document.querySelector('#arena-gate')?.classList.contains('hidden')`);
    if (gateHidden) break;
    await wait(250);
  }
  await wait(800);

  async function getState() {
    return await evaluate(`(() => {
      const s = window.__ssTutorial;
      const r = window.__ssRuntime;
      const p = s?.host?.player;
      const rival = s?.host?.room?.players?.get(s?.rivalId);
      const wp = document.querySelector('.rival-waypoint');
      const wpRect = wp?.getBoundingClientRect();
      const caption = document.querySelector('.tutorial-caption');
      const instr = document.querySelector('.tutorial-instruction');
      const obj = document.querySelector('.objective-card');
      return {
        beat: s?.director?.current?.id,
        segment: s?.director?.current?.segment,
        chapter: s?.director?.current?.chapter,
        prompt: s?.director?.current?.line,
        speaker: s?.director?.current?.speaker,
        advanceOn: s?.director?.current?.advanceOn,
        permissions: s?.director?.permissions ?? [],
        playerPos: p?.position ? { x: +p.position.x.toFixed(1), y: +p.position.y.toFixed(1), z: +p.position.z.toFixed(1) } : null,
        playerYaw: p?.yaw ? +p.yaw.toFixed(2) : 0,
        playerStamina: p?.guardStamina ? +p.guardStamina.toFixed(1) : 0,
        playerHealth: p?.health ? +p.health.toFixed(1) : 0,
        rivalPos: rival?.position ? { x: +rival.position.x.toFixed(1), y: +rival.position.y.toFixed(1), z: +rival.position.z.toFixed(1) } : null,
        rivalHealth: rival?.health ? +rival.health.toFixed(1) : 0,
        rivalMode: s?.rival?.mode,
        waypoint: {
          text: wp?.textContent?.replace(/\\s+/g, ' ').trim(),
          visible: !wp?.hidden && wpRect && wpRect.width > 0,
          rect: wpRect ? { left: Math.round(wpRect.left), top: Math.round(wpRect.top) } : null,
        },
        captionText: caption?.textContent?.replace(/\\s+/g, ' ').trim(),
        instructionText: instr?.textContent?.replace(/\\s+/g, ' ').trim(),
        objectiveText: obj?.textContent?.replace(/\\s+/g, ' ').trim(),
      };
    })()`);
  }

  // 1. Initial Opening Spawn
  console.log('Step 1: Opening Spawn');
  let st = await getState();
  console.log(st);
  await captureScreenshot('01-spawn.png');

  // Fast forward dialogue to look-prompt
  console.log('Advancing opening dialogue...');
  while (true) {
    st = await getState();
    if (st.beat === 'look-prompt') break;
    await evaluate(`(() => {
      const btn = document.querySelector('[data-tutorial-continue]');
      if (btn) btn.click();
      else window.__ssTutorial?.director?.advance();
    })()`);
    await wait(200);
  }
  console.log('Step 2: Look prompt');
  console.log(st);
  await captureScreenshot('02-look-prompt.png');

  // Complete look
  await evaluate(`(() => {
    const s = window.__ssTutorial;
    const r = window.__ssRuntime;
    r?.input?.turn(1.0, 0);
    s?.director?.fact('player-looked');
    s?.director?.accept('player-looked');
  })()`);
  await wait(500);

  // Advance through dialogue to walk-prompt
  console.log('Advancing to walk prompt...');
  while (true) {
    st = await getState();
    if (st.beat === 'walk-prompt') break;
    await evaluate(`(() => {
      const btn = document.querySelector('[data-tutorial-continue]');
      if (btn) btn.click();
      else window.__ssTutorial?.director?.advance();
    })()`);
    await wait(200);
  }
  console.log('Step 3: Walk prompt');
  console.log(st);
  await captureScreenshot('03-walk-prompt.png');

  // Turn camera toward Gate A (yaw ~ -1.02 rad = -58.4 deg)
  console.log('Facing Gate A and walking toward it...');
  await evaluate(`(() => {
    const r = window.__ssRuntime;
    const h = window.__ssLink.local;
    const p = h.player;
    const target = { x: 68, z: 168 };
    const dx = target.x - p.position.x;
    const dz = target.z - p.position.z;
    const yaw = Math.atan2(-dx, -dz);
    if (r?.input) r.input.yaw = yaw;
    p.yaw = yaw;
  })()`);
  await wait(500);
  st = await getState();
  console.log('Facing Gate A:', st);
  await captureScreenshot('04-facing-gate-a.png');

  // Advance to sprint-prompt
  console.log('Advancing to Sprint...');
  await evaluate(`(() => {
    const s = window.__ssTutorial;
    s?.director?.fact('approach-progress');
    s?.director?.accept('approach-progress');
  })()`);
  await wait(300);

  // Advance through dialogue to sprint-prompt
  for (let i = 0; i < 10; i++) {
    st = await getState();
    if (st.beat === 'sprint-prompt') break;
    await evaluate(`(() => {
      const btn = document.querySelector('[data-tutorial-continue]');
      if (btn) btn.click();
      else window.__ssTutorial?.director?.advance();
    })()`);
    await wait(200);
  }
  st = await getState();
  console.log('Step 4: Sprint prompt:', st);
  await captureScreenshot('05-sprint-prompt.png');

  // Jump to Introductions checkpoint
  console.log('Advancing to Introductions checkpoint...');
  await evaluate(`(() => {
    const s = window.__ssTutorial;
    s?.restartChapter?.('introductions') || s?.beginChapter?.('introductions');
  })()`);
  await wait(1000);
  st = await getState();
  console.log('Step 5: Introductions:', st);
  await captureScreenshot('06-introductions.png');

  // Advance to first attack
  console.log('Advancing to Attack prompt...');
  for (let i = 0; i < 15; i++) {
    st = await getState();
    if (st.beat === 'attack-prompt') break;
    await evaluate(`(() => {
      const btn = document.querySelector('[data-tutorial-continue]');
      if (btn) btn.click();
      else window.__ssTutorial?.director?.advance();
    })()`);
    await wait(200);
  }
  st = await getState();
  console.log('Step 6: Attack prompt:', st);
  await captureScreenshot('07-attack-prompt.png');

  // Advance to Guard prompt
  console.log('Advancing to Guard prompt...');
  await evaluate(`(() => {
    const s = window.__ssTutorial;
    s?.director?.fact('sword-contact');
    s?.director?.fact('rival-sword-drawn');
    s?.director?.accept('sword-contact');
    s?.director?.accept('rival-sword-drawn');
  })()`);
  await wait(300);

  for (let i = 0; i < 10; i++) {
    st = await getState();
    if (st.beat === 'guard-prompt') break;
    await evaluate(`(() => {
      const btn = document.querySelector('[data-tutorial-continue]');
      if (btn) btn.click();
      else window.__ssTutorial?.director?.advance();
    })()`);
    await wait(200);
  }
  st = await getState();
  console.log('Step 7: Guard prompt:', st);
  await captureScreenshot('08-guard-prompt.png');

  // Jump to Bridge checkpoint
  console.log('Advancing to Bridge checkpoint...');
  await evaluate(`(() => {
    const s = window.__ssTutorial;
    s?.restartChapter?.('bridge') || s?.beginChapter?.('bridge');
  })()`);
  await wait(1000);
  st = await getState();
  console.log('Step 8: Bridge approach:', st);
  await captureScreenshot('09-bridge-approach.png');

  // Advance to Dash prompt
  for (let i = 0; i < 10; i++) {
    st = await getState();
    if (st.beat === 'dash-prompt') break;
    await evaluate(`(() => {
      const btn = document.querySelector('[data-tutorial-continue]');
      if (btn) btn.click();
      else window.__ssTutorial?.director?.advance();
    })()`);
    await wait(200);
  }
  st = await getState();
  console.log('Step 9: Dash prompt at bridge:', st);
  await captureScreenshot('10-dash-prompt.png');

  // Jump to Final Duel checkpoint
  console.log('Advancing to Final Fight checkpoint...');
  await evaluate(`(() => {
    const s = window.__ssTutorial;
    s?.restartChapter?.('final-guard') || s?.beginChapter?.('final-guard');
  })()`);
  await wait(1000);
  st = await getState();
  console.log('Step 10: Final Duel at Tattle On You:', st);
  await captureScreenshot('11-final-duel.png');

  // Complete tutorial and view ending
  console.log('Advancing to Tutorial Ending...');
  await evaluate(`(() => {
    const s = window.__ssTutorial;
    s?.director?.fact('rival-turned');
    s?.director?.fact('rival-guard-broken');
    s?.director?.fact('rival-defeated');
    s?.director?.fact('title-first-ended');
    s?.director?.fact('title-final-ended');
    s?.director?.fact('departure-complete');
    s?.director?.fact('title-ended');
    s?.director?.jumpToBeat?.('tutorial-ended') || s?.director?.skip?.();
  })()`);
  await wait(1000);
  st = await getState();
  console.log('Step 11: Tutorial Completion:', st);
  await captureScreenshot('12-tutorial-ended.png');

} finally {
  try { socket?.close(); } catch {}
  try { chrome?.kill('SIGKILL'); } catch {}
  try { server?.kill('SIGKILL'); } catch {}
}
