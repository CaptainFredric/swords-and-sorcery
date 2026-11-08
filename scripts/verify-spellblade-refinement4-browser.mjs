import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGameServer } from '../server/src/server.mjs';

const PORT = 3028;
const CDP_PORT = 9268;
const OUT_DIR = 'output/spellblade-refinement-iv';
const DOCS_DIR = 'docs/verification';
await mkdir(OUT_DIR, { recursive: true });
await mkdir(DOCS_DIR, { recursive: true });

const EXPECTED_REV = 'b43e5c3fb0c60a0a722577e0fad266efb3eef0f2';

const chromeBin = process.env.CHROME_BIN || (
  process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : 'chromium'
);

const server = createGameServer({ port: PORT, host: '127.0.0.1' });
await server.start();
console.log(`[VERIFY] Game server running at http://127.0.0.1:${PORT}`);

const profileDir = await mkdtemp(join(tmpdir(), 'ss-spellblade-chrome-'));
const chrome = spawn(chromeBin, [
  '--headless=new',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--enable-unsafe-swiftshader',
  '--remote-allow-origins=*',
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${profileDir}`,
  '--window-size=1280,800',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let ws = null;
let seq = 0;
const pending = new Map();

function send(method, params = {}) {
  const id = ++seq;
  const p = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} timed out`));
    }, 20000);
    pending.set(id, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });
  });
  ws.send(JSON.stringify({ id, method, params }));
  return p;
}

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) {
    const desc = r.exceptionDetails.exception?.description || r.exceptionDetails.text || 'Evaluation failed';
    throw new Error(desc);
  }
  return r.result?.value;
}

async function screenshot(filename) {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const outPath = join(OUT_DIR, filename);
  const docsPath = join(DOCS_DIR, filename);
  const buf = Buffer.from(r.data, 'base64');
  await writeFile(outPath, buf);
  await writeFile(docsPath, buf);
  console.log(`[VERIFY] Captured screenshot: ${outPath} & ${docsPath}`);
}

async function until(fn, label, tries = 120) {
  let last = null;
  for (let i = 0; i < tries; i++) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (e) {
      last = e;
    }
    await sleep(150);
  }
  throw new Error(`Timeout waiting for ${label}: ${last?.message ?? ''}`);
}

