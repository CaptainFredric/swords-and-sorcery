// Real menu and browser input. The matchmaker rotation index is staged only
// to reach the new duel in one queue cycle.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGameServer } from '../server/src/server.mjs';
import { ProfileStore } from '../server/src/ProfileStore.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const out = 'output/playwright/arena-variety';
await mkdir(out, { recursive:true });
const profileDir = await mkdtemp(join(tmpdir(), 'castleward-arenas-'));
const server = createGameServer({ port:0, host:'127.0.0.1', profileStore:new ProfileStore(profileDir) });
await server.start();
const url = 'http://127.0.0.1:' + server.address().port + '/?debug';
const browser = await chromium.launch({channel:'chrome', args:['--enable-unsafe-swiftshader','--disable-background-timer-throttling']});
const evidence = {};
const errors = [];
const path = (name) => join(out, name + '.png');
let latestPage;
let stage;

async function page({touch=false}={}) {
  const context = await browser.newContext({
    viewport:touch ? {width:844,height:390} : {width:900,height:550},
    isMobile:touch, hasTouch:touch, deviceScaleFactor:1,
    ...(touch && {userAgent:'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36'}),
  });
  const p = await context.newPage();
  latestPage=p;
  p.on('pageerror', error => errors.push(error.message));
  await menu(p);
  return p;
}

async function menu(p) {
  await p.goto(url,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(() => document.querySelector('#loading-veil')?.classList.contains('done'));
  const skip=p.locator('[data-tutorial-onboarding-skip]');
  if(await skip.isVisible()) await skip.click();
  const show=p.locator('#show-menu');
  if(await show.isVisible()) await show.click();
}

async function solo(p, mode, id) {
  await p.locator('#solo-button').click();
  await p.locator('#solo-menu [data-name-copy]').first().fill('Arena Knight');
  await p.locator('#'+mode).click();
  const details=p.locator('#solo-details');
  if(await details.isVisible()) await details.click();
  await p.locator('#solo-arena [data-arena="'+id+'"]').click();
  await p.locator('#solo-launch').click();
}

async function snapshot(p, mode, world) {
  await p.waitForFunction(({mode,world})=>{
    const r=window.__ssRuntime, s=r?.latestSnapshot;
    return s?.mode===mode && s.worldId===world && s.roomState==='PLAYING' &&
      r.activeWorld?.id===world && r.localAuth?.alive;
  },{mode,world},{timeout:45000});
  return p.evaluate(()=>{
    const r=window.__ssRuntime,s=r.latestSnapshot;
    return {mode:s.mode, world:s.worldId, local:r.socket.playingLocally, renderer:r.world.constructor.name,
      position:r.localAuth.position, player:r.playerId, room:s.roomCode,
      competitive:Boolean(s.highGrounds || s.objective || s.renownTrial), prowess:r.localAuth.prowess};
  });
}

async function practice() {
  stage='landscape High Grounds Practice';
  const p=await page({touch:true});
  await solo(p,'practice-mode','high-grounds');
  const entered=await snapshot(p,'PRACTICE','high-grounds');
  assert.ok(entered.local && !entered.competitive && entered.prowess===100);
  assert.deepEqual(entered.position,{x:0,y:0,z:4});
  await p.locator('#arena-gate').waitFor({state:'hidden'});
  assert.ok(await p.evaluate(()=>document.body.classList.contains('touch-ui')));
  await p.locator('#practice-drawer-close').tap();
  if(!await p.evaluate(()=>window.__ssRuntime.input.enabled)) {
    await p.touchscreen.tap(390,150);
  }
  await p.waitForFunction(()=>window.__ssRuntime.input.enabled && window.__ssRuntime.touch.active);
  const stick=await p.locator('.touch-stick').boundingBox();
  const finger={x:stick.x+stick.width*.6,y:stick.y+stick.height*.54,id:1};
  const cdp=await p.context().newCDPSession(p);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[finger]});
  try {
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...finger,y:finger.y-44}]});
    await p.waitForFunction(()=>window.__ssRuntime.localAuth.position.z<3.2);
  } finally {
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await cdp.detach();
  }
  await p.screenshot({path:path('high-grounds-practice')});
  await p.evaluate(()=>{window.oldArena=window.__ssRuntime.world.group;});
  const panel=p.locator('#practice-reposition');
  const tools=p.locator('.touch-practiceTools');
  if(!(await panel.isVisible()) && await tools.isVisible()) await tools.tap();
  await panel.locator('summary').click();
  await p.locator('#practice-destination').selectOption('canopy');
  await p.locator('#practice-move').tap();
  await p.waitForFunction(()=>window.__ssRuntime?.localAuth?.position.y===12);
  await p.locator('#practice-fight').tap();
  await p.waitForFunction(()=>window.__ssSnapshot?.players.some(a=>a.actorKind==='dummy'&&a.position.y===12));
  await p.screenshot({path:path('high-grounds-canopy')});
  await p.locator('#practice-destination').selectOption('roots');
  await p.locator('#practice-move').tap();
  await p.waitForFunction(()=>window.__ssRuntime?.localAuth?.position.y===-9);
  await p.screenshot({path:path('high-grounds-roots')});
  await p.locator('#practice-leave').tap();
  await p.locator('#solo-button').waitFor({state:'visible'});
  await p.waitForFunction(()=>window.oldArena.parent===null);
  evidence.practice={...entered, canopy:12, roots:-9, sceneDisposed:true};
  await p.context().close();
}

