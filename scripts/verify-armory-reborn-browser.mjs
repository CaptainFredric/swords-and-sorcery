import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGameServer } from '../server/src/server.mjs';

const PORT = 3009;
const CDP_PORT = 9249;
const OUT_DIR = 'output/armory-reborn';
await mkdir(OUT_DIR, { recursive: true });

const chromeBin = process.env.CHROME_BIN || (
  process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : 'chromium'
);

const server = createGameServer({ port: PORT, host: '127.0.0.1' });
await server.start();
console.log(`[VERIFY] Game server running at http://127.0.0.1:${PORT}`);

const profileDir = await mkdtemp(join(tmpdir(), 'ss-armory-chrome-'));
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
    if (data.method === 'Runtime.consoleAPICalled') {
      const msg = data.params?.args?.map((a) => a.value ?? a.description ?? '').join(' ');
      if (data.params.type === 'error') console.error('[BROWSER CONSOLE ERROR]', msg);
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

  console.log('[VERIFY] Navigating to Armory...');
  await evaluate("document.querySelector('#armory-button').click()");
  await until(() => evaluate("!document.querySelector('#armory-menu').classList.contains('hidden')"), 'armory screen visible');
  await sleep(700);

  // ----------------------------------------------------
  // JOURNEY A: Default presentation & Equip Sorcery
  // ----------------------------------------------------
  console.log('[VERIFY] --- JOURNEY A: Centered Kit & Sorcery Selection ---');
  const kitState = await evaluate(`(() => {
    const heading = document.querySelector('#armory-heading')?.textContent;
    const kitVisible = !document.querySelector('#armory-kit')?.classList.contains('hidden');
    const technique = document.querySelector('#plaque-name-technique')?.textContent;
    const sorcery = document.querySelector('#plaque-name-sorcery')?.textContent;
    const masterstroke = document.querySelector('#plaque-name-masterstroke')?.textContent;
    const heraldry = document.querySelector('#plaque-name-heraldry')?.textContent;
    const summary = document.querySelector('#armory-status-summary')?.textContent;
    const inspectorClosed = document.querySelector('#armory-inspector')?.classList.contains('closed');
    return { heading, kitVisible, technique, sorcery, masterstroke, heraldry, summary, inspectorClosed };
  })()`);

  assert.match(kitState.heading, /THE SPELLBLADE'S KIT/);
  assert.equal(kitState.kitVisible, true);
  assert.equal(kitState.technique, 'Castleward longsword');
  assert.equal(kitState.inspectorClosed, true);
  console.log('[VERIFY] Default Kit State verified:', kitState);

  await screenshot('01-armory-default-kit.png');

  // Open Sorcery Inspector
  console.log('[VERIFY] Opening Sorcery Inspector...');
  await evaluate("document.querySelector('#armory-slot-sorcery').click()");
  await sleep(600);

  const sorceryInspectorOpen = await evaluate(`(() => {
    const closed = document.querySelector('#armory-inspector')?.classList.contains('closed');
    const title = document.querySelector('#inspector-title')?.textContent;
    const spellsCount = document.querySelectorAll('#armory-spells [data-spell]').length;
    return { closed, title, spellsCount };
  })()`);
  assert.equal(sorceryInspectorOpen.closed, false);
  assert.match(sorceryInspectorOpen.title, /CHOOSE SPELL OR WARD/);
  assert.ok(sorceryInspectorOpen.spellsCount >= 4);

  // Highlight Gale Garner
  console.log('[VERIFY] Highlighting Gale Garner...');
  await evaluate("document.querySelector('[data-spell=\"gale\"]').click()");
  await sleep(400);

  const galeCardState = await evaluate(`(() => {
    const name = document.querySelector('#inspector-card-name')?.textContent;
    const desc = document.querySelector('#inspector-card-desc')?.textContent;
    const facts = document.querySelector('#inspector-card-facts')?.textContent;
    const equipText = document.querySelector('#armory-equip-btn')?.textContent;
    return { name, desc, facts, equipText };
  })()`);
  assert.match(galeCardState.name, /GALE GARNER/i);
  assert.ok(galeCardState.desc.length > 5);
  console.log('[VERIFY] Gale detail verified:', galeCardState);

  await screenshot('02-sorcery-inspector-open.png');

  // Equip Gale Garner
  console.log('[VERIFY] Equipping Gale Garner...');
  await evaluate("document.querySelector('#armory-equip-btn').click()");
  await sleep(400);

  const afterEquip = await evaluate(`(() => {
    const sorceryPlaque = document.querySelector('#plaque-name-sorcery')?.textContent;
    const summary = document.querySelector('#armory-status-summary')?.textContent;
    const cardStatus = document.querySelector('#inspector-card-status')?.textContent;
    return { sorceryPlaque, summary, cardStatus };
  })()`);
  assert.match(afterEquip.sorceryPlaque, /Gale Garner/i);
  assert.match(afterEquip.summary, /Gale Garner/i);
  assert.equal(afterEquip.cardStatus, 'EQUIPPED');
  console.log('[VERIFY] Gale Garner successfully equipped:', afterEquip);

  // Close inspector
  await evaluate("document.querySelector('#armory-inspector-close').click()");
  await sleep(400);

  // ----------------------------------------------------
  // JOURNEY B: Masterstroke Selection
  // ----------------------------------------------------
  console.log('[VERIFY] --- JOURNEY B: Masterstroke Selection ---');
  await evaluate("document.querySelector('#armory-slot-masterstroke').click()");
  await sleep(600);

  const masterstrokeOpen = await evaluate(`(() => {
    const closed = document.querySelector('#armory-inspector')?.classList.contains('closed');
    const title = document.querySelector('#inspector-title')?.textContent;
    const count = document.querySelectorAll('#armory-ultimates [data-ultimate]').length;
    return { closed, title, count };
  })()`);
  assert.equal(masterstrokeOpen.closed, false);
  assert.match(masterstrokeOpen.title, /CHOOSE MASTERSTROKE/);
  assert.ok(masterstrokeOpen.count >= 4);

  // Highlight All-Natural Disaster
  console.log('[VERIFY] Highlighting All-Natural Disaster...');
  await evaluate("document.querySelector('[data-ultimate=\"one_hit_of_wonders\"]').click()");
  await sleep(400);

  const oneHitState = await evaluate(`(() => {
    const name = document.querySelector('#inspector-card-name')?.textContent;
    const desc = document.querySelector('#inspector-card-desc')?.textContent;
    const facts = document.querySelector('#inspector-card-facts')?.textContent;
    return { name, desc, facts };
  })()`);
  assert.match(oneHitState.name, /ALL-NATURAL DISASTER/i);
  console.log('[VERIFY] All-Natural Disaster detail verified:', oneHitState);

  await screenshot('03-masterstroke-inspector-open.png');

  // Equip All-Natural Disaster
  console.log('[VERIFY] Equipping All-Natural Disaster...');
  await evaluate("document.querySelector('#armory-equip-btn').click()");
  await sleep(400);

  const afterUltEquip = await evaluate(`(() => {
    const ultPlaque = document.querySelector('#plaque-name-masterstroke')?.textContent;
    const summary = document.querySelector('#armory-status-summary')?.textContent;
    return { ultPlaque, summary };
  })()`);
  assert.match(afterUltEquip.ultPlaque, /All-Natural Disaster/i);
  assert.match(afterUltEquip.summary, /All-Natural Disaster/i);

  // Close inspector
  await evaluate("document.querySelector('#armory-inspector-close').click()");
  await sleep(400);

  // ----------------------------------------------------
  // JOURNEY C: Connected Siege Workshop
  // ----------------------------------------------------
  console.log('[VERIFY] --- JOURNEY C: Connected Siege Workshop ---');
  await evaluate("document.querySelector('#armory-nav-siege').click()");
  await sleep(900);

  const siegeStageState = await evaluate(`(() => {
    const heading = document.querySelector('#armory-heading')?.textContent;
    const siegeVisible = !document.querySelector('#armory-siege')?.classList.contains('hidden');
    const kitVisible = !document.querySelector('#armory-kit')?.classList.contains('hidden');
    const activeTab = document.querySelector('.siege-tab.selected')?.dataset.siegeTab;
    const title = document.querySelector('#siege-title')?.textContent;
    return { heading, siegeVisible, kitVisible, activeTab, title };
  })()`);
  assert.match(siegeStageState.heading, /SIEGE WORKSHOP/);
  assert.equal(siegeStageState.siegeVisible, true);
  assert.equal(siegeStageState.kitVisible, false);
  assert.equal(siegeStageState.title, 'SO-FIST-ICATION');
  console.log('[VERIFY] Siege Workshop SO-FIST-ICATION verified:', siegeStageState);

  await screenshot('04-siege-workshop-sofist.png');

  // Switch to BI-BYE-LLISTA
  console.log('[VERIFY] Selecting BI-BYE-LLISTA tab...');
  await evaluate("document.querySelector('[data-siege-tab=\"biBye\"]').click()");
  await sleep(500);

  const bibyeState = await evaluate(`(() => {
    const activeTab = document.querySelector('.siege-tab.selected')?.dataset.siegeTab;
    const title = document.querySelector('#siege-title')?.textContent;
    const skills = [...document.querySelectorAll('#armory-siege-machines [data-siege-skill]')].map((b) => b.dataset.siegeSkill);
    return { activeTab, title, skills };
  })()`);
  assert.equal(bibyeState.activeTab, 'biBye');
  assert.equal(bibyeState.title, 'BI-BYE-LLISTA');
  assert.ok(bibyeState.skills.includes('boltToTheOccasion'));
  console.log('[VERIFY] Bi-Bye-llista state verified:', bibyeState);

  await screenshot('05-siege-workshop-bibye.png');

  // Switch to FIGHT-AND-FLIGHT & expand Story of Siege
  console.log('[VERIFY] Selecting FIGHT-AND-FLIGHT tab & expanding Story of Siege...');
  await evaluate("document.querySelector('[data-siege-tab=\"fightFlight\"]').click()");
  await sleep(500);
  await evaluate("document.querySelector('#siege-story-details').open = true");
  await sleep(300);

  const flightState = await evaluate(`(() => {
    const title = document.querySelector('#siege-title')?.textContent;
    const motto = document.querySelector('#siege-story-content .siege-armory-motto')?.textContent;
    const paragraphsCount = document.querySelectorAll('#siege-story-content p').length;
    return { title, motto, paragraphsCount };
  })()`);
  assert.equal(flightState.title, 'FIGHT-AND-FLIGHT');
  assert.match(flightState.motto, /Why choose to Fight or Flee\? When you could be Free\?/);
  assert.equal(flightState.paragraphsCount, 9);
  console.log('[VERIFY] Fight-and-Flight state and all 9 lore paragraphs verified:', flightState);

  await screenshot('06-siege-workshop-fightflight.png');

  // Test Contextual Back: returns to Kit
  console.log('[VERIFY] Testing contextual back from Siege to Kit...');
  await evaluate("document.querySelector('#armory-back').click()");
  await sleep(600);

  const backToKit = await evaluate(`(() => {
    const heading = document.querySelector('#armory-heading')?.textContent;
    const kitVisible = !document.querySelector('#armory-kit')?.classList.contains('hidden');
    return { heading, kitVisible };
  })()`);
  assert.match(backToKit.heading, /THE SPELLBLADE'S KIT/);
  assert.equal(backToKit.kitVisible, true);

  // ----------------------------------------------------
  // JOURNEY D: Heraldic Chamber
  // ----------------------------------------------------
  console.log('[VERIFY] --- JOURNEY D: Heraldic Chamber ---');
  await evaluate("document.querySelector('#armory-slot-heraldry').click()");
  await sleep(700);

  const heraldryState = await evaluate(`(() => {
    const heading = document.querySelector('#armory-heading')?.textContent;
    const heraldryVisible = !document.querySelector('#armory-heraldry')?.classList.contains('hidden');
    const clothsCount = document.querySelectorAll('#armory-cloths button').length;
    const emblemsCount = document.querySelectorAll('#armory-emblems button').length;
    return { heading, heraldryVisible, clothsCount, emblemsCount };
  })()`);
  assert.match(heraldryState.heading, /HERALDIC CHAMBER/);
  assert.equal(heraldryState.heraldryVisible, true);
  assert.ok(heraldryState.clothsCount >= 6);
  console.log('[VERIFY] Heraldic Chamber verified:', heraldryState);

  await screenshot('07-heraldry-chamber.png');

  // Return to Kit
  await evaluate("document.querySelector('#armory-back').click()");
  await sleep(600);

  // ----------------------------------------------------
  // JOURNEY E: Challenge Ledger
  // ----------------------------------------------------
  console.log('[VERIFY] --- JOURNEY E: Challenge Ledger ---');
  await evaluate("document.querySelector('#armory-challenges-tab').click()");
  await sleep(600);

  const challengesState = await evaluate(`(() => {
    const visible = !document.querySelector('#armory-challenges-view')?.classList.contains('hidden');
    const headerTitle = document.querySelector('#armory-heading')?.textContent;
    return { visible, headerTitle };
  })()`);
  assert.equal(challengesState.visible, true);
  assert.match(challengesState.headerTitle, /CHALLENGE LEDGER/);
  console.log('[VERIFY] Challenge Ledger verified:', challengesState);

  await screenshot('08-challenges-ledger.png');

  // Close Challenges
  await evaluate("document.querySelector('#challenges-close-btn').click()");
  await sleep(500);

  // ----------------------------------------------------
  // JOURNEY F: Landscape Mobile
  // ----------------------------------------------------
  console.log('[VERIFY] --- JOURNEY F: Landscape Mobile Layouts ---');
  // 1) 844 x 390 (iPhone 12/13/14 landscape)
  await send('Emulation.setDeviceMetricsOverride', {
    width: 844,
    height: 390,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await sleep(600);
  await screenshot('09-landscape-mobile-kit.png');

  // Open Sorcery Inspector in 896 x 414 (iPhone 11/XR landscape)
  await evaluate("document.querySelector('#armory-slot-sorcery').click()");
  await sleep(500);
  await send('Emulation.setDeviceMetricsOverride', {
    width: 896,
    height: 414,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await sleep(600);
  await screenshot('10-landscape-mobile-inspector.png');

  // Reset emulation metrics
  await send('Emulation.clearDeviceMetricsOverride');
  await sleep(400);
  await evaluate("document.querySelector('#armory-inspector-close').click()");
  await sleep(400);

  // ----------------------------------------------------
  // JOURNEY G: Reload Persistence & Rapid Switching
  // ----------------------------------------------------
  console.log('[VERIFY] --- JOURNEY G: Persistence & Rapid Switching ---');
  // Reload page
  console.log('[VERIFY] Reloading page to test loadout & location persistence...');
  await send('Page.reload');
  await until(() => evaluate("document.querySelector('#loading-veil')?.classList.contains('done')"), 'loading veil after reload', 150);
  await sleep(600);

  // Open Armory again
  await evaluate("document.querySelector('#armory-button').click()");
  await sleep(700);

  const persistedState = await evaluate(`(() => {
    const sorcery = document.querySelector('#plaque-name-sorcery')?.textContent;
    const masterstroke = document.querySelector('#plaque-name-masterstroke')?.textContent;
    const summary = document.querySelector('#armory-status-summary')?.textContent;
    return { sorcery, masterstroke, summary };
  })()`);

  assert.match(persistedState.sorcery, /Gale Garner/i);
  assert.match(persistedState.masterstroke, /All-Natural Disaster/i);
  assert.match(persistedState.summary, /Gale Garner/i);
  assert.match(persistedState.summary, /All-Natural Disaster/i);
  console.log('[VERIFY] Reload persistence verified:', persistedState);

  // Rapid switching stress test
  console.log('[VERIFY] Running rapid switching stress test...');
  for (let i = 0; i < 4; i++) {
    await evaluate("document.querySelector('#armory-slot-technique').click()");
    await sleep(80);
    await evaluate("document.querySelector('#armory-slot-sorcery').click()");
    await sleep(80);
    await evaluate("document.querySelector('#armory-slot-masterstroke').click()");
    await sleep(80);
    await evaluate("document.querySelector('#armory-nav-siege').click()");
    await sleep(80);
    await evaluate("document.querySelector('#armory-back').click()");
    await sleep(80);
  }
  await sleep(500);

  const finalCheck = await evaluate("!document.querySelector('#armory-menu').classList.contains('hidden')");
  assert.equal(finalCheck, true);
  console.log('[VERIFY] Rapid switching stress test passed with zero issues!');

  console.log('\n========================================');
  console.log('ALL ARMORY REBORN JOURNEYS VERIFIED SUCCESSFULLY!');
  console.log('========================================\n');
} catch (error) {
  console.error('[VERIFY FAILED]', error);
  if (exceptions.length) console.error('[BROWSER EXCEPTIONS]', exceptions);
  process.exitCode = 1;
} finally {
  try { ws?.close(); } catch {}
  try { chrome.kill('SIGKILL'); } catch {}
  await sleep(400);
  try { await server.stop(); } catch {}
  try { await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
}
