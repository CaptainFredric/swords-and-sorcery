// Mobile Practice UX, Spell Button Lifecycle, and Flight Ergonomics Browser Acceptance
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGameServer } from '../server/src/server.mjs';

const artifactDir = '/Users/erendiracisneros/.gemini/antigravity/brain/bf36c922-8785-4d62-b11e-f266d5847a42';
const chromeBin = process.env.CHROME_BIN ?? (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'chromium');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const game = createGameServer({ port: 0, host: '127.0.0.1' });
await game.start();
const { port } = game.address();
const url = `http://127.0.0.1:${port}`;

const profile = await mkdtemp(join(tmpdir(), 'mobile-practice-chrome-'));
const cdpPort = 9277;
const chrome = spawn(chromeBin, [
  '--headless=new',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--enable-unsafe-swiftshader',
  '--remote-allow-origins=*',
  '--window-size=915,412',
  '--remote-debugging-port=' + cdpPort,
  '--user-data-dir=' + profile,
  'about:blank',
], { stdio: 'ignore' });

async function waitFor(fn, label, attempts = 150) {
  for (let i = 0; i < attempts; i++) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    await sleep(100);
  }
  throw new Error('Timed out waiting for: ' + label);
}

let ws, seq = 0;
const pending = new Map();

function send(method, params = {}) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP ${method} timed out`));
    }, 25000);
    pending.set(id, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evalPage(expression) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text ?? JSON.stringify(res.exceptionDetails));
  }
  return res.result?.value;
}

async function captureShot(filename) {
  const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const buf = Buffer.from(res.data, 'base64');
  await writeFile(join(artifactDir, filename), buf);
  console.log(`Saved screenshot: ${filename} (${buf.length} bytes)`);
}

async function walkToMachine(machineExpr) {
  await evalPage(`(() => {
    const rt = window.__ssRuntime;
    const p = rt.localAuth?.position;
    const m = ${machineExpr};
    if (m && p) {
      rt.input.yaw = Math.atan2(-(m.x - p.x), -(m.z - p.z));
      rt.input.enabled = true;
      rt._origMovement = rt.input.movement?.bind(rt.input);
      rt.input.movement = () => ({ forward: 1, strafe: 0 });
    }
  })()`);
  await waitFor(async () => {
    const dist = await evalPage(`(() => {
      const rt = window.__ssRuntime;
      const p = rt.localAuth?.position;
      const m = ${machineExpr};
      return p && m ? Math.hypot(p.x - m.x, p.z - m.z) : 99;
    })()`);
    return dist < 2.0;
  }, 'walk into mount range');
  await evalPage(`(() => {
    const rt = window.__ssRuntime;
    if (rt._origMovement) rt.input.movement = rt._origMovement;
    rt.input.enabled = true;
  })()`);
  await sleep(200);
}

async function tapTouchButton(selector) {
  await waitFor(() => evalPage(`Boolean(document.querySelector('${selector}') && !document.querySelector('${selector}').hidden)`), `button visible: ${selector}`);
  await evalPage(`(() => {
    const el = document.querySelector('${selector}');
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 25, pointerType: 'touch', clientX: cx, clientY: cy, bubbles: true }));
    el.dispatchEvent(new PointerEvent('pointerup', { pointerId: 25, pointerType: 'touch', clientX: cx, clientY: cy, bubbles: true }));
  })()`);
}

try {
  const target = await waitFor(async () => {
    const res = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
    return (await res.json()).find((t) => t.type === 'page');
  }, 'CDP page target');

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = (e) => {
    const pkt = JSON.parse(String(e.data));
    const next = pending.get(pkt.id);
    if (!next) return;
    pending.delete(pkt.id);
    if (pkt.error) next.reject(new Error(pkt.error.message));
    else next.resolve(pkt.result);
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 915,
    height: 412,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

  console.log('Navigating to game...');
  await send('Page.navigate', { url: `${url}/?touch=1&debug=1` });
  await waitFor(() => evalPage("document.querySelector('#loading-veil')?.classList.contains('done')"), 'loading veil done');
  await sleep(400);

  // Set loadout spell to steel in settings and reload so client & local session start with Steel
  await evalPage(`(() => {
    const current = JSON.parse(localStorage.getItem('ss-settings') || '{"version":1,"values":{},"bindings":{}}');
    current.values = current.values || {};
    current.values['loadout.spell'] = 'steel';
    current.values['loadout.ultimate'] = 'sunder';
    current.values['loadout.preparedSpells'] = ['steel', 'fireball', 'gale'];
    localStorage.setItem('ss-settings', JSON.stringify(current));
  })()`);
  await send('Page.reload');
  await waitFor(() => evalPage("document.querySelector('#loading-veil')?.classList.contains('done')"), 'loading veil done after reload');
  await sleep(400);

  // Enter Solo menu first, then Practice Yard
  console.log('Entering Solo menu and Practice Yard...');
  await evalPage(`(() => {
    const name = document.querySelector('#player-name');
    if (name) name.value = 'Mobile Blade';
    document.querySelector('#solo-button')?.click();
  })()`);
  await waitFor(() => evalPage("Boolean(document.querySelector('#practice-mode') && !document.querySelector('#practice-mode').disabled)"), 'solo practice button');
  await evalPage("document.querySelector('#practice-mode')?.click()");
  await waitFor(() => evalPage("window.__ssRuntime?.latestSnapshot?.roomState === 'PLAYING'"), 'playing arena state');
  await sleep(1000);

  // Activate touch focus and ensure steel loadout
  await evalPage(`(() => {
    const r = window.__ssRuntime;
    r?.enableTouch?.();
    r?.touch?.setActive?.(true);
    r?.requestPointerLock?.();
    if (r?.localAuth) {
      r.localAuth.spell = 'steel';
      r.localAuth.preparedSpells = ['steel', 'fireball', 'gale'];
    }
    const host = r?.socket?.local;
    if (host?.room && host?.playerId) {
      const p = host.room.players.get(host.playerId);
      if (p) {
        p.spell = 'steel';
        p.startingSpell = 'steel';
        p.preparedSpells = ['steel', 'fireball', 'gale'];
      }
    }
  })()`);
  await sleep(400);

  // Verify on-foot mobile controls active
  const initialTouch = await evalPage(`(() => {
    const t = window.__ssRuntime?.touch;
    return {
      active: t?.active,
      spellHidden: t?.buttons?.spell?.hidden,
      spellLabel: t?.buttons?.spell?.querySelector('span')?.textContent,
      practiceToolsHidden: t?.buttons?.practiceTools?.hidden,
    };
  })()`);
  console.log('Initial mobile controls state:', initialTouch);
  assert.equal(initialTouch.active, true, 'Touch controls must be active');
  assert.equal(initialTouch.spellHidden, false, 'Spell button visible on foot');
  assert.equal(initialTouch.practiceToolsHidden, false, 'Practice tools button visible');

  // STEP 1: Tap Practice Tools shortcut -> opens side drawer directly WITHOUT opening Pause modal
  console.log('Tapping Practice Tools shortcut...');
  await evalPage(`(() => {
    window.__ssRuntime?.input?.onAction?.('practiceTools', true);
  })()`);
  await sleep(350);

  const drawerState = await evalPage(`(() => {
    const overlay = document.querySelector('#practice-overlay');
    const pauseMenu = document.querySelector('#pause-menu');
    const rect = overlay?.getBoundingClientRect();
    return {
      overlayHidden: overlay?.classList.contains('hidden'),
      drawerOpen: overlay?.classList.contains('drawer-open'),
      pauseMenuHidden: pauseMenu?.classList.contains('hidden'),
      overlayInHome: overlay?.parentNode?.id === 'hud',
      left: rect?.left,
      top: rect?.top,
      width: rect?.width,
      contentVisible: !document.querySelector('#practice-panel-content')?.classList.contains('hidden'),
    };
  })()`);
  console.log('Drawer state:', drawerState);
  assert.equal(drawerState.overlayHidden, false, 'Practice overlay must be visible');
  assert.equal(drawerState.drawerOpen, true, 'Drawer open class set');
  assert.equal(drawerState.pauseMenuHidden, true, 'Pause menu MUST NOT be opened (dark modal backdrop absent)');
  assert.equal(drawerState.overlayInHome, true, 'Practice overlay must remain in original playing screen home');
  assert.equal(drawerState.contentVisible, true, 'Panel content must be expanded');

  await captureShot('01-mobile-practice-drawer-open.png');

  // STEP 2: Interact with side drawer (spawn a dummy)
  console.log('Spawning Guarding Dummy via side drawer button...');
  await evalPage("document.querySelector('#practice-guarding')?.click()");
  await sleep(400);

  const dummySpawned = await waitFor(() => evalPage(`(() => {
    const players = window.__ssRuntime?.latestSnapshot?.players ?? [];
    const dummy = players.find((p) => p.actorKind === 'dummy');
    return dummy ? dummy.name : null;
  })()`), 'dummy spawned in snapshot');
  console.log('Dummy spawned role:', dummySpawned);
  assert.ok(dummySpawned, 'Guarding dummy spawned successfully');

  // STEP 3: Close side drawer via close button and resume gameplay
  console.log('Closing drawer via ✕ CLOSE button...');
  await evalPage("document.querySelector('#practice-drawer-close')?.click()");
  await sleep(350);

  const closedState = await evalPage(`(() => {
    const overlay = document.querySelector('#practice-overlay');
    const t = window.__ssRuntime?.touch;
    return {
      drawerOpen: overlay?.classList.contains('drawer-open'),
      touchActive: t?.active,
      touchFocus: window.__ssRuntime?.input?.touchFocus,
    };
  })()`);
  console.log('Drawer closed state:', closedState);
  assert.equal(closedState.drawerOpen, false, 'Drawer open class cleared');
  assert.equal(closedState.touchActive, true, 'Touch controls reactivated');

  await captureShot('02-mobile-practice-dummy-spawned-resumed.png');

  // STEP 4: Build and mount Fight-and-Flight
  console.log('Reopening drawer to spawn Fight-and-Flight...');
  await evalPage("window.__ssRuntime?.onPracticeTools?.()");
  await sleep(300);

  await evalPage(`(() => {
    const sel = document.querySelector('#practice-siege-type');
    if (sel) { sel.value = 'fight-and-flight'; sel.dispatchEvent(new Event('change')); }
  })()`);
  await sleep(200);

  await evalPage("document.querySelector('#practice-build-bibye')?.click()");
  await sleep(400);

  // Close drawer
  await evalPage("document.querySelector('#practice-drawer-close')?.click()");
  await sleep(300);

  // Mount machine
  console.log('Mounting Fight-and-Flight...');
  const fafId = await waitFor(() => evalPage("window.__ssRuntime?.latestSnapshot?.fightFlight?.id"), 'fight-and-flight spawned');
  console.log('Spotted fight-and-flight id:', fafId);

  await walkToMachine('window.__ssRuntime?.latestSnapshot?.fightFlight');
  console.log('Tapping MOUNT button via touch...');
  await tapTouchButton('.touch-interact');

  await waitFor(() => evalPage("Boolean(window.__ssRuntime?.latestSnapshot?.fightFlight?.operatorId)"), 'operator mounted in snapshot');
  await sleep(500);

  // STEP 5: Verify combat ergonomics on mobile
  const flightLayout = await evalPage(`(() => {
    const t = window.__ssRuntime?.touch;
    const l = t?.layer;
    const bolt = t?.buttons?.siegeWeapon?.getBoundingClientRect();
    const sword = t?.buttons?.attack?.getBoundingClientRect();
    const guard = t?.buttons?.guard?.getBoundingClientRect();
    const dash = t?.buttons?.dash?.getBoundingClientRect();
    const spell = t?.buttons?.spell?.getBoundingClientRect();
    const hud = document.querySelector('#hud');
    const plate = getComputedStyle(l, '::before');
    return {
      isFlightMounted: l?.classList.contains('touch-flight'),
      bolt: { width: bolt?.width, height: bolt?.height, bottom: window.innerHeight - (bolt?.bottom ?? 0) },
      sword: { width: sword?.width, height: sword?.height, bottom: window.innerHeight - (sword?.bottom ?? 0) },
      guard: { width: guard?.width, height: guard?.height, bottom: window.innerHeight - (guard?.bottom ?? 0) },
      dash: { width: dash?.width, height: dash?.height, bottom: window.innerHeight - (dash?.bottom ?? 0) },
      spell: { width: spell?.width, height: spell?.height, bottom: window.innerHeight - (spell?.bottom ?? 0), hidden: t?.buttons?.spell?.hidden, label: t?.buttons?.spell?.querySelector('span')?.textContent },
      plateWidth: plate.width,
      plateHeight: plate.height,
      hasFlightHud: Boolean(hud?.querySelector('.flight-hud:not(.hidden)')),
    };
  })()`);
  console.log('Flight layout state:', flightLayout);
  assert.equal(flightLayout.isFlightMounted, true, 'Touch flight layer class active');
  assert.equal(flightLayout.spell.hidden, false, 'Mounted Steel button visible');
  assert.equal(flightLayout.spell.label, 'STEEL', 'Spell button displays STEEL while mounted');
  assert.ok(flightLayout.hasFlightHud, 'Flight HUD with Hull, Rotor, Charge is visible');

  await captureShot('03-mobile-flight-mounted-ergonomics.png');

  // STEP 6: Cast Sheathe in Steel while mounted -> verify WARD active
  console.log('Casting mounted Sheathe in Steel via touch...');
  await tapTouchButton('.touch-spell');
  await sleep(400);

  const wardState = await waitFor(() => evalPage(`(() => {
    const btn = window.__ssRuntime?.touch?.buttons?.spell;
    const faf = window.__ssRuntime?.latestSnapshot?.fightFlight;
    return {
      wardClass: btn?.classList.contains('steel-ward-active'),
      label: btn?.querySelector('span')?.textContent,
      disabled: btn?.getAttribute('aria-disabled'),
      siegeSteelActive: Boolean(faf?.siegeSteel && faf.siegeSteel.state !== 'expired'),
    };
  })()`), 'ward active state');
  console.log('Ward state:', wardState);
  assert.equal(wardState.wardClass, true, 'steel-ward-active class active');
  assert.equal(wardState.label, 'WARD', 'Displays WARD while active');

  await captureShot('04-mobile-mounted-steel-ward.png');

  // STEP 7: Dismount Fight-and-Flight -> verify normal spell button reappears
  console.log('Dismounting Fight-and-Flight via touch button...');
  await tapTouchButton('.touch-interact');
  await waitFor(() => evalPage("!window.__ssRuntime?.latestSnapshot?.fightFlight?.operatorId"), 'operator dismounted');
  await sleep(500);

  const dismountedState = await evalPage(`(() => {
    const t = window.__ssRuntime?.touch;
    const btn = t?.buttons?.spell;
    return {
      isFlightMounted: t?.layer?.classList.contains('touch-flight'),
      spellHidden: btn?.hidden,
      spellFace: btn?.dataset?.face,
      spellLabel: btn?.querySelector('span')?.textContent,
      wardClass: btn?.classList.contains('steel-ward-active'),
      ariaDisabled: btn?.getAttribute('aria-disabled'),
    };
  })()`);
  console.log('Dismounted spell state:', dismountedState);
  assert.equal(dismountedState.isFlightMounted, false, 'Flight mounted layer cleared');
  assert.equal(dismountedState.spellHidden, false, 'Spell button MUST be unhidden after dismounting');
  assert.equal(dismountedState.wardClass, false, 'Ward active class cleared');
  assert.equal(dismountedState.ariaDisabled, 'false', 'Aria-disabled reset to false');
  assert.ok(dismountedState.spellLabel, 'Spell label present');

  await captureShot('05-mobile-dismount-spell-restored.png');

  console.log('ALL BROWSER ACCEPTANCE CHECKS PASSED SUCCESSFULLY!');
} catch (err) {
  console.error('Browser acceptance failed:', err);
  process.exitCode = 1;
} finally {
  try { ws?.close(); } catch {}
  try { chrome.kill(); } catch {}
  try { await game.stop(); } catch {}
  try { await rm(profile, { recursive: true, force: true }); } catch {}
}