async function botDuel() {
  stage='desktop Blackbell Foundry Bot Duel';
  const p=await page();
  await solo(p,'bot-duel','blackbell-foundry');
  const entered=await snapshot(p,'BOT_DUEL','blackbell-foundry');
  assert.ok(entered.local && !entered.competitive);
  const start=await p.evaluate(()=>window.__ssSnapshot.players.find(a=>a.actorKind==='bot').position);
  await p.waitForFunction(start=>{
    const b=window.__ssSnapshot.players.find(a=>a.actorKind==='bot');
    return Math.hypot(b.position.x-start.x,b.position.z-start.z)>2;
  },start,{timeout:20000});
  await p.locator('#arena-gate').waitFor({state:'hidden'});
  if(!await p.evaluate(()=>Boolean(document.pointerLockElement))) await p.locator('#game-canvas canvas').click({position:{x:430,y:250}});
  const from=await p.evaluate(()=>window.__ssRuntime.localAuth.position);
  await p.keyboard.down('w');
  try {
    await p.waitForFunction(from=>{
      const p=window.__ssRuntime.localAuth.position;
      return Math.hypot(p.x-from.x,p.z-from.z)>.6;
    },from,{timeout:10000});
  } finally { await p.keyboard.up('w'); }
  await p.screenshot({path:path('blackbell-bot-duel')});
  evidence.botDuel={...entered,botMoved:true};
  await p.context().close();
}

async function online() {
  stage='two Chrome clients in High Grounds Shared Practice';
  const host=await page();
  await solo(host,'shared-practice-mode','high-grounds');
  const entered=await snapshot(host,'PRACTICE','high-grounds');
  assert.ok(!entered.local && !entered.competitive);
  const guest=await page();
  await guest.locator('#private-button').click();
  await guest.locator('#private-menu [data-name-copy]').first().fill('Guest Knight');
  await guest.locator('#room-code').fill(entered.room);
  await guest.locator('#join-room').click();
  const joined=await snapshot(guest,'PRACTICE','high-grounds');
  assert.equal(joined.room,entered.room);
  await guest.locator('#arena-gate').waitFor({state:'hidden'});
  await guest.screenshot({path:path('high-grounds-shared')});
  await menu(guest);
  const reconnected=await snapshot(guest,'PRACTICE','high-grounds');
  assert.equal(reconnected.player,joined.player);
  assert.equal(reconnected.room,joined.room);
  evidence.shared={...entered,reconnected:true};

  stage='matchmade Court of Merit Duel';
  for(const p of [host,guest]){
    await p.evaluate(()=>window.__ssLink.leaveRoom());
    await menu(p);
    await p.locator('#player-name').fill(p===host?'Court Host':'Court Guest');
  }
  server.roomManager.duelsMade=2;
  await host.locator('#seek-duel').click();
  await guest.locator('#seek-duel').click();
  const duel=await Promise.all([host,guest].map(p=>snapshot(p,'DUEL','court-of-merit')));
  assert.equal(duel[0].room,duel[1].room);
  assert.ok(duel.every(s=>!s.competitive));
  await host.waitForFunction(()=>window.__ssRuntime.world.renowner.model);
  await host.locator('#arena-gate').waitFor({state:'hidden'});
  await host.screenshot({path:path('court-matchmade-duel')});
  evidence.duel=duel;

  stage='private Outerworks team room';
  latestPage=host;
  await host.evaluate(()=>window.__ssLink.leaveRoom());
  await menu(host);
  await host.locator('#private-button').click();
  await host.locator('[data-private-mode="BREAKTHROUGH"]').click();
  const options=host.locator('#private-options');
  const narrow=await options.isVisible();
  if(narrow) await options.click();
  await host.locator('#private-settings-form [name="worldId"]').selectOption('outerworks');
  await host.locator(narrow ? '#private-create-right' : '#create-room').click();
  await host.waitForFunction(()=>{
    const lobby=window.__ssLink?.roomCode;
    return lobby && document.querySelector('#lobby-world')?.textContent.toLowerCase().includes('outerworks');
  });
  const team=server.roomManager.findByCode(await host.evaluate(()=>window.__ssLink.roomCode));
  assert.equal(team.mode,'BREAKTHROUGH');
  assert.equal(team.worldId,'outerworks');
  assert.ok(team.objectiveState);
  await host.locator('#start-match').click();
  const teamStarted=await snapshot(host,'BREAKTHROUGH','outerworks');
  assert.ok(teamStarted.competitive);
  await host.locator('#arena-gate').waitFor({state:'hidden'});
  await host.screenshot({path:path('outerworks-private-team')});
  evidence.team=teamStarted;
  await host.context().close();
  await guest.context().close();
}

try {
  const proof=process.env.ARENA_PROOF;
  if(!proof || proof==='practice') await practice();
  if(!proof || proof==='bot') await botDuel();
  if(!proof || proof==='online') await online();
  assert.deepEqual(errors,[]);
  await writeFile(join(out,'results-'+(proof||'all')+'.json'),JSON.stringify(evidence,null,2));
  console.log('PASS',JSON.stringify(evidence));
} catch(error) {
  await latestPage?.screenshot({path:path('failure')}).catch(()=>{});
  console.error(stage, error);
  process.exitCode=1;
} finally {
  await browser.close();
  await server.stop();
  await rm(profileDir,{recursive:true,force:true});
}
