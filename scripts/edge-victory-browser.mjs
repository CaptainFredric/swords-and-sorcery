// Live Chrome acceptance with real HTML5 LocalHost simulation, movement input,
// Castleward renderer and desktop/mobile screenshots. Machine setup is a
// disclosed authoritative test fixture; it is not represented as normal spawning.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CdpClient } from './browser-cdp.mjs';

const base=(process.env.SIEGE_BROWSER_URL??'http://127.0.0.1:3001').replace(/\/$/,'');
const out='output/playwright/edge-of-victory';
await mkdir(out,{recursive:true});
const dir=await mkdtemp(join(tmpdir(),'ss-edge-')),port=9326;
const chrome=spawn(process.env.CHROME_BIN??'chromium',['--headless=new','--no-sandbox',
  '--disable-dev-shm-usage','--enable-unsafe-swiftshader','--remote-allow-origins=*',
  '--remote-debugging-port='+port,'--window-size=1440,900',
  '--user-data-dir='+dir,'about:blank'],{stdio:'ignore'});
const exceptions=[],result={scenarios:[],exceptions};
let cdp=null,stage='startup';
const pause=ms=>new Promise(ok=>setTimeout(ok,ms));
async function until(fn,label,tries=180) {
  stage=label;let last;
  for(let i=0;i<tries;i++){try{const v=await fn();if(v)return v;}catch(e){last=e;}await pause(140);}
  throw Error('Timeout '+label+(last?' / '+last.message:''));
}
async function evalPage(expression){
  const r=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);
  return r.result?.value;
}
async function shot(name) {
  const r=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(join(out,name+'.png'),Buffer.from(r.data,'base64'));
}
const probe=()=>evalPage("(() => {"
  +"const r=window.__ssRuntime,s=r?.latestSnapshot,e=s?.edgeOfVictory;"
  +"const p=s?.players?.find(p=>p.id===r?.playerId);"
  +"const visual=r?.edgeRenderer;"
  +"return {mode:s?.mode,state:s?.roomState,world:s?.worldId,"
  +"player:p?.position,alive:p?.alive,health:p?.health,edge:e?.radius,"
  +"remaining:e?.playersRemaining,ring:visual?.active?.geometry?.drawRange?.count??0,"
  +"next:visual?.next?.geometry?.drawRange?.count??0,"
  +"pickups:[...(visual?.pickups?.values()??[])].filter(x=>x.visible).length,"
  +"visible:visual?.group?.visible??false,"
  +"mounted:!!(p?.operatingRamId||p?.operatingBallistaId||p?.operatingFightFlightId),"
  +"predictionError:r?.predictionError??null};})()");
