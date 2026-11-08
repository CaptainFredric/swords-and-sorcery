// End-to-end Chrome acceptance: actual Castleward HTML/WebGL client, live
// websocket-backed Solo trial, real sword commands and persistent profile.
// The second wave's deadline is shortened by the TEST SERVER solely to
// exercise overtime without waiting for its provisional full playtest target.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGameServer } from '../server/src/server.mjs';
import { ProfileStore } from '../server/src/ProfileStore.mjs';
import { CdpClient } from './browser-cdp.mjs';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label, tries=160) {
  let last;
  for (let i=0; i<tries; i++) {
    try { const result=await fn(); if(result)return result; }
    catch (error) { last=error; }
    await sleep(140);
  }
  throw new Error('Timed out: '+label+(last?' ('+last.message+')':''));
}
const out='output/playwright/renown-trials';
const tmp=await mkdtemp(join(tmpdir(),'castleward-renown-trials-'));
const browserProfile=join(tmp,'chrome');
const profileDir=join(tmp,'wallet');
await mkdir(out,{recursive:true});
const profileStore=new ProfileStore(profileDir);
const server=createGameServer({port:0,host:'127.0.0.1',profileStore});
let chrome,cdp;
async function evaluate(expression) {
  const r=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
  return r.result?.value;
}
const click=selector=>evaluate('document.querySelector('+JSON.stringify(selector)+')?.click(),true');
async function shot(name){
  const r=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(join(out,name+'.png'),Buffer.from(r.data,'base64'));
}
async function swordDefeat(room, player, bot) {
  // Set up reproducible standing contact without replacing combat resolution:
  // the live browser's sword command must actually kill the server's bot.
  room.inspectionFrozenActors = new Set([bot.id]);
  bot.health = 1;
  bot.guardStamina = 0;
  bot.guarding = false;
  bot.spawnProtectionUntil = -Infinity;
  player.staggerUntil = -Infinity;
  player.recoverUntil = -Infinity;
  for (let attempt = 0; attempt < 8 && bot.alive; attempt++) {
    const yaw = player.yaw;
    bot.position = {
      x: player.position.x - Math.sin(yaw) * 1.2,
      y: player.position.y,
      z: player.position.z - Math.cos(yaw) * 1.2,
    };
    bot.velocity = { x: 0, y: 0, z: 0 };
    await evaluate('window.__ssLink.attack(true), true');
    await sleep(400);
    await evaluate('window.__ssLink.attack(false), true');
    await sleep(350);
  }
  assert.equal(bot.alive, false, 'Real sword input must defeat the actual server Spellblade');
  assert.ok(player.kills > 0, 'Real combat must credit a kill');
  room.inspectionFrozenActors.clear();
}
try {
  await server.start();
  const base='http://127.0.0.1:'+server.address().port;
  const debugPort=9427;
  chrome=spawn(process.env.CHROME_BIN??'chromium',[
    '--headless=new','--no-sandbox','--disable-dev-shm-usage',
    '--enable-unsafe-swiftshader','--remote-allow-origins=*',
    '--remote-debugging-port='+debugPort,'--window-size=1450,900',
    '--user-data-dir='+browserProfile,'about:blank'],{stdio:'ignore'});
  const page=await until(async()=>{
    const r=await fetch('http://127.0.0.1:'+debugPort+'/json/list');
    return (await r.json()).find(page=>page.type==='page');
  },'Chrome CDP');
  cdp=new CdpClient(page.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Page.navigate',{url:base+'/?debug'});
  await until(()=>evaluate("document.querySelector('#loading-veil')?.classList.contains('done')"),
    'full Three.js main menu',190);
  await click('#solo-button');
  await evaluate("document.querySelector('#player-name').value='Trial Knight',true");
  await click('#renown-trials-mode');
  assert.equal(await evaluate("document.querySelector('#solo-selected-title')?.textContent"),'RENOWN TRIALS');
  await click('#renown-trials-mode'); // second activation launches actual selected pursuit
  await until(()=>evaluate("window.__ssLink?.hosting==='remote' && window.__ssLink?.roomCode"),
    'server-authored trial join',240);
  const room=await until(()=>[...server.roomManager.rooms.values()].find(r=>r.mode==='RENOWN_TRIALS'),'server trial room');
  const player=[...room.players.values()].find(p=>p.actorKind==='human');
  assert.equal(player.profileToken?.length,64,'trial must have a connected persistent guest identity');
  await until(()=>room.renownTrial?.phase==='WAVE_ACTIVE','live first wave');
  assert.equal(room.renownTrial.wave.count,1);
  assert.equal(room.players.size,2);
  await until(()=>evaluate("document.querySelector('#renown-trial-hud')?.hidden===false"),'trial HUD visible in Three.js arena');
  await shot('01-live-wave');
  const enemy=room.players.get(room.renownTrial.wave.enemyIds[0]);
  await swordDefeat(room,player,enemy);
  await until(()=>room.renownTrial?.phase==='JUDGMENT','authoritative timely victory');
  await until(()=>room.renownTrial.ledger[0]?.status==='SETTLED','durable server wallet award');
  const balanceAfterWave1=profileStore.open(player.profileToken).profile.balance;
  assert.ok(balanceAfterWave1>0);
  assert.equal(room.renownTrial.ledger[0].reward,balanceAfterWave1);
  await shot('02-timely-ceremony');
  await until(()=>room.renownTrial.waveIndex===2 && room.renownTrial.phase==='WAVE_ACTIVE',
    'second wave after nonfatal ceremony',150);
  const second=room.renownTrial.wave;
  // Force the server's test deadline into the past. The production director
  // still runs at 30Hz and the client's combat remains real and controllable.
  second.startedAt=server.now()-second.deadlineSec-5;
  second.deadlineAt=server.now()-5;
  await until(()=>room.renownTrial.phase==='WAVE_OVERTIME','live overtime without forced defeat');
  assert.equal(room.state,'PLAYING');
  assert.ok(room.renownTrial.wave.overtimeSec>0);
  const overtimeHUD = await until(async () => {
    const text = await evaluate("document.querySelector('#renown-trial-hud')?.textContent");
    return /OVERTIME/.test(text) ? text : null;
  }, 'client HUD displays OVERTIME');
  assert.match(overtimeHUD,/OVERTIME/);
  await shot('03-overtime-combat');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:780,deviceScaleFactor:1,mobile:true});
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  await shot('04-mobile-overtime-hud');
  await cdp.send('Emulation.clearDeviceMetricsOverride');
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await sleep(200);
  const secondEnemy=room.players.get(second.enemyIds[0]);
  await swordDefeat(room,player,secondEnemy);
  await until(()=>room.renownTrial.phase==='JUDGMENT','single late verdict after last kill');
  assert.equal(room.renownTrial.wave.reward,0);
  assert.equal(room.renownTrial.ledger[1].status,'NOT_AWARDED');
  assert.equal(profileStore.open(player.profileToken).profile.balance,balanceAfterWave1,
    'late judgment must not erase a previously settled reward');
  const ceremonyId=room.renownTrial.ceremony.id;
  assert.equal(room.events.filter(e=>e.type==='renownTrialCeremonyStarted'&&e.ceremonyId===ceremonyId).length<=1,true);
  await shot('05-late-ceremony');
  await writeFile(join(out,'results.json'),JSON.stringify({
    verdict:room.renownTrial.wave.verdict,ceremonyId,
    firstWaveRealSwordKill:true,secondWaveRealSwordKill:true,
    overtimeContinued:true,walletBalance:balanceAfterWave1,
    earlierAwardPreserved:true,headlessChrome:true
  },null,2));
  console.log('PASS: actual Three.js Chrome + websocket Solo, real sword defeats, two wave transitions, durable award and continuing overtime');
}catch(error){
  console.error('RENOWN TRIALS BROWSER ACCEPTANCE FAILED:',error);
  process.exitCode=1;
}finally{
  cdp?.close();
  chrome?.kill('SIGTERM');
  await server.stop().catch(()=>{});
  await rm(tmp,{recursive:true,force:true,maxRetries:12,retryDelay:250}).catch(()=>{});
}
