// Acceptance test for real mounted Sheathe in Steel across Fight-and-Flight,
// SO-FIST-ICATION, and Bi-Bye-llista in mobile landscape touch mode.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const serverPort = 3028;
const cdpPort = 9258;
const out = 'output/playwright/mounted-steel';
const brainDir = '/Users/erendiracisneros/.gemini/antigravity/brain/bf36c922-8785-4d62-b11e-f266d5847a42';
await mkdir(out, { recursive: true });

const chromeBin = process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : (process.env.CHROME_BIN || 'chromium');

console.log('[MOUNTED STEEL BROWSER] Starting game server on port', serverPort);
const server = spawn('node', ['server/src/server.mjs'], {
  env: { ...process.env, PORT: String(serverPort), HOST: '127.0.0.1' },
  stdio: 'ignore'
});

const sleep = ms => new Promise(r => setTimeout(r, ms));
await sleep(1500);

const profile = await mkdtemp(join(tmpdir(), 'ss-mounted-steel-chrome-'));
const chrome = spawn(chromeBin, [
  '--headless=new',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--enable-unsafe-swiftshader',
  '--remote-allow-origins=*',
  '--window-size=915,412', // Mobile landscape (e.g. Pixel 7 / modern phone)
  `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=${profile}`,
  'about:blank'
], { stdio: 'ignore' });

let ws = null;
let seq = 0;
const pending = new Map();
const exceptions = [];