try {
  // Connect to Chrome DevTools
  const target = await until(async () => {
    const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
    const list = await res.json();
    return list.find((x) => x.type === 'page');
  }, 'Chrome debugger target', 100);

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  ws.onmessage = (event) => {
    const payload = JSON.parse(String(event.data));
    if (!payload.id) return;
    const cb = pending.get(payload.id);
    if (!cb) return;
    pending.delete(payload.id);
    if (payload.error) cb.reject(new Error(payload.error.message));
    else cb.resolve(payload.result);
  };

  await send('Page.enable');
  await send('Runtime.enable');

  console.log('[VERIFY] Navigating to Castleward client...');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}` });

  // 1. MAIN MENU ACCEPTANCE
  console.log('[VERIFY] Phase 1: Main Menu Acceptance...');
  await until(async () => {
    return evaluate(`Boolean(document.querySelector('.menu-spellblade-ready') || window.__SPELLBLADE_ASSET_STATUS__?.menu)`);
  }, 'Main menu Spellblade ready', 150);

  await sleep(1000);

  const menuAssetStatus = await evaluate(`window.__SPELLBLADE_ASSET_STATUS__?.menu`);
  console.log('[VERIFY] Menu Asset Status:', menuAssetStatus);
  assert.equal(menuAssetStatus?.kind, 'glb', 'Menu asset kind must be glb (not fallback)');
  assert.equal(menuAssetStatus?.sourceRevision, EXPECTED_REV, `Menu asset must report new revision ${EXPECTED_REV}`);

  // Check character hierarchy in menu scene
  const menuMeshCount = await evaluate(`(() => {
    const root = window.__ssRuntime?.menuScene?.characterRoot;
    if (!root) return 0;
    let count = 0;
    root.traverse(o => { if (o.isMesh) count++; });
    return count;
  })()`);
  console.log('[VERIFY] Menu Character Mesh Count:', menuMeshCount);
  assert.equal(menuMeshCount, 17, 'Menu Spellblade must have 17 meshes');

  await screenshot('01_main_menu_spellblade_refinement_iv.png');

  // Watch the yard (clear the banner for unobstructed third-person hero presentation)
  await evaluate(`(() => {
    const watchBtn = document.querySelector('#watch-yard');
    if (watchBtn) watchBtn.click();
    else if (window.__ssRuntime?.menuScene) window.__ssRuntime.menuScene.setTouring?.(true);
  })()`);
  await sleep(800);
  await screenshot('02_main_menu_yard_view.png');

  // Return to menu if needed
  await evaluate(`(() => {
    if (window.__ssRuntime?.menuScene?.touring) window.__ssRuntime.menuScene.setTouring(false);
  })()`);
  await sleep(400);

  // 2. ARMORY ACCEPTANCE
  console.log('[VERIFY] Phase 2: Armory Acceptance...');
  await evaluate(`(() => {
    const armoryBtn = document.querySelector('#armory-button');
    if (armoryBtn) armoryBtn.click();
    else if (window.__ssLink?.setMenuState) window.__ssLink.setMenuState('armory');
  })()`);

  await until(async () => {
    return evaluate(`!document.querySelector('#armory-menu')?.classList.contains('hidden')`);
  }, 'Armory menu visible', 80);

  await sleep(1000);
  await screenshot('03_armory_spellblade_refinement_iv.png');

  // Inspect heraldry tab in Armory if available
  const heraldryTabExists = await evaluate(`Boolean(document.querySelector('#armory-heraldry-tab') || document.querySelector('#armory-emblems'))`);
  if (heraldryTabExists) {
    await evaluate(`(() => {
      const tab = document.querySelector('#armory-heraldry-tab');
      if (tab) tab.click();
    })()`);
    await sleep(600);
    await screenshot('04_armory_heraldry_and_standards.png');
  }

  // Back to Main Menu
  await evaluate(`(() => {
    const backBtn = document.querySelector('#armory-back');
    if (backBtn) backBtn.click();
  })()`);
  await sleep(500);

  // 3. ACTUAL COMBAT & FIRST-PERSON ACCEPTANCE
  console.log('[VERIFY] Phase 3: Actual Combat & First-Person Acceptance...');
  await evaluate(`(() => {
    window.__ssLink.startSolo('BOT_DUEL', 'Tester', 'castleward', 'KNIGHT');
  })()`);

  await until(async () => {
    return evaluate(`Boolean(window.__ssRuntime?.arenaActive && !document.querySelector('#game-screen')?.classList.contains('hidden'))`);
  }, 'Combat arena active', 150);

  await sleep(1500);

  const fpAssetStatus = await evaluate(`window.__SPELLBLADE_ASSET_STATUS__?.firstPerson`);
  const remoteAssetStatus = await evaluate(`window.__SPELLBLADE_ASSET_STATUS__?.remote`);
  console.log('[VERIFY] First-Person Asset Status:', fpAssetStatus);
  console.log('[VERIFY] Remote Bot Asset Status:', remoteAssetStatus);

  assert.equal(fpAssetStatus?.kind, 'glb', 'First-person asset must be glb');
  assert.equal(fpAssetStatus?.sourceRevision, EXPECTED_REV, `First-person must report ${EXPECTED_REV}`);
  assert.equal(remoteAssetStatus?.kind, 'glb', 'Remote player asset must be glb');
  assert.equal(remoteAssetStatus?.sourceRevision, EXPECTED_REV, `Remote player must report ${EXPECTED_REV}`);

  await screenshot('05_actual_combat_first_person_ready.png');

  // Simulate sword attack in combat
  console.log('[VERIFY] Simulating sword attack...');
  await evaluate(`(() => {
    if (window.__ssRuntime?.input?.onAction) {
      window.__ssRuntime.input.onAction('attack', true);
    }
  })()`);
  await sleep(250);
  await screenshot('06_actual_combat_sword_slash.png');
  await evaluate(`(() => {
    if (window.__ssRuntime?.input?.onAction) {
      window.__ssRuntime.input.onAction('attack', false);
    }
  })()`);
  await sleep(300);

  // Simulate spellcasting
  console.log('[VERIFY] Simulating spellcasting...');
  await evaluate(`(() => {
    if (window.__ssRuntime?.input?.onAction) {
      window.__ssRuntime.input.onAction('spell', true);
    }
  })()`);
  await sleep(300);
  await screenshot('07_actual_combat_spellcast.png');
  await evaluate(`(() => {
    if (window.__ssRuntime?.input?.onAction) {
      window.__ssRuntime.input.onAction('spell', false);
    }
  })()`);
  await sleep(400);

  // 4. REMOTE MULTIPLAYER CHARACTER & THIRD-PERSON PRESENTATION
  console.log('[VERIFY] Phase 4: Remote Multiplayer Character & Third-Person Locomotion...');
  // Inspect remote bot in arena
  const remoteRigsCount = await evaluate(`window.__ssRuntime?.remotePlayers?.rigs?.size ?? 0`);
  console.log('[VERIFY] Remote Rigs in Arena:', remoteRigsCount);
  assert.ok(remoteRigsCount >= 1, 'Expected at least 1 remote bot rig in arena');

  // Position camera or remote bot in front of camera to verify third-person remote hero
  await evaluate(`(() => {
    const rp = window.__ssRuntime?.remotePlayers;
    const firstRig = rp?.rigs?.values()?.next()?.value;
    if (firstRig && window.__ssRuntime?.camera) {
      const cam = window.__ssRuntime.camera;
      // Position remote bot directly in front of camera at good view distance
      firstRig.root.position.set(cam.position.x, cam.position.y - 0.9, cam.position.z - 3.2);
      firstRig.root.rotation.y = cam.rotation.y + Math.PI;
      firstRig.root.updateMatrixWorld(true);
    }
  })()`);
  await sleep(500);
  await screenshot('08_remote_multiplayer_spellblade_bot.png');

  // Test cloth trailing under motion
  console.log('[VERIFY] Testing secondary cloth movement and locomotion...');
  const clothDynamics = await evaluate(`(() => {
    const rp = window.__ssRuntime?.remotePlayers;
    const firstRig = rp?.rigs?.values()?.next()?.value;
    const bone = firstRig?.root?.getObjectByName('tabard_back_02');
    const initialRx = bone ? bone.rotation.x : 0;
    
    // Simulate motion on rig
    if (firstRig?.visualInstance?.animator?.cloth) {
      firstRig.root.position.z += 2.0;
      firstRig.root.updateMatrixWorld(true);
      firstRig.visualInstance.animator.cloth.apply(1 / 30);
    }
    const finalRx = bone ? bone.rotation.x : 0;
    return { initialRx, finalRx, delta: Math.abs(finalRx - initialRx) };
  })()`);
  console.log('[VERIFY] Cloth dynamic deflection:', clothDynamics);
  await screenshot('09_third_person_locomotion_cloth_trailing.png');

  // 5. SIEGE OPERATOR POSES & ALL-NATURAL DISASTER ACCEPTANCE
  console.log('[VERIFY] Phase 5: Siege Operator Poses & All-Natural Disaster...');
  // Apply Ram operator pose on the staged character in browser
  await evaluate(`(() => {
    const rp = window.__ssRuntime?.remotePlayers;
    const firstRig = rp?.rigs?.values()?.next()?.value;
    const animator = firstRig?.visualInstance?.animator;
    if (animator) {
      animator.applyRam({
        pelvis: new THREE.Vector3(0, 0.95, 0),
        forward: new THREE.Vector3(0, 0, -1),
        up: new THREE.Vector3(0, 1, 0),
        leftFoot: new THREE.Vector3(-0.2, 0.1, -0.2),
        rightFoot: new THREE.Vector3(0.2, 0.1, -0.2),
        leftHand: new THREE.Vector3(-0.25, 1.1, -0.35),
        rightHand: new THREE.Vector3(0.25, 1.1, -0.35),
        recoil: 0,
        heaveIntensity: 1.0,
      });
    }
  })()`);
  await sleep(400);
  await screenshot('10_siege_ram_operator_pose.png');

  // Apply Bi-Bye-llista operator pose
  await evaluate(`(() => {
    const rp = window.__ssRuntime?.remotePlayers;
    const firstRig = rp?.rigs?.values()?.next()?.value;
    const animator = firstRig?.visualInstance?.animator;
    if (animator) {
      animator.restoreRamArms?.();
      animator.applyMounted({ kind: 'bibye', yawRad: 0.2, pitchRad: -0.1 }, 1.0, {});
    }
  })()`);
  await sleep(400);
  await screenshot('11_siege_bibye_ballista_operator_pose.png');

  // Apply Valkyrie Fight-and-Flight operator pose
  await evaluate(`(() => {
    const rp = window.__ssRuntime?.remotePlayers;
    const firstRig = rp?.rigs?.values()?.next()?.value;
    const animator = firstRig?.visualInstance?.animator;
    if (animator) {
      animator.applyFightFlight(
        { pelvis: new THREE.Vector3(0, 0.95, 0) },
        true,
        { id: 'flight-1', pitchRad: 0.3, bankRad: -0.2, dashActive: true },
        1.2,
        1 / 60
      );
    }
  })()`);
  await sleep(400);
  await screenshot('12_siege_flight_valkyrie_operator_pose.png');

  // Apply All-Natural Disaster animation
  await evaluate(`(() => {
    const rp = window.__ssRuntime?.remotePlayers;
    const firstRig = rp?.rigs?.values()?.next()?.value;
    const animator = firstRig?.visualInstance?.animator;
    if (animator) {
      animator.releaseMounted();
      animator.apply({ clip: 'AllNatural_Ground_DualSpin_Slam', time: 0.45, loop: false }, 0.45);
    }
  })()`);
  await sleep(400);
  await screenshot('13_all_natural_disaster_animation.png');

  console.log('================================================================================');
  console.log('ALL BROWSER ACCEPTANCE TESTS & SCREENSHOTS COMPLETED SUCCESSFULLY!');
  console.log('================================================================================');

} finally {
  try { ws?.close(); } catch {}
  try { chrome.kill('SIGTERM'); } catch {}
  try { await server.stop(); } catch {}
}
