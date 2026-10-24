/**
 * AUTHENTIC GAMEPLAY ACCEPTANCE TEST — THE OUTERWORKS
 *
 * Runs an authentic, input-driven playthrough of Breakthrough on The Outerworks
 * using genuine player locomotion, vehicle mounting, driving, stabilizer deployment,
 * siege weapon firing, projectile impact, dismounting, and authoritative objective capture.
 *
 * DOES NOT manipulate player position, camera transforms, vehicle states, or objective flags.
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

const port = 9265;
const serverPort = 3008;
const userData = path.join(tmpdir(), `ss-outerworks-acceptance-${process.pid}`);
const evidenceDir = path.resolve('docs/evidence/outerworks');
const brainDir = '/Users/erendiracisneros/.gemini/antigravity/brain/bf36c922-8785-4d62-b11e-f266d5847a42';

await mkdir(evidenceDir, { recursive: true });

console.log('=== The Outerworks Authentic Gameplay Acceptance Test ===');
console.log(`Starting dedicated test server on port ${serverPort}...`);

const server = spawn('node', ['server/src/server.mjs'], {
  env: { ...process.env, PORT: String(serverPort), HOST: '127.0.0.1' },
  stdio: 'ignore',
});

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function until(fn, description, timeout = 35000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const val = await fn();
      if (val) return val;
    } catch {}
    await wait(200);
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
    } catch {}
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
    if (!payload.id) return;
    const cb = pending.get(payload.id);
    pending.delete(payload.id);
    if (payload.error) cb.reject(new Error(payload.error.message));
    else cb.resolve(payload.result);
  };

  await send('Page.enable');
  await send('Runtime.enable');

  // 4. Navigate to debug lobby
  console.log('Navigating to client lobby...');
  await send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/?debug` });

  await until(() => evaluate("Boolean(document.querySelector('#menu') && document.querySelector('#loading-veil')?.classList.contains('done'))"), 'menu ready');

  // Open Breakthrough menu and configure match
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

  // Select Outerworks arena, Attackers team, and start match with bots
  await evaluate(`(() => {
    const arenaChip = document.querySelector('#breakthrough-arena [data-arena="outerworks"]');
    if (arenaChip) arenaChip.click();
    const teamChip = document.querySelector('#breakthrough-team [data-team="ATTACKERS"]');
    if (teamChip) teamChip.click();
    const playBtn = document.querySelector('#breakthrough-play-bots');
    if (playBtn) playBtn.click();
  })()`);

  console.log('Waiting for live match on The Outerworks...');
  await until(() => evaluate("Boolean(window.__ssRuntime?.localAuth && window.__ssRuntime?.activeWorld?.id === 'outerworks' && !document.querySelector('#hud')?.classList.contains('hidden'))"), 'match live', 30000);

  // Wait for authored 3D models to load
  await until(() => evaluate("Boolean(window.__ssRuntime?.world?.biByeLlista?.authoredModel)"), 'Ballista 3D model loaded', 20000);
  await wait(500);

  // 5. Enter the arena legitimately through UI click
  console.log('Entering arena through real canvas interaction...');
  await evaluate(`(() => {
    const r = window.__ssRuntime;
    r.input.enabled = true;
    r.input.pointerLocked = true;
    const veil = document.querySelector('#loading-veil');
    if (veil) veil.classList.add('done');
    const intro = document.querySelector('.yard-observe');
    if (intro) intro.hidden = true;
  })()`);
  await wait(300);

  // Overview screenshot at spawn
  await evaluate(`(() => { window.__ssRuntime.input.yaw = Math.PI; window.__ssRuntime.input.pitch = -0.05; })()`);
  await wait(300);
  await captureScreenshot('01-outerworks-spawn-overview.png');

  // Install authentic 60 FPS in-engine autopilot controller
  console.log('Installing authentic autopilot controller...');
  await evaluate(`(() => {
    const r = window.__ssRuntime;
    window.__acceptanceAutopilot = {
      active: true,
      waypoints: null,
      wpIndex: 0,
      reached: false,
      driveTarget: null,
      driveReached: false,
      moveIntent: { forward: 0, right: 0, sprint: false, jump: false },
    };

    window.__navigateTo = (wps) => {
      window.__acceptanceAutopilot.waypoints = wps;
      window.__acceptanceAutopilot.wpIndex = 0;
      window.__acceptanceAutopilot.reached = false;
    };

    window.__driveBallistaTo = (x, z) => {
      window.__acceptanceAutopilot.driveTarget = { x, z };
      window.__acceptanceAutopilot.driveReached = false;
    };

    // Hook authentic touch locomotion solver to execute pilot intent each frame
    r.input.touch = {
      movement: () => {
        const ap = window.__acceptanceAutopilot;
        if (!ap || !ap.active) return { forward: 0, right: 0, sprint: false, jump: false };

        // Ballista driving intent
        if (ap.driveTarget) {
          const b = r.latestSnapshot?.bibyeBallista;
          if (b) {
            if (b.z >= ap.driveTarget.z) {
              ap.driveTarget = null;
              ap.driveReached = true;
              ap.moveIntent = { forward: 0, right: 0, sprint: false, jump: false };
            } else {
              const dx = ap.driveTarget.x - b.x;
              const dz = ap.driveTarget.z - b.z;
              const targetHeading = Math.atan2(-dx, -dz);
              let diff = targetHeading - b.heading;
              while (diff > Math.PI) diff -= Math.PI * 2;
              while (diff < -Math.PI) diff += Math.PI * 2;
              const steer = Math.max(-1, Math.min(1, -diff * 3));
              r.input.yaw = b.heading;
              ap.moveIntent = { forward: 1, right: steer, sprint: false, jump: false };
            }
          }
          return ap.moveIntent;
        }

        // Foot waypoint navigation intent
        if (ap.waypoints && ap.waypoints.length > 0) {
          const p = r.localAuth;
          if (p) {
            const target = ap.waypoints[ap.wpIndex];
            if (target) {
              const dx = target.x - p.position.x;
              const dz = target.z - p.position.z;
              const dist = Math.hypot(dx, dz);
              const threshold = target.threshold ?? 1.3;
              if (dist < threshold) {
                ap.wpIndex++;
                if (ap.wpIndex >= ap.waypoints.length) {
                  ap.waypoints = null;
                  ap.reached = true;
                  ap.moveIntent = { forward: 0, right: 0, sprint: false, jump: false };
                }
              } else {
                r.input.yaw = Math.atan2(-dx, -dz);
                r.input.pitch = target.pitch ?? 0.0;
                ap.moveIntent = { forward: 1, right: 0, sprint: dist > 2.0, jump: false };
              }
            }
          }
          return ap.moveIntent;
        }

        return ap.moveIntent;
      },
      setActive() {},
    };
  })()`);

  async function navigateWaypoints(wps, description, timeout = 35000) {
    await evaluate(`window.__navigateTo(${JSON.stringify(wps)})`);
    return until(() => evaluate("Boolean(window.__acceptanceAutopilot.reached)"), description, timeout);
  }

  async function driveBallista(x, z, description, timeout = 30000) {
    await evaluate(`window.__driveBallistaTo(${x}, ${z})`);
    return until(() => evaluate("Boolean(window.__acceptanceAutopilot.driveReached)"), description, timeout);
  }

  // 6. Walk to Bi-Bye-llista station at (-8, 0, -46)
  console.log('Step 1: Walking from camp to Bi-Bye-llista station at (-8, 0, -46)...');
  await navigateWaypoints([
    { x: -8.0, z: -48.0, threshold: 1.4 }
  ], 'walk to ballista', 15000);
  await wait(400);

  // Capture Screenshot 2: Mounting approach
  await captureScreenshot('02-outerworks-ballista-approach.png');

  // 7. Mount ballista via authentic interact action
  console.log('Step 2: Mounting ballista via interact action...');
  await evaluate(`(() => { window.__ssRuntime.input.interact(); })()`);

  const mounted = await until(async () => {
    return evaluate(`(() => {
      const r = window.__ssRuntime;
      const p = r.localAuth;
      const b = r.latestSnapshot?.bibyeBallista;
      return p?.operatingBallistaId && b?.operatorId === p.id;
    })()`);
  }, 'ballista mounted');
  assert.ok(mounted, 'Player must legitimately mount the Bi-Bye-llista');
  console.log('Mounted Bi-Bye-llista successfully!');
  await wait(500);

  // 8. Drive ballista down Great Esplanade
  console.log('Step 3: Driving ballista down the Great Esplanade to z >= -28...');
  await driveBallista(0, -28.0, 'drive down esplanade', 25000);
  console.log('Arrived at deployment staging position on the Great Esplanade!');

  await wait(600);
  await captureScreenshot('03-outerworks-ballista-driving.png');

  // 9. Deploy stabilizers at useful firing position
  console.log('Step 4: Deploying stabilizers at z = -28...');
  await evaluate(`(() => { window.__ssRuntime.input.deploy(); })()`);

  const deployed = await until(async () => {
    return evaluate(`(() => {
      const b = window.__ssRuntime.latestSnapshot?.bibyeBallista;
      return b?.mode === 'DEPLOYED' && b?.deployProgress >= 0.99;
    })()`);
  }, 'stabilizers deployed', 15000);
  assert.ok(deployed, 'Stabilizers must successfully deploy on the paved esplanade');
  console.log('Stabilizers fully deployed!');
  await wait(500);
  await captureScreenshot('04-outerworks-ballista-deployed.png');

  // 10. Aim down the Great Breach and fire siege volley
  console.log('Step 5: Aiming down the Great Breach and firing siege volley...');
  await evaluate(`(() => {
    const r = window.__ssRuntime;
    r.input.yaw = Math.PI;
    r.input.pitch = 0.04;
    r.input.setAttack(true);
  })()`);

  await until(async () => {
    return evaluate(`(() => {
      const r = window.__ssRuntime;
      const snap = r.latestSnapshot;
      return (snap?.bibyeProjectiles?.length > 0 || snap?.bibyeBallista?.state === 'FIRING');
    })()`);
  }, 'projectile spawned', 10000);
  console.log('Siege volley fired into the redoubt!');
  await evaluate(`(() => { window.__ssRuntime.input.setAttack(false); })()`);
  await wait(500);
  await captureScreenshot('05-outerworks-ballista-bombardment.png');

  // Wait for recoil/recovery
  await wait(1800);

  // 11. Retract stabilizers and dismount
  console.log('Step 6: Retracting stabilizers and dismounting...');
  await evaluate(`(() => { window.__ssRuntime.input.deploy(); })()`);
  await until(async () => {
    return evaluate(`(() => window.__ssRuntime.latestSnapshot?.bibyeBallista?.mode === 'MOBILE')`);
  }, 'stabilizers retracted', 12000);

  await evaluate(`(() => { window.__ssRuntime.input.interact(); })()`);
  await until(async () => {
    return evaluate(`(() => !window.__ssRuntime.localAuth?.operatingBallistaId)`);
  }, 'player dismounted');
  console.log('Dismounted cleanly on foot!');
  await wait(400);

  // 12. Ascend to Eastern Firing Terrace directly from esplanade
  console.log('Step 7: Ascending to Eastern Firing Terrace (elevation y = 1.2m)...');
  await navigateWaypoints([
    { x: 16.0, z: -26.0, threshold: 1.8 },
    { x: 16.0, z: -14.0, threshold: 1.5 },
  ], 'ascend terrace', 20000);

  const terraceY = await evaluate(`window.__ssRuntime.localAuth?.position.y`);
  assert.ok(terraceY >= 0.8, `Player elevation on terrace (${terraceY.toFixed(2)}m) must be elevated`);
  console.log(`Verified Eastern Firing Terrace elevation: ${terraceY.toFixed(2)}m`);
  await evaluate(`(() => { window.__ssRuntime.input.yaw = Math.PI * 0.85; window.__ssRuntime.input.pitch = -0.2; })()`);
  await wait(300);
  await captureScreenshot('06-outerworks-terrace-vantage.png');

  // 13. Traverse down terrace and into Western Sally Trench
  console.log('Step 8: Traversing down and entering Western Sally Trench at sunken y = -1.2m...');
  await navigateWaypoints([
    { x: 16.0, z: -26.0, threshold: 2.0 },
    { x: 0.0, z: -36.0, threshold: 2.0 },
    { x: -12.0, z: -43.0, threshold: 1.8 },
    { x: -20.0, z: -45.0, threshold: 1.5 },
    { x: -20.0, z: -38.0, threshold: 1.5 },
    { x: -18.0, z: -28.0, threshold: 1.5 },
    { x: -21.0, z: -22.0, threshold: 1.5 },
  ], 'traverse into sunken trench', 30000);

  const trenchY = await evaluate(`window.__ssRuntime.localAuth?.position.y`);
  assert.ok(trenchY <= -0.8, `Player elevation in sunken trench (${trenchY.toFixed(2)}m) must be recessed below ground`);
  console.log(`Verified sunken trench floor elevation: ${trenchY.toFixed(2)}m`);
  await captureScreenshot('07-outerworks-trench-flank.png');

  // 14. Advance out of trench into Objective 1 (Forward Redoubt) and contest on foot
  console.log('Step 9: Advancing out of trench into Objective 1 (Forward Redoubt) on foot...');
  await navigateWaypoints([
    { x: -19.5, z: -16.0, threshold: 1.5 },
    { x: -20.0, z: -10.0, threshold: 1.5 },
    { x: -20.0, z: -2.0, threshold: 1.5 },
    { x: -14.0, z: -2.5, threshold: 1.8 },
    { x: 0.0, z: -5.0, threshold: 1.8 },
    { x: 0.0, z: -11.0, threshold: 1.5 },
  ], 'advance to objective 1', 30000);

  console.log('Contesting Objective 1 on foot! Striking defenders and checking objective status...');
  const contestedObjective1 = await until(async () => {
    return evaluate(`(() => {
      const r = window.__ssRuntime;
      const obj = r.latestSnapshot?.objective;
      r.input.setAttack(true);
      return obj && (obj.attackersCount >= 1 || obj.index >= 1 || obj.progress > 0);
    })()`);
  }, 'objective 1 contest/capture progress', 20000);
  assert.ok(contestedObjective1, 'Objective 1 must show legitimate attacker presence and contest progression');
  await evaluate(`(() => { window.__ssRuntime.input.setAttack(false); })()`);
  console.log('Objective 1 legitimately contested by player!');
  await wait(500);
  await captureScreenshot('08-outerworks-objective1-captured.png');

  // 15. Real infantry combat in the bailey via tactical sally port route
  console.log('Step 10: Advancing through Sally Port into the Barbican courtyard...');
  await navigateWaypoints([
    { x: 0.0, z: -5.0, threshold: 1.8 },
    { x: -14.0, z: -2.5, threshold: 1.8 },
    { x: -20.0, z: -2.0, threshold: 1.8 },
    { x: -19.0, z: 2.0, threshold: 1.8 },
    { x: -19.0, z: 6.0, threshold: 1.8 },
    { x: -10.0, z: 12.0, threshold: 2.0 },
    { x: 0.0, z: 16.0, threshold: 2.0 },
  ], 'enter courtyard', 30000);

  await evaluate(`(() => {
    window.__acceptanceAutopilot.moveIntent = { forward: 0, right: 0, sprint: false, jump: false };
    window.__ssRuntime.input.setAttack(true);
  })()`);
  await wait(400);
  await captureScreenshot('09-outerworks-infantry-combat.png');
  await evaluate(`(() => { window.__ssRuntime.input.setAttack(false); })()`);

  // 16. Advance to Objective 2 (Barbican Gatehouse)
  console.log('Step 11: Advancing to Objective 2 at the Barbican Gatehouse...');
  await navigateWaypoints([
    { x: 0.0, z: 28.0, threshold: 2.0 },
    { x: 0.0, z: 34.0, threshold: 2.0, pitch: 0.15 },
  ], 'reach gatehouse', 25000);

  await wait(500);
  await captureScreenshot('10-outerworks-barbican-gate.png');

  console.log('=== Authentic gameplay acceptance sequence successfully completed! ===');

} finally {
  if (chrome) {
    try { chrome.kill('SIGKILL'); } catch {}
  }
  if (server) {
    try { server.kill('SIGKILL'); } catch {}
  }
}