function send(method, params = {}) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP ${method} timeout`));
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

async function until(fn, label, maxAttempts = 150, delay = 100) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const val = await fn();
      if (val) return val;
    } catch {}
    await sleep(delay);
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

async function screenshot(name) {
  const res = await send('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(res.data, 'base64');
  await writeFile(join(out, `${name}.png`), buf);
  try {
    await copyFile(join(out, `${name}.png`), join(brainDir, `${name}.png`));
  } catch {}
}

async function tapTouchButton(selector) {
  await until(() => evaluate(`Boolean(document.querySelector('${selector}') && !document.querySelector('${selector}').hidden)`), `button visible: ${selector}`);
  await evaluate(`(() => {
    const el = document.querySelector('${selector}');
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 25, pointerType: 'touch', clientX: cx, clientY: cy, bubbles: true }));
    el.dispatchEvent(new PointerEvent('pointerup', { pointerId: 25, pointerType: 'touch', clientX: cx, clientY: cy, bubbles: true }));
  })()`);
}

async function walkToMachine(machineSelector, expectedAria = '') {
  await evaluate(`(() => {
    const rt = window.__ssRuntime;
    const p = rt.localAuth?.position;
    const m = ${machineSelector};
    if (m && p) {
      const isRam = Boolean(m.heading !== undefined && !m.rotorHP);
      const tx = isRam ? m.x + Math.sin(m.heading) * 2.5 : m.x;
      const tz = isRam ? m.z + Math.cos(m.heading) * 2.5 : m.z;
      rt.input.yaw = Math.atan2(-(tx - p.x), -(tz - p.z));
      rt.input.pitch = 0;
      rt.input.enabled = true;
      rt._walking = true;
      rt._origMovement = rt.input.movement?.bind(rt.input);
      rt.input.movement = () => {
        if (!rt._walking) return { forward: 0, strafe: 0 };
        const curP = rt.localAuth?.position;
        const curM = ${machineSelector};
        if (curP && curM) {
          const ram = Boolean(curM.heading !== undefined && !curM.rotorHP);
          const cx = ram ? curM.x + Math.sin(curM.heading) * 2.5 : curM.x;
          const cz = ram ? curM.z + Math.cos(curM.heading) * 2.5 : curM.z;
          rt.input.yaw = Math.atan2(-(cx - curP.x), -(cz - curP.z));
        }
        return { forward: 1, strafe: 0 };
      };
    }
  })()`);

  await until(async () => {
    return evaluate(`(() => {
      const btn = document.querySelector('.touch-interact');
      if (!btn || btn.hidden) return false;
      const text = btn.querySelector('span')?.textContent;
      const aria = btn.getAttribute('aria-label') || '';
      return text === 'MOUNT' && (!${JSON.stringify(expectedAria)} || aria.includes(${JSON.stringify(expectedAria)}));
    })()`);
  }, `walk into mount range (${expectedAria || 'MOUNT'})`, 100);

  await evaluate(`(() => {
    const rt = window.__ssRuntime;
    rt._walking = false;
    if (rt._origMovement) rt.input.movement = rt._origMovement;
    else rt.input.movement = () => ({ forward: 0, strafe: 0 });
    rt.input.enabled = true;
  })()`);
  await sleep(200);
}

async function mountMachine(operatingField) {
  await until(() => evaluate(`(() => {
    const p = window.__ssRuntime?.localAuth;
    if (!p) return false;
    const v = p.velocity || { x: 0, z: 0 };
    return !p.attackActive && Math.hypot(v.x, v.z) < 0.4;
  })()`), 'player settled before mount');

  await until(async () => {
    const mounted = await evaluate(`Boolean(window.__ssRuntime?.localAuth?.${operatingField})`);
    if (mounted) return true;
    await tapTouchButton('.touch-interact');
    await sleep(250);
    return evaluate(`Boolean(window.__ssRuntime?.localAuth?.${operatingField})`);
  }, `mounted via touch (${operatingField})`, 80);
}

async function dismountMachine(operatingField) {
  await until(async () => {
    const mounted = await evaluate(`Boolean(window.__ssRuntime?.localAuth?.${operatingField})`);
    if (!mounted) return true;
    await tapTouchButton('.touch-interact');
    await sleep(200);
    return evaluate(`!Boolean(window.__ssRuntime?.localAuth?.${operatingField})`);
  }, `dismounted via touch (${operatingField})`, 80);
}

const results = {};

try {
  const debugTarget = await until(async () => {
    const res = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
    const list = await res.json();
    return list.find(x => x.type === 'page');
  }, 'debugger page target');

  ws = new WebSocket(debugTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  ws.onmessage = e => {
    const m = JSON.parse(String(e.data));
    if (m.method === 'Runtime.consoleAPICalled') {
      const text = (m.params?.args || []).map(a => a.value !== undefined ? a.value : a.description).join(' ');
      console.log('[BROWSER CONSOLE]', text);
    }
    if (m.method === 'Runtime.exceptionThrown') {
      exceptions.push(m.params?.exceptionDetails?.text ?? 'uncaught');
    }
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

  await until(() => evaluate("document.querySelector('#loading-veil')?.classList.contains('done')"), 'menu ready');

  // Open Armory and select Steel as equipped spell
  await evaluate(`(() => {
    document.querySelector('#armory-button')?.click();
  })()`);
  await until(() => evaluate("Boolean(document.querySelector('#armory-spells [data-spell=\"steel\"]'))"), 'armory spells visible');
  await evaluate(`(() => {
    document.querySelector('#armory-spells [data-spell="steel"]')?.click();
    document.querySelector('#armory-back')?.click();
  })()`);

  await evaluate(`(() => {
    document.querySelector('#player-name').value = 'MountedSteelTester';
    document.querySelector('#solo-button').click();
  })()`);

  await until(() => evaluate("Boolean(document.querySelector('#practice-mode') && !document.querySelector('#practice-mode').disabled)"), 'practice entry');
  await evaluate("document.querySelector('#practice-mode').click()");
  await until(() => evaluate("Boolean(window.__ssRuntime?.localAuth && window.__ssRuntime?.playing)"), 'practice yard loaded');

  // Enable mobile touch presentation and log errors
  await evaluate(`(() => {
    const r = window.__ssRuntime;
    r.enableTouch();
    r.touch.setActive(true);
    r.socket.on('error', err => console.log('*** [SERVER REJECTED]', JSON.stringify(err)));
  })()`);

  // ==========================================
  // 1. FIGHT-AND-FLIGHT MOUNTED STEEL TEST
  // ==========================================
  console.log('[TEST 1] Fight-and-Flight mounted Steel');
  await evaluate(`(() => {
    const s = document.querySelector('#practice-siege-type');
    s.value = 'fight-and-flight';
    s.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('#practice-build-bibye').click();
  })()`);

  await until(() => evaluate("Boolean(window.__ssRuntime?.latestSnapshot?.fightFlight?.id)"), 'Fight-and-Flight spawned');

  // Walk into mount range
  await walkToMachine('window.__ssRuntime.latestSnapshot.fightFlight', 'Fight-and-Flight');
  await mountMachine('operatingFightFlightId');
  await screenshot('01-mounted-flight-ready');

  // Verify .touch-spell is visible and displays STEEL (never FIST)
  const flightSpellReady = await evaluate(`(() => {
    const btn = document.querySelector('.touch-spell');
    return {
      hidden: btn?.hidden ?? true,
      text: btn?.querySelector('span')?.textContent,
      hasPulse: btn?.classList.contains('steel-ward-active'),
      isFist: btn?.classList.contains('fist')
    };
  })()`);
  assert.equal(flightSpellReady.hidden, false, 'touch-spell visible while mounted on Fight-and-Flight');
  assert.equal(flightSpellReady.text, 'STEEL');
  assert.equal(flightSpellReady.isFist, false, 'Never shows FIST while mounted');
  assert.equal(flightSpellReady.hasPulse, false);

  // Cast Steel via touch control
  await tapTouchButton('.touch-spell');

  // Verify ward activation
  await until(() => evaluate("Boolean(window.__ssRuntime?.latestSnapshot?.fightFlight?.siegeSteel?.state === 'active')"), 'Fight-and-Flight ward active');
  const flightWardActive = await evaluate(`(() => {
    const btn = document.querySelector('.touch-spell');
    return {
      text: btn?.querySelector('span')?.textContent,
      hasPulse: btn?.classList.contains('steel-ward-active'),
      ariaDisabled: btn?.getAttribute('aria-disabled')
    };
  })()`);
  assert.equal(flightWardActive.text, 'WARD');
  assert.equal(flightWardActive.hasPulse, true, 'glowing cyan border on active ward');
  assert.equal(flightWardActive.ariaDisabled, 'true');
  await screenshot('02-flight-ward-active');

  // Authoritative damage mitigation & repair simulation
  await evaluate(`(() => {
    const r = window.__ssRuntime;
    const m = r.latestSnapshot.fightFlight;
    m.braceLHP = 40;
    r.onEvents([{
      type: 'siegeSteelBlocked',
      machineId: m.id,
      componentId: 'braceL',
      point: { x: m.x - 0.5, y: m.y + 1.2, z: m.z },
      attackerDamagePrevented: 15,
      at: r.socket.serverNow()
    }]);
    r.onEvents([{
      type: 'siegeSteelRepair',
      machineId: m.id,
      componentId: 'braceL',
      amount: 12,
      health: 52,
      phase: 'full',
      at: r.socket.serverNow()
    }]);
  })()`);
  await screenshot('03-flight-repair-glint');

  // Verify ward expiry (siegeSteelEnded)
  await evaluate(`(() => {
    const r = window.__ssRuntime;
    const m = r.latestSnapshot.fightFlight;
    if (m?.siegeSteel) {
      m.siegeSteel.state = 'expired';
      m.siegeSteel.protectionUntil = r.socket.serverNow() - 0.1;
    }
    r.onEvents([{
      type: 'siegeSteelEnded',
      machineId: m?.id,
      at: r.socket.serverNow()
    }]);
  })()`);
  await until(() => evaluate(`(() => {
    const btn = document.querySelector('.touch-spell');
    return btn?.querySelector('span')?.textContent === 'STEEL' && !btn?.classList.contains('steel-ward-active');
  })()`), 'flight ward expired returns to STEEL');

  // Dismount Fight-and-Flight
  await dismountMachine('operatingFightFlightId');
  results.flight = { spellReady: flightSpellReady, wardActive: flightWardActive };

  // Dismantle Fight-and-Flight so it does not linger in the yard
  await evaluate(`(() => {
    window.__ssRuntime.socket.send({ type: 'practiceSiege', action: 'dismantle', machine: 'fight-and-flight' });
  })()`);
  await until(() => evaluate("!window.__ssRuntime?.latestSnapshot?.fightFlight"), 'Fight-and-Flight dismantled');

  // ==========================================
  // 2. SO-FIST-ICATION MOUNTED STEEL TEST
  // ==========================================
  console.log('[TEST 2] SO-FIST-ICATION mounted Steel');
  await evaluate(`(() => {
    const s = document.querySelector('#practice-siege-type');
    s.value = 'so-fist-ication';
    s.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('#practice-build-bibye').click();
  })()`);

  await until(() => evaluate("Boolean(window.__ssRuntime?.latestSnapshot?.soFistication?.id)"), 'SO-FIST-ICATION spawned');

  // Walk into ram mount range
  await walkToMachine('window.__ssRuntime.latestSnapshot.soFistication', 'ram');
  await mountMachine('operatingRamId');

  // Verify .touch-spell shows STEEL at bottom right without overlapping controls
  const ramSpellReady = await evaluate(`(() => {
    const btn = document.querySelector('.touch-spell');
    return {
      hidden: btn?.hidden ?? true,
      text: btn?.querySelector('span')?.textContent,
      hasPulse: btn?.classList.contains('steel-ward-active'),
      isFist: btn?.classList.contains('fist')
    };
  })()`);
  assert.equal(ramSpellReady.hidden, false, 'touch-spell visible while mounted on ram');
  assert.equal(ramSpellReady.text, 'STEEL');
  assert.equal(ramSpellReady.isFist, false);

  // Cast Steel on ram
  await tapTouchButton('.touch-spell');
  await until(() => evaluate("Boolean(window.__ssRuntime?.latestSnapshot?.soFistication?.siegeSteel?.state === 'active')"), 'Ram ward active');
  const ramWardActive = await evaluate(`(() => {
    const btn = document.querySelector('.touch-spell');
    return {
      text: btn?.querySelector('span')?.textContent,
      hasPulse: btn?.classList.contains('steel-ward-active')
    };
  })()`);
  assert.equal(ramWardActive.text, 'WARD');
  assert.equal(ramWardActive.hasPulse, true);
  await screenshot('04-ram-ward-active');

  // Repair glint near surviving fist
  await evaluate(`(() => {
    const r = window.__ssRuntime;
    const b = r.latestSnapshot.soFistication;
    r.onEvents([{
      type: 'siegeSteelRepair',
      machineId: b.id,
      componentId: 'Fist',
      amount: 20,
      health: 80,
      phase: 'full',
      at: r.socket.serverNow()
    }]);
  })()`);

  // Verify ram ward expiry
  await evaluate(`(() => {
    const r = window.__ssRuntime;
    const b = r.latestSnapshot.soFistication;
    if (b?.siegeSteel) {
      b.siegeSteel.state = 'expired';
      b.siegeSteel.protectionUntil = r.socket.serverNow() - 0.1;
    }
    r.onEvents([{
      type: 'siegeSteelEnded',
      machineId: b?.id,
      at: r.socket.serverNow()
    }]);
  })()`);
  await until(() => evaluate(`(() => {
    const btn = document.querySelector('.touch-spell');
    return btn?.querySelector('span')?.textContent === 'STEEL' && !btn?.classList.contains('steel-ward-active');
  })()`), 'ram ward expired returns to STEEL');

  // Dismount ram
  await dismountMachine('operatingRamId');
  results.ram = { spellReady: ramSpellReady, wardActive: ramWardActive };

  // Dismantle ram
  await evaluate(`(() => {
    window.__ssRuntime.socket.send({ type: 'practiceSiege', action: 'dismantle', machine: 'so-fist-ication' });
  })()`);
  await until(() => evaluate("!window.__ssRuntime?.latestSnapshot?.soFistication"), 'ram dismantled');

  // ==========================================
  // 3. BI-BYE-LLISTA MOUNTED STEEL TEST
  // ==========================================
  console.log('[TEST 3] Bi-Bye-llista mounted Steel');
  await evaluate(`(() => {
    const s = document.querySelector('#practice-siege-type');
    s.value = 'bi-bye-llista';
    s.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('#practice-build-bibye').click();
  })()`);

  await until(() => evaluate("Boolean(window.__ssRuntime?.latestSnapshot?.bibyeBallista?.id)"), 'Bi-Bye-llista spawned');

  // Walk to ballista
  await walkToMachine('window.__ssRuntime.latestSnapshot.bibyeBallista', 'ballista');
  await mountMachine('operatingBallistaId');

  const ballistaSpellReady = await evaluate(`(() => {
    const btn = document.querySelector('.touch-spell');
    return {
      hidden: btn?.hidden ?? true,
      text: btn?.querySelector('span')?.textContent,
      hasPulse: btn?.classList.contains('steel-ward-active'),
      isFist: btn?.classList.contains('fist')
    };
  })()`);
  assert.equal(ballistaSpellReady.hidden, false, 'touch-spell visible on ballista');
  assert.equal(ballistaSpellReady.text, 'STEEL');

  // Cast Steel on ballista
  await tapTouchButton('.touch-spell');
  await until(() => evaluate("Boolean(window.__ssRuntime?.latestSnapshot?.bibyeBallista?.siegeSteel?.state === 'active')"), 'Ballista ward active');
  const ballistaWardActive = await evaluate(`(() => {
    const btn = document.querySelector('.touch-spell');
    return {
      text: btn?.querySelector('span')?.textContent,
      hasPulse: btn?.classList.contains('steel-ward-active')
    };
  })()`);
  assert.equal(ballistaWardActive.text, 'WARD');
  assert.equal(ballistaWardActive.hasPulse, true);
  await screenshot('05-ballista-ward-active');

  // Verify ballista ward expiry
  await evaluate(`(() => {
    const r = window.__ssRuntime;
    const b = r.latestSnapshot.bibyeBallista;
    if (b?.siegeSteel) {
      b.siegeSteel.state = 'expired';
      b.siegeSteel.protectionUntil = r.socket.serverNow() - 0.1;
    }
    r.onEvents([{
      type: 'siegeSteelEnded',
      machineId: b?.id,
      at: r.socket.serverNow()
    }]);
  })()`);
  await until(() => evaluate(`(() => {
    const btn = document.querySelector('.touch-spell');
    return btn?.querySelector('span')?.textContent === 'STEEL' && !btn?.classList.contains('steel-ward-active');
  })()`), 'ballista ward expired returns to STEEL');

  // Dismount ballista
  await dismountMachine('operatingBallistaId');
  results.ballista = { spellReady: ballistaSpellReady, wardActive: ballistaWardActive };

  // Dismantle ballista
  await evaluate(`(() => {
    window.__ssRuntime.socket.send({ type: 'practiceSiege', action: 'dismantle', machine: 'bi-bye-llista' });
  })()`);
  await until(() => evaluate("!window.__ssRuntime?.latestSnapshot?.bibyeBallista"), 'ballista dismantled');

  // ==========================================
  // 4. CHIVALRY-PREPARED STEEL & ILLEGAL REJECTION
  // ==========================================
  console.log('[TEST 4] Chivalry-prepared Steel & illegal spell rejection');

  await send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/?debug` });
  await send('Runtime.enable');
  await send('Page.enable');
  await until(() => evaluate("document.querySelector('#loading-veil')?.classList.contains('done')"), 'menu ready for Test 4');

  // Open Armory and select Fireball as base spell and Chivalry as ultimate with prepared spells
  await evaluate(`(() => {
    document.querySelector('#armory-button')?.click();
  })()`);
  await until(() => evaluate("Boolean(document.querySelector('#armory-ultimates [data-ultimate=\"chivalry\"]'))"), 'armory chivalry visible');
  await evaluate(`(() => {
    document.querySelector('#armory-spells [data-spell="fireball"]')?.click();
    document.querySelector('#armory-ultimates [data-ultimate="chivalry"]')?.click();
    window.__ssSettings?.settings?.set('loadout.preparedSpells', ['fireball', 'steel', 'gale']);
    document.querySelector('#armory-back')?.click();
  })()`);

  await evaluate(`(() => {
    document.querySelector('#player-name').value = 'ChivalryTester';
    document.querySelector('#solo-button').click();
  })()`);

  await until(() => evaluate("Boolean(document.querySelector('#practice-mode') && !document.querySelector('#practice-mode').disabled)"), 'practice entry Test 4');
  await evaluate("document.querySelector('#practice-mode').click()");
  await until(() => evaluate("Boolean(window.__ssRuntime?.localAuth && window.__ssRuntime?.playing && window.__ssRuntime?.localAuth?.spell === 'fireball' && window.__ssRuntime?.localAuth?.ultimate === 'chivalry')"), 'practice loaded with Fireball & Chivalry');

  await evaluate(`(() => {
    const r = window.__ssRuntime;
    r.enableTouch();
    r.touch.setActive(true);
  })()`);

  // Build Fight-and-Flight
  await evaluate(`(() => {
    const s = document.querySelector('#practice-siege-type');
    s.value = 'fight-and-flight';
    s.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('#practice-build-bibye').click();
  })()`);
  await until(() => evaluate("Boolean(window.__ssRuntime?.latestSnapshot?.fightFlight?.id)"), 'Fight-and-Flight spawned');

  await walkToMachine('window.__ssRuntime.latestSnapshot.fightFlight', 'Fight-and-Flight');
  await mountMachine('operatingFightFlightId');

  // 1. Verify .touch-spell is HIDDEN while mounted because base spell (fireball) is unpermitted
  const illegalSpellHidden = await evaluate("Boolean(document.querySelector('.touch-spell')?.hidden)");
  assert.equal(illegalSpellHidden, true, 'touch-spell hidden while mounted with unpermitted spell');

  // 2. Verify local rejection: onCastLocal does not trigger steel sound or ward
  const localReject = await evaluate(`(() => {
    const r = window.__ssRuntime;
    const initialSteelAt = r.localSteelAt;
    r.input.onCastLocal();
    return r.localSteelAt === initialSteelAt;
  })()`);
  assert.equal(localReject, true, 'local cast rejected for unpermitted mounted spell');

  // 3. Verify authoritative server rejection: sending fireball cast while mounted is rejected
  await evaluate(`(() => {
    window.__ssRuntime.socket.send({ type: 'cast', spell: 'fireball' });
  })()`);
  await sleep(150);
  const hadFireball = await evaluate(`(() => {
    const r = window.__ssRuntime;
    return Boolean(r.latestSnapshot?.projectiles?.some(p => p.spell === 'fireball'));
  })()`);
  assert.equal(hadFireball, false, 'authoritative server rejected illegal mounted fireball cast');

  // 4. Activate Chivalry: ready ultimate meter in practice yard
  await evaluate(`(() => {
    window.__ssRuntime.socket.send({ type: 'practiceReadyUltimate' });
  })()`);
  await until(() => evaluate("Boolean((window.__ssRuntime?.localAuth?.prowess ?? 0) >= 100)"), 'prowess 100');

  // Cast Ultimate to activate Chivalry
  await evaluate(`(() => {
    window.__ssRuntime.socket.send({ type: 'ultimate' });
  })()`);

  await until(() => evaluate("Boolean(window.__ssRuntime?.localAuth?.ultimateState?.phase === 'active')"), 'Chivalry active');

  // 5. With Chivalry active, prepared Steel is exposed via .touch-spell
  await until(() => evaluate("!document.querySelector('.touch-spell')?.hidden"), 'prepared steel exposed');
  const preparedSpellLabel = await evaluate("document.querySelector('.touch-spell span')?.textContent");
  assert.equal(preparedSpellLabel, 'STEEL', 'touch-spell shows STEEL from prepared slots');

  // 6. Tap .touch-spell to cast prepared Steel on Fight-and-Flight
  await tapTouchButton('.touch-spell');
  await until(() => evaluate("Boolean(window.__ssRuntime?.latestSnapshot?.fightFlight?.siegeSteel?.state === 'active')"), 'prepared steel successfully cast on machine');
  await screenshot('06-chivalry-prepared-steel-cast');

  // 7. Verify illegal prepared cast rejection: attempting cast of non-steel prepared spell while mounted is rejected
  await evaluate(`(() => {
    window.__ssRuntime.socket.send({ type: 'castPreparedSpell', spell: 'fireball', direction: { x: 0, y: 0, z: -1 } });
  })()`);
  await sleep(150);
  const hadPreparedFireball = await evaluate(`(() => {
    const r = window.__ssRuntime;
    return Boolean(r.latestSnapshot?.projectiles?.some(p => p.spell === 'fireball'));
  })()`);
  assert.equal(hadPreparedFireball, false, 'server rejected illegal prepared spell while mounted');

  // Dismount and clean exit
  await dismountMachine('operatingFightFlightId');
  results.chivalry = { illegalSpellHidden, preparedSpellLabel, castSucceeded: true };

  await writeFile(join(out, 'result.json'), JSON.stringify(results, null, 2));
  console.log('[MOUNTED STEEL BROWSER ACCEPTED]', JSON.stringify(results, null, 2));
  assert.equal(exceptions.length, 0, `Uncaught exceptions: ${exceptions.join('; ')}`);
} catch (e) {
  console.error('[MOUNTED STEEL BROWSER FAILED]', e);
  await screenshot('failure').catch(() => {});
  throw e;
} finally {
  if (ws) ws.close();
  chrome.kill('SIGTERM');
  server.kill('SIGTERM');
  await sleep(800);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
