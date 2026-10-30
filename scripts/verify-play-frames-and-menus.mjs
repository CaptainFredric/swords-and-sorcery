import { spawn } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const PORT = 3092;
const CDP_PORT = 9298;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startServer() {
  const srv = spawn('node', ['server/src/server.mjs'], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  srv.stderr.on('data', (d) => process.stderr.write(`[srv-err] ${d}`));
  for (let i = 0; i < 30; i++) {
    await wait(200);
    try {
      const res = await fetch(`http://localhost:${PORT}/`);
      if (res.ok) {
        console.log(`Server healthy on port ${PORT}`);
        return srv;
      }
    } catch {}
  }
  srv.kill();
  throw new Error('Server failed to start');
}

async function startChrome() {
  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--remote-allow-origins=*',
    '--disable-gpu',
    '--no-sandbox',
    '--mute-audio',
    `--window-size=1280,720`,
    'about:blank',
  ]);
  for (let i = 0; i < 30; i++) {
    await wait(200);
    try {
      const res = await fetch(`http://localhost:${CDP_PORT}/json/list`);
      if (res.ok) {
        const list = await res.json();
        if (list.length > 0) return { chrome, pageWsUrl: list[0].webSocketDebuggerUrl };
      }
    } catch {}
  }
  chrome.kill();
  throw new Error('Chrome failed to start');
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.nextId = 1;
    this.callbacks = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    this.ws.addEventListener('message', (ev) => {
      const data = JSON.parse(ev.data);
      if (data.id && this.callbacks.has(data.id)) {
        const { resolve, reject } = this.callbacks.get(data.id);
        this.callbacks.delete(data.id);
        if (data.error) reject(new Error(data.error.message));
        else resolve(data.result);
      }
    });
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr) {
    const res = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true });
    return res?.result?.value;
  }

  async captureScreenshot(name) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    const outDir = join(process.cwd(), 'output', 'play-frames-evidence');
    mkdirSync(outDir, { recursive: true });
    const localPath = join(outDir, name);
    const { writeFileSync } = await import('node:fs');
    writeFileSync(localPath, buffer);
    const brainDir = '/Users/erendiracisneros/.gemini/antigravity/brain/bf36c922-8785-4d62-b11e-f266d5847a42';
    copyFileSync(localPath, join(brainDir, name));
    console.log(`Captured screenshot: ${name}`);
  }
}

