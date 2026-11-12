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

async function point(x, y, touch = false) {
  if(touch) {
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  } else {
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});
  }
}

async function tap(selector,touch=false) {
  const coords=await until(()=>evaluate(`(() => {
    const el=document.querySelector(${JSON.stringify(selector)});
    if(!el || el.getClientRects().length===0) return null;
    el.scrollIntoView({block:'nearest'});
    const r=el.getBoundingClientRect();
    const x=r.x+r.width/2,y=r.y+r.height/2;
    return el.contains(document.elementFromPoint(x,y))?[x,y]:null;
  })()`),`visible hit target ${selector}`,36);
  await point(...coords,touch);
}

async function dragPreview(name, touch = false) {
  const [x, y] = await evaluate(`(() => {
    const r=document.querySelector('[data-armory-preview="${name}"]').getBoundingClientRect();
    return [r.x+r.width/2,r.y+r.height/2];
  })()`);
  if (touch) {
    await send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{x,y}]});
    await send('Input.dispatchTouchEvent', {type:'touchMove',touchPoints:[{x:x+35,y:y+18}]});
    await send('Input.dispatchTouchEvent', {type:'touchMove',touchPoints:[{x:x+62,y:y+30}]});
    await send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
  } else {
    await send('Input.dispatchMouseEvent', {type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});
    await send('Input.dispatchMouseEvent', {type:'mouseMoved',x:x+62,y:y+30,button:'left',buttons:1});
    await send('Input.dispatchMouseEvent', {type:'mouseReleased',x:x+62,y:y+30,button:'left',clickCount:1});
  }
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
  assert.equal(kitState.technique, 'None equipped');
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
  // Selected cards settle last, do not scale twice, and leave the detail card
  // below in the same native scroll rail for a downward swipe.
  const equipmentMotion=await evaluate(`(() => {
    const cards=[...document.querySelectorAll('#armory-spells .spell-card')];
    const scroll=document.querySelector('#armory-inspector .inspector-scroll');
    const detail=document.querySelector('#inspector-item-card');
    const card=cards.at(-1);
    return {
      last:card?.dataset.spell,
      selected:card?.classList.contains('equipped'),
      noLegacyBounce:getComputedStyle(card).animationName==='none',
      detailBelow:detail.getBoundingClientRect().top>card.getBoundingClientRect().bottom,
      canSwipe:scroll.scrollHeight>scroll.clientHeight,
    };
  })()`);
  assert.equal(equipmentMotion.last,'gale','newly selected Sorcery slides to final list position');
  assert.equal(equipmentMotion.selected,true);
  assert.equal(equipmentMotion.noLegacyBounce,true,'no conflicting equip scale keyframes');
  assert.equal(equipmentMotion.detailBelow,true,'details remain below the options');
  assert.equal(equipmentMotion.canSwipe,true,'downward swipe exposes equipment details');


  assert.equal(await evaluate(`(() => {
    const panel = document.querySelector('#armory-inspector').getBoundingClientRect();
    const preview = document.querySelector('[data-armory-preview="kit"]').getBoundingClientRect();
    const rail = document.querySelector('#armory-inspector-categories').getBoundingClientRect();
    return rail.right <= preview.left && preview.right <= panel.left;
  })()`), true, 'the reserved preview does not intersect either control column');
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
  // JOURNEY C: Connected Siege Workshop & Real Authored GLBs
  // ----------------------------------------------------
  console.log('[VERIFY] --- JOURNEY C: Connected Siege Workshop & Real Authored GLBs ---');
  await evaluate("document.querySelector('#armory-nav-siege').click()");
  await sleep(900);

  // 1. Verify SO-FIST-ICATION authored GLB
  console.log('[VERIFY] Awaiting authored SO-FIST-ICATION GLB load...');
  await evaluate("window.__ssMenu?.siegeWorkshop?.whenLoaded('soFist').then(() => true)");
  await sleep(300);

  const soFistStatus = await evaluate(`(() => {
    const ws = window.__ssMenu?.siegeWorkshop;
    return ws ? ws.getActiveModelStatus() : null;
  })()`);
  console.log('[VERIFY] soFist authored model status:', soFistStatus);
  assert.ok(soFistStatus, 'SiegeWorkshop instance active');
  assert.equal(soFistStatus.isAuthored, true, 'SO-FIST-ICATION must display authored GLB, not fallback');
  assert.match(soFistStatus.childName, /Authored_soFist/);
  assert.ok(soFistStatus.bounds.size.x > 0.5 && soFistStatus.bounds.size.y > 0.5, 'soFist model has realistic dimensions');

  // The first Skill is held until stopped. A second press genuinely replays it.
  await until(()=>evaluate('Boolean(window.__ssMenu.siegeWorkshop.knight)'), 'authentic training Spellblade');
  await evaluate('document.querySelector("[data-siege-skill=longArmToTheJaw]").click()');
  await sleep(800);
  assert.equal(await evaluate('window.__ssMenu.siegeWorkshop.performance.skill'), 'longArmToTheJaw');
  assert.ok(await evaluate('window.__ssMenu.siegeWorkshop.performance.time') > .6);
  assert.ok(await evaluate(`(() => {
    const ws=window.__ssMenu.siegeWorkshop;
    return ws.previewAnimation?.layers?.has('01_Ram_Strike_Full_Cycle')
      && !ws.previewFist;
  })()`), 'the authored ram strike plays without double-applying manual piston travel');
  await evaluate('document.querySelector("[data-siege-skill=longArmToTheJaw]").click()');
  assert.ok(await evaluate('window.__ssMenu.siegeWorkshop.performance.time') < .3, 'second press restarts the shot');
  await evaluate('document.querySelector("#siege-preview-stop").click()');
  assert.equal(await evaluate('window.__ssMenu.siegeWorkshop.performance.active'),false);
  assert.equal(await evaluate('window.__ssMenu.siegeWorkshop.machinePivot.position.y'),0);
  await evaluate('document.querySelector("[data-siege-skill=beatToThePunch]").click()');
  await sleep(1650);
  assert.ok(await evaluate('window.__ssMenu.siegeWorkshop.machinePivot.position.z') < -1.3,
    'Beat to the Punch visibly reverses out of the shed');
  // The Spellblade must share the inspection turntable with the ram.
  // Dragging can change the view, never the staged contact relationship.
  const stagedBefore=await evaluate(`(() => {
    const ws=window.__ssMenu.siegeWorkshop;
    return {active:ws.performance.active,parented:ws.performance.root.parent===ws.inspectionPivot,
      position:ws.performance.actors[0].root.getWorldPosition(new THREE.Vector3()).toArray(),
      machine:ws.machinePivot.getWorldPosition(new THREE.Vector3()).toArray()};
  })()`);
  assert.ok(stagedBefore.active && stagedBefore.parented,'the attacker and training knight share one exhibition turntable');
  const relativeBefore=await evaluate(`(() => {
    const ws=window.__ssMenu.siegeWorkshop;
    return ws.inspectionPivot.worldToLocal(ws.performance.actors[0].root.getWorldPosition(
      new THREE.Vector3())).toArray();
  })()`);
  await dragPreview('siege');
  await sleep(400);
  const relativeAfter=await evaluate(`(() => {
    const ws=window.__ssMenu.siegeWorkshop;
    return {active:ws.performance.active,position:ws.inspectionPivot.worldToLocal(
      ws.performance.actors[0].root.getWorldPosition(new THREE.Vector3())).toArray()};
  })()`);
  assert.equal(relativeAfter.active,true,'inspection dragging must not cancel the ram performance');
  assert.ok(Math.hypot(...relativeAfter.position.map((n,i)=>n-relativeBefore[i]))<2.5,
    'the trained victim remains in the ram demonstration rather than orbiting independently');
  await screenshot('04a-ram-beat-to-the-punch.png');
  await evaluate('document.querySelector("#siege-preview-stop").click()');
  assert.equal(await evaluate('window.__ssMenu.siegeWorkshop.machinePivot.position.z'),0);


  // Verify pointer dragging rotates machine
  const initialYaw = await evaluate("window.__ssMenu?.siegeWorkshop?.targetYaw ?? 0");
  await dragPreview('siege');
  const rotatedYaw = await evaluate("window.__ssMenu?.siegeWorkshop?.targetYaw ?? 0");
  assert.ok(Math.abs(rotatedYaw - initialYaw) > 0.4, 'Pointer dragging rotates selected machine');
  await tap('#siege-reset-view');
  await until(() => evaluate('Math.abs(window.__ssMenu.siegeWorkshop.targetYaw-window.__ssMenu.siegeWorkshop.currentYaw)<.02'), 'machine reset settles');

  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.siege-inspector-scroll > section > h4, #siege-story-details summary span:first-child')].map(el=>el.textContent)`),
    ['SIEGE SKILLS · U', 'ABILITIES & ATTACKS', 'CONTROLS', 'OVERVIEW', 'STORY OF SIEGE']);
  assert.equal(await evaluate('document.querySelector("#siege-story-details").open'), false);
  const framing = await evaluate(`({
    bounds:window.__ssMenu.siegeWorkshop.presentationBounds(),
    camera:window.__ssMenu.presentedShot,
    viewport:window.__ssMenu.previewFrame
  })`);
  assert.ok(framing.bounds.max[0] - framing.bounds.min[0] < 12, 'comparison knight bounds stay local to the ram');
  console.log('[VERIFY] Workshop framing:', framing);
  await screenshot('04-siege-workshop-sofist.png');

  // 2. Verify BI-BYE-LLISTA authored GLB
  console.log('[VERIFY] Selecting BI-BYE-LLISTA tab...');
  await evaluate("document.querySelector('[data-siege-tab=\\'biBye\\']').click()");
  await evaluate("window.__ssMenu?.siegeWorkshop?.whenLoaded('biBye').then(() => true)");
  await sleep(300);

  const bibyeStatus = await evaluate(`(() => {
    const ws = window.__ssMenu?.siegeWorkshop;
    const activeTab = document.querySelector('.siege-tab.selected')?.dataset.siegeTab;
    const title = document.querySelector('#siege-title')?.textContent;
    const skills = [...document.querySelectorAll('#armory-siege-machines [data-siege-skill]')].map((b) => b.dataset.siegeSkill);
    const model = ws ? ws.getActiveModelStatus() : null;
    return { activeTab, title, skills, model };
  })()`);
  console.log('[VERIFY] biBye authored model status:', bibyeStatus);
  assert.equal(bibyeStatus.activeTab, 'biBye');
  assert.equal(bibyeStatus.title, 'BI-BYE-LLISTA');
  assert.equal(bibyeStatus.model.isAuthored, true, 'BI-BYE-LLISTA must display authored GLB, not fallback');
  assert.match(bibyeStatus.model.childName, /Authored_biBye/);
  assert.ok(bibyeStatus.model.bounds.size.x > 0.5, 'biBye model has non-zero authored bounds');
  assert.ok(bibyeStatus.skills.includes('boltToTheOccasion'));
  await evaluate('document.querySelector("[data-siege-skill=coldHowTouching]").click()');
  assert.equal(await evaluate('window.__ssMenu.siegeWorkshop.performance.projectiles[0].shot.nearMiss'),true);
  await sleep(1200);
  await screenshot('05a-bibye-near-miss-frost.png');
  await evaluate('document.querySelector("[data-siege-skill=boltToTheOccasion]").click()');
  assert.deepEqual(await evaluate('window.__ssMenu.siegeWorkshop.performance.projectiles.map(p=>p.shot.kind)'),
    ['heavy','frost'], 'mobile Bolt II is demonstrated BEFORE the conditioning bolt');
  await sleep(1450);
  const forwardBolt=await evaluate(`(() => {
    const ws=window.__ssMenu.siegeWorkshop;
    const shot=ws.performance.projectiles[0];
    return {from:shot.from,origin:shot.object.position.toArray(),
      target:ws.performance.actors[0].root.position.toArray(),
      commonParent:ws.performance.root.parent===ws.machinePivot.parent};
  })()`);
  assert.equal(forwardBolt.commonParent,true,'projectiles and machine use a shared rotated coordinate system');
  assert.ok(forwardBolt.from && forwardBolt.from[2]>forwardBolt.target[2],
    'heavy bolt starts in front of its target, never behind the carriage');
  await dragPreview('siege');
  await sleep(200);
  assert.equal(await evaluate('window.__ssMenu.siegeWorkshop.performance.active'),true,
    'ballista inspection must not cancel the authored shooting sequence');
  await screenshot('05b-bibye-rotated-firing.png');
  await evaluate('document.querySelector("#siege-preview-stop").click()');


  await screenshot('05-siege-workshop-bibye.png');

  // 3. Verify FIGHT-AND-FLIGHT authored GLB & all 9 lore paragraphs
  console.log('[VERIFY] Selecting FIGHT-AND-FLIGHT tab & expanding Story of Siege...');
  await evaluate("document.querySelector('[data-siege-tab=\\'fightFlight\\']').click()");
  await evaluate("window.__ssMenu?.siegeWorkshop?.whenLoaded('fightFlight').then(() => true)");
  await sleep(300);
  await evaluate("document.querySelector('#siege-story-details').open = true");
  await sleep(300);

  const flightStatus = await evaluate(`(() => {
    const ws = window.__ssMenu?.siegeWorkshop;
    const title = document.querySelector('#siege-title')?.textContent;
    const motto = document.querySelector('#siege-story-content .siege-armory-motto')?.textContent;
    const paragraphsCount = document.querySelectorAll('#siege-story-content p').length;
    const model = ws ? ws.getActiveModelStatus() : null;
    return { title, motto, paragraphsCount, model };
  })()`);
  console.log('[VERIFY] fightFlight authored model status:', flightStatus);
  assert.equal(flightStatus.title, 'FIGHT-AND-FLIGHT');
  assert.match(flightStatus.motto, /Why choose to Fight or Flee\? When you could be Free\?/);
  assert.equal(flightStatus.paragraphsCount, 9);
  assert.equal(flightStatus.model.isAuthored, true, 'FIGHT-AND-FLIGHT must display authored GLB, not fallback');
  assert.match(flightStatus.model.childName, /Authored_fightFlight/);
  assert.ok(flightStatus.model.bounds.size.y > 0.5, 'fightFlight model has non-zero authored bounds');
  await evaluate('document.querySelector("[data-siege-skill=doNotStopMyAscension]").click()');
  await sleep(1950);
  assert.ok(await evaluate('window.__ssMenu.siegeWorkshop.machinePivot.position.y')>1,
    'the flight demonstration really pitches and climbs');
  await screenshot('06a-flight-dash-loop.png');
  await evaluate('document.querySelector("[data-siege-skill=narrowToOne]").click()');
  assert.equal(await evaluate('window.__ssMenu.siegeWorkshop.performance.projectiles.length'),18);
  await sleep(1300);
  await screenshot('06b-flight-narrow-to-one.png');
  await evaluate('document.querySelector("[data-siege-skill=fireAwayRightHere]").click()');
  assert.equal(await evaluate('window.__ssMenu.siegeWorkshop.performance.projectiles.length'),27);
  assert.equal(await evaluate('window.__ssMenu.siegeWorkshop.performance.actors.length'),3);
  await sleep(2900);
  assert.ok(await evaluate('window.__ssMenu.siegeWorkshop.performance.actors.some(a=>a.lastHp<100)'),
    'three visible 100-HP training targets lose HP under sustained repeater fire');
  await screenshot('06c-flight-fire-away-hp.png');
  await evaluate('document.querySelector("#siege-preview-stop").click()');


  // 4. Verify honest fallback when asset is missing or unknown
  const honestFallback = await evaluate(`(() => {
    const ws = window.__ssMenu?.siegeWorkshop;
    return {
      invalidDisplay: ws.isDisplayingAuthored('unknown_machine'),
      mixersCount: ws.mixers.size,
      inFlightCount: ws.inFlight.size,
    };
  })()`);
  assert.equal(honestFallback.invalidDisplay, false, 'Missing or non-authored machine produces honest fallback state');
  assert.equal(honestFallback.inFlightCount, 0, 'No stuck in-flight requests');
  console.log('[VERIFY] Honest fallback and in-flight deduplication verified:', honestFallback);

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

  const backToKitFromHeraldry = await evaluate(`(() => {
    const heading = document.querySelector('#armory-heading')?.textContent;
    const kitVisible = !document.querySelector('#armory-kit')?.classList.contains('hidden');
    return { heading, kitVisible };
  })()`);
  assert.match(backToKitFromHeraldry.heading, /THE SPELLBLADE'S KIT/);
  assert.equal(backToKitFromHeraldry.kitVisible, true);

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

  const afterChallengesClose = await evaluate(`(() => {
    const heading = document.querySelector('#armory-heading')?.textContent;
    const kitVisible = !document.querySelector('#armory-kit')?.classList.contains('hidden');
    return { heading, kitVisible };
  })()`);
  assert.match(afterChallengesClose.heading, /THE SPELLBLADE'S KIT/);
  assert.equal(afterChallengesClose.kitVisible, true);

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
  await sleep(750);
  assert.equal(await evaluate(`(() => {
    const r=document.querySelector('.inspector-inner').getBoundingClientRect();
    return r.right<=innerWidth+1 && r.left>=0;
  })()`),true,'the whole inspector is inside the landscape viewport');
  await screenshot('10-landscape-mobile-inspector.png');
  await send('Emulation.setTouchEmulationEnabled',{enabled:true});
  const beforeTouch = await evaluate('window.__ssMenu.targetYaw');
  await dragPreview('kit',true);
  assert.ok(Math.abs(await evaluate('window.__ssMenu.targetYaw') - beforeTouch) > 0.4);
  assert.equal(await evaluate('window.__ssMenu.targetPitch'), 0, 'the Spellblade remains planted during vertical drag');
  await tap('#armory-reset-hero', true);
  assert.equal(await evaluate('window.__ssMenu.targetPitch'), 0);
  await tap('#armory-inspector-close', true);
  await tap('#armory-nav-siege', true);
  await tap('[data-siege-tab="biBye"]', true);
  await sleep(650);
  await screenshot('15-landscape-mobile-workshop.png');
  await tap('#armory-back', true);
  await tap('#armory-slot-heraldry', true);
  await sleep(650);
  await screenshot('16-landscape-mobile-heraldry.png');
  await tap('#armory-back', true);
  await send('Emulation.setTouchEmulationEnabled',{enabled:false});

  // Reset emulation metrics
  await send('Emulation.clearDeviceMetricsOverride');
  await sleep(400);
  await evaluate("document.querySelector('#armory-inspector-close').click()");
  await sleep(400);

  // ----------------------------------------------------
  // JOURNEY G: Plaque Icons & Full Reload Persistence
  // ----------------------------------------------------
  console.log('[VERIFY] --- JOURNEY G: Plaque Icons & Full Reload Persistence ---');

  // Verify visible occupied equipment plaque icons for all spells
  console.log('[VERIFY] Testing plaque icons for every registered spell...');
  await evaluate("document.querySelector('#armory-slot-sorcery').click()");
  await sleep(200);
  const allSpells = await evaluate(`[...document.querySelectorAll('#armory-spells [data-spell]')].map(b => b.dataset.spell)`);
  for (const spellId of allSpells) {
    await evaluate(`(() => {
      document.querySelector('[data-spell="' + '${spellId}' + '"]')?.click();
      document.querySelector('#armory-equip-btn')?.click();
    })()`);
    const plaqueIcon = await evaluate("document.querySelector('#plaque-icon-sorcery')?.textContent?.trim()");
    assert.ok(plaqueIcon && plaqueIcon.length > 0, 'Spell ' + spellId + ' has non-empty plaque icon glyph');
  }
  await evaluate("document.querySelector('[data-spell=\"line_of_conduct\"]').click()");
  console.log('[VERIFY] All spell plaque icons verified visible!');

  // Verify visible occupied equipment plaque icons for all masterstrokes
  console.log('[VERIFY] Testing plaque icons for every registered masterstroke...');
  await evaluate("document.querySelector('#armory-slot-masterstroke').click()");
  await sleep(200);
  const allUlts = await evaluate(`[...document.querySelectorAll('#armory-ultimates [data-ultimate]')].map(b => b.dataset.ultimate)`);
  for (const ultId of allUlts) {
    await evaluate(`(() => {
      document.querySelector('[data-ultimate="' + '${ultId}' + '"]')?.click();
      document.querySelector('#armory-equip-btn')?.click();
    })()`);
    const ultIcon = await evaluate("document.querySelector('#plaque-icon-masterstroke')?.textContent?.trim()");
    assert.ok(ultIcon && ultIcon.length > 0, 'Masterstroke ' + ultId + ' has non-empty plaque icon glyph');
  }
  console.log('[VERIFY] All masterstroke plaque icons verified visible!');

  // Close inspector
  await evaluate("document.querySelector('#armory-inspector-close').click()");
  await sleep(200);

  // Navigate to Siege Workshop, select biBye, and expand story before reload
  console.log('[VERIFY] Setting up 6-property persistence state in Siege Workshop...');
  await evaluate("document.querySelector('#armory-nav-siege').click()");
  await sleep(300);
  await evaluate("document.querySelector('[data-siege-tab=\\'biBye\\']').click()");
  await sleep(200);
  await evaluate("document.querySelector('#siege-story-details').open = true");
  await sleep(200);

  // Full page reload to prove location persistence survives reload
  console.log('[VERIFY] Reloading full page to prove all 6 properties survive...');
  await send('Page.reload');
  await until(() => evaluate("document.querySelector('#loading-veil')?.classList.contains('done')"), 'loading veil after reload', 150);
  await sleep(600);

  // Open Armory: router must restore to the saved region (siege), machine (biBye), and expanded story!
  await evaluate("document.querySelector('#armory-button').click()");
  await sleep(700);

  const restoredLocation = await evaluate(`(() => {
    const heading = document.querySelector('#armory-heading')?.textContent;
    const siegeVisible = !document.querySelector('#armory-siege')?.classList.contains('hidden');
    const selectedTab = document.querySelector('.siege-tab.selected')?.dataset.siegeTab;
    const title = document.querySelector('#siege-title')?.textContent;
    const storyOpen = Boolean(document.querySelector('#siege-story-details')?.open);
    return { heading, siegeVisible, selectedTab, title, storyOpen };
  })()`);
  console.log('[VERIFY] Restored Armory location after reload:', restoredLocation);
  assert.match(restoredLocation.heading, /SIEGE WORKSHOP/);
  assert.equal(restoredLocation.siegeVisible, true);
  assert.equal(restoredLocation.selectedTab, 'biBye');
  assert.equal(restoredLocation.title, 'BI-BYE-LLISTA');
  assert.equal(restoredLocation.storyOpen, true);

  // Contextual back to kit
  await evaluate("document.querySelector('#armory-back').click()");
  await sleep(500);

  const kitPlaques = await evaluate(`(() => {
    const sorceryIcon = document.querySelector('#plaque-icon-sorcery')?.textContent?.trim();
    const masterstrokeIcon = document.querySelector('#plaque-icon-masterstroke')?.textContent?.trim();
    const summary = document.querySelector('#armory-status-summary')?.textContent;
    return { sorceryIcon, masterstrokeIcon, summary };
  })()`);
  assert.ok(kitPlaques.sorceryIcon.length > 0, 'Sorcery plaque icon restored');
  assert.ok(kitPlaques.masterstrokeIcon.length > 0, 'Masterstroke plaque icon restored');
  console.log('[VERIFY] Kit plaques after reload:', kitPlaques);

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

  await tap('#armory-slot-sorcery');
  await sleep(520);
  await tap('[data-inspector-category="masterstroke"]');
  await until(()=>evaluate("document.querySelector('#inspector-title').textContent.includes('MASTERSTROKE')"),'category switch');
  await tap('[data-inspector-category="heraldry"]');
  const rearYaw = await evaluate('window.__ssMenu.targetYaw');
  await dragPreview('heraldry');
  assert.ok(Math.abs(await evaluate('window.__ssMenu.targetYaw') - rearYaw) > .4);
  assert.equal(await evaluate("document.querySelector('#armory-heraldry').classList.contains('hidden')"), false);
  await tap('#armory-back');
  await until(()=>evaluate("!document.querySelector('#armory-kit').classList.contains('hidden')"),'Heraldry Back returns to Kit');
  assert.equal(await evaluate("document.activeElement.id"),'armory-slot-heraldry');
  await tap('#armory-slot-heraldry');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await until(()=>evaluate("!document.querySelector('#armory-kit').classList.contains('hidden')"),'Escape returns to Kit');
  await tap('#armory-back');
  await until(()=>evaluate("document.querySelector('#armory-menu').classList.contains('hidden')"),'Armory closed');
  await evaluate(`(() => {
    document.querySelector('[data-tutorial-onboarding-skip]')?.click();
    const name=document.querySelector('#player-name');
    name.value='Kit Tester';name.dispatchEvent(new Event('input',{bubbles:true}));
  })()`);
  await tap('#solo-button');
  await until(()=>evaluate("!document.querySelector('#solo-menu').classList.contains('hidden')"),'Solo shown');
  await tap('#practice-mode');
  await tap('#solo-launch');
  console.log('[VERIFY] Practice launch request:',await evaluate(`({
    errors:[...document.querySelectorAll('#solo-menu .error-copy')].map(e=>e.textContent),
    name:document.querySelector('#solo-name').value,
    room:window.__ssLink?.roomCode
  })`));
  await until(()=>evaluate("window.__ssLink.roomCode && window.__ssSnapshot?.mode==='PRACTICE'"),'Practice after full reload',180);
  const equipped=await evaluate(`window.__ssSnapshot.players.find(p=>p.id===window.__ssSnapshot.hostId)`);
  assert.equal(equipped.spell,'line_of_conduct');
  assert.equal(equipped.ultimate,'one_hit_of_wonders');
  await until(()=>evaluate("document.querySelector('#arena-gate').classList.contains('hidden') && !document.querySelector('#hud').classList.contains('hidden')"),'Practice presentation ready');
  await screenshot('11-practice-equipped-after-reload.png');
  // The separate match pause screen controls are hidden until it is opened.
  const leave=async()=> {
    await evaluate("document.querySelector('#pause-leave').click()");
    await until(()=>evaluate("!window.__ssLink.roomCode && document.querySelector('#breakthrough-button').getClientRects().length"),'return to main menu');
  };
  await leave();

  for(const [mode,action,touch] of [['RESTLESS_DAY','#breakthrough-play-bots',false],
    ['RENOWN_TRIALS','#mettle-renown-rehearse',false],['EDGE_OF_VICTORY','#breakthrough-play-bots',true]]) {
    if(touch) {
      await send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});
      await send('Emulation.setTouchEmulationEnabled',{enabled:true});
    }
    await tap('#breakthrough-button',touch);
    await tap(`[data-mettle-mode="${mode}"]`,touch);
    if(mode!=='RESTLESS_DAY')assert.equal(await evaluate("document.querySelector('#breakthrough-create-private').hidden && document.querySelector('.mettle-companion').hidden"),true);
    if(mode==='RENOWN_TRIALS')await screenshot('12-mettle-rampage-menu.png');
    await tap(action,touch);
    await until(()=>evaluate(`window.__ssLink.roomCode && window.__ssSnapshot?.mode==='${mode}' && window.__ssSnapshot.roomState==='PLAYING'`),
      `authoritative ${mode} launch`,180);
    assert.equal(await evaluate("window.__ssLink.hosting"),'local');
    if (mode === 'RENOWN_TRIALS') {
      await until(()=>evaluate("window.__ssSnapshot.renownTrial.phase==='WAVE_ACTIVE'"), 'rehearsal combat');
      assert.equal(await evaluate("window.__ssSnapshot.renownTrial.rehearsal"), true);
      assert.doesNotMatch(await evaluate("document.querySelector('#renown-trial-hud').innerText"), /REHEARSAL|ACCOUNT/);
      // End the fixture at an authoritative defeat to check the offline results.
      await evaluate("window.__ssLink.local.player.alive=false");
      await until(()=>evaluate("document.querySelector('#final-scoreboard').textContent.includes('No account Renown awarded.')"), 'rehearsal results');
      assert.equal(await evaluate("document.querySelector('#final-scoreboard .final-row')===null"), true);
      await screenshot('14-rehearsal-results.png');
    }
    if(touch){
      await until(()=>evaluate("document.querySelector('#arena-gate').classList.contains('hidden') && !document.querySelector('#hud').classList.contains('hidden')"),'Edge presentation ready');
      await screenshot('13-mobile-edge-of-victory.png');
    }
    await leave();
    console.log(`[VERIFY] Visible Modes of Mettle selection launched ${mode} and returned`);
  }

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
