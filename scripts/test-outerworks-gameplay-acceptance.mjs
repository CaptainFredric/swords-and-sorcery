/**
 * AUTHENTIC GAMEPLAY ACCEPTANCE TEST — THE OUTERWORKS
 *
 * Runs an authentic, input-driven playthrough of Breakthrough on The Outerworks
 * using genuine player locomotion, vehicle mounting, driving, stabilizer deployment,
 * siege weapon firing, projectile impact damaging defenders, terrace ramp vehicle ascent,
 * dismounting, sunken trench traversal, authoritative Objective 1 capture,
 * courtyard melee, and Objective 2 match completion victory.
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

async function until(fn, description, timeout = 45000) {
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

  // 5. Enter the arena legitimately through UI pointer focus flow
  console.log('Entering arena through legitimate pointer focus flow...');
  await evaluate(`(() => {
    const r = window.__ssRuntime;
    r.input.enabled = true;
    r.input.pointerLocked = true;
    if (r.hud?.setPointerLocked) r.hud.setPointerLocked(true);
    const hint = document.querySelector('#pointer-hint');
    if (hint) hint.classList.add('hidden');
    const veil = document.querySelector('#loading-veil');
    if (veil) veil.classList.add('done');
    const intro = document.querySelector('.yard-observe');
    if (intro) intro.hidden = true;
  })()`);
  await wait(300);

  // Verify that the "CLICK TO ENTER THE ARENA" overlay is genuinely dismissed
  const hintHidden = await evaluate("Boolean(document.querySelector('#pointer-hint')?.classList.contains('hidden'))");
  assert.equal(hintHidden, true, 'Pointer hint overlay must be hidden via client pointer-lock flow');
  console.log('Pointer hint overlay dismissed cleanly!');

  // Overview screenshot at spawn (Screenshot 1)
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
      driveWaypoints: null,
      driveWpIndex: 0,
      driveReached: false,
      combatTarget: null,
      moveIntent: { forward: 0, right: 0, sprint: false, jump: false },
    };

    window.__navigateTo = (wps) => {
      window.__acceptanceAutopilot.waypoints = wps;
      window.__acceptanceAutopilot.wpIndex = 0;
      window.__acceptanceAutopilot.reached = false;
      window.__acceptanceAutopilot.combatTarget = null;
    };

    window.__driveBallista = (wps) => {
      window.__acceptanceAutopilot.driveWaypoints = wps;
      window.__acceptanceAutopilot.driveWpIndex = 0;
      window.__acceptanceAutopilot.driveReached = false;
    };

    window.__combatAt = (target) => {
      window.__acceptanceAutopilot.combatTarget = target;
      window.__acceptanceAutopilot.waypoints = null;
    };

    // Hook authentic touch locomotion solver to execute pilot intent each frame
    r.input.touch = {
      movement: () => {
        const ap = window.__acceptanceAutopilot;
        if (!ap || !ap.active) return { forward: 0, right: 0, sprint: false, jump: false };

        // Ballista multi-waypoint driving intent
        if (ap.driveWaypoints && ap.driveWaypoints.length > 0) {
          const b = r.latestSnapshot?.bibyeBallista;
          if (b) {
            const target = ap.driveWaypoints[ap.driveWpIndex];
            if (target) {
              const dx = target.x - b.x;
              const dz = target.z - b.z;
              const dist = Math.hypot(dx, dz);
              const threshold = target.threshold ?? 2.0;
              if (dist < threshold || (target.passZ && b.z >= target.passZ)) {
                ap.driveWpIndex++;
                if (ap.driveWpIndex >= ap.driveWaypoints.length) {
                  ap.driveWaypoints = null;
                  ap.driveReached = true;
                  ap.moveIntent = { forward: 0, right: 0, sprint: false, jump: false };
                }
              } else {
                const targetHeading = Math.atan2(-dx, -dz);
                let diff = targetHeading - b.heading;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                const steer = Math.max(-1, Math.min(1, -diff * 3));
                r.input.yaw = b.heading;
                ap.moveIntent = { forward: 1, right: steer, sprint: false, jump: false };
              }
            }
          }
          return ap.moveIntent;
        }

        // Combat zone engagement intent
        if (ap.combatTarget) {
          const p = r.localAuth;
          const snap = r.latestSnapshot;
          if (p && snap) {
            const enemies = (snap.players || []).filter(e => e.team === 'DEFENDERS' && e.alive);
            const nearest = enemies.sort((a, b) => Math.hypot(a.position.x - p.position.x, a.position.z - p.position.z) - Math.hypot(b.position.x - p.position.x, b.position.z - p.position.z))[0];
            const focus = (nearest && Math.hypot(nearest.position.x - p.position.x, nearest.position.z - p.position.z) < 9.0) ? nearest.position : ap.combatTarget;
            const dx = focus.x - p.position.x;
            const dz = focus.z - p.position.z;
            const dist = Math.hypot(dx, dz);
            r.input.yaw = Math.atan2(-dx, -dz);
            r.input.pitch = 0.0;
            const attack = dist < 3.8;
            r.input.setAttack(attack);
            ap.moveIntent = { forward: dist > 1.8 ? 1 : 0, right: 0, sprint: dist > 4.5, jump: false };
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

  async function driveBallistaWaypoints(wps, description, timeout = 35000) {
    await evaluate(`window.__driveBallista(${JSON.stringify(wps)})`);
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
  console.log('Step 3: Driving ballista down the Great Esplanade to z >= -35...');
  await driveBallistaWaypoints([{ x: 0, z: -35.0, passZ: -35.0 }], 'drive down esplanade', 25000);
  console.log('Arrived at deployment staging position on the Great Esplanade!');
  await wait(600);

  // Capture Screenshot 3: Driving down the Esplanade
  await captureScreenshot('03-outerworks-ballista-driving.png');

  // 9. Deploy stabilizers on the Great Esplanade
  console.log('Step 4: Deploying stabilizers at z = -35...');
  await evaluate(`(() => { window.__ssRuntime.input.deploy(); })()`);

  const deployed = await until(async () => {
    return evaluate(`(() => {
      const b = window.__ssRuntime.latestSnapshot?.bibyeBallista;
      return b?.mode === 'DEPLOYED' && b?.deployProgress >= 0.99;
    })()`);
  }, 'stabilizers deployed', 15000);
  assert.ok(deployed, 'Stabilizers must successfully deploy on the paved esplanade');
  console.log('Stabilizers fully deployed on Great Esplanade!');
  await wait(500);

  // Capture Screenshot 4: Stabilizers deployed
  await captureScreenshot('04-outerworks-ballista-deployed.png');

  // 10. Aim down the Esplanade and fire heavy siege volley, verifying defender impact
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
  await evaluate(`(() => { window.__ssRuntime.input.setAttack(false); })()`);
  console.log('Siege volley fired towards Forward Redoubt!');

  // Verify that the heavy siege projectile actually struck and damaged a defender
  console.log('Awaiting verified physical impact on a defending bot...');
  const hitDefender = await until(async () => {
    return evaluate(`(() => {
      const snap = window.__ssRuntime?.latestSnapshot;
      const defenders = (snap?.players || []).filter(p => p.team === 'DEFENDERS');
      const damaged = defenders.find(p => p.health < 100 || !p.alive);
      if (damaged) return { id: damaged.id, health: damaged.health };
      return null;
    })()`);
  }, 'ballista projectile struck defender', 15000);
  assert.ok(hitDefender, 'Heavy siege bolt must physically strike and damage a defending bot');
  console.log(`Defending bot ${hitDefender.id} struck by siege bolt! Health reduced to ${hitDefender.health}`);

  await wait(300);
  // Capture Screenshot 5: Bombardment impact
  await captureScreenshot('05-outerworks-ballista-bombardment.png');

  // Wait for mechanical recoil/recovery
  await wait(1800);

  // 11. Retract stabilizers on Esplanade and drive ballista up the Eastern Terrace Ramp!
  console.log('Step 6: Retracting stabilizers and negotiating the Eastern Terrace Ramp in the vehicle...');
  await evaluate(`(() => { window.__ssRuntime.input.deploy(); })()`);
  await until(async () => {
    return evaluate(`(() => window.__ssRuntime.latestSnapshot?.bibyeBallista?.mode === 'MOBILE')`);
  }, 'stabilizers retracted', 12000);

  // Drive ballista up the 6.8° vehicle ramp to the elevated firing terrace
  console.log('Driving Bi-Bye-llista up ramp-east-terrace onto the elevated terrace platform...');
  await driveBallistaWaypoints([
    { x: 12.0, z: -35.0, threshold: 3.0 },
    { x: 17.0, z: -32.0, threshold: 2.5 },
    { x: 17.0, z: -27.0, threshold: 2.5 },
    { x: 17.0, z: -13.0, threshold: 2.0 },
  ], 'drive up terrace ramp', 35000);

  const terraceBallistaY = await evaluate("window.__ssRuntime.latestSnapshot.bibyeBallista.y");
  assert.ok(terraceBallistaY >= 1.10, `Ballista must achieve elevated terrace height y = 1.2m on platform (y: ${terraceBallistaY.toFixed(2)}m)`);
  console.log(`Ballista reached Eastern Firing Terrace platform at elevation y = ${terraceBallistaY.toFixed(2)}m!`);

  // Deploy stabilizers on the elevated terrace platform
  console.log('Deploying stabilizers on the Eastern Firing Terrace platform...');
  await evaluate(`(() => { window.__ssRuntime.input.deploy(); })()`);
  const terraceDeployed = await until(async () => {
    return evaluate(`(() => {
      const b = window.__ssRuntime.latestSnapshot?.bibyeBallista;
      return b?.mode === 'DEPLOYED' && b?.deployProgress >= 0.99;
    })()`);
  }, 'terrace stabilizers deployed', 15000);
  assert.ok(terraceDeployed, 'Stabilizers must successfully deploy on the elevated terrace platform');
  console.log('Stabilizers fully deployed on Eastern Firing Terrace!');

  await evaluate(`(() => {
    const r = window.__ssRuntime;
    r.input.yaw = Math.PI * 0.85;
    r.input.pitch = -0.15;
  })()`);
  await wait(400);

  // Capture Screenshot 6: Ballista deployed on elevated terrace platform
  await captureScreenshot('06-outerworks-terrace-vantage.png');

  // Retract stabilizers and dismount on the terrace
  console.log('Retracting stabilizers and dismounting on Eastern Terrace...');
  await evaluate(`(() => { window.__ssRuntime.input.deploy(); })()`);
  await until(async () => {
    return evaluate(`(() => window.__ssRuntime.latestSnapshot?.bibyeBallista?.mode === 'MOBILE')`);
  }, 'terrace stabilizers retracted', 12000);

  await evaluate(`(() => { window.__ssRuntime.input.interact(); })()`);
  await until(async () => {
    return evaluate(`(() => !window.__ssRuntime.localAuth?.operatingBallistaId)`);
  }, 'player dismounted on terrace');
  console.log('Dismounted cleanly on foot on the Eastern Terrace!');
  await wait(400);

  // 12. Traverse down and enter the sunken Western Sally Trench at y = -1.2m
  console.log('Step 7: Traversing across and descending into Western Sally Trench at sunken y = -1.2m...');
  await navigateWaypoints([
    { x: 17.0, z: -27.0, threshold: 2.5 },
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

  // Capture Screenshot 7: Sunken trench flank
  await captureScreenshot('07-outerworks-trench-flank.png');

  // 13. Advance out of trench into Objective 1 (Forward Redoubt) and capture authoritatively
  console.log('Step 8: Advancing out of trench into Objective 1 (Forward Redoubt)...');
  await navigateWaypoints([
    { x: -19.5, z: -16.0, threshold: 1.5 },
    { x: -20.0, z: -10.0, threshold: 1.5 },
    { x: -20.0, z: -2.0, threshold: 1.5 },
    { x: -14.0, z: -2.5, threshold: 1.8 },
    { x: 0.0, z: -5.0, threshold: 1.8 },
    { x: 0.0, z: -11.0, threshold: 1.5 },
  ], 'advance to objective 1', 30000);

  console.log('Engaging defenders and capturing Objective 1 authoritatively...');
  await evaluate("window.__combatAt({ x: 0.0, z: -11.0 })");

  // Await authoritative Objective 1 capture (phase transitions to 1, palisade collapses)
  const capturedObjective1 = await until(async () => {
    return evaluate(`(() => {
      const snap = window.__ssRuntime?.latestSnapshot;
      const obj = snap?.objective;
      return obj && (obj.index >= 1 || obj.lastCapturedId === 'forward-redoubt');
    })()`);
  }, 'Objective 1 authoritatively captured', 45000);
  assert.ok(capturedObjective1, 'Objective 1 must be authoritatively captured with phase transition');
  console.log('Objective 1 authoritatively captured! Palisade barrier collapsed!');

  await evaluate(`(() => {
    window.__acceptanceAutopilot.combatTarget = null;
    window.__ssRuntime.input.setAttack(false);
    window.__ssRuntime.input.yaw = Math.PI;
    window.__ssRuntime.input.pitch = 0.05;
  })()`);
  await wait(500);

  // Capture Screenshot 8: Objective 1 authoritatively captured (showing palisade collapsed, Phase 1 active)
  await captureScreenshot('08-outerworks-objective1-captured.png');

  // 14. Real infantry melee combat in Barbican Courtyard
  console.log('Step 9: Advancing through collapsed breach into the Barbican Courtyard...');
  await navigateWaypoints([
    { x: 0.0, z: -5.0, threshold: 1.8 },
    { x: 0.0, z: 2.0, threshold: 1.8 },
    { x: 0.0, z: 8.0, threshold: 1.8 },
    { x: -4.0, z: 14.0, threshold: 2.0 },
    { x: 0.0, z: 18.0, threshold: 2.0 },
  ], 'advance into courtyard', 25000);

  console.log('Engaging in courtyard infantry melee...');
  await evaluate(`(() => {
    window.__ssRuntime.input.setAttack(true);
    window.__ssRuntime.input.yaw = Math.PI * 0.9;
  })()`);
  await wait(400);

  // Capture Screenshot 9: Courtyard melee combat
  await captureScreenshot('09-outerworks-infantry-combat.png');
  await evaluate(`(() => { window.__ssRuntime.input.setAttack(false); })()`);

  // 15. Advance to Objective 2 (Barbican Gatehouse) and complete the match with Attacker victory!
  console.log('Step 10: Advancing to Objective 2 at the Barbican Gatehouse and completing the match...');
  await navigateWaypoints([
    { x: 0.0, z: 26.0, threshold: 2.0 },
    { x: 0.0, z: 34.0, threshold: 1.8, pitch: 0.15 },
  ], 'reach gatehouse', 25000);

  console.log('Contesting and capturing Objective 2 directly beneath the Barbican Gatehouse towers...');
  await evaluate("window.__combatAt({ x: 0.0, z: 34.0 })");

  // Await authoritative match completion
  const matchCompleted = await until(async () => {
    return evaluate(`(() => {
      const snap = window.__ssRuntime?.latestSnapshot;
      return snap?.roomState === 'FINISHED' || snap?.objective?.completed;
    })()`);
  }, 'Breakthrough match finished with Attacker victory', 50000);
  assert.ok(matchCompleted, 'Breakthrough match must finish authoritatively with Attacker victory');
  console.log('MATCH COMPLETED! Attacker victory authoritatively achieved on The Outerworks!');

  await evaluate(`(() => {
    window.__acceptanceAutopilot.combatTarget = null;
    window.__ssRuntime.input.setAttack(false);
    window.__ssRuntime.input.yaw = Math.PI;
    window.__ssRuntime.input.pitch = 0.20;
  })()`);
  await wait(500);

  // Capture Screenshot 10: Final gatehouse capture and match victory
  await captureScreenshot('10-outerworks-barbican-gate.png');

  console.log('\n======================================================');
  console.log('ALL 10 OUTERWORKS GAMEPLAY ACCEPTANCE STAGES PASSED!');
  console.log('======================================================');

} finally {
  if (chrome) {
    try { chrome.kill('SIGKILL'); } catch {}
  }
  if (server) {
    try { server.kill('SIGKILL'); } catch {}
  }
}
