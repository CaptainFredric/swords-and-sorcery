/**
 * Final Fight-and-Flight Mobile Controls & Layout Verification
 * Tests the locked default combat ladder, movement rocker, Valkyrie chord isolation,
 * multi-touch CDP touch events, and the Touch Layout Editor with real headless Chrome.
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const chromeBin = process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : (process.env.CHROME_BIN || 'chromium');

const cdpPort = 9312;
const serverPort = 3108;
const evidenceDir = path.resolve('output/mobile-controls-evidence');
const brainDir = '/Users/erendiracisneros/.gemini/antigravity/brain/bf36c922-8785-4d62-b11e-f266d5847a42';

await mkdir(evidenceDir, { recursive: true });

console.log('=== Fight-and-Flight Mobile Controls Verification ===');
console.log(`Starting server on port ${serverPort}...`);

const server = spawn('node', ['server/src/server.mjs'], {
  env: { ...process.env, PORT: String(serverPort), HOST: '127.0.0.1' },
  stdio: 'ignore'
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
await sleep(1500);

const userData = path.join(tmpdir(), `ss-mobile-controls-${process.pid}`);
const chrome = spawn(chromeBin, [
  '--headless=new',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--enable-unsafe-swiftshader',
  '--remote-allow-origins=*',
  '--window-size=915,412', // Google Pixel 7 landscape
  `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=${userData}`,
  'about:blank'
], { stdio: 'ignore' });

let ws;
let seq = 0;
const pending = new Map();
const activeTouches = new Map();

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
    } catch (e) {
      // retry
    }
    await sleep(delayMs);
  }
  throw new Error(`Timeout waiting for: ${name}`);
}

// Genuine CDP touch dispatchers
async function touchDown(x, y, id = 0) {
  activeTouches.set(id, { x: Math.round(x), y: Math.round(y), id });
  await send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: Array.from(activeTouches.values())
  });
}

async function touchMove(x, y, id = 0) {
  activeTouches.set(id, { x: Math.round(x), y: Math.round(y), id });
  await send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: Array.from(activeTouches.values())
  });
}

async function touchUp(id = 0) {
  activeTouches.delete(id);
  await send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: Array.from(activeTouches.values())
  });
}

async function touchCancel(id = 0) {
  activeTouches.delete(id);
  await send('Input.dispatchTouchEvent', {
    type: 'touchCancel',
    touchPoints: Array.from(activeTouches.values())
  });
}

async function releaseAllTouches() {
  activeTouches.clear();
  await send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: []
  });
}

async function getElementCenter(selector) {
  return await evaluate(`(() => {
    const el = document.querySelector('${selector}');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height, rect: r };
  })()`);
}

async function tapElement(selector, touchId = 1) {
  const center = await getElementCenter(selector);
  assert.ok(center, `Element ${selector} found for tap`);
  await touchDown(center.x, center.y, touchId);
  await sleep(80);
  await touchUp(touchId);
}

try {
  const target = await until(async () => {
    const res = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
    const list = await res.json();
    return list.find(x => x.type === 'page');
  }, 'Chrome debugging target');

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
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/?debug` });

  await until(() => evaluate("document.querySelector('#loading-veil')?.classList.contains('done')"), 'Menu ready');

  // Configure loadout: Chivalry as Ultimate
  await evaluate(`
    document.querySelector('#player-name').value = 'MobilePilot';
    document.querySelector('#armory-button').click();
  `);
  await until(() => evaluate("Boolean(document.querySelector('#armory-ultimates [data-ultimate=\"chivalry\"]'))"), 'Chivalry armory choice');
  await evaluate("document.querySelector('#armory-ultimates [data-ultimate=\"chivalry\"]').click()");
  await evaluate("document.querySelector('#armory-back').click(); document.querySelector('#solo-button').click();");

  await until(() => evaluate("Boolean(document.querySelector('#practice-mode') && !document.querySelector('#practice-mode').disabled)"), 'Practice entry');
  await evaluate("document.querySelector('#practice-mode').click()");
  await until(() => evaluate("Boolean(window.__ssRuntime?.localAuth && window.__ssRuntime?.playing)"), 'Practice loaded');

  // Spawn Fight-and-Flight
  await evaluate(`
    const sel = document.querySelector('#practice-siege-type');
    sel.value = 'fight-and-flight';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('#practice-build-bibye').click();
  `);

  await until(() => evaluate("Boolean(window.__ssRuntime?.latestSnapshot?.fightFlight)"), 'Fight-and-Flight spawned');

  // Activate touch controls
  await evaluate(`(() => {
    window.__ssRuntime.enableTouch();
    window.__ssRuntime.touch.setActive(true);
    window.__ssRuntime.touch.setGauntletButton(true);
  })()`);

  // Move pilot into mount range
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
    const dist = await evaluate(`(() => {
      const rt = window.__ssRuntime;
      const p = rt.localAuth.position;
      const m = rt.latestSnapshot.fightFlight;
      return Math.hypot(p.x - m.x, p.z - m.z);
    })()`);
    return dist < 2.0;
  }, 'Walking into mount range', 40, 200);

  await evaluate(`(() => {
    const rt = window.__ssRuntime;
    rt.input.movement = rt._origMovement;
    rt.input.enabled = true;
    rt.input.interact();
  })()`);

  await until(() => evaluate("Boolean(window.__ssRuntime?.localAuth?.operatingFightFlightId)"), 'Mounted on Fight-and-Flight', 40, 200);
  await sleep(400);

  // Hide debug/pointer overlays for clean screenshots
  await evaluate(`(() => {
    const po = document.getElementById('practice-overlay');
    if (po) po.style.setProperty('display', 'none', 'important');
    const ph = document.getElementById('pointer-hint');
    if (ph) ph.style.setProperty('display', 'none', 'important');
    const pl = document.getElementById('pointer-lock-overlay');
    if (pl) pl.style.setProperty('display', 'none', 'important');
  })()`);

  // Verify locked layout geometry on default Pixel 7 (915x412)
  const evalLayout = async () => evaluate(`(() => {
    const getRect = sel => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };

    const sword = getRect('.touch-attack');
    const guard = getRect('.touch-guard');
    const jump = getRect('.touch-jump');
    const bolt = getRect('.touch-siegeWeapon');
    const skill = getRect('.touch-siegeSkill');
    const dash = getRect('.touch-dash');
    const ult = getRect('.touch-ultimate');
    const stick = getRect('.touch-stick');
    const rise = getRect('.touch-flightRise');
    const lower = getRect('.touch-flightLower');
    const eject = getRect('.touch-interact');

    const swordLabel = document.querySelector('.touch-attack span')?.textContent;
    const ejectLabel = document.querySelector('.touch-interact span')?.textContent;
    const boltLabel = document.querySelector('.touch-siegeWeapon span')?.textContent;
    const skillLabel = document.querySelector('.touch-siegeSkill span')?.textContent;
    const ultLabel = document.querySelector('.touch-ultimate span')?.textContent;

    return {
      sword, guard, jump, bolt, skill, dash, ult, stick, rise, lower, eject,
      swordLabel, ejectLabel, boltLabel, skillLabel, ultLabel
    };
  })()`);

  const layoutCheck = await evalLayout();
  console.log('Layout evaluation:', JSON.stringify(layoutCheck, null, 2));

  // Assertions for Right-Hand Combat Cluster:
  // 1. Bottom row: Guard on left, Sword on right
  assert.ok(layoutCheck.guard.left < layoutCheck.sword.left, 'Guard is left of Sword on bottom row');
  assert.ok(Math.abs(layoutCheck.guard.bottom - layoutCheck.sword.bottom) < 25, 'Guard and Sword are in bottom row');

  // 2. Second row: Jump directly above Guard, Bolt directly above Sword
  assert.ok(layoutCheck.jump.top < layoutCheck.guard.top, 'Jump is above Guard');
  assert.ok(layoutCheck.bolt.top < layoutCheck.sword.top, 'Bolt is above Sword');
  assert.ok(layoutCheck.jump.left < layoutCheck.bolt.left, 'Jump is left of Bolt');

  // 3. Third row: Fire Away (skill) on left, Dash on right
  assert.ok(layoutCheck.skill.top < layoutCheck.jump.top, 'Fire Away is above Jump');
  assert.ok(layoutCheck.dash.top < layoutCheck.bolt.top, 'Dash is above Bolt');
  assert.ok(layoutCheck.skill.left < layoutCheck.dash.left, 'Fire Away is left of Dash');

  // 4. Above combat cluster: Ultimate
  assert.ok(layoutCheck.ult.top < layoutCheck.dash.top, 'Ultimate is above Dash and combat cluster');

  // 5. Movement cluster: Rise/Lower vertical rocker inward from stick
  assert.ok(layoutCheck.rise.left > layoutCheck.stick.left, 'Rise/Lower is inward (right) of joystick');
  assert.ok(layoutCheck.rise.top < layoutCheck.lower.top, 'Rise is vertically above Lower in rocker');

  // 6. Labels
  assert.equal(layoutCheck.swordLabel, 'SWORD', 'Attack button renamed to SWORD');
  assert.equal(layoutCheck.ejectLabel, 'EJECT', 'Interact button renamed to EJECT');

  console.log('[PASS] All layout geometric and labeling specifications verified!');
  await captureScreenshot('mobile-flight-default-layout.png');

  // Multi-viewport verification: test 800x360, 915x412, and 1024x600 viewports
  const viewports = [
    { width: 915, height: 412, name: 'Pixel 7 landscape' },
    { width: 800, height: 360, name: 'Compact phone landscape' },
    { width: 1024, height: 600, name: 'Tablet landscape' }
  ];

  for (const vp of viewports) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 2,
      mobile: true
    });
    await evaluate("window.__ssRuntime.touch.applyLayout()");
    await sleep(150);

    const vpLayout = await evalLayout();
    for (const [key, rect] of Object.entries(vpLayout)) {
      if (rect && typeof rect === 'object' && 'left' in rect) {
        assert.ok(rect.left >= 0, `${key} left >= 0 in ${vp.name} (${rect.left})`);
        assert.ok(rect.right <= vp.width + 2, `${key} right <= ${vp.width} in ${vp.name} (${rect.right})`);
        assert.ok(rect.top >= 0, `${key} top >= 0 in ${vp.name} (${rect.top})`);
        assert.ok(rect.bottom <= vp.height + 2, `${key} bottom <= ${vp.height} in ${vp.name} (${rect.bottom})`);
      }
    }
    console.log(`[PASS] Viewport ${vp.name} bounds verified (${vp.width}x${vp.height})`);
  }

  // Restore 915x412 default viewport
  await send('Emulation.setDeviceMetricsOverride', {
    width: 915,
    height: 412,
    deviceScaleFactor: 2,
    mobile: true
  });
  await evaluate("window.__ssRuntime.touch.applyLayout()");
  await sleep(150);

  // 1. Legitimate Prowess charging & Takeoff (no state tampering!)
  console.log('Charging personal Prowess via Practice tool...');
  await evaluate("document.querySelector('#practice-ultimate')?.click()");
  await until(() => evaluate("window.__ssRuntime?.localAuth?.prowess >= 100"), 'Prowess ready at 100');

  // Genuine touch on Rise rocker to climb
  console.log('Touching Rise rocker via genuine CDP touch...');
  const riseCenter = await getElementCenter('.touch-flightRise');
  await touchDown(riseCenter.x, riseCenter.y, 15);
  await until(() => evaluate("window.__ssRuntime?.latestSnapshot?.fightFlight?.y > 1.2 && window.__ssRuntime?.latestSnapshot?.fightFlight?.rotorRPM > 0"), 'Climbed into air via touch Rise', 50, 100);
  await touchUp(15);
  await sleep(200);

  const airborneState = await evaluate("window.__ssRuntime?.latestSnapshot?.fightFlight?.grounded === false");
  assert.equal(airborneState, true, 'Machine is airborne');

  // 2. Multi-touch Valkyrie Chord: simultaneous Dash + Ultimate hold
  console.log('Dispatching simultaneous multi-touch Dash + Ultimate chord...');
  const curDashCenter = await getElementCenter('.touch-dash');
  const curUltCenter = await getElementCenter('.touch-ultimate');
  activeTouches.set(21, { x: Math.round(curDashCenter.x), y: Math.round(curDashCenter.y), id: 21 });
  activeTouches.set(22, { x: Math.round(curUltCenter.x), y: Math.round(curUltCenter.y), id: 22 });
  await send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: Array.from(activeTouches.values())
  });

  await sleep(350);
  const prepActive = await evaluate("Boolean(window.__ssRuntime?.latestSnapshot?.fightFlight?.terminalPrep)");
  assert.equal(prepActive, true, 'Terminal prep started by simultaneous multi-touch chord');
  await captureScreenshot('mobile-flight-valkyrie-prep.png');

  // Cancel chord before 1.0s commitment: release touches
  console.log('Cancelling multi-touch chord before commitment...');
  await releaseAllTouches();
  await sleep(200);

  const cancelResult = await evaluate(`(() => {
    const rt = window.__ssRuntime;
    const m = rt.latestSnapshot?.fightFlight;
    return {
      terminalPrep: m?.terminalPrep,
      terminalDive: m?.terminalDive,
      prowess: rt.localAuth?.prowess
    };
  })()`);
  assert.equal(cancelResult.terminalPrep, null, 'Terminal prep cleanly cancelled on touch release');
  assert.equal(cancelResult.terminalDive, null, 'Terminal dive was NOT activated');
  assert.ok(cancelResult.prowess >= 100, 'Prowess was not consumed on chord cancellation');
  console.log('[PASS] Multi-touch Valkyrie prep chord cancelled safely without prowess consumption!');

  // Test touchCancel event (palm rejection / gesture interruption)
  activeTouches.set(23, { x: Math.round(curDashCenter.x), y: Math.round(curDashCenter.y), id: 23 });
  activeTouches.set(24, { x: Math.round(curUltCenter.x), y: Math.round(curUltCenter.y), id: 24 });
  await send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: Array.from(activeTouches.values())
  });
  await sleep(100);
  await send('Input.dispatchTouchEvent', {
    type: 'touchCancel',
    touchPoints: []
  });
  activeTouches.clear();
  await sleep(150);

  const afterCancel = await evaluate(`(() => {
    const rt = window.__ssRuntime;
    return {
      dashHeld: (rt.input.flightDashSources?.size ?? 0) > 0,
      ultHeld: (rt.input.flightUltimateSources?.size ?? 0) > 0
    };
  })()`);
  assert.equal(afterCancel.dashHeld, false, 'touchCancel releases Dash sources');
  assert.equal(afterCancel.ultHeld, false, 'touchCancel releases Ultimate sources');
  console.log('[PASS] touchCancel correctly cleared all held sources!');

  // 3. Test Independent Dash vs Ultimate isolation using genuine CDP touch events
  // Touch Dash alone:
  await touchDown(curDashCenter.x, curDashCenter.y, 11);
  await sleep(100);
  const dashAlone = await evaluate(`(() => {
    const rt = window.__ssRuntime;
    return {
      dashHeld: (rt.input.flightDashSources?.size ?? 0) > 0,
      ultHeld: (rt.input.flightUltimateSources?.size ?? 0) > 0,
      ultPressed: document.querySelector('.touch-ultimate')?.classList.contains('pressed')
    };
  })()`);
  assert.equal(dashAlone.ultHeld, false, 'Touch on Dash alone NEVER synthesizes Ultimate');
  assert.equal(dashAlone.ultPressed, false, 'Touch Ultimate button is not pressed when touching Dash');
  await touchUp(11);
  await sleep(100);

  // Touch Ultimate alone:
  await touchDown(curUltCenter.x, curUltCenter.y, 10);
  await sleep(100);
  const ultAlone = await evaluate(`(() => {
    const rt = window.__ssRuntime;
    return {
      dashHeld: (rt.input.flightDashSources?.size ?? 0) > 0,
      ultHeld: (rt.input.flightUltimateSources?.size ?? 0) > 0,
      dashPressed: document.querySelector('.touch-dash')?.classList.contains('pressed')
    };
  })()`);
  assert.equal(ultAlone.dashHeld, false, 'Touch on Ultimate alone NEVER synthesizes Dash');
  assert.equal(ultAlone.dashPressed, false, 'Touch Dash button is not pressed when touching Ultimate');
  await touchUp(10);
  await sleep(100);

  console.log('[PASS] Dash and Ultimate are completely independent with no auto-synthesis!');

  // 4. Touch Layout Editor verification
  console.log('Testing Touch Layout Editor...');
  await evaluate("window.__ssRuntime.editTouchLayout('flight')");
  await sleep(300);

  const editorCheck = await evaluate(`(() => {
    const tle = document.querySelector('.touch-layout-editor');
    const isVisible = tle && !tle.classList.contains('hidden');
    const modeBtnActive = document.querySelector('.tle-mode-toggles .active')?.dataset?.mode;
    return { isVisible, modeBtnActive };
  })()`);
  assert.equal(editorCheck.isVisible, true, 'Touch layout editor is visible');
  assert.equal(editorCheck.modeBtnActive, 'flight', 'Editor starts in flight mode');

  await captureScreenshot('mobile-flight-touch-editor.png');

  // Drag .touch-siegeWeapon (Bolt) using genuine CDP touch events
  const boltCenter = await getElementCenter('.touch-siegeWeapon');
  assert.ok(boltCenter, 'Bolt button found for dragging');

  await touchDown(boltCenter.x, boltCenter.y, 30);
  await sleep(50);
  await touchMove(boltCenter.x - 40, boltCenter.y - 30, 30);
  await sleep(50);
  await touchMove(boltCenter.x - 70, boltCenter.y - 50, 30);
  await sleep(50);
  await touchUp(30);
  await sleep(100);

  const newBoltCenter = await getElementCenter('.touch-siegeWeapon');
  assert.ok(Math.abs(newBoltCenter.x - boltCenter.x) > 30, 'Bolt button was physically dragged to a new position');

  // Test mode switching in editor
  await tapElement('.tle-btn[data-mode="onFoot"]', 31);
  await sleep(100);
  const onFootPreview = await evaluate("window.__ssRuntime.touch.previewMode");
  assert.equal(onFootPreview, 'onFoot', 'Editor switched to onFoot preview mode');

  await tapElement('.tle-btn[data-mode="flight"]', 32);
  await sleep(100);
  const flightPreview = await evaluate("window.__ssRuntime.touch.previewMode");
  assert.equal(flightPreview, 'flight', 'Editor switched back to flight preview mode');

  // Close editor via Done button
  await tapElement('.tle-btn[data-action="done"]', 33);
  await sleep(200);

  const editorClosedCheck = await evaluate(`(() => {
    const tle = document.querySelector('.touch-layout-editor');
    const isHidden = !tle || tle.classList.contains('hidden');
    const previewMode = window.__ssRuntime?.touch?.previewMode;
    const editingClass = Boolean(document.querySelector('.touch-controls')?.classList.contains('touch-layout-editing'));
    return { isHidden, previewMode, editingClass };
  })()`);
  assert.equal(editorClosedCheck.isHidden, true, 'Editor is hidden after clicking Done');
  assert.equal(editorClosedCheck.previewMode, null, 'previewMode restored to null on close');
  assert.equal(editorClosedCheck.editingClass, false, 'touch-layout-editing class removed on close');

  console.log('[PASS] Touch Layout Editor dragging, preview switching, and close lifecycle verified!');
  console.log('[MOBILE CONTROLS ACCEPTED] All specifications and review requirements satisfied.');

} catch (err) {
  console.error('[ERROR]', err.stack || err);
  process.exitCode = 1;
} finally {
  try { ws?.close(); } catch {}
  try { chrome.kill('SIGTERM'); } catch {}
  try { server.kill('SIGTERM'); } catch {}
  await sleep(600);
}
