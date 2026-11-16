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
  // TASK 2 — Restore Breakthrough to Play Alone
  // =========================================================================
  console.log('[VERIFY] === Task 2: Restore Breakthrough to Play Alone ===');
  await evaluate("document.querySelector('#solo-button').click()");
  await until(() => evaluate("!document.querySelector('#solo-menu').classList.contains('hidden')"), 'solo menu visible');
  await sleep(300);

  // Click Breakthrough in Play Alone
  console.log('[VERIFY] Selecting Breakthrough in Play Alone...');
  await evaluate("document.querySelector('#breakthrough-mode').click()");
  await sleep(300);

  const soloState = await evaluate(`(() => {
    const title = document.querySelector('#solo-selected-title')?.textContent;
    const note = document.querySelector('#solo-selected-note')?.textContent;
    const btWrapVisible = !document.querySelector('#solo-breakthrough-wrap')?.hidden;
    const launchText = document.querySelector('#solo-launch span')?.textContent;
    return { title, note, btWrapVisible, launchText };
  })()`);
  console.log('[VERIFY] Solo Breakthrough selection state:', soloState);
  assert.equal(soloState.title, 'BREAKTHROUGH');
  assert.equal(soloState.btWrapVisible, true);
  assert.equal(soloState.launchText, 'START BREAKTHROUGH');

  // Configure battlefield, allegiance, team size, difficulty
  console.log('[VERIFY] Configuring Breakthrough options...');
  await evaluate("document.querySelector('#solo-breakthrough-arena [data-arena=\"outerworks\"]').click()");
  await evaluate("document.querySelector('#solo-breakthrough-team [data-team=\"DEFENDERS\"]').click()");
  await evaluate("document.querySelector('#solo-breakthrough-size [data-size=\"2\"]').click()");
  await evaluate("document.querySelector('#solo-breakthrough-rival [data-skill=\"champion\"]').click()");
  await sleep(300);

  const configuredOrders = await evaluate(`(() => {
    const arena = document.querySelector('#solo-breakthrough-arena [data-arena="outerworks"]')?.classList.contains('mine');
    const team = document.querySelector('#solo-breakthrough-team [data-team="DEFENDERS"]')?.classList.contains('mine');
    const size = document.querySelector('#solo-breakthrough-size [data-size="2"]')?.classList.contains('mine');
    const rival = document.querySelector('#solo-breakthrough-rival [data-skill="champion"]')?.classList.contains('mine');
    return { arena, team, size, rival };
  })()`);
  console.log('[VERIFY] Configured Breakthrough options active:', configuredOrders);
  assert.equal(configuredOrders.arena, true);
  assert.equal(configuredOrders.team, true);
  assert.equal(configuredOrders.size, true);
  assert.equal(configuredOrders.rival, true);
  await screenshot('04-solo-breakthrough-configured-desktop.png');

  // Verify mobile landscape presentation
  console.log('[VERIFY] Testing mobile landscape viewport emulation (844x390)...');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 844,
    height: 390,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await sleep(400);

  // Switch to review settings panel on mobile
  await evaluate("document.querySelector('#solo-details')?.click()");
  await sleep(300);

  await screenshot('05-solo-breakthrough-mobile-landscape.png');

  // Reset to desktop viewport
  await send('Emulation.clearDeviceMetricsOverride');
  await send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await sleep(300);

  // Ensure player name is set across all name fields
  await evaluate(`(() => {
    for (const f of document.querySelectorAll('input[maxlength="18"]')) {
      f.value = 'Spellblade';
      f.dispatchEvent(new Event('input', { bubbles: true }));
    }
  })()`);

  // Launch actual local Breakthrough match
  console.log('[VERIFY] Launching local Breakthrough match...');
  const launchDebug = await evaluate(`(() => {
    const launchBtn = document.querySelector('#solo-launch');
    const nameVal = document.querySelector('#player-name')?.value;
    const soloNameVal = document.querySelector('#solo-name')?.value;
    const rightNameVal = document.querySelector('#solo-right-name')?.value;
    const act = typeof soloActivity !== 'undefined' ? soloActivity : null;
    launchBtn.click();
    const err = document.querySelector('[data-menu-error]')?.textContent;
    const currentScreen = typeof router !== 'undefined' ? router.current : null;
    return { nameVal, soloNameVal, rightNameVal, act, err, currentScreen };
  })()`);
  console.log('[VERIFY] Launch debug:', launchDebug);
  await sleep(1000);

  const afterClickInfo = await evaluate(`(() => {
    const visibleSections = Array.from(document.querySelectorAll('section:not(.hidden)')).map(s => s.id);
    const link = globalThis.__ssLink;
    return {
      visibleSections,
      linkHosting: link?.hosting,
      linkPlayingLocally: link?.playingLocally,
      localRoomState: link?.local?.room?.state,
      localRoomMode: link?.local?.room?.mode,
      lobbyModeText: document.querySelector('#lobby-mode')?.textContent,
      lobbyWorldText: document.querySelector('#lobby-world')?.textContent,
      hudHidden: document.querySelector('#hud')?.classList.contains('hidden'),
    };
  })()`);
  console.log('[VERIFY] After click state:', afterClickInfo);

  // Wait for lobby or match to appear
  console.log('[VERIFY] Waiting for Breakthrough lobby or arena...');
  await until(async () => {
    return evaluate(`(() => {
      const lobbyVisible = !document.querySelector('#lobby')?.classList.contains('hidden');
      const hudVisible = !document.querySelector('#hud')?.classList.contains('hidden');
      const link = globalThis.__ssLink;
      const isBreakthrough = link?.local?.room?.mode === 'BREAKTHROUGH' || /BREAKTHROUGH/i.test(document.querySelector('#lobby-mode')?.textContent || '');
      return (lobbyVisible || hudVisible) && isBreakthrough;
    })()`);
  }, 'Breakthrough lobby or arena', 150);

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

  // Start match from lobby if ready button is visible, or wait for countdown to finish
  console.log('[VERIFY] Readying up / waiting for match start...');
  await evaluate("document.querySelector('#start-match')?.click()");
  await sleep(1000);

  // Wait for playing arena
  console.log('[VERIFY] Waiting for Breakthrough arena playing state...');
  await until(async () => {
    return evaluate(`(() => {
      const link = globalThis.__ssLink;
      const playing = link?.local?.room?.state === 'PLAYING';
      const hudVisible = !document.querySelector('#hud')?.classList.contains('hidden');
      return playing || hudVisible;
    })()`);
  }, 'Breakthrough arena playing', 150);
  await sleep(800);

  await screenshot('07-breakthrough-match-running.png');
  console.log('[VERIFY] Breakthrough local match confirmed running!');

  // Leave room and return to main menu
  console.log('[VERIFY] Leaving Breakthrough match...');
  await evaluate(`(() => {
    const leaveBtn = document.querySelector('#lobby-leave') || document.querySelector('#pause-leave') || document.querySelector('#leave');
    if (leaveBtn) leaveBtn.click();
    else if (globalThis.__ssLink?.leaveRoom) globalThis.__ssLink.leaveRoom();
  })()`);
  await sleep(600);

  // Ensure returned to main menu
  await evaluate(`(() => {
    const menuSec = document.querySelector('#menu');
    if (menuSec?.classList.contains('hidden')) {
      for (const s of document.querySelectorAll('section')) s.classList.add('hidden');
      menuSec.classList.remove('hidden');
    }
  })()`);
  await sleep(400);

  // =========================================================================
  // TASK 3 — Make Rampage to Renown accessible to guests
  // =========================================================================
  console.log('[VERIFY] === Task 3: Make Rampage to Renown accessible to guests ===');
  await evaluate("document.querySelector('#solo-button').click()");
  await until(() => evaluate("!document.querySelector('#solo-menu').classList.contains('hidden')"), 'solo menu visible');
  await sleep(300);

  console.log('[VERIFY] Selecting Rampage to Renown in Solo menu...');
  await evaluate("document.querySelector('#renown-trials-mode').click()");
  await sleep(300);

  const renownState = await evaluate(`(() => {
    const title = document.querySelector('#solo-selected-title')?.textContent;
    const noteVisible = !document.querySelector('#solo-renown-note')?.hidden;
    const noteText = document.querySelector('#solo-renown-note')?.textContent;
    const rehearseVisible = !document.querySelector('#solo-renown-rehearse')?.hidden;
    const rehearseText = document.querySelector('#solo-renown-rehearse span')?.textContent;
    const launchText = document.querySelector('#solo-launch span')?.textContent;
    return { title, noteVisible, noteText, rehearseVisible, rehearseText, launchText };
  })()`);
  console.log('[VERIFY] Solo Renown selection state for guest:', renownState);
  assert.equal(renownState.title, 'RAMPAGE TO RENOWN');
  assert.equal(renownState.noteVisible, true);
  assert.match(renownState.noteText, /Permanent Renown rewards require a connected profile/);
  assert.equal(renownState.rehearseVisible, true);
  assert.equal(renownState.rehearseText, 'REHEARSE ON THIS DEVICE');
  assert.equal(renownState.launchText, 'REHEARSE ON THIS DEVICE');
  await screenshot('08-solo-renown-guest-options.png');

  // Launch local rehearsal as guest
  console.log('[VERIFY] Launching Renown rehearsal on this device...');
  await evaluate("document.querySelector('#solo-renown-rehearse').click()");
  await sleep(1000);

  console.log('[VERIFY] Waiting for Renown Rehearsal match or lobby...');
  await until(async () => {
    return evaluate(`(() => {
      const link = globalThis.__ssLink;
      const isLocal = link?.playingLocally;
      const isRenown = link?.local?.room?.mode === 'RENOWN_TRIALS';
      const lobbyVisible = !document.querySelector('#lobby')?.classList.contains('hidden');
      const hudVisible = !document.querySelector('#hud')?.classList.contains('hidden');
      return (lobbyVisible || hudVisible) && isLocal && isRenown;
    })()`);
  }, 'local Renown Rehearsal match started', 150);

  // Start match from lobby if present
  const inLobby = await evaluate("!document.querySelector('#lobby')?.classList.contains('hidden')");
  if (inLobby) {
    console.log('[VERIFY] Starting match from Renown lobby...');
    await evaluate("document.querySelector('#start-match')?.click()");
    await sleep(1000);
  }

  await until(async () => {
    return evaluate(`(() => {
      const link = globalThis.__ssLink;
      const playing = link?.local?.room?.state === 'PLAYING';
      const hudVisible = !document.querySelector('#hud')?.classList.contains('hidden');
      return playing || hudVisible;
    })()`);
  }, 'Renown Rehearsal arena playing', 150);

  await sleep(800);
  await screenshot('09-renown-rehearsal-match-running.png');
  console.log('[VERIFY] Renown Rehearsal confirmed running locally without remote connection!');

  console.log('[VERIFY] ALL 3 TASKS VERIFIED SUCCESSFULLY IN CHROME!');

  console.log('[VERIFY] ALL 3 TASKS VERIFIED SUCCESSFULLY IN CHROME!');
} finally {
  try { ws?.close(); } catch {}
  try { chrome.kill('SIGKILL'); } catch {}
  try { await server.stop(); } catch {}
}