try{
  const page=await until(async()=>{
    const r=await fetch('http://127.0.0.1:'+port+'/json/list');
    return (await r.json()).find(x=>x.type==='page');
  },'Chrome CDP',180);
  cdp=new CdpClient(page.webSocketDebuggerUrl);
  await cdp.connect();
  cdp.on('Runtime.exceptionThrown',e=>exceptions.push(e.exceptionDetails?.exception?.description??
    e.exceptionDetails?.text??'exception'));
  await cdp.send('Page.enable');await cdp.send('Runtime.enable');
  await cdp.send('Page.navigate',{url:base+'/?debug'});
  await until(()=>evalPage("document.querySelector('#loading-veil')?.classList.contains('done')"),'main menu',200);
  await evalPage("document.querySelector('#player-name').value='Edge Witness';document.querySelector('#solo-button').click()");
  await until(()=>evalPage("!document.querySelector('#solo-menu').classList.contains('hidden')"),'solo menu');
  await evalPage("document.querySelector('#edge-of-victory-mode').click()");
  assert.match(await evalPage("document.querySelector('#solo-selected-title').textContent"),/EDGE OF VICTORY/);
  await shot('01-desktop-mode-selection');
  await evalPage("document.querySelector('#solo-launch').click()");
  const first=await until(async()=>{const s=await probe();
    return s?.mode==='EDGE_OF_VICTORY'&&s.state==='PLAYING'&&s.ring>0&&s.visible&&s.pickups>0?s:null;
  },'real battle + visible heraldic marking + spell pickups',210);
  assert.equal(first.remaining,4);
  assert.equal(first.world,'ruined-keep');
  await shot('02-real-desktop-boundary');
  result.scenarios.push({name:'real HTML5 match',first});

  // Move the real authoritative match clock to its small final battleground.
  // Drive feet with genuine CDP keyboard input rather than editing a snapshot.
  await evalPage("(() => {const rt=window.__ssRuntime,room=rt.socket.local.room,"
    +"p=room.players.get(rt.playerId);"
    +"rt.input.enabled=true;rt.input.pointerLocked=true;"
    +"room.edgeOfVictory.startedAt=rt.socket.serverNow()-230;"
    +"p.position={x:7,y:0,z:-1};p.velocity={x:0,y:0,z:0};"
    +"p.spawnProtectionUntil=Infinity;rt.input.yaw=-Math.PI/2;rt.input.pitch=0;"
    +"if(rt.localState){rt.localState.position={...p.position};rt.localState.velocity={x:0,y:0,z:0};}"
    +"return true;})()");
  const before=await until(async()=>{const x=await probe();return x.edge<8.5&&x.player?.x>6.5?x:null;},
    'authoritative small battleground',120);
  await cdp.send('Input.dispatchKeyEvent',
    {type:'rawKeyDown',key:'w',code:'KeyW',windowsVirtualKeyCode:87});
  await pause(750);
  await cdp.send('Input.dispatchKeyEvent',
    {type:'keyUp',key:'w',code:'KeyW',windowsVirtualKeyCode:87});
  const after=await probe();
  const attempted=after.player.x-before.player.x;
  assert.ok(attempted>.08,'real keyboard input must cause forward movement');
  assert.ok(Math.hypot(after.player.x,after.player.z+1)<=after.edge-.38,
    'outward movement stops at the ACTUAL edge');
  assert.equal(after.health,before.health,'boundary never drains health');
  await shot('03-real-desktop-contracted-boundary');
  const correction=await evalPage("(() => {const r=window.__ssRuntime,p=r?.localState?.position,"
    +"s=r?.localAuth?.position;return p&&s?Math.hypot(p.x-s.x,p.z-s.z):null;})()");
  assert.ok(correction===null||correction<1.1,'no runaway client/authority correction');
  result.scenarios.push({name:'real keyboard outward refusal',before,after,attempted,correction});

  // Stage one actual mounted machine in the running room; the game still
  // executes its original dismount mechanism and renders the authored model.
  await evalPage("(async()=>{const rt=window.__ssRuntime,room=rt.socket.local.room,"
    +"p=room.players.get(rt.playerId);"
    +"const mod=await import('/shared/sim/soFistication.mjs');"
    +"room.edgeOfVictory.startedAt=rt.socket.serverNow()-80;"
    +"const m=mod.createSoFistication({id:'edge-browser-ram',x:0,y:0,z:-5,heading:0});"
    +"room.soFistication=m;room.soFistRevision=(room.soFistRevision??0)+1;"
    +"m.operatorId=p.id;p.operatingRamId=m.id;p.position=mod.soFistOperator(m);"
    +"p.velocity={x:0,y:0,z:0};rt.localState.position={...p.position};return true;})()");
  const mounted=await until(async()=>{const x=await probe();return x.mounted?x:null;},
    'real mounted ram state',120);
  await shot('04-real-mounted-ram');
  await evalPage("(async()=>{const rt=window.__ssRuntime,room=rt.socket.local.room;"
    +"const mod=await import('/shared/sim/edgeSiegeDismount.mjs');"
    +"room.soFistication.edgeBlocked=true;"
    +"mod.edgeHandleMountedOperators(room,rt.socket.serverNow());return true;})()");
  const dismounted=await until(async()=>{const x=await probe();return !x.mounted?x:null;},
    'authoritative voluntary ram dismount',120);
  assert.equal(dismounted.alive,true);
  await shot('05-ram-abandoned-on-foot');
  result.scenarios.push({name:'staged ram + real dismount',mounted,dismounted});

  await cdp.send('Emulation.setDeviceMetricsOverride',
    {width:390,height:844,deviceScaleFactor:1,mobile:true});
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  await pause(650);
  const mobile=await probe();
  assert.equal(mobile.mode,'EDGE_OF_VICTORY');
  assert.ok(mobile.visible&&mobile.ring>0);
  await shot('06-mobile-boundary-pickups');
  result.scenarios.push({name:'mobile viewport',mobile});
  if(exceptions.length)throw Error('Browser exceptions: '+exceptions.join(' / '));
  await writeFile(join(out,'metrics.json'),JSON.stringify(result,null,2));
  console.log('PASS: real Edge Chrome desktop/mobile presentation, movement, staged ram dismount');
}catch(error){
  console.error('EDGE BROWSER FAILED',stage,error.stack??error);
  if(cdp)await shot('failure').catch(()=>{});
  await writeFile(join(out,'failure.json'),JSON.stringify({stage,error:String(error),result},null,2));
  process.exitCode=1;
}finally{
  cdp?.close();chrome.kill('SIGTERM');await pause(600);
  await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:150}).catch(()=>{});
}
