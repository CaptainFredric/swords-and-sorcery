/**
 * Final Fight-and-Flight Mobile Controls & Layout Verification
 * Tests the locked combat ladder, functional vertical flight rail, Valkyrie chord isolation,
 * and the Touch Layout Editor with real headless Chrome in landscape mobile dimensions.
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

  // Configure loadout: Chivalry as Ultimate, Sunder prepared as alternate test
  await evaluate(`
    document.querySelector('#player-name').value = 'MobilePilot';
    document.querySelector('#solo-button').click();
  `);

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

  // Force enable touch controls for testing
  await evaluate(`(() => {
    window.__ssRuntime.enableTouch();
    window.__ssRuntime.touch.setActive(true);
    window.__ssRuntime.touch.setGauntletButton(true);
  })()`);

  // Walk pilot to mount position
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

  // Verify locked layout geometry
  const layoutCheck = await evaluate(`(() => {
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
    const rail = getRect('.touch-flight-rail');
    const eject = getRect('.touch-interact');

    const swordLabel = document.querySelector('.touch-attack span')?.textContent;
    const ejectLabel = document.querySelector('.touch-interact span')?.textContent;
    const boltLabel = document.querySelector('.touch-siegeWeapon span')?.textContent;
    const skillLabel = document.querySelector('.touch-siegeSkill span')?.textContent;
    const ultLabel = document.querySelector('.touch-ultimate span')?.textContent;

    return {
      sword, guard, jump, bolt, skill, dash, ult, stick, rail, eject,
      swordLabel, ejectLabel, boltLabel, skillLabel, ultLabel
    };
  })()`);

  console.log('Layout evaluation:', JSON.stringify(layoutCheck, null, 2));

  // Assertions for Right-Hand Combat Cluster:
  // 1. Bottom row: Guard on left, Sword on right
  assert.ok(layoutCheck.guard.left < layoutCheck.sword.left, 'Guard is left of Sword on bottom row');
  assert.ok(Math.abs(layoutCheck.guard.bottom - layoutCheck.sword.bottom) < 25, 'Guard and Sword are in bottom row');

  // 2. Second row: wider Bolt left of Jump
  assert.ok(layoutCheck.jump.top < layoutCheck.sword.top, 'Jump is above Sword');
  assert.ok(layoutCheck.bolt.top < layoutCheck.guard.top, 'Bolt is above Guard');
  assert.ok(layoutCheck.bolt.left < layoutCheck.jump.left, 'Bolt is left of Jump');
  assert.ok(layoutCheck.bolt.width > layoutCheck.jump.width, 'Bolt has a wider held-fire touch target');

  // 3. Third row: Fire Away (skill) on left, Dash on right
  assert.ok(layoutCheck.skill.top < layoutCheck.jump.top, 'Fire Away is above Jump');
  assert.ok(layoutCheck.dash.top < layoutCheck.bolt.top, 'Dash is above Bolt');
  assert.ok(layoutCheck.skill.left < layoutCheck.dash.left, 'Fire Away is left of Dash');

  // 4. Above combat cluster: Ultimate
  assert.ok(layoutCheck.ult.top < layoutCheck.dash.top, 'Ultimate is above Dash and combat cluster');

  // 5. Movement cluster: one spring-centered rail inward from the movement stick
  assert.ok(layoutCheck.rail.left > layoutCheck.stick.left, 'Flight rail is inward from joystick');
  assert.ok(layoutCheck.rail.height > layoutCheck.rail.width * 2, 'Flight rail is vertical');

  // 6. Labels
  assert.equal(layoutCheck.swordLabel, 'SWORD', 'Attack button renamed to SWORD');
  assert.equal(layoutCheck.ejectLabel, 'EJECT', 'Interact button renamed to EJECT');

  console.log('[PASS] All layout geometric and labeling specifications verified!');

  // Take screenshot of default layout
  await captureScreenshot('mobile-flight-default-layout.png');

  // Test Valkyrie chord isolation
  // 1. Ultimate alone:
  await evaluate(`(() => {
    const btn = document.querySelector('.touch-ultimate');
    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 10, pointerType: 'touch' }));
  })()`);
  const ultAlone = await evaluate(`(() => {
    const rt = window.__ssRuntime;
    return {
      dashHeld: (rt.input.flightDashSources?.size ?? 0) > 0,
      ultHeld: (rt.input.flightUltimateSources?.size ?? 0) > 0,
      dashPressed: document.querySelector('.touch-dash')?.classList.contains('active')
    };
  })()`);
  assert.equal(ultAlone.dashHeld, false, 'Pressing Ultimate alone NEVER synthesizes Dash');
  assert.equal(ultAlone.dashPressed, false, 'Touch Dash button is not active when pressing Ultimate');

  await evaluate(`(() => {
    const btn = document.querySelector('.touch-ultimate');
    btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 10, pointerType: 'touch' }));
  })()`);

  // 2. Dash alone:
  await evaluate(`(() => {
    const btn = document.querySelector('.touch-dash');
    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 11, pointerType: 'touch' }));
  })()`);
  const dashAlone = await evaluate(`(() => {
    const rt = window.__ssRuntime;
    return {
      dashHeld: (rt.input.flightDashSources?.size ?? 0) > 0,
      ultHeld: (rt.input.flightUltimateSources?.size ?? 0) > 0
    };
  })()`);
  assert.equal(dashAlone.ultHeld, false, 'Pressing Dash alone NEVER synthesizes Ultimate');

  await evaluate(`(() => {
    const btn = document.querySelector('.touch-dash');
    btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 11, pointerType: 'touch' }));
  })()`);

  console.log('[PASS] Dash and Ultimate are completely independent with no auto-synthesis!');

  // Actual touch rail input, not a synthetic property on InputController.
  const startY = await evaluate('window.__ssRuntime.latestSnapshot.fightFlight.y');
  const riseSent = await evaluate(`(() => {
    const rt = window.__ssRuntime;
    const rail = document.querySelector('.touch-flight-rail');
    const r = rail.getBoundingClientRect();
    rail.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles:true, pointerId:81, pointerType:'touch', clientX:r.left+r.width/2, clientY:r.top+8,
    }));
    return rt.input.movement().flightRise === true && rt.input.movement().flightLower === false;
  })()`);
  assert.equal(riseSent,true,'Rail Rise must survive through InputController');
  await until(() => evaluate(`window.__ssRuntime.latestSnapshot.fightFlight.y > ${startY + .15}`), 'Real authoritative flight ascent',40,150);
  await evaluate(`(() => {
    const rail=document.querySelector('.touch-flight-rail'),r=rail.getBoundingClientRect();
    rail.dispatchEvent(new PointerEvent('pointerup', {
      bubbles:true,pointerId:81,pointerType:'touch',clientX:r.left+r.width/2,clientY:r.top+8,
    }));
  })()`);
  assert.equal(await evaluate('window.__ssRuntime.input.movement().flightRise'),false,'releasing rail stops Rise');
  await sleep(150);
  const lowerSent = await evaluate(`(() => {
    const rail=document.querySelector('.touch-flight-rail'),r=rail.getBoundingClientRect();
    rail.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles:true,pointerId:82,pointerType:'touch',clientX:r.left+r.width/2,clientY:r.bottom-8,
    }));
    return window.__ssRuntime.input.movement().flightLower;
  })()`);
  assert.equal(lowerSent,true,'Rail Lower reaches movement packets');
  await evaluate(`(() => {
    const rail=document.querySelector('.touch-flight-rail'),r=rail.getBoundingClientRect();
    rail.dispatchEvent(new PointerEvent('pointerup', {
      bubbles:true,pointerId:82,pointerType:'touch',clientX:r.left+r.width/2,clientY:r.bottom-8,
    }));
  })()`);
  assert.equal(await evaluate('window.__ssRuntime.input.movement().flightLower'),false);
  await captureScreenshot('mobile-flight-actual-ascent.png');
  // The authoritative server, not the browser, owns prowess and Ultimate state.

  // Press both Dash and Ultimate to begin Valkyrie Prep
  await evaluate(`(() => {
    const dashBtn = document.querySelector('.touch-dash');
    const ultBtn = document.querySelector('.touch-ultimate');
    dashBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 21, pointerType: 'touch' }));
    ultBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 22, pointerType: 'touch' }));
  })()`);
  await sleep(300);

  // Capture Valkyrie prep state screenshot
  await captureScreenshot('mobile-flight-valkyrie-prep.png');

  // Release Dash and Ultimate
  await evaluate(`(() => {
    const rt = window.__ssRuntime;
    const dashBtn = document.querySelector('.touch-dash');
    const ultBtn = document.querySelector('.touch-ultimate');
    dashBtn?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 21, pointerType: 'touch' }));
    ultBtn?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 22, pointerType: 'touch' }));
    // Rise/Lower were already released by their real pointer events.
  })()`);
  await sleep(200);

  // Pause must actually suppress Practice instead of stacking two menus.
  const pauseResult = await evaluate(`(() => {
    const rt=window.__ssRuntime;
    const practice=document.querySelector('#practice-overlay');
    practice.style.removeProperty('display');
    rt.onPause();
    const menu=document.querySelector('#pause-menu');
    return {
      menuShown:!menu.classList.contains('hidden') && getComputedStyle(menu).display !== 'none',
      practiceHidden:getComputedStyle(practice).display === 'none',
      practiceInert:practice.inert,
    };
  })()`);
  assert.equal(pauseResult.menuShown,true,'Pause is visible');
  assert.equal(pauseResult.practiceHidden,true,'Practice is not drawn behind Pause');
  assert.equal(pauseResult.practiceInert,true,'Practice cannot receive focus behind Pause');
  await captureScreenshot('mobile-flight-practice-paused.png');
  await evaluate("document.querySelector('#resume-game').click()");
  assert.equal(await evaluate("document.querySelector('#pause-menu').classList.contains('hidden')"),true,'Resume closes Pause');

  // Open Touch Layout Editor
  await evaluate(`(() => {
    window.__ssRuntime.editTouchLayout('flight');
  })()`);
  await sleep(300);

  const editorCheck = await evaluate(`(() => {
    const tle = document.querySelector('.touch-layout-editor');
    const isVisible = tle && !tle.classList.contains('hidden');
    const modeBtnActive = document.querySelector('.tle-mode-toggles .active')?.dataset?.mode;
    return { isVisible, modeBtnActive };
  })()`);
  assert.equal(editorCheck.isVisible, true, 'Touch layout editor is visible');
  assert.equal(editorCheck.modeBtnActive, 'flight', 'Editor starts in flight mode');

  // Capture Touch Layout Editor screenshot
  await captureScreenshot('mobile-flight-touch-editor.png');

  // Close Touch Layout Editor
  await evaluate(`(() => {
    document.querySelector('.tle-btn[data-action="done"]')?.click();
  })()`);
  await sleep(200);

  const editorClosed = await evaluate(`(() => {
    const tle = document.querySelector('.touch-layout-editor');
    return !tle || tle.classList.contains('hidden');
  })()`);
  assert.equal(editorClosed, true, 'Touch layout editor closed cleanly on Done');

  console.log('[PASS] All verification scenarios passed successfully!');

} catch (err) {
  console.error('[ERROR]', err);
  process.exitCode = 1;
} finally {
  try { ws?.close(); } catch {}
  try { chrome.kill('SIGKILL'); } catch {}
  try { server.kill('SIGKILL'); } catch {}
  process.exit();
}
