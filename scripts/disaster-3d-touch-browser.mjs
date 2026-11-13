// End-to-end mobile Full Gale + Full Lightning: real one-finger Ultimate
// hold -> drag to a different upward 3D destination -> release -> server blink.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {createGameServer} from '../server/src/server.mjs';
import {launchAcceptanceChrome} from './acceptance-chrome.mjs';
import {CdpClient} from './browser-cdp.mjs';

const output='output/playwright/disaster-3d-touch';
await mkdir(output,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'castleward-touch-3d-'));
const game=createGameServer({host:'127.0.0.1',port:0});
const rt='window.__ssRuntime';
let chrome,cdp;
const evidence={};
async function evaluate(expression){
  const r=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);
  return r.result?.value;
}
async function until(fn,what,ms=30000){
  const end=Date.now()+ms;
  while(Date.now()<end){const value=await fn().catch(()=>null);if(value)return value;await sleep(90);}
  throw Error('Timed out: '+what);
}
const click=selector=>evaluate("document.querySelector("+JSON.stringify(selector)+")?.click()");
async function shot(label){
  const r=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(join(output,label+'.png'),Buffer.from(r.data,'base64'));
}
const touch=(type,x=null,y=null)=>cdp.send('Input.dispatchTouchEvent',{
  type,touchPoints:x===null?[]:[{id:17,x,y,radiusX:5,radiusY:5,force:.7}],
});
async function startPractice(url){
  await cdp.send('Page.navigate',{url:url+'/?debug'});
  await until(()=>evaluate("document.querySelector('#loading-veil')?.classList.contains('done')"),'menu ready',40000);
  await click('[data-tutorial-onboarding-skip]');
  await evaluate("(()=>{const f=document.querySelector('#player-name');f.value='3D Aim Tester';f.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await click('#armory-button');
  await click('#armory-slot-masterstroke');
  // Equip even if the saved browser already selected this Ultimate.
  if(await evaluate("document.querySelector('#plaque-name-masterstroke')?.textContent?.includes('All-Natural Disaster')")){
    await click('[data-ultimate=chivalry]');
    await click('#armory-equip-btn');
  }
  await click('[data-ultimate=one_hit_of_wonders]');
  await click('#armory-equip-btn');
  await click('#armory-inspector-close');
  await click('#armory-back');
  await click('#solo-button');
  await click('#practice-mode');
  if(await evaluate("Boolean(document.querySelector('#solo-launch')?.getClientRects().length)"))
    await click('#solo-launch');
  else await click('#practice-mode');
  await until(()=>evaluate("Boolean("+rt+"?.localAuth?.alive&&"+rt+".localAuth.ultimate==='one_hit_of_wonders')"),
    'Practice actor loaded',35000);
  await until(()=>evaluate("document.querySelector('#arena-gate')?.classList.contains('hidden')"),'arena open');
  await click('#practice-drawer-close');
  await cdp.send('Page.bringToFront');
  await touch('touchStart',422,190);await touch('touchEnd');
  await until(()=>evaluate("Boolean("+rt+"?.input?.enabled)"),'touch controls enabled');
  await click('[data-one-hit-preset=full]');
  await until(()=>evaluate("Boolean("+rt+"?.localAuth?.practiceOneHit?.stages?.gale===2&&"+rt+".localAuth.practiceOneHit.stages.lightning===2)"),
    'Full Gale+Lightning Practice preset confirmed');
}
try{
  await game.start();
  const url='http://127.0.0.1:'+game.address().port;
  chrome=launchAcceptanceChrome(process.env.CHROME_BIN??'chromium',profile,join(output,'chrome.log'),
    {width:844,height:390});
  const target=await chrome.target();
  cdp=new CdpClient(target.webSocketDebuggerUrl);
  await cdp.connect();await cdp.send('Page.enable');await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride',{
    width:844,height:390,deviceScaleFactor:1,mobile:true,
    screenOrientation:{type:'landscapePrimary',angle:90},
  });
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  await startPractice(url);
  await evaluate("(()=>{window.__touchTeleportEvents=[];"+rt+".socket.on('events',m=>{for(const e of m.events??[])if(['oneHitTeleport','oneHitCommitted','oneHitWave','ultimateInterrupted'].includes(e.type))window.__touchTeleportEvents.push(e);});})()");
  const button=await evaluate("(()=>{const b=document.querySelector('.touch-btn[data-action=\"ultimate\"]');const r=b?.getBoundingClientRect();return {x:(r.left+r.right)/2,y:(r.top+r.bottom)/2,w:r.width,h:r.height,visible:!!b&&!b.hidden,active:getComputedStyle(b).pointerEvents};})()");
  assert.ok(button.visible&&button.w>22&&button.h>22,'real visible Ultimate button');
  evidence.button=button;
  await touch('touchStart',button.x,button.y);
  await until(()=>evaluate("Boolean("+rt+"?.localAuth?.ultimateState?.id==='one_hit_of_wonders'&&"+rt+".localAuth.ultimateState.phase==='startup'&&Number.isFinite("+rt+".localAuth.ultimateState.teleportHoldAt))"),
    'actual Full Lightning hold begins');
  await until(()=>evaluate("Boolean("+rt+"?.input.disasterThreeDAim)"),'Full Gale unlocks true vertical look');
  evidence.before=await evaluate("(()=>{const rt="+rt+";return {yaw:rt.input.yaw,pitch:rt.input.pitch,preview:rt.oneHitEffects.teleportTarget.position.toArray(),origin:rt.localAuth.position,gesture:rt.input.ultimateGesture,caption:document.querySelector('.touch-btn[data-action=\"ultimate\"] span')?.textContent};})()");
  assert.equal(evidence.before.gesture,'charge');
  assert.equal(evidence.before.caption,'DRAG TO AIM');
  await evaluate("window.__touchTeleportBeforeYaw="+evidence.before.yaw);
  // The original finger leaves the button's bounds. Pointer capture must
  // preserve the hold while changing BOTH azimuth and elevation.
  const firstX=Math.max(45,Math.min(790,button.x-95));
  const firstY=Math.max(36,button.y-135);
  await touch('touchMove',firstX,firstY);
  const secondX=Math.max(35,firstX-80);
  const secondY=Math.max(20,firstY-90);
  await touch('touchMove',secondX,secondY);
  const aimed=await until(()=>evaluate("(()=>{const rt="+rt+",p=rt.localAuth;const c=rt.oneHitEffects.teleportTarget.position;return p?.ultimateState?.phase==='startup'&&rt.input.ultimateGesture==='charge'&&rt.input.pitch>.5&&Math.abs(Math.atan2(Math.sin(rt.input.yaw-window.__touchTeleportBeforeYaw),Math.cos(rt.input.yaw-window.__touchTeleportBeforeYaw)))>.15&&c.y>p.position.y+3?{yaw:rt.input.yaw,pitch:rt.input.pitch,preview:c.toArray(),origin:{...p.position},aim3D:rt.input.disasterThreeDAim}:null;})()"),
    'thumb drag changes the held 3D destination BEFORE release',15000);
  evidence.aimed=aimed;
  await shot('held-upward-aim');
  await touch('touchEnd');
  const teleport=await until(()=>evaluate("window.__touchTeleportEvents?.find(e=>e.type==='oneHitTeleport')"),
    'actual upward teleport event after thumb release',12000);
  evidence.teleport=teleport;
  assert.ok(!teleport.grounded,'Full Gale ascent arrives in the AIR');
  assert.ok(teleport.to.y>teleport.from.y+3,'actual server-authoritative teleport gains height');
  assert.ok(Math.hypot(teleport.to.x-teleport.from.x,teleport.to.z-teleport.from.z)>2,
    '3D aim is not reduced to a fixed vertical axis');
  // Direction must match the live visual marker. Charge reach may lengthen
  // slightly while the final touch-end event is delivered to the local host.
  const direction=p=>{const v=[p[0],p[1],p[2]],d=Math.hypot(...v)||1;return v.map(x=>x/d);};
  const preview=direction(aimed.preview.map((x,i)=>x-[aimed.origin.x,aimed.origin.y+1.45,aimed.origin.z][i]));
  const actual=direction([teleport.to.x-teleport.from.x,teleport.to.y-teleport.from.y,teleport.to.z-teleport.from.z]);
  assert.ok(preview.reduce((sum,x,i)=>sum+x*actual[i],0)>.90,'arrival follows the DRAGGED guide, not a frozen vector');
  await shot('after-upward-teleport');
  await writeFile(join(output,'result.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log('[3D TOUCH TELEPORT PASS]',JSON.stringify({from:teleport.from,to:teleport.to,aim:aimed,button}));
}catch(e){
  console.error('[3D TOUCH TELEPORT FAIL]',e.stack);
  await writeFile(join(output,'failure.json'),JSON.stringify({error:String(e),evidence},null,2));
  process.exitCode=1;
}finally{
  cdp?.close();chrome?.child?.kill('SIGTERM');
  await game.stop().catch(()=>{});await sleep(300);
  await rm(profile,{recursive:true,force:true}).catch(()=>{});
}
