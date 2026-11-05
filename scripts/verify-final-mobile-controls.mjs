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
const browserErrors = [];
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
    if (m.method === 'Runtime.exceptionThrown') browserErrors.push(m.params?.exceptionDetails?.exception?.description ?? m.params?.exceptionDetails?.text ?? 'uncaught exception');
    if (m.method === 'Inspector.targetCrashed') browserErrors.push('Chrome renderer target crashed');
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

  // Actual mobile terminal acceptance needs the canonical equipment selected
  // BEFORE mounting (the server locks the equipped Skill to the operator).
  await evaluate("document.querySelector('#player-name').value='MobilePilot';document.querySelector('#armory-button').click()");
  await until(()=>evaluate("Boolean(document.querySelector('#armory-ultimates [data-ultimate=\"chivalry\"]') && document.querySelector('[data-siege-machine=\"fightFlight\"][data-siege-skill=\"doNotStopMyAscension\"]'))"),'Ascension and Chivalry armory options');
  await evaluate("document.querySelector('#armory-ultimates [data-ultimate=\"chivalry\"]').click();document.querySelector('[data-siege-machine=\"fightFlight\"][data-siege-skill=\"doNotStopMyAscension\"]').click();document.querySelector('#armory-back').click();document.querySelector('#solo-button').click()");

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

  // 2. The wider Bolt now reaches left over the top edge of Guard.
  assert.ok(layoutCheck.bolt.top < layoutCheck.sword.top,'Bolt is above Sword');
  assert.ok(Math.abs(layoutCheck.bolt.right-layoutCheck.sword.right)<8 &&
    layoutCheck.bolt.left<layoutCheck.sword.left,
    'Bolt shares the right edge of Sword and grows left toward Guard');
  assert.ok(layoutCheck.bolt.width>layoutCheck.sword.width+18,
    'Bolt extends further left than Sword, into the space above Guard');
  assert.ok(layoutCheck.bolt.left<layoutCheck.guard.right &&
    layoutCheck.bolt.right>layoutCheck.guard.left,
    'the wider Bolt horizontally reaches over Guard');
  assert.ok(layoutCheck.bolt.bottom<=layoutCheck.sword.top+3,'Bolt/Sword touch targets do not overlap');

  // 3. Jump immediately over Bolt, Dash left in Fire Away former position.
  assert.ok(Math.abs(layoutCheck.jump.right-layoutCheck.bolt.right)<35,
    'Jump is vertically reachable from Bolt in a single upward swipe');
  assert.ok(layoutCheck.jump.bottom<=layoutCheck.bolt.top+3,'Jump/Bolt do not overlap');
  assert.ok(layoutCheck.dash.left<layoutCheck.jump.left,'Dash is to the left of Jump');
  assert.ok(Math.abs(layoutCheck.dash.top-layoutCheck.jump.top)<12,'Dash/Jump share a row');

  // 4. Fire Away is adjacent to Ultimate in the high row.
  assert.ok(layoutCheck.skill.left<layoutCheck.ult.left,'Fire Away is beside Ultimate');
  assert.ok(Math.abs(layoutCheck.skill.top-layoutCheck.ult.top)<12,'Skill/Ultimate share a row');
  assert.ok(layoutCheck.skill.bottom<=layoutCheck.dash.top+3,'Skill/Dash do not overlap');

  // 5. Movement cluster: one spring-centered rail inward from the movement stick
  assert.ok(layoutCheck.rail.left > layoutCheck.stick.left, 'Flight rail is inward from joystick');
  assert.ok(layoutCheck.rail.height > layoutCheck.rail.width * 2, 'Flight rail is vertical');

  // 6. Labels
  assert.equal(layoutCheck.swordLabel, 'SWORD', 'Attack button renamed to SWORD');
  assert.equal(layoutCheck.ejectLabel, 'EJECT', 'Interact button renamed to EJECT');

  console.log('[PASS] All layout geometric and labeling specifications verified!');

  // Take screenshot of default layout
  await captureScreenshot('mobile-flight-default-layout.png');

  // Physical swipe semantics: drag one captured firing pointer upward into
  // Jump. The repeater remains held and a real server-side ground Hop occurs.
  const startHopY=await evaluate('window.__ssRuntime.latestSnapshot.fightFlight.y');
  const swipeState=await evaluate(`(() => {
    const rt=window.__ssRuntime,bolt=document.querySelector('.touch-siegeWeapon'),
      jump=document.querySelector('.touch-jump'),br=bolt.getBoundingClientRect(),
      jr=jump.getBoundingClientRect();
    bolt.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:91,
      pointerType:'touch',clientX:br.left+br.width/2,clientY:br.top+br.height/2}));
    bolt.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:91,
      pointerType:'touch',clientX:jr.left+jr.width/2,clientY:jr.top+jr.height/2}));
    return {firing:rt.input.flightFireSources.size>0,
      jumpPressed:jump.classList.contains('pressed')};
  })()`);
  assert.ok(swipeState.firing,'Bolt must remain held during the Jump slide');
  assert.ok(swipeState.jumpPressed,'Jump must activate from one Bolt-held pointer');
  await until(()=>evaluate(`window.__ssRuntime.latestSnapshot.fightFlight.y>${startHopY+.12}`),
    'real ground Hop produced by Bolt-to-Jump swipe',70,120);
  await captureScreenshot('mobile-flight-bolt-swipe-hop.png');
  await evaluate(`(() => {
    const bolt=document.querySelector('.touch-siegeWeapon'),jump=document.querySelector('.touch-jump'),
      jr=jump.getBoundingClientRect();
    bolt.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:91,
      pointerType:'touch',clientX:jr.left+jr.width/2,clientY:jr.top+jr.height/2}));
  })()`);
  assert.equal(await evaluate('window.__ssRuntime.input.flightFireSources.size'),0,
    'releasing the swiping thumb must finally release Bolt');

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

  // An active combat finger must be released before workshop mode. This
  // reproduces opening Settings with Bolt still firing, not a fake state edit.
  const pendingFire=await evaluate(`(() => {
    const rt=window.__ssRuntime,bolt=rt.touch.buttons.siegeWeapon,
      rect=bolt.getBoundingClientRect();
    rt.touch.setActive(true);rt.input.enabled=true;
    bolt.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:240,
      pointerType:'touch',clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2}));
    return {owned:rt.touch.held.has(240),firing:rt.input.flightFireSources.size};
  })()`);
  assert.equal(pendingFire.owned,true,'real Bolt finger is owned before edit mode');
  assert.ok(pendingFire.firing>0,'repeater is actually firing before workshop opens');

  // Open Touch Layout Editor. The controller AND pointer ownership reset.
  await evaluate(`window.__ssRuntime.editTouchLayout('flight')`);
  await sleep(300);
  const editorSafety=await evaluate(`(() => {
    const rt=window.__ssRuntime,bolt=rt.touch.buttons.siegeWeapon,
      rect=bolt.getBoundingClientRect();
    bolt.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:241,
      pointerType:'touch',clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2}));
    return {held:rt.touch.held.size,fire:rt.input.flightFireSources.size,
      stick:!!rt.touch.stick,active:rt.touchLayoutEditor.active};
  })()`);
  assert.deepEqual(editorSafety,{held:0,fire:0,stick:false,active:true},
    'editing a control cannot carry old fire or create a new held gameplay action');

  const editorCheck = await evaluate(`(() => {
    const tle = document.querySelector('.touch-layout-editor');
    const isVisible = tle && !tle.classList.contains('hidden');
    const modeBtnActive = document.querySelector('.tle-mode-toggles .active')?.dataset?.mode;
    return { isVisible, modeBtnActive };
  })()`);
  assert.equal(editorCheck.isVisible, true, 'Touch layout editor is visible');
  assert.equal(editorCheck.modeBtnActive, 'flight', 'Editor starts in flight mode');

  // A real control-preview interaction: select, resize and drag a joystick,
  // then edit an independent Ballista Skill placement. The edits must persist
  // per page without moving the live flight controls into the Ballista layout.
  const editorResize = await evaluate(`(() => {
    const rt=window.__ssRuntime,editor=rt.touchLayoutEditor,stick=rt.touch.stickBase,
      rect=stick.getBoundingClientRect();
    stick.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:210,
      pointerType:'touch',clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2}));
    window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:210,pointerType:'touch'}));
    const slider=document.querySelector('.tle-controls [data-action="size"]');
    slider.value='148';slider.dispatchEvent(new Event('input',{bubbles:true}));
    return {size:editor.layouts.flight.stick.size,width:stick.getBoundingClientRect().width};
  })()`);
  assert.equal(editorResize.size,148,'joystick size slider changes saved size');
  assert.ok(Math.abs(editorResize.width-148)<5,'joystick actually grows on screen, not just in storage');
  const pageCheck=await evaluate(`(() => {
    const editor=window.__ssRuntime.touchLayoutEditor;
    document.querySelector('[data-mode="ballista"]').click();
    const skill=window.__ssRuntime.touch.buttons.siegeSkill;
    const rect=skill.getBoundingClientRect();
    skill.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:211,
      pointerType:'touch',clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2}));
    window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:211,pointerType:'touch'}));
    const slider=document.querySelector('.tle-controls [data-action="size"]');
    slider.value='74';slider.dispatchEvent(new Event('input',{bubbles:true}));
    return {mode:editor.mode,skill:editor.layouts.ballista.siegeSkill.size,
      flightStick:editor.layouts.flight.stick.size,ramPage:!!editor.layouts.ram};
  })()`);
  assert.deepEqual(pageCheck,{mode:'ballista',skill:74,flightStick:148,ramPage:true});
  await captureScreenshot('mobile-ballista-layout-editor.png');
  await evaluate("document.querySelector('[data-mode=ram]').click()");
  assert.equal(await evaluate("window.__ssRuntime.touchLayoutEditor.mode"),'ram');
  await captureScreenshot('mobile-ram-layout-editor.png');
  await evaluate("document.querySelector('[data-mode=flight]').click()");
  // The independent Ballista edit must not alter a visible flight action.
  assert.ok(await evaluate("window.__ssRuntime.touchLayoutEditor.layouts.flight.siegeSkill.size!==74"));

  // The stencil has its OWN workshop hit-target, saved position and size;
  // moving it does not change any ordinary mounted action placement.
  const stencilEditor=await evaluate(`(() => {
    const rt=window.__ssRuntime,editor=rt.touchLayoutEditor;
    const before=editor.layouts.flight.jump.right;
    const surface=rt.touch.valkyrieStencil;
    const grip=surface.querySelector('.touch-valkyrie-grip');
    const rect=grip.getBoundingClientRect();
    const x=rect.left+rect.width/2,y=rect.top+rect.height/2;
    grip.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,
      pointerId:256,pointerType:'touch',clientX:x,clientY:y}));
    window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,cancelable:true,
      pointerId:256,pointerType:'touch',clientX:x-30,clientY:y-12}));
    window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,
      pointerId:256,pointerType:'touch',clientX:x-30,clientY:y-12}));
    const slider=document.querySelector('.tle-controls [data-action="size"]');
    slider.value='220';slider.dispatchEvent(new Event('input',{bubbles:true}));
    return {selected:editor.selectedAction,
      size:editor.layouts.flight.valkyrieStencil.size,
      moved:editor.layouts.flight.valkyrieStencil.right!==14,
      jumpUnchanged:editor.layouts.flight.jump.right===before,
      visible:!surface.hidden,width:surface.getBoundingClientRect().width};
  })()`);
  assert.equal(stencilEditor.selected,'valkyrieStencil','the stencil can be individually grabbed');
  assert.equal(stencilEditor.size,220,'the stencil scales independently from the buttons');
  assert.ok(stencilEditor.moved,'stencil can be dragged without moving ordinary controls');
  assert.ok(stencilEditor.jumpUnchanged,'custom rune placement cannot alter Jump');
  assert.ok(stencilEditor.visible&&stencilEditor.width>180,
    'the new stencil is visible and has the true resized touch area');

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

  // Unlike a superficial two-button state check, this drives REAL mobile
  // PointerEvents into the ordinary mounted input controller and then awaits
  // authoritative simulation. It runs last: the irreversible Dive destroys
  // its own rotor, so it cannot be followed by control-layout assertions.
  await evaluate(`(() => {
    const rt=window.__ssRuntime;
    rt.touch.setActive(true);rt.input.enabled=true;
    window.__mobileValkyrieTrace=[];
    window.__mobileValkyrieErrors=[];
    window.addEventListener('error',e=>window.__mobileValkyrieErrors.push('error: '+(e.message??'unknown')));
    window.addEventListener('unhandledrejection',e=>window.__mobileValkyrieErrors.push('rejection: '+String(e.reason)));
    for(const canvas of document.querySelectorAll('canvas')){
      canvas.addEventListener('webglcontextlost',()=>window.__mobileValkyrieErrors.push('WebGL context lost'));
    }
    let frames=0;
    const sample=()=>{
      const m=rt.latestSnapshot?.fightFlight,p=rt.localAuth;
      if(m?.terminalPrep||m?.terminalDive||m?.offensiveRun){
        const t={prep:m.terminalPrep?.phase??null,spent:Boolean(m.terminalDiveSpent),
          dive:Boolean(m.terminalDive),resolved:Boolean(m.terminalDive?.resolved),
          prowess:p?.prowess,skill:m.skill?.id,mode:m.mode,rotor:m.rotorHP};
        const last=window.__mobileValkyrieTrace.at(-1);
        if(!last||Object.keys(t).some(k=>t[k]!==last[k]))window.__mobileValkyrieTrace.push(t);
      }
      if(++frames<3000)requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  })()`);

  // The rail's real Rise touch lifts us far enough to survive a one-second
  // held chord, even on the software-rendered GPU used in CI.
  await evaluate(`(() => {
    const rail=document.querySelector('.touch-flight-rail'),r=rail.getBoundingClientRect();
    rail.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:271,
      pointerType:'touch',clientX:r.left+r.width/2,clientY:r.top+8}));
  })()`);
  await until(()=>evaluate("Boolean(window.__ssRuntime?.latestSnapshot?.fightFlight?.y>4)"),'powered ascent before real mobile Valkyrie',200,150);
  await evaluate(`(() => {
    const rail=document.querySelector('.touch-flight-rail'),r=rail.getBoundingClientRect();
    rail.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:271,
      pointerType:'touch',clientX:r.left+r.width/2,clientY:r.top+8}));
  })()`);
  // Activate the equipped machine Skill through its actual right-thumb button.
  await evaluate(`(() => {
    const b=document.querySelector('.touch-siegeSkill'),r=b.getBoundingClientRect();
    for(const type of ['pointerdown','pointerup'])b.dispatchEvent(new PointerEvent(type,
      {bubbles:true,pointerId:272,pointerType:'touch',clientX:r.left+r.width/2,clientY:r.top+r.height/2}));
  })()`);
  await until(()=>evaluate("(() => {const s=window.__ssRuntime?.latestSnapshot?.fightFlight?.skill;return s?.id==='doNotStopMyAscension'&&s.phase==='active';})()"),'activated authoritative Ascension from mobile Skill',120,150);
  await evaluate("document.querySelector('#practice-ultimate').click()");
  await until(()=>evaluate("(() => {const p=window.__ssRuntime?.localAuth;return p?.ultimate==='chivalry'&&p.prowess>=100;})()"),'full unspent Chivalry ready on mobile',120,150);
  const beforeDive=await evaluate("(() => {const r=window.__ssRuntime,m=r.latestSnapshot.fightFlight;return {y:m.y,skill:m.skill.id,charge:m.flightCharge,rotor:m.rotorHP,spent:Boolean(m.terminalDiveSpent),prowess:r.localAuth.prowess};})()");
  assert.ok(beforeDive.y>2&&beforeDive.charge>0&&beforeDive.rotor>0);

  await until(()=>evaluate("(() => {const rt=window.__ssRuntime;return rt.touch.valkyrieEligible && !rt.touch.valkyrieStencil.hidden;})()"),
    'stencil appears only while real terminal input is eligible',100,150);
  // The actual pointer originates from the same physical position, but the
  // buttons are deliberately hidden before tracing: all eight checkpoints
  // belong to the independent stencil, not to the button targets.
  const drawn=await evaluate(`(() => {
    const rt=window.__ssRuntime,touch=rt.touch;
    // Practice tools temporarily suspend touch while interacting with the
    // toolbox. Restore actual arena focus before attempting a real trace.
    touch.setActive(true);rt.input.enabled=true;
    const stencil=touch.valkyrieStencil,r=stencil.getBoundingClientRect();
    const points=[[201,127],[201,45],[112,143],[92,47],
      [201,127],[169,15],[102,8],[39,30]];
    const pt=p=>({x:r.left+p[0]/240*r.width,y:r.top+p[1]/240*r.height});
    const event=(kind,p)=>{
      const v=pt(p);
      touch.layer.dispatchEvent(new PointerEvent(kind,{
        bubbles:true,cancelable:true,pointerId:273,pointerType:'touch',
        clientX:v.x,clientY:v.y}));
    };
    for(const key of ['jump','dash','ultimate'])touch.buttons[key].hidden=true;
    const beforeSources={dash:rt.input.flightDashSources.size,
      ultimate:rt.input.flightUltimateSources.size};
    event('pointerdown',points[0]);
    const stages=[];
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i];
      for(const t of [.3,.65,1]){
        event('pointermove',[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);
      }
      stages.push({checkpoint:i,index:touch.ritual?.index,
        progress:touch.ritual?.index==null?null:
          (touch.ritual.index+touch.ritual.segmentProgress)/7});
    }
    const complete=touch.ritual?.completed??false;
    event('pointerup',points.at(-1));
    return {beforeSources,stages,complete,active:touch.active,angle:rt.screenTurn?.angle,held:touch.held.size,
      afterSources:{dash:rt.input.flightDashSources.size,
        ultimate:rt.input.flightUltimateSources.size}};
  })()`);
  if(!drawn.complete)console.log('[MOBILE RITUAL TRACE DIAGNOSTIC]',JSON.stringify({
    ...drawn,stencilReady:await evaluate("window.__ssRuntime.touch.valkyrieEligible")
  }));
  assert.ok(drawn.complete,'full Dagaz and halo trace must complete on the real touch layer');
  assert.equal(drawn.stages.at(-1).index,7,'final halo checkpoint reached');
  assert.ok(drawn.stages[3].progress>.4&&drawn.stages[6].progress>=1,
    'the rune becomes progressively brighter through the final halo');
  assert.deepEqual(drawn.beforeSources,{dash:0,ultimate:0},
    'stencil does not require a simulated held Dash or Ultimate');
  assert.deepEqual(drawn.afterSources,{dash:0,ultimate:0},
    'ritual never presses underlying buttons, including hidden ones');
  await captureScreenshot('mobile-flight-valkyrie-stencil-complete.png');
  await until(()=>evaluate("window.__mobileValkyrieTrace?.some(s=>s.dive&&s.spent)"),'mobile terminal dive committed once',150,150);
  await until(()=>evaluate("window.__ssRuntime?.latestSnapshot?.fightFlight?.terminalDive?.resolved===true"),'mobile terminal impact resolved',150,150);
  const mobileValkyrie=await evaluate("({before:window.__mobileValkyrieTrace[0],trace:window.__mobileValkyrieTrace,errors:window.__mobileValkyrieErrors,final:{mode:window.__ssRuntime.latestSnapshot.fightFlight.mode,spent:window.__ssRuntime.latestSnapshot.fightFlight.terminalDiveSpent}})");

  assert.equal(beforeDive.spent,false,'precommit stencil cannot consume Chivalry');
  assert.equal(beforeDive.prowess,100,'the authorized ritual begins with full Chivalry');
  assert.equal(mobileValkyrie.final.spent,true);
  assert.equal(mobileValkyrie.final.mode,'DESTROYED');
  assert.deepEqual(mobileValkyrie.errors,[],'no JS errors or WebGL context loss');
  assert.deepEqual(browserErrors,[],'no Chrome unhandled exception or renderer crash');
  await writeFile(path.join(evidenceDir,'mobile-valkyrie-terminal.json'),JSON.stringify(mobileValkyrie,null,2));
  await captureScreenshot('mobile-flight-valkyrie-terminal-aftermath.png');
  console.log('[PASS] Full real mobile Dagaz stencil, terminal impact and clean browser state');
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
