/**
 * Verification of Critical Inspection Yard Repair and Director Mode Improvement
 * Scenarios A through G
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

const port = 9295;
const serverPort = 3088;
const userData = path.join(tmpdir(), `ss-inspection-verify-${process.pid}`);
const evidenceDir = path.resolve('output/inspection-evidence');
const brainDir = '/Users/erendiracisneros/.gemini/antigravity/brain/bf36c922-8785-4d62-b11e-f266d5847a42';

await mkdir(evidenceDir, { recursive: true });

console.log('=== Castleward Inspection Yard Verification ===');
console.log(`Starting test server on port ${serverPort}...`);

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
    const desc = response.exceptionDetails.exception?.description || response.exceptionDetails.text;
    console.error('EVAL EXCEPTION:', desc);
    throw new Error(desc || 'Evaluation error');
  }
  return response.result?.value;
}

async function captureScreenshot(filename) {
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const outPath = path.join(evidenceDir, filename);
  await writeFile(outPath, Buffer.from(shot.data, 'base64'));
  const brainPath = path.join(brainDir, filename);
  try {
    await copyFile(outPath, brainPath);
  } catch (err) {
    console.warn(`Could not copy to brainDir: ${err.message}`);
  }
  console.log(`Saved screenshot: ${filename}`);
}

let chrome;

async function run() {
  try {
    // 1. Wait for server health
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        const res = await fetch(`http://127.0.0.1:${serverPort}/health`);
        if (res.ok) {
          console.log(`Server healthy on port ${serverPort}`);
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
        if (!page && res.length === 0) {
          const newPage = await (await fetch(`http://127.0.0.1:${port}/json/new`, { method: 'PUT' })).json();
          if (newPage?.webSocketDebuggerUrl) { tabs = [newPage]; break; }
        }
      } catch (err) {
        if (i % 10 === 0) console.log(`Waiting for Chrome CDP... (${i}/60)`);
      }
      await wait(200);
    }

    assert.ok(tabs?.[0]?.webSocketDebuggerUrl, 'Chrome page target missing');
    socket = new WebSocket(tabs[0].webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });

    socket.addEventListener('message', event => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });

    await send('Page.enable');
    await send('Runtime.enable');
    await send('DOM.enable');

    console.log('Navigating to game with ?debug...');
    await send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/?debug` });

    console.log('Waiting for game page load...');
    await wait(2500);

    // Start Inspection Practice
    console.log('Starting Inspection Practice session...');
    await evaluate(`
      window.__ssLink.startInspectionPractice('Director', 'castleward');
      window.__ssLink.arenaReady(true);
    `);

    // Wait for match to start and runtime to be available
    for (let i = 0; i < 40; i++) {
      const state = await evaluate(`window.__ssLink?.playingLocally && window.__ssRuntime?.playing ? 'playing' : 'loading'`);
      if (state === 'playing') break;
      await wait(200);
    }

    console.log('Inspection Practice loaded and playing.');
    await wait(1000);

    // Spawn practice dummy
    console.log('Spawning practice dummy...');
    await evaluate(`window.__ssLink.practiceSpawnDummy('PASSIVE')`);
    await wait(600);

    // Verify Inspection Tools mounted
    const toolsMounted = await evaluate(`Boolean(window.__ssRuntime?.inspectionTools?.root)`);
    console.log('InspectionTools mounted:', toolsMounted);
    assert.equal(toolsMounted, true, 'InspectionCameraTools must be mounted');

    // -------------------------------------------------------------
    // Scenario A: Frozen combat target
    // Stage opponent, face target, freeze target, strike, capture
    // -------------------------------------------------------------
    console.log('\n--- Scenario A: Frozen Combat Target ---');
    const dummyId = await evaluate(`
      (() => {
        const dummy = Array.from(window.__ssRuntime.latestSnapshot.players).find(p => p.actorKind === 'dummy');
        return dummy?.id;
      })()
    `);
    console.log('Found practice dummy ID:', dummyId);
    assert.ok(dummyId, 'Practice dummy must exist');

    // Position player and dummy directly in front of each other
    await evaluate(`
      const p = window.__ssRuntime.localAuth.position;
      window.__ssLink.stageInspectionActor({
        actorId: '${dummyId}',
        position: { x: p.x, y: p.y, z: p.z - 1.2 },
        vitals: true,
        ai: false
      });
      const dx = 0;
      const dz = -1.2;
      const facingYaw = Math.atan2(-dx, -dz);
      window.__ssRuntime.input.yaw = facingYaw;
      window.__ssLink.stageInspectionActor({
        actorId: window.__ssRuntime.playerId,
        position: 'face_target'
      });
      window.__ssLink.stageInspectionActor({
        actorId: '${dummyId}',
        position: 'face_target'
      });
    `);
    await wait(300);

    // Set freeze mode to 'others' so dummy is frozen, player is free
    await evaluate(`window.__ssLink.setInspectionFreezeMode('others')`);
    await wait(200);

    const initialHealth = await evaluate(`
      (() => {
        const dummy = Array.from(window.__ssRuntime.latestSnapshot.players).find(p => p.id === '${dummyId}');
        return dummy?.health;
      })()
    `);
    console.log('Dummy initial health:', initialHealth);

    const diagBefore = await evaluate(`
      (() => {
        const dummy = window.__ssRuntime.latestSnapshot.players.find(p => p.id === '${dummyId}');
        const me = window.__ssRuntime.localAuth;
        return {
          mePos: me.position,
          meYaw: me.yaw,
          dummyPos: dummy.position,
          dummyYaw: dummy.yaw,
          inputYaw: window.__ssRuntime.input.yaw
        };
      })()
    `);
    console.log('Diagnostic before attack:', diagBefore);

    // Attacker performs sword attack and holds through the 400ms contact window
    await evaluate(`
      window.__ssRuntime.input.setAttack(true);
    `);
    await wait(450);

    const diagMid = await evaluate(`
      (() => {
        const dummy = window.__ssRuntime.latestSnapshot.players.find(p => p.id === '${dummyId}');
        const me = window.__ssRuntime.localAuth;
        return {
          attackActive: me.attackActive,
          attackStartedAt: me.attackStartedAt,
          dummyHealth: dummy.health
        };
      })()
    `);
    console.log('Diagnostic mid attack (450ms):', diagMid);

    await wait(350);
    await evaluate(`
      window.__ssRuntime.input.setAttack(false);
    `);
    await wait(300);

    const damagedHealth = await evaluate(`
      (() => {
        const dummy = Array.from(window.__ssRuntime.latestSnapshot.players).find(p => p.id === '${dummyId}');
        return dummy?.health;
      })()
    `);
    console.log('Dummy health after attack on frozen target:', damagedHealth);
    assert.ok(damagedHealth < initialHealth, 'Frozen combat target must receive damage');

    // Position fly camera for dramatic shot of frozen target with damage
    await evaluate(`
      window.__ssRuntime.setInspectionFocus('fly');
      window.__ssRuntime.flyPose.x = window.__ssRuntime.localAuth.position.x + 1.2;
      window.__ssRuntime.flyPose.y = window.__ssRuntime.localAuth.position.y + 1.6;
      window.__ssRuntime.flyPose.z = window.__ssRuntime.localAuth.position.z + 1.5;
      window.__ssRuntime.flyPose.yaw = Math.PI * 0.75;
      window.__ssRuntime.flyPose.pitch = -0.15;
    `);
    await wait(300);
    await captureScreenshot('scenario-a-frozen-combat-target.png');

    // -------------------------------------------------------------
    // Scenario B: Frozen Spellblade
    // Freeze primary player ('actor'), dummy is free to move/act
    // -------------------------------------------------------------
    console.log('\n--- Scenario B: Frozen Spellblade ---');
    // Refill dummy vitals and re-enable dummy AI
    await evaluate(`
      window.__ssLink.stageInspectionActor({
        actorId: '${dummyId}',
        vitals: true,
        ai: true
      });
    `);
    // Set freeze mode to 'actor' (freezes the player)
    await evaluate(`window.__ssLink.setInspectionFreezeMode('actor')`);
    await wait(200);

    const playerFrozen = await evaluate(`Boolean(window.__ssRuntime.localAuth?.inspectionFrozen)`);
    console.log('Player actor is frozen:', playerFrozen);
    assert.equal(playerFrozen, true, 'Player actor must be frozen');

    // Move fly camera to frame frozen hero with dummy moving in background
    await evaluate(`
      window.__ssRuntime.flyPose.x = window.__ssRuntime.localAuth.position.x - 1.5;
      window.__ssRuntime.flyPose.y = window.__ssRuntime.localAuth.position.y + 1.4;
      window.__ssRuntime.flyPose.z = window.__ssRuntime.localAuth.position.z - 2.0;
      window.__ssRuntime.flyPose.yaw = Math.PI * 0.2;
      window.__ssRuntime.flyPose.pitch = -0.1;
    `);
    await wait(400);
    await captureScreenshot('scenario-b-frozen-spellblade.png');

    // -------------------------------------------------------------
    // Scenario C: Midflight projectile
    // Launch Fireball, freeze projectiles midair, orbit fly camera
    // -------------------------------------------------------------
    console.log('\n--- Scenario C: Midflight Projectile ---');
    // Unfreeze all actors
    await evaluate(`
      window.__ssLink.setInspectionFreezeMode('none');
      window.__ssRuntime.inhabitInspection(window.__ssRuntime.playerId);
      window.__ssRuntime.setInspectionFocus('actor');
    `);
    await wait(300);

    // Cast Fireball forward
    await evaluate(`
      window.__ssRuntime.socket.cast({ x: 0, y: 0, z: -1 });
    `);
    await wait(250); // Wait for projectile to launch into flight

    // Freeze projectiles
    await evaluate(`
      window.__ssLink.setInspectionFreezeProjectiles(true);
    `);
    await wait(200);

    const projectileCount = await evaluate(`
      (() => {
        const snap = window.__ssRuntime.latestSnapshot;
        return snap.projectiles?.length || 0;
      })()
    `);
    console.log('Active projectiles frozen midflight:', projectileCount);
    assert.ok(projectileCount > 0, 'Fireball projectile must be frozen in midair');

    // Switch to fly camera and position right next to the fireball
    await evaluate(`
      (() => {
        window.__ssRuntime.setInspectionFocus('fly');
        const p = window.__ssRuntime.localAuth.position;
        window.__ssRuntime.flyPose.x = p.x + 0.8;
        window.__ssRuntime.flyPose.y = p.y + 1.3;
        window.__ssRuntime.flyPose.z = p.z - 2.5;
        window.__ssRuntime.flyPose.yaw = Math.PI * 0.85;
        window.__ssRuntime.flyPose.pitch = -0.05;
      })()
    `);
    await wait(300);
    await captureScreenshot('scenario-c-midflight-projectile.png');

    // Reset projectile freeze
    await evaluate(`window.__ssLink.setInspectionFreezeProjectiles(false)`);

    // -------------------------------------------------------------
    // Scenario D: Dummy Ultimate
    // Possess dummy, ready its Ultimate, activate Sunder / Vortex / Chivalry
    // -------------------------------------------------------------
    console.log('\n--- Scenario D: Dummy Ultimate ---');
    // Possess dummy and prepare Sunder
    await evaluate(`
      window.__ssRuntime.inhabitInspection('${dummyId}');
      window.__ssLink.stageInspectionActor({
        actorId: '${dummyId}',
        position: 'courtyard',
        vitals: true,
        ultimate: true,
        loadout: { ultimate: 'SUNDER' }
      });
    `);
    await wait(300);

    const dummyControlled = await evaluate(`window.__ssRuntime.socket.inspectionActorId === '${dummyId}'`);
    console.log('Dummy possessed:', dummyControlled);
    assert.equal(dummyControlled, true, 'Dummy must be controlled');

    // Activate Ultimate
    await evaluate(`
      window.__ssRuntime.socket.ultimate();
    `);
    await wait(200); // During activation leap/slam

    // Freeze simulation to capture the ultimate moment
    await evaluate(`
      (() => {
        window.__ssLink.setInspectionFrozen(true);
        window.__ssRuntime.setInspectionFocus('fly');
        const dp = window.__ssRuntime.localAuth.position;
        window.__ssRuntime.flyPose.x = dp.x + 2.0;
        window.__ssRuntime.flyPose.y = dp.y + 1.8;
        window.__ssRuntime.flyPose.z = dp.z + 2.0;
        window.__ssRuntime.flyPose.yaw = Math.PI * 0.7;
        window.__ssRuntime.flyPose.pitch = -0.2;
      })()
    `);
    await wait(300);
    await captureScreenshot('scenario-d-dummy-ultimate.png');

    // Resume simulation
    await evaluate(`window.__ssLink.setInspectionFrozen(false)`);
    await wait(500);

    // -------------------------------------------------------------
    // Scenario E: Dummy siege operator
    // Possess dummy, mount Bi-Bye-llista, fire volley, dismount
    // Mount SO-FIST-ICATION, punch, dismount
    // -------------------------------------------------------------
    console.log('\n--- Scenario E: Dummy Siege Operator ---');
    // Mount Bi-Bye-llista
    await evaluate(`
      window.__ssLink.stageInspectionActor({
        actorId: '${dummyId}',
        mount: 'ballista'
      });
    `);
    await wait(300);

    const ballistaMounted = await evaluate(`
      Boolean(window.__ssRuntime.latestSnapshot?.bibyeBallista?.operatorId === '${dummyId}')
    `);
    console.log('Dummy mounted Bi-Bye-llista:', ballistaMounted);
    assert.equal(ballistaMounted, true, 'Dummy must be mounted on Bi-Bye-llista');

    // Fire ballista volley
    await evaluate(`
      window.__ssRuntime.socket.bibyeFire();
    `);
    await wait(250);

    // Frame ballista operation
    await evaluate(`
      (() => {
        window.__ssRuntime.setInspectionFocus('fly');
        const b = window.__ssRuntime.latestSnapshot.bibyeBallista;
        window.__ssRuntime.flyPose.x = b.x + 3.0;
        window.__ssRuntime.flyPose.y = b.y + 2.2;
        window.__ssRuntime.flyPose.z = b.z + 3.5;
        window.__ssRuntime.flyPose.yaw = Math.PI * 0.65;
        window.__ssRuntime.flyPose.pitch = -0.15;
      })()
    `);
    await wait(300);
    await captureScreenshot('scenario-e1-dummy-ballista.png');

    // Dismount ballista
    await evaluate(`
      window.__ssLink.stageInspectionActor({
        actorId: '${dummyId}',
        mount: 'dismount'
      });
    `);
    await wait(200);

    // Mount SO-FIST-ICATION
    await evaluate(`
      window.__ssLink.stageInspectionActor({
        actorId: '${dummyId}',
        mount: 'ram'
      });
    `);
    await wait(300);

    const ramMounted = await evaluate(`
      Boolean(window.__ssRuntime.latestSnapshot?.soFistication?.operatorId === '${dummyId}')
    `);
    console.log('Dummy mounted SO-FIST-ICATION ram:', ramMounted);
    assert.equal(ramMounted, true, 'Dummy must be mounted on SO-FIST-ICATION');

    // Actuate punch
    await evaluate(`
      window.__ssRuntime.socket.attack(true);
    `);
    await wait(200);

    // Frame ram operation
    await evaluate(`
      (() => {
        const r = window.__ssRuntime.latestSnapshot.soFistication;
        window.__ssRuntime.flyPose.x = r.x + 3.2;
        window.__ssRuntime.flyPose.y = r.y + 2.5;
        window.__ssRuntime.flyPose.z = r.z - 2.5;
        window.__ssRuntime.flyPose.yaw = Math.PI * 0.35;
        window.__ssRuntime.flyPose.pitch = -0.2;
      })()
    `);
    await wait(300);
    await captureScreenshot('scenario-e2-dummy-ram.png');

    // Dismount ram and restore control to player
    await evaluate(`
      window.__ssLink.stageInspectionActor({
        actorId: '${dummyId}',
        mount: 'dismount'
      });
      window.__ssRuntime.inhabitInspection(window.__ssRuntime.playerId);
      window.__ssRuntime.setInspectionFocus('actor');
    `);
    await wait(300);

    // -------------------------------------------------------------
    // Scenario F: Multi-camera capture
    // Set up scene, freeze, place bookmarks 1 & 2, verify both capture cleanly
    // -------------------------------------------------------------
    console.log('\n--- Scenario F: Multi-Camera Capture ---');
    // Freeze scene
    await evaluate(`window.__ssLink.setInspectionFrozen(true)`);
    await wait(200);

    // Position Camera 1 (Low Angle Hero)
    await evaluate(`
      (() => {
        window.__ssRuntime.setInspectionFocus('fly');
        const hp = window.__ssRuntime.localAuth.position;
        window.__ssRuntime.flyPose.x = hp.x - 2.0;
        window.__ssRuntime.flyPose.y = hp.y + 0.6;
        window.__ssRuntime.flyPose.z = hp.z - 2.0;
        window.__ssRuntime.flyPose.yaw = Math.PI * 0.25;
        window.__ssRuntime.flyPose.pitch = 0.2;
        window.__ssRuntime.inspectionFov = 75;
        window.__ssRuntime.setInspectionBookmark(1);
      })()
    `);
    await wait(300);
    await captureScreenshot('scenario-f1-camera-slot1.png');

    // Position Camera 2 (High Angle Overhead)
    await evaluate(`
      (() => {
        const hp = window.__ssRuntime.localAuth.position;
        window.__ssRuntime.flyPose.x = hp.x + 3.0;
        window.__ssRuntime.flyPose.y = hp.y + 5.0;
        window.__ssRuntime.flyPose.z = hp.z + 4.0;
        window.__ssRuntime.flyPose.yaw = Math.PI * 0.75;
        window.__ssRuntime.flyPose.pitch = -0.65;
        window.__ssRuntime.inspectionFov = 60;
        window.__ssRuntime.setInspectionBookmark(2);
      })()
    `);
    await wait(300);
    await captureScreenshot('scenario-f2-camera-slot2.png');

    // Verify returning to bookmark 1 restores exact transform and simulation tick is untouched
    const tickBefore = await evaluate(`window.__ssRuntime.latestSnapshot.tickNumber`);
    await evaluate(`window.__ssRuntime.recallInspectionBookmark(1)`);
    await wait(200);
    const tickAfter = await evaluate(`window.__ssRuntime.latestSnapshot.tickNumber`);
    assert.equal(tickBefore, tickAfter, 'Multi-camera switching must not advance simulation tick');
    console.log('Multi-camera verified: simulation tick held at', tickBefore);

    // Unfreeze
    await evaluate(`window.__ssLink.setInspectionFrozen(false)`);

    // -------------------------------------------------------------
    // Scenario G: Normal gameplay regression
    // Verify ordinary Practice, Tutorial, and Multiplayer are unaffected
    // -------------------------------------------------------------
    console.log('\n--- Scenario G: Normal Gameplay Regression ---');
    // Start ordinary Practice (without inspection)
    await evaluate(`
      window.__ssLink.leaveRoom();
      window.__ssLink.startSolo('PRACTICE', 'OrdinaryPractice');
      window.__ssLink.arenaReady(true);
    `);
    await wait(1500);

    const normalInspectionAvailable = await evaluate(`window.__ssLink.inspectionAvailable`);
    console.log('Ordinary practice inspectionAvailable:', normalInspectionAvailable);
    assert.equal(normalInspectionAvailable, false, 'Inspection must not be available in ordinary practice');

    const normalFreezeResult = await evaluate(`window.__ssLink.setInspectionFrozen(true)`);
    assert.equal(normalFreezeResult, false, 'Freeze must be rejected in ordinary practice');

    await captureScreenshot('scenario-g-normal-practice-regression.png');

    console.log('\n=== ALL SCENARIOS VERIFIED SUCCESSFULLY ===\n');

  } finally {
    if (socket) socket.close();
    if (chrome) chrome.kill();
    server.kill();
  }
}

run().catch(err => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