async function main() {
  console.log('=== Inspection Play Frames & Menu Verification ===');
  const server = await startServer();
  let chromeProc, cdp;

  try {
    const { chrome, pageWsUrl } = await startChrome();
    chromeProc = chrome;
    cdp = new CdpClient(pageWsUrl);
    await cdp.connect();

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    console.log('Navigating to game with ?debug...');
    await cdp.send('Page.navigate', { url: `http://localhost:${PORT}/?debug` });
    await wait(2000);

    console.log('Starting Inspection Practice session...');
    await cdp.eval(`
      window.__ssLink.startInspectionPractice('Director', 'castleward');
      window.__ssLink.arenaReady(true);
    `);

    for (let i = 0; i < 40; i++) {
      const state = await cdp.eval(`window.__ssLink?.playingLocally && window.__ssRuntime?.playing ? 'playing' : 'loading'`);
      if (state === 'playing') break;
      await wait(200);
    }
    await wait(1000);

    const debugDom = await cdp.eval(`({
      titleEl: document.querySelector('#practice-tools-title')?.outerHTML,
      practiceOverlay: document.querySelector('#practice-overlay')?.outerHTML?.slice(0, 300),
      inspectorTools: document.querySelector('.inspection-camera-ui')?.outerHTML?.slice(0, 300)
    })`);
    console.log('Debug DOM:', debugDom);

    await cdp.captureScreenshot('scenario-inspection-menu-clarity.png');

    // Test toggle minimize
    console.log('Testing minimize toggle on left panel...');
    await cdp.eval(`document.querySelector('#practice-panel-toggle').click();`);
    await wait(300);
    const isMinimized = await cdp.eval(`document.querySelector('#practice-panel-content').classList.contains('hidden')`);
    console.log('Left panel minimized:', isMinimized);
    if (!isMinimized) throw new Error('Left panel failed to minimize');

    // Spawn a dummy from Inspection Yard
    console.log('Spawning dummy via Inspector Tools...');
    await cdp.eval(`
      const sel = document.querySelector('[data-stage-dummy-type]');
      if (sel) sel.value = 'GUARDING';
      document.querySelector('[data-camera="stageSpawnDummy"]').click();
    `);
    await wait(1000);
    const hasDummy = await cdp.eval(`Boolean(window.__ssLink?.latestSnapshot?.players?.some(p => p.actorKind === 'dummy'))`);
    console.log('Dummy spawned via Inspector:', hasDummy);
    if (!hasDummy) throw new Error('Failed to spawn dummy via Inspector Tools');

    // Cast fireball, freeze, then test Play Frames
    console.log('Casting Fireball...');
    await cdp.eval(`
      window.__ssLink.cast({ x: 0, y: 0, z: 1 });
    `);
    await wait(400); // Wait for projectile to spawn and travel

    const projSpawned = await cdp.eval(`(window.__ssLink.latestSnapshot?.projectiles?.length || 0) > 0`);
    console.log('Projectile spawned:', projSpawned);
    if (!projSpawned) throw new Error('Projectile failed to spawn');

    const posBefore = await cdp.eval(`window.__ssLink.latestSnapshot.projectiles[0].position`);
    console.log('Projectile position before freeze:', posBefore);

    // Freeze ALL
    console.log('Freezing scene (ALL)...');
    await cdp.eval(`window.__ssLink.setInspectionFreezeMode('all')`);
    await wait(500);

    const posDuringFreeze = await cdp.eval(`window.__ssLink.latestSnapshot.projectiles[0].position`);
    console.log('Projectile position during freeze:', posDuringFreeze);

    // Click PLAY FRAMES
    console.log('Activating Play Frames...');
    await cdp.eval(`document.querySelector('[data-camera="playFrames"]').click()`);
    await wait(600); // Let 3 frame beats advance

    const posAfterPlayFrames = await cdp.eval(`window.__ssLink.latestSnapshot.projectiles[0].position`);
    console.log('Projectile position after Play Frames:', posAfterPlayFrames);

    const movedZ = Math.abs((posAfterPlayFrames?.z ?? 0) - (posDuringFreeze?.z ?? 0));
    console.log('Projectile displacement during Play Frames:', movedZ);
    if (movedZ < 0.1) throw new Error(`Projectile did not fly during Play Frames! Displacement: ${movedZ}`);

    await cdp.captureScreenshot('scenario-play-frames-flying-projectile.png');

    // Unpause / Resume
    console.log('Clicking RESUME / Unpause...');
    await cdp.eval(`document.querySelector('[data-camera="freeze"]').click()`);
    await wait(400);

    const liveState = await cdp.eval(`({
      frozen: window.__ssLink.inspectionFrozen,
      freezeMode: window.__ssLink.inspectionFreezeMode,
      playingFrames: window.__ssLink.inspectionFramesPlaying,
      freezeProjectiles: window.__ssLink.inspectionFreezeProjectiles
    })`);
    console.log('State after resume:', liveState);
    if (liveState.frozen || liveState.freezeMode !== 'none' || liveState.playingFrames || liveState.freezeProjectiles) {
      throw new Error('Scene did not cleanly unpause everything on resume');
    }

    await cdp.captureScreenshot('scenario-unpause-everything-resumed.png');

    console.log('All verification checks passed successfully!');
  } finally {
    if (chromeProc) chromeProc.kill();
    server.kill();
    console.log('Verification finished.');
  }
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
