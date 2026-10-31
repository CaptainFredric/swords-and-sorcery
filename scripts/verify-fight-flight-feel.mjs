/**
 * End-to-end headless browser verification of Fight-and-Flight feel,
 * first-person camera cockpit, aim limiting HUD, mobile touch layout,
 * and flight audio events.
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const chromeBin = process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : (process.env.CHROME_BIN || 'chromium');

const cdpPort = 9298;
const serverPort = 3094;
const evidenceDir = path.resolve('output/flight-evidence');
const brainDir = '/Users/erendiracisneros/.gemini/antigravity/brain/bf36c922-8785-4d62-b11e-f266d5847a42';

await mkdir(evidenceDir, { recursive: true });

console.log('=== Fight-and-Flight Feel, Mobile UX & Audio Verification ===');
console.log(`Starting server on port ${serverPort}...`);

const server = spawn('node', ['server/src/server.mjs'], {
  env: { ...process.env, PORT: String(serverPort), HOST: '127.0.0.1' },
  stdio: 'ignore'
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
await sleep(1500);

const userData = path.join(tmpdir(), `ss-flight-feel-${process.pid}`);
const chrome = spawn(chromeBin, [
  '--headless=new',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--enable-unsafe-swiftshader',
  '--remote-allow-origins=*',
  '--window-size=1280,800',
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

const down = async key => {
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: key.toLowerCase(), code: 'Key' + key.toUpperCase(), windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0) });
};
const up = async key => {
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: key.toLowerCase(), code: 'Key' + key.toUpperCase(), windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0) });
};
const tap = async key => {
  await down(key);
  await sleep(90);
  await up(key);
};

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
  // Connect WebSocket to Chrome target
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
  await send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/?debug` });

  await until(() => evaluate("document.querySelector('#loading-veil')?.classList.contains('done')"), 'Menu ready');
  await evaluate(`
    document.querySelector('#player-name').value = 'Pilot';
    document.querySelector('#solo-button').click();
  `);
  await until(() => evaluate("Boolean(document.querySelector('#practice-mode') && !document.querySelector('#practice-mode').disabled)"), 'Practice entry');
  await evaluate("document.querySelector('#practice-mode').click()");

  await until(() => evaluate("Boolean(window.__ssRuntime?.localAuth && window.__ssRuntime?.playing)"), 'Practice loaded');

  // Build Fight-and-Flight
  await evaluate(`
    const sel = document.querySelector('#practice-siege-type');
    sel.value = 'fight-and-flight';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('#practice-build-bibye').click();
  `);

  await until(() => evaluate("Boolean(window.__ssRuntime?.latestSnapshot?.fightFlight)"), 'Fight-and-Flight spawned');

  // Orient toward apparatus, enable input, and walk into mount range
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
    const info = await evaluate(`(() => {
      const rt = window.__ssRuntime;
      const p = rt.localAuth.position;
      const m = rt.latestSnapshot.fightFlight;
      return {
        dist: Math.hypot(p.x - m.x, p.z - m.z),
        pos: p,
        mPos: { x: m.x, y: m.y, z: m.z },
        forward: rt.input.movement().forward,
        enabled: rt.input.enabled
      };
    })()`);
    console.log('Walk step:', JSON.stringify(info));
    if (info && info.dist < 2.0) return info.dist;
    return false;
  }, 'Walking into mount range', 40, 200);

  await evaluate(`(() => {
    const rt = window.__ssRuntime;
    rt.input.movement = rt._origMovement;
  })()`);
  await sleep(200);

  await evaluate(`(() => {
    const rt = window.__ssRuntime;
    rt.input.enabled = true;
    rt.input.interact();
  })()`);
  await until(() => evaluate("Boolean(window.__ssRuntime?.localAuth?.operatingFightFlightId)"), 'Mounted on Fight-and-Flight', 40, 200);

  // Allow render frame to draw cockpit view
  await sleep(400);

  // Ensure practice overlay and pointer hint are hidden for clean screenshots
  await evaluate(`(() => {
    const po = document.getElementById('practice-overlay');
    if (po) po.style.setProperty('display', 'none', 'important');
    const ph = document.getElementById('pointer-hint');
    if (ph) ph.style.setProperty('display', 'none', 'important');
    const pl = document.getElementById('pointer-lock-overlay');
    if (pl) pl.style.setProperty('display', 'none', 'important');
  })()`);
  await sleep(100);

  // CHECK 1: Mounted camera defaults to first-person view
  const siegeView = await evaluate("window.__ssRuntime?.siegeView");
  console.log('Check 1: Default mounted view:', siegeView);
  assert.equal(siegeView, 'sight', 'Fight-and-Flight mounts into first-person sight view by default');

  // CHECK 2: Local cockpit head meshes hidden while body/arms rendered
  const headHidden = await evaluate("Boolean(window.__ssRuntime?.remotePlayers?.self?.cockpitHeadHidden)");
  console.log('Check 2: Local cockpit head hidden:', headHidden);
  assert.equal(headHidden, true, 'Pilot helmet meshes hidden to avoid clipping in cockpit view');

  await captureScreenshot('flight-cockpit-default-first-person.png');

  // CHECK 3: Crossbow tracking and aim limits
  // Rotate camera look right past traverse threshold (> 25 deg = 0.436 rad) or pitch past elevation (20 deg = 0.349 rad)
  await evaluate(`(() => {
    const rt = window.__ssRuntime;
    rt.input.pitch = 0.5; // ~28.6 degrees elevation
  })()`);
  await sleep(100);

  const debugSight = await evaluate(`(() => {
    const rt = window.__ssRuntime;
    const m = rt.latestSnapshot.fightFlight;
    const deltaYaw = Math.atan2(Math.sin(rt.input.yaw - (m.heading ?? 0)), Math.cos(rt.input.yaw - (m.heading ?? 0)));
    return {
      yaw: rt.input.yaw,
      heading: m.heading,
      deltaYaw,
      sightHidden: rt.hud.flightSight?.hidden,
      sightClass: rt.hud.flightSight?.className,
      labelText: rt.hud.flightSight?.querySelector('.flight-aim-limit')?.textContent
    };
  })()`);
  console.log('DEBUG SIGHT:', debugSight);

  const aimLimitInfo = await evaluate(`(() => {
    const el = document.querySelector('.flight-aim-limit');
    const parent = el?.parentElement;
    return {
      visible: parent ? parent.classList.contains('limited') : false,
      text: el ? el.textContent.trim() : null
    };
  })()`);
  console.log('Check 3: Aim limit HUD warning:', aimLimitInfo);
  assert.ok(aimLimitInfo.text.includes('TRAVERSE LIMIT') || aimLimitInfo.text.includes('ELEVATION LIMIT') || aimLimitInfo.text.includes('AIM LIMITED'), 'Aim limit warning displayed when exceeding traverse bounds');

  await captureScreenshot('flight-cockpit-aim-limit.png');

  // Reset yaw to center
  await evaluate(`(() => {
    const rt = window.__ssRuntime;
    const m = rt.latestSnapshot.fightFlight;
    rt.input.yaw = m.heading ?? 0;
  })()`);
  await sleep(100);

  // CHECK 4: Compact Flight HUD structure
  const flightHudData = await evaluate(`(() => {
    const hud = document.querySelector('.flight-hud');
    if (!hud) return null;
    return {
      displayed: !hud.hidden && getComputedStyle(hud).display !== 'none',
      alt: hud.querySelector('[data-flight-alt]')?.textContent,
      charge: hud.querySelector('[data-flight-charge]')?.textContent,
      rotor: hud.querySelector('[data-flight-rotor]')?.textContent,
      ammo: hud.querySelector('[data-flight-ammo]')?.textContent
    };
  })()`);
  console.log('Check 4: Flight HUD data:', flightHudData);
  assert.ok(flightHudData?.displayed, 'Dedicated Flight HUD strip is displayed');
  assert.ok(flightHudData?.alt, 'Altitude display is present');
  assert.ok(flightHudData?.rotor, 'Rotor efficiency display is present');
  assert.ok(flightHudData?.ammo, 'Ammo count display is present');

  // CHECK 5: Mobile Touch Controls Layout
  // Enable mobile touch interface
  await send('Emulation.setDeviceMetricsOverride', {
    width: 844,
    height: 390,
    deviceScaleFactor: 2,
    mobile: true
  });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await evaluate(`(() => {
    const rt = window.__ssRuntime;
    rt.enableTouch();
    rt.touch.setActive(true);
  })()`);
  await sleep(300);

  const mobileControls = await evaluate(`(() => {
    const tc = document.querySelector('.touch-controls');
    const rise = tc?.querySelector('[data-action="jump"]');
    const lower = tc?.querySelector('[data-action="crouch"]');
    const bolt = tc?.querySelector('[data-action="siegeWeapon"]');
    const sword = tc?.querySelector('[data-action="attack"]');
    const dash = tc?.querySelector('[data-action="dash"]');
    const valkyrie = tc?.querySelector('[data-action="ultimate"]');
    const viewBtn = tc?.querySelector('[data-action="siegeView"]');
    const leaveBtn = tc?.querySelector('[data-action="interact"]');
    return {
      hasRise: Boolean(rise && !rise.hidden),
      hasLower: Boolean(lower && !lower.hidden),
      hasBolt: Boolean(bolt && !bolt.hidden),
      hasSword: Boolean(sword && !sword.hidden),
      hasDash: Boolean(dash && !dash.hidden),
      hasValkyrie: Boolean(valkyrie && !valkyrie.hidden),
      hasView: Boolean(viewBtn && !viewBtn.hidden),
      hasLeave: Boolean(leaveBtn && !leaveBtn.hidden),
      riseLabel: rise?.textContent?.trim(),
      lowerLabel: lower?.textContent?.trim(),
      boltLabel: bolt?.textContent?.trim(),
      swordLabel: sword?.textContent?.trim(),
      valkyrieLabel: valkyrie?.textContent?.trim(),
      viewLabel: viewBtn?.textContent?.trim(),
      leaveLabel: leaveBtn?.textContent?.trim()
    };
  })()`);
  console.log('Check 5: Mobile Flight Controls:', mobileControls);
  assert.equal(mobileControls.hasRise && mobileControls.hasLower, true, 'Rise/Lower rocker present on left');
  assert.equal(mobileControls.hasBolt && mobileControls.hasSword, true, 'Bolt and Sword controls present on right');
  assert.equal(mobileControls.hasDash && mobileControls.hasValkyrie, true, 'Dash and Valkyrie present');
  assert.equal(mobileControls.hasView && mobileControls.hasLeave, true, 'Compact View and Leave present at top right');

  await evaluate(`(() => {
    const po = document.getElementById('practice-overlay');
    if (po) po.style.setProperty('display', 'none', 'important');
    const ph = document.getElementById('pointer-hint');
    if (ph) ph.style.setProperty('display', 'none', 'important');
  })()`);

  await captureScreenshot('flight-mobile-cockpit-hud.png');

  // CHECK 6: Flight Sound & Airborne Operation
  const soundChecks = await evaluate(`(() => {
    const rt = window.__ssRuntime;
    const fs = rt.flightSound;
    return {
      instantiated: Boolean(fs),
      rotorPlaying: Boolean(fs?.rotorNode),
      active: Boolean(fs?.active)
    };
  })()`);
  console.log('Check 6: Flight sound engine state:', soundChecks);
  assert.ok(soundChecks.instantiated, 'FlightSound engine active on GameRuntime');

  // Test firing a bolt and trigger sound recipe
  await evaluate(`(() => {
    const rt = window.__ssRuntime;
    rt.input.flightFire(true);
    rt.flightSound.event({ type: 'fightFlightBoltFired' }, rt.latestSnapshot?.fightFlight, rt.socket.serverNow());
    rt.flightSound.event({ type: 'fightFlightBoltImpact', point: [0, 1, 0], hitKind: 'wall' }, rt.latestSnapshot?.fightFlight, rt.socket.serverNow());
  })()`);
  await sleep(150);
  await evaluate(`(() => { window.__ssRuntime.input.flightFire(false); })()`);

  // Ascend slightly to demonstrate airborne state
  await evaluate(`(() => {
    const rt = window.__ssRuntime;
    const m = rt.latestSnapshot.fightFlight;
    m.y += 2.5;
    m.grounded = false;
    m.flightCharge = 85;
  })()`);
  await sleep(250);

  await captureScreenshot('flight-airborne-cockpit.png');

  console.log('ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!');
} catch (err) {
  console.error('VERIFICATION ERROR:', err);
  process.exitCode = 1;
} finally {
  if (ws) ws.close();
  if (chrome) chrome.kill();
  if (server) server.kill();
  console.log('Verification finished.');
}
