// Matched Practice playback, exercising the real input controller and shared room.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CdpClient } from './browser-cdp.mjs';

const output='output/playwright/disaster-impact';
await mkdir(output,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'castleward-disaster-impact-'));
const bin=process.env.CHROME_BIN||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'chromium');
const cdpPort=9308;
const chrome=spawn(bin,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader',
  '--remote-allow-origins=*','--window-size=1280,800','--remote-debugging-port='+cdpPort,'--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let cdp;
async function until(fn,label,ms=16000){
  const end=Date.now()+ms;
  while(Date.now()<end){
    const v=await fn().catch(()=>null);
    if(v)return v;
    await sleep(60);
  }
  throw new Error('Timed out: '+label);
}
async function ev(expression){
  const r=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);
  return r.result?.value;
}
const click=selector=>ev(`document.querySelector(${JSON.stringify(selector)})?.click()`);
async function snap(label){
  const r=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(join(output,label+'.png'),Buffer.from(r.data,'base64'));
}
const runtime='window.__ssRuntime';
const actor=runtime+'?.localAuth';
async function load(url,touch){
  if(touch){
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});
    await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true});
  }
  await cdp.send('Page.navigate',{url:url+'/?debug'});
  await until(()=>ev("document.querySelector('#loading-veil')?.classList.contains('done')"),'menu ready',40000);
  await click('[data-tutorial-onboarding-skip]');
  await ev(`(() => {
    const input=document.querySelector('#player-name');
    input.value='Disaster Tester';
    input.dispatchEvent(new Event('input',{bubbles:true}));
  })()`);
  await click('#armory-button');
  await click('#armory-slot-masterstroke');
  // Re-equip after opening a saved Armory. The separately reviewed recovery
  // branch fixes startup synchronization; this fixture also runs on old main.
  if(await ev("document.querySelector('#plaque-name-masterstroke').textContent.includes('All-Natural Disaster')")){
    await click('[data-ultimate=chivalry]');
    await click('#armory-equip-btn');
  }
  await click('[data-ultimate=one_hit_of_wonders]');
  await click('#armory-equip-btn');
  await click('#armory-inspector-close');
  await click('#armory-back');
  await click('#solo-button');
  await click('#practice-mode');
  if(await ev("document.querySelector('#solo-launch').getClientRects().length"))await click('#solo-launch');
  else await click('#practice-mode');
  await until(()=>ev(`${actor}?.ultimate==='one_hit_of_wonders' && ${actor}?.alive`),'equipped Practice actor').catch(async error=>{
    console.error(await ev(`({mode:window.__ssSnapshot?.mode,ultimate:${actor}?.ultimate,
      errors:[...document.querySelectorAll('.error-copy')].map(e=>e.textContent).filter(Boolean),
      armory:document.querySelector('#armory-menu').className,solo:document.querySelector('#solo-menu').className})`));
    throw error;
  });
  await until(()=>ev("document.querySelector('#arena-gate').classList.contains('hidden')"),'arena title lifted');
  await click('#practice-drawer-close');
  await cdp.send('Page.bringToFront');
  if(touch){
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:422,y:195}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }else{
    const xy=await ev(`(() => {const r=document.querySelector('#game-canvas').getBoundingClientRect();return {x:r.x+r.width*.52,y:r.y+r.height*.47};})()`);
    await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',...xy,button:'left',clickCount:1});
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',...xy,button:'left',clickCount:1});
  }
  await until(()=>ev(`${runtime}?.input.enabled`),'arena controls enabled').catch(async error=>{
    console.error(await ev(`({target:document.elementFromPoint(innerWidth/2,innerHeight/2)?.id, canvas:document.querySelector('#game-canvas').getBoundingClientRect().toJSON(),
      locked:!!document.pointerLockElement, touch:${runtime}?.input.touch, suspended:${runtime}?.input.suspended})`));
    throw error;
  });
}
async function press(touch,down){
  if(touch){
    const at=await ev(`(() => {
      const r=document.querySelector('.touch-btn[data-action="ultimate"]').getBoundingClientRect();
      return {x:r.x+r.width/2,y:r.y+r.height/2};
    })()`);
    assert.ok(at.x>0 && at.y>0);
    await cdp.send('Input.dispatchTouchEvent',{type:down?'touchStart':'touchEnd',touchPoints:down?[at]:[]});
  }else await cdp.send('Input.dispatchKeyEvent',{type:down?'rawKeyDown':'keyUp',key:'r',code:'KeyR',windowsVirtualKeyCode:82});
}
async function scenario(url,label,touch,enhanced){
  await load(url,touch);
  // The Practice preset is public UI. The renderer and simulator are never injected.
  await click('[data-one-hit-preset=full]');
  await until(()=>ev(`${actor}?.practiceOneHit?.stages?.lightning===2`),'four Full infusions');
  await press(touch,true);
  await until(()=>ev(`Number.isFinite(${actor}?.ultimateState?.teleportHoldAt)`),'Full Lightning holds on actual input');
  if(enhanced)await until(()=>ev(`${runtime}?.chase>.6 && ${runtime}.oneHitEffects.reticle.visible`),'charging chase and reachable guide');
  await snap(label+'-charge');
  await until(()=>ev(`${runtime}.socket.serverNow()-${actor}.ultimateState.teleportHoldAt>.55`),'half-second charge');
  await press(touch,false);
  await until(()=>ev(`${actor}?.ultimateState?.phase==='active'`),'ground commit on release');
  await until(()=>ev(`${runtime}?.latestSnapshot?.oneHitBurnZones?.length>0`),'authoritative Full Fire zone');
  await snap(label+'-ground');
  await until(()=>ev(`!${actor}?.ultimateState && (${actor}?.recoverUntil??0)<${runtime}.socket.serverNow() &&
    ${runtime}.latestSnapshot.oneHitBurnZones.length===0`),'recovery and ground zone expiry');
  await click('[data-one-hit-action=aerial]');
  await until(()=>ev(`${actor}?.position.y>=4 && !${actor}.grounded`),'aerial Practice start');
  // Match the exact downward aim for the two captures. Cast/release still
  // travel through actual desktop or touch events and authoritative movement.
  await ev(`${runtime}.input.pitch=-.50`);
  await sleep(100);
  await press(touch,true);
  await until(()=>ev(`Number.isFinite(${actor}?.ultimateState?.teleportHoldAt)`),'aerial hold').catch(async e=>{
    console.error(await ev(`({enabled:${runtime}.input.enabled,grounded:${actor}.grounded,
      tiers:${actor}.practiceOneHit, pose:${actor}.position,recovers:${actor}.recoverUntil})`));
    throw e;
  });
  await press(touch,false);
  await until(()=>ev(`${actor}?.ultimateState?.oneHit?.form==='aerial'`),'aerial commitment');
  if(enhanced){
    await until(()=>ev(`${runtime}?.oneHitEffects.zones.size>0 && ${runtime}.oneHitEffects.transients.length>12`),'aerial eruption and ground zone',4000);
    await snap(label+'-aerial-impact');
  }else await snap(label+'-aerial-release');
  await click('#pause-leave');
  await until(()=>ev("!window.__ssLink?.roomCode"),'left Practice');
  console.log('[PLAYED]',label);
  return {label,touch,enhanced,grounded:true,aerial:true};
}

try{
  const target=await until(async()=> (await (await fetch('http://127.0.0.1:'+cdpPort+'/json/list')).json()).find(p=>p.type==='page'),'Chrome');
  cdp=new CdpClient(target.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');await cdp.send('Runtime.enable');
  cdp.on('Runtime.exceptionThrown',e=>console.error('[browser]',e.exceptionDetails?.exception?.description??e.exceptionDetails?.text));
  const base=process.env.DISASTER_BASE_URL;
  const candidate=process.env.DISASTER_CANDIDATE_URL??'http://127.0.0.1:3251';
  const result=[];
  if(base)result.push(await scenario(base,'before-desktop',false,false));
  if(!process.env.DISASTER_TOUCH_ONLY)result.push(await scenario(candidate,'after-desktop',false,true));
  result.push(await scenario(candidate,'after-touch',true,true));
  await writeFile(join(output,'result.json'),JSON.stringify(result,null,2)+'\n');
  console.log(result);
} catch(e){ console.error(e);process.exitCode=1; }
finally{
  cdp?.close();chrome.kill();
  await sleep(500);
  await rm(profile,{recursive:true,force:true,maxRetries:3});
}
