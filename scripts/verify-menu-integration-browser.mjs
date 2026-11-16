import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGameServer } from '../server/src/server.mjs';

const PORT = 3019;
const CDP_PORT = 9259;
const OUT_DIR = 'docs/evidence/menu-ui';
await mkdir(OUT_DIR, { recursive: true });

const chromeBin = process.env.CHROME_BIN || (
  process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : 'chromium'
);

const server = createGameServer({ port: PORT, host: '127.0.0.1' });
await server.start();
console.log(`[VERIFY] Game server running at http://127.0.0.1:${PORT}`);

const profileDir = await mkdtemp(join(tmpdir(), 'ss-menu-integration-chrome-'));
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
const exceptions = [];

function send(method, params = {}) {
  const id = ++seq;
  const p = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} timed out`));
    }, 15000);
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
  const filePath = join(OUT_DIR, filename);
  await writeFile(filePath, Buffer.from(r.data, 'base64'));
  console.log(`[VERIFY] Captured screenshot: ${filePath}`);
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
    const data = JSON.parse(String(event.data));
    if (data.method === 'Runtime.exceptionThrown') {
      const err = data.params?.exceptionDetails?.exception?.description || data.params?.exceptionDetails?.text || 'unknown';
      console.error('[BROWSER EXCEPTION]', err);
      exceptions.push(err);
    }
    const task = pending.get(data.id);
    if (!task) return;
    pending.delete(data.id);
    if (data.error) task.reject(new Error(data.error.message));
    else task.resolve(data.result);
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?debug` });

  console.log('[VERIFY] Waiting for menu veil to lift...');
  await until(() => evaluate("document.querySelector('#loading-veil')?.classList.contains('done')"), 'loading veil done', 150);
  await sleep(600);

  // =========================================================================
  // TASK 1 — Fix the Armory's equipped technique display
  // =========================================================================
  console.log('[VERIFY] === Task 1: Armory Equipped Technique Display ===');
  await evaluate("document.querySelector('#armory-button').click()");
  await until(() => evaluate("!document.querySelector('#armory-menu').classList.contains('hidden')"), 'armory screen visible');
  await sleep(400);

  // Verify fresh user sees Rigid Riposte equipped on plaque
  const techPlaque = await evaluate(`(() => {
    const name = document.querySelector('#plaque-name-technique')?.textContent;
    const icon = document.querySelector('#plaque-icon-technique')?.textContent;
    return { name, icon };
  })()`);
  console.log('[VERIFY] Default Technique Plaque:', techPlaque);
  assert.equal(techPlaque.name, 'Rigid Riposte');
  assert.equal(techPlaque.icon, '⇏');
  await screenshot('01-armory-technique-default.png');

  // Open technique inspector and select Whirl Like the Wind
  console.log('[VERIFY] Opening technique inspector...');
  await evaluate("document.querySelector('#armory-slot-technique').click()");
  await sleep(400);

  console.log('[VERIFY] Equipping Whirl Like the Wind...');
  await evaluate("document.querySelector('[data-technique=\"whirl_wind\"]').click()");
  await sleep(400);

  const updatedTechPlaque = await evaluate(`(() => {
    const name = document.querySelector('#plaque-name-technique')?.textContent;
    const icon = document.querySelector('#plaque-icon-technique')?.textContent;
    return { name, icon };
  })()`);
  console.log('[VERIFY] Updated Technique Plaque:', updatedTechPlaque);
  assert.equal(updatedTechPlaque.name, 'Whirl Like the Wind');
  assert.equal(updatedTechPlaque.icon, '↻');
  await screenshot('02-armory-technique-whirlwind.png');

  // Reload page and re-enter Armory to verify reload persistence
  console.log('[VERIFY] Reloading page to test persistence...');
  await send('Page.reload');
  await until(() => evaluate("document.querySelector('#loading-veil')?.classList.contains('done')"), 'loading veil done after reload', 150);
  await sleep(600);
  await evaluate("document.querySelector('#armory-button').click()");
  await until(() => evaluate("!document.querySelector('#armory-menu').classList.contains('hidden')"), 'armory visible after reload');
  await sleep(400);

  const persistedTechPlaque = await evaluate(`(() => {
    const name = document.querySelector('#plaque-name-technique')?.textContent;
    const icon = document.querySelector('#plaque-icon-technique')?.textContent;
    return { name, icon };
  })()`);
  console.log('[VERIFY] Persisted Technique Plaque:', persistedTechPlaque);
  assert.equal(persistedTechPlaque.name, 'Whirl Like the Wind');
  assert.equal(persistedTechPlaque.icon, '↻');
  await screenshot('03-armory-technique-persisted.png');

  // Return to main menu
  await evaluate("document.querySelector('#armory-back').click()");
  await sleep(400);

  // =========================================================================
  // TASK 2 — Restore Breakthrough to Play Alone & Isolate Battlefield Selection
  // =========================================================================
  console.log('[VERIFY] === Task 2: Restore Breakthrough to Play Alone & Isolate Battlefield ===');

  // Step A: Reproduce the user's sequence
  // 1. Open Modes of Mettle and select High Grounds
  console.log('[VERIFY] Opening Modes of Mettle and selecting High Grounds...');
  await evaluate("document.querySelector('#breakthrough-button').click()");
  await until(() => evaluate("!document.querySelector('#breakthrough-menu').classList.contains('hidden')"), 'breakthrough menu visible');
  await evaluate("document.querySelector('[data-mettle-mode=\"HIGH_GROUNDS\"]').click()");
  await sleep(300);

  const mettleState = await evaluate(`(() => {
    const chip = document.querySelector('#breakthrough-arena [data-arena="high-grounds"]');
    return {
      highGroundsActive: chip?.classList.contains('mine'),
      storedArena: localStorage.getItem('ss-breakthrough-arena'),
    };
  })()`);
  console.log('[VERIFY] Modes of Mettle High Grounds state:', mettleState);
  assert.equal(mettleState.highGroundsActive, true);
  assert.equal(mettleState.storedArena, 'high-grounds');

  // 2. Return to the main menu
  await evaluate("document.querySelector('#breakthrough-back').click()");
  await until(() => evaluate("!document.querySelector('#menu').classList.contains('hidden')"), 'main menu visible');
  await sleep(300);

  // 3. Open Play Alone -> Breakthrough
  console.log('[VERIFY] Opening Play Alone -> Breakthrough...');
  await evaluate("document.querySelector('#solo-button').click()");
  await until(() => evaluate("!document.querySelector('#solo-menu').classList.contains('hidden')"), 'solo menu visible');
  await sleep(300);

  await evaluate("document.querySelector('#breakthrough-mode').click()");
  await sleep(300);

  // 4. Examine the available battlefields and displayed team-size settings
  const soloBreakthroughInspection = await evaluate(`(() => {
    const arenaControl = document.querySelector('#solo-breakthrough-arena');
    const chips = Array.from(arenaControl?.querySelectorAll('[data-arena]') || []).map(c => ({
      arena: c.dataset.arena,
      hidden: c.hidden,
      mine: c.classList.contains('mine'),
    }));
    const sizeControl = document.querySelector('#solo-breakthrough-size');
    const sizeVisible = !sizeControl?.hidden;
    const sizeChips = Array.from(sizeControl?.querySelectorAll('[data-size]') || []).map(c => ({
      size: c.dataset.size,
      mine: c.classList.contains('mine'),
    }));
    return { chips, sizeVisible, sizeChips };
  })()`);
  console.log('[VERIFY] Solo Breakthrough Inspection:', soloBreakthroughInspection);

  // Assert ALL three Breakthrough battlefields are present and none are hidden!
  assert.equal(soloBreakthroughInspection.chips.length, 3);
  assert.deepEqual(soloBreakthroughInspection.chips.map(c => c.arena).sort(), ['bastion-breach', 'blackbell-foundry', 'outerworks']);
  for (const c of soloBreakthroughInspection.chips) {
    assert.equal(c.hidden, false, `Battlefield ${c.arena} must not be hidden in Solo Breakthrough`);
  }
  assert.equal(soloBreakthroughInspection.sizeVisible, true);
  assert.equal(soloBreakthroughInspection.sizeChips.length, 2);

  // 5. Configure Solo Breakthrough options (Outerworks, Defenders, 2v2, Champion)
  console.log('[VERIFY] Configuring Solo Breakthrough options...');
  await evaluate("document.querySelector('#solo-breakthrough-arena [data-arena=\"outerworks\"]').click()");
  await evaluate("document.querySelector('#solo-breakthrough-team [data-team=\"DEFENDERS\"]').click()");
  await evaluate("document.querySelector('#solo-breakthrough-size [data-size=\"2\"]').click()");
  await evaluate("document.querySelector('#solo-breakthrough-rival [data-skill=\"champion\"]').click()");
  await sleep(300);

  const configuredSoloBT = await evaluate(`(() => {
    const arena = document.querySelector('#solo-breakthrough-arena [data-arena="outerworks"]')?.classList.contains('mine');
    const team = document.querySelector('#solo-breakthrough-team [data-team="DEFENDERS"]')?.classList.contains('mine');
    const size = document.querySelector('#solo-breakthrough-size [data-size="2"]')?.classList.contains('mine');
    const rival = document.querySelector('#solo-breakthrough-rival [data-skill="champion"]')?.classList.contains('mine');
    const storedSoloArena = localStorage.getItem('ss-solo-breakthrough-arena');
    const storedMettleArena = localStorage.getItem('ss-breakthrough-arena');
    return { arena, team, size, rival, storedSoloArena, storedMettleArena };
  })()`);
  console.log('[VERIFY] Configured Solo Breakthrough state:', configuredSoloBT);
  assert.equal(configuredSoloBT.arena, true);
  assert.equal(configuredSoloBT.team, true);
  assert.equal(configuredSoloBT.size, true);
  assert.equal(configuredSoloBT.rival, true);
  assert.equal(configuredSoloBT.storedSoloArena, 'outerworks');
  assert.equal(configuredSoloBT.storedMettleArena, 'high-grounds'); // Mettle retained High Grounds!
  await screenshot('04-solo-breakthrough-configured-desktop.png');

  // Mobile landscape presentation check
  console.log('[VERIFY] Testing mobile landscape viewport emulation (844x390)...');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 844,
    height: 390,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await sleep(400);

  await evaluate("document.querySelector('#solo-details')?.click()");
  await sleep(300);
  await screenshot('05-solo-breakthrough-mobile-landscape.png');

  await send('Emulation.clearDeviceMetricsOverride');
  await send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await sleep(300);

  // Return to main menu and test bidirectional persistence
  await evaluate("document.querySelector('#solo-back').click()");
  await until(() => evaluate("!document.querySelector('#menu').classList.contains('hidden')"), 'main menu visible');
  await sleep(300);

  // Check Modes of Mettle still has High Grounds selected
  await evaluate("document.querySelector('#breakthrough-button').click()");
  await until(() => evaluate("!document.querySelector('#breakthrough-menu').classList.contains('hidden')"), 'breakthrough menu visible');
  const mettleRevisit = await evaluate(`(() => {
    return {
      highGroundsActive: document.querySelector('#breakthrough-arena [data-arena="high-grounds"]')?.classList.contains('mine'),
      storedArena: localStorage.getItem('ss-breakthrough-arena'),
    };
  })()`);
  console.log('[VERIFY] Modes of Mettle revisit state:', mettleRevisit);
  assert.equal(mettleRevisit.highGroundsActive, true);
  assert.equal(mettleRevisit.storedArena, 'high-grounds');
  await evaluate("document.querySelector('#breakthrough-back').click()");
  await until(() => evaluate("!document.querySelector('#menu').classList.contains('hidden')"), 'main menu visible');
  await sleep(300);

  // Test reload persistence of both separate selections
  console.log('[VERIFY] Reloading page to test persistence of both selections...');
  await send('Page.reload');
  await until(() => evaluate("document.querySelector('#loading-veil')?.classList.contains('done')"), 'loading veil done after reload', 150);
  await sleep(600);

  // Check Solo Breakthrough persisted outerworks
  await evaluate("document.querySelector('#solo-button').click()");
  await until(() => evaluate("!document.querySelector('#solo-menu').classList.contains('hidden')"), 'solo menu visible');
  await evaluate("document.querySelector('#breakthrough-mode').click()");
  await sleep(300);

  const soloPersisted = await evaluate(`(() => {
    const arenaMine = document.querySelector('#solo-breakthrough-arena [data-arena="outerworks"]')?.classList.contains('mine');
    const stored = localStorage.getItem('ss-solo-breakthrough-arena');
    return { arenaMine, stored };
  })()`);
  console.log('[VERIFY] Solo Breakthrough reload persistence:', soloPersisted);
  assert.equal(soloPersisted.arenaMine, true);
  assert.equal(soloPersisted.stored, 'outerworks');

  // Ensure player name is set
  await evaluate(`(() => {
    for (const f of document.querySelectorAll('input[maxlength="18"]')) {
      f.value = 'Spellblade';
      f.dispatchEvent(new Event('input', { bubbles: true }));
    }
  })()`);

  // Launch Breakthrough match
  console.log('[VERIFY] Launching local Breakthrough match...');
  await evaluate("document.querySelector('#solo-launch').click()");
  await sleep(1000);

  // Wait for Breakthrough lobby
  console.log('[VERIFY] Waiting for Breakthrough lobby...');
  await until(async () => {
    return evaluate(`(() => {
      const lobbyVisible = !document.querySelector('#lobby')?.classList.contains('hidden');
      const link = globalThis.__ssLink;
      return lobbyVisible && link?.local?.room?.mode === 'BREAKTHROUGH';
    })()`);
  }, 'Breakthrough lobby', 150);

  const lobbyState = await evaluate(`(() => {
    const mode = document.querySelector('#lobby-mode')?.textContent;
    const world = document.querySelector('#lobby-world')?.textContent;
    const link = globalThis.__ssLink;
    const isLocal = link?.playingLocally;
    return { mode, world, isLocal };
  })()`);
  console.log('[VERIFY] Breakthrough lobby state:', lobbyState);
  assert.match(lobbyState.mode, /BREAKTHROUGH/i);
  assert.match(lobbyState.world, /OUTERWORKS/i);
  assert.equal(lobbyState.isLocal, true);
  await screenshot('06-breakthrough-lobby.png');

  // Ready up / start match
  console.log('[VERIFY] Starting Breakthrough match...');
  await evaluate("document.querySelector('#start-match')?.click()");
  await sleep(1000);

  // STRICT ASSERTION: mode === 'BREAKTHROUGH' AND room.state === 'PLAYING' AND visible gameplay HUD (not an OR condition!)
  console.log('[VERIFY] Waiting for Breakthrough arena STRICT active state (mode + PLAYING state + visible HUD)...');
  const breakthroughRunning = await until(async () => {
    return evaluate(`(() => {
      const link = globalThis.__ssLink;
      const isMode = link?.local?.room?.mode === 'BREAKTHROUGH';
      const isPlaying = link?.local?.room?.state === 'PLAYING';
      const hudVisible = !document.querySelector('#hud')?.classList.contains('hidden');
      if (isMode && isPlaying && hudVisible) {
        return { mode: link.local.room.mode, state: link.local.room.state, hudVisible };
      }
      return null;
    })()`);
  }, 'Breakthrough active playing arena with HUD', 150);
  console.log('[VERIFY] Breakthrough confirmed active:', breakthroughRunning);
  assert.equal(breakthroughRunning.mode, 'BREAKTHROUGH');
  assert.equal(breakthroughRunning.state, 'PLAYING');
  assert.equal(breakthroughRunning.hudVisible, true);
  await sleep(800);
  await screenshot('07-breakthrough-match-running.png');

  // Leave match using the real Leave/Return flow (no artificial unhide hack!)
  console.log('[VERIFY] Leaving Breakthrough match via game pause-leave button...');
  await evaluate("document.querySelector('#pause-leave')?.click()");
  await until(async () => {
    return evaluate(`(() => {
      const menuVisible = !document.querySelector('#menu')?.classList.contains('hidden');
      const routerCurrent = typeof router !== 'undefined' ? router.current : null;
      return menuVisible && (routerCurrent === null || routerCurrent === 'MAIN_MENU');
    })()`);
  }, 'main menu reached via real Leave flow', 100);
  console.log('[VERIFY] Main menu reached cleanly via real Leave flow!');
  await sleep(400);

  // =========================================================================
  // TASK 3 — Make Rampage to Renown accessible to guests & consistent on connection changes
  // =========================================================================
  console.log('[VERIFY] === Task 3: Renown Guest Rehearsal & Connection Consistency ===');

  // Step A: Guest State Check
  console.log('[VERIFY] Testing Guest State in Solo Renown...');
  await evaluate("document.querySelector('#solo-button').click()");
  await until(() => evaluate("!document.querySelector('#solo-menu').classList.contains('hidden')"), 'solo menu visible');
  await sleep(300);

  await evaluate("document.querySelector('#renown-trials-mode').click()");
  await sleep(300);

  const guestRenownState = await evaluate(`(() => {
    const isOnline = Boolean(globalThis.__ssRenown ? globalThis.__ssRenown.online() : (globalThis.__ssLink?.status === 'online' && globalThis.__ssLink?.remote?.profileReady));
    const title = document.querySelector('#solo-selected-title')?.textContent;
    const noteVisible = !document.querySelector('#solo-renown-note')?.hidden;
    const noteText = document.querySelector('#solo-renown-note')?.textContent;
    const rehearseVisible = !document.querySelector('#solo-renown-rehearse')?.hidden;
    const launchText = document.querySelector('#solo-launch span')?.textContent;
    return { isOnline, title, noteVisible, noteText, rehearseVisible, launchText };
  })()`);
  console.log('[VERIFY] Guest Solo Renown state:', guestRenownState);
  assert.equal(guestRenownState.isOnline, false);
  assert.equal(guestRenownState.title, 'RAMPAGE TO RENOWN');
  assert.equal(guestRenownState.noteVisible, true);
  assert.match(guestRenownState.noteText, /Permanent Renown rewards require a connected profile/);
  // Guest must NOT have two identical rehearsal buttons!
  assert.equal(guestRenownState.rehearseVisible, false, 'Guest must not have duplicate rehearsal button');
  assert.equal(guestRenownState.launchText, 'REHEARSE ON THIS DEVICE');
  await screenshot('08-solo-renown-guest-options.png');

  // Launch guest rehearsal via primary button
  console.log('[VERIFY] Launching guest Renown rehearsal on this device...');
  await evaluate("document.querySelector('#solo-launch').click()");
  await sleep(1000);

  // Start from lobby if lobby appeared
  const guestLobby = await evaluate("!document.querySelector('#lobby')?.classList.contains('hidden')");
  if (guestLobby) {
    console.log('[VERIFY] Starting from Renown lobby...');
    await evaluate("document.querySelector('#start-match')?.click()");
    await sleep(1000);
  }

  // STRICT ASSERTION: mode === 'RENOWN_TRIALS' AND room.state === 'PLAYING' AND visible gameplay HUD (not an OR condition!)
  console.log('[VERIFY] Waiting for Renown Rehearsal STRICT active state (mode + PLAYING state + visible HUD)...');
  const rehearsalRunning = await until(async () => {
    return evaluate(`(() => {
      const link = globalThis.__ssLink;
      const isLocal = link?.playingLocally;
      const isMode = link?.local?.room?.mode === 'RENOWN_TRIALS';
      const isPlaying = link?.local?.room?.state === 'PLAYING';
      const hudVisible = !document.querySelector('#hud')?.classList.contains('hidden');
      if (isLocal && isMode && isPlaying && hudVisible) {
        return { isLocal, mode: link.local.room.mode, state: link.local.room.state, hudVisible };
      }
      return null;
    })()`);
  }, 'local Renown Rehearsal active playing arena with HUD', 150);
  console.log('[VERIFY] Renown Rehearsal confirmed running locally:', rehearsalRunning);
  assert.equal(rehearsalRunning.isLocal, true);
  assert.equal(rehearsalRunning.mode, 'RENOWN_TRIALS');
  assert.equal(rehearsalRunning.state, 'PLAYING');
  assert.equal(rehearsalRunning.hudVisible, true);
  await sleep(800);
  await screenshot('09-renown-rehearsal-match-running.png');

  // Leave rehearsal via real Leave flow
  console.log('[VERIFY] Leaving rehearsal match via pause-leave...');
  await evaluate("document.querySelector('#pause-leave')?.click()");
  await until(() => evaluate("!document.querySelector('#menu')?.classList.contains('hidden')"), 'main menu reached via pause-leave', 100);
  await sleep(400);

  // Step B: Connected / Profile-Ready State Check
  console.log('[VERIFY] Connecting to server to test Connected User state...');
  await evaluate(`(async () => {
    const link = globalThis.__ssLink;
    await link.connect();
  })()`);
  await until(async () => {
    return evaluate(`(() => {
      const link = globalThis.__ssLink;
      return link?.status === 'online' && link?.remote?.profileReady;
    })()`);
  }, 'server online with profile ready', 150);

  // Open Solo -> Renown while connected
  await evaluate("document.querySelector('#solo-button').click()");
  await until(() => evaluate("!document.querySelector('#solo-menu').classList.contains('hidden')"), 'solo menu visible');
  await evaluate("document.querySelector('#renown-trials-mode').click()");
  await sleep(300);

  const connectedRenownState = await evaluate(`(() => {
    const isOnline = Boolean(globalThis.__ssRenown ? globalThis.__ssRenown.online() : (globalThis.__ssLink?.status === 'online' && globalThis.__ssLink?.remote?.profileReady));
    const noteVisible = !document.querySelector('#solo-renown-note')?.hidden;
    const rehearseVisible = !document.querySelector('#solo-renown-rehearse')?.hidden;
    const launchText = document.querySelector('#solo-launch span')?.textContent;
    return { isOnline, noteVisible, rehearseVisible, launchText };
  })()`);
  console.log('[VERIFY] Connected Solo Renown state:', connectedRenownState);
  assert.equal(connectedRenownState.isOnline, true);
  assert.equal(connectedRenownState.noteVisible, false);
  assert.equal(connectedRenownState.rehearseVisible, true, 'Connected user has explicit optional rehearsal button');
  assert.equal(connectedRenownState.launchText, 'BEGIN REWARDED TRIAL');
  await screenshot('10-solo-renown-connected-options.png');

  // Step C: Test Connection Loss while Renown menu is open
  console.log('[VERIFY] Simulating connection loss while Renown menu is open...');
  await evaluate(`(() => {
    const link = globalThis.__ssLink;
    link.remote.ws?.close();
  })()`);
  await until(async () => {
    return evaluate(`(() => {
      const isOnline = Boolean(globalThis.__ssRenown ? globalThis.__ssRenown.online() : (globalThis.__ssLink?.status === 'online' && globalThis.__ssLink?.remote?.profileReady));
      return !isOnline;
    })()`);
  }, 'connection loss detected', 100);

  const disconnectedRenownState = await evaluate(`(() => {
    const isOnline = Boolean(globalThis.__ssRenown ? globalThis.__ssRenown.online() : (globalThis.__ssLink?.status === 'online' && globalThis.__ssLink?.remote?.profileReady));
    const noteVisible = !document.querySelector('#solo-renown-note')?.hidden;
    const rehearseVisible = !document.querySelector('#solo-renown-rehearse')?.hidden;
    const launchText = document.querySelector('#solo-launch span')?.textContent;
    return { isOnline, noteVisible, rehearseVisible, launchText };
  })()`);
  console.log('[VERIFY] Disconnected Renown state (live transition):', disconnectedRenownState);
  assert.equal(disconnectedRenownState.isOnline, false);
  assert.equal(disconnectedRenownState.noteVisible, true);
  assert.equal(disconnectedRenownState.rehearseVisible, false);
  assert.equal(disconnectedRenownState.launchText, 'REHEARSE ON THIS DEVICE');
  await screenshot('11-solo-renown-connection-loss.png');

  // Step D: Test Connection Recovery while Renown menu is open
  console.log('[VERIFY] Simulating connection recovery while Renown menu is open...');
  await evaluate(`(async () => {
    const link = globalThis.__ssLink;
    await link.connect();
  })()`);
  await until(async () => {
    return evaluate(`(() => {
      const link = globalThis.__ssLink;
      return link?.status === 'online' && link?.remote?.profileReady;
    })()`);
  }, 'connection recovery detected', 150);

  const recoveredRenownState = await evaluate(`(() => {
    const isOnline = Boolean(globalThis.__ssRenown ? globalThis.__ssRenown.online() : (globalThis.__ssLink?.status === 'online' && globalThis.__ssLink?.remote?.profileReady));
    const noteVisible = !document.querySelector('#solo-renown-note')?.hidden;
    const rehearseVisible = !document.querySelector('#solo-renown-rehearse')?.hidden;
    const launchText = document.querySelector('#solo-launch span')?.textContent;
    return { isOnline, noteVisible, rehearseVisible, launchText };
  })()`);
  console.log('[VERIFY] Recovered Renown state (live transition):', recoveredRenownState);
  assert.equal(recoveredRenownState.isOnline, true);
  assert.equal(recoveredRenownState.noteVisible, false);
  assert.equal(recoveredRenownState.rehearseVisible, true);
  assert.equal(recoveredRenownState.launchText, 'BEGIN REWARDED TRIAL');

  // Step E: Launch Connected Rewarded Trial -> Routes online to authoritative server
  console.log('[VERIFY] Launching authoritative online trial as connected user...');
  await evaluate("document.querySelector('#solo-launch').click()");
  await sleep(1000);

  await until(async () => {
    return evaluate(`(() => {
      const lobbyVisible = !document.querySelector('#lobby')?.classList.contains('hidden');
      const link = globalThis.__ssLink;
      return lobbyVisible && link?.hosting === 'remote' && link?.status === 'online';
    })()`);
  }, 'online authoritative trial lobby reached', 150);

  const onlineTrialLobby = await evaluate(`(() => {
    const link = globalThis.__ssLink;
    const hosting = link?.hosting;
    const status = link?.status;
    const mode = document.querySelector('#lobby-mode')?.textContent;
    return { hosting, status, mode };
  })()`);
  console.log('[VERIFY] Online trial lobby reached:', onlineTrialLobby);
  assert.equal(onlineTrialLobby.hosting, 'remote');
  assert.equal(onlineTrialLobby.status, 'online');
  assert.match(onlineTrialLobby.mode, /RENOWN/i);
  await screenshot('12-solo-renown-online-trial-lobby.png');

  // Leave room using real lobby leave
  console.log('[VERIFY] Leaving online lobby via real #lobby-leave button...');
  await evaluate("document.querySelector('#lobby-leave')?.click()");
  await until(() => evaluate("!document.querySelector('#menu')?.classList.contains('hidden')"), 'main menu reached via lobby-leave', 100);
  console.log('[VERIFY] Main menu cleanly reached via lobby-leave!');

  console.log('[VERIFY] ALL ACCEPTANCE CRITERIA VERIFIED SUCCESSFULLY IN REAL CHROME!');

  console.log('[VERIFY] ALL 3 TASKS VERIFIED SUCCESSFULLY IN CHROME!');

  console.log('[VERIFY] ALL 3 TASKS VERIFIED SUCCESSFULLY IN CHROME!');
} finally {
  try { ws?.close(); } catch {}
  try { chrome.kill('SIGKILL'); } catch {}
  try { await server.stop(); } catch {}
}
