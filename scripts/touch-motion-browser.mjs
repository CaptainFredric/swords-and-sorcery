// Browser DOM/CSS acceptance using the real TouchControls instance inside
// an actual local High Grounds match. No Playwright dependency required.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const base=(process.env.SIEGE_BROWSER_URL??'http://127.0.0.1:3001').replace(/\/$/,'');
const output='output/playwright/touch-motion';
await mkdir(output,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'ss-touch-motion-'));
const port=9263;
const chrome=spawn(process.env.CHROME_BIN??'chromium',['--headless=new','--no-sandbox',
  '--disable-dev-shm-usage','--enable-unsafe-swiftshader','--remote-allow-origins=*',
  '--window-size=960,560','--remote-debugging-port='+port,
  '--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws,id=0;const pending=new Map(),errors=[];
async function until(fn,description,attempts=150){
  for(let n=0;n<attempts;n++){try{const v=await fn();if(v)return v;}catch{}await sleep(125);}
  throw Error('Timed out: '+description);
}
async function command(method,params={}){
  const key=++id;
  const result=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pending.delete(key);reject(Error(method+' timed out'));},10000);
    pending.set(key,{resolve:d=>{clearTimeout(timer);resolve(d);},reject:e=>{clearTimeout(timer);reject(e);}});
  });
  ws.send(JSON.stringify({id:key,method,params}));return result;
}
async function evalPage(expression){
  const d=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(d.exceptionDetails)throw Error(d.exceptionDetails.text);
  return d.result?.value;
}
async function snap(name){
  const s=await command('Page.captureScreenshot',{format:'png'});
  await writeFile(output+'/'+name+'.png',Buffer.from(s.data,'base64'));
}
const uiState=`(() => {
  const t=window.__ssRuntime?.touch, g=t?.motionGuide;
  if(!g)return null;
  const well=g.querySelector('.touch-motion-well'),chevron=well?.querySelector('svg');
  const rect=well?.getBoundingClientRect(),crouch=t.buttons.crouch.getBoundingClientRect();
  const style=getComputedStyle(chevron);
  return {mode:g.dataset.motion,label:t.motionLabel.textContent,active:g.classList.contains('active'),
    pointerEvents:getComputedStyle(g).pointerEvents,animation:style.animationName,
    visible:getComputedStyle(g).display!=='none',wellLeft:rect.left,wellRight:rect.right,
    crouchLeft:crouch.left,crouchRight:crouch.right};
})()`;
async function display(mode){
  return evalPage(`(() => {
    const r=window.__ssRuntime,t=r.touch;
    const local={...r.localAuth,alive:true,sprinting:${mode==='sprinting'?'true':'false'}};
    const snapshot={...r.latestSnapshot};
    if('${mode}'==='charging'){
      local.operatingRamId='test-authoritative-ram';local.operatingBallistaId=null;local.operatingFightFlightId=null;
      snapshot.soFistication={...snapshot.soFistication,id:local.operatingRamId,
        operatorId:local.id,health:1400,charging:true,retired:false};
    }else{local.operatingRamId=null;local.operatingBallistaId=null;local.operatingFightFlightId=null;}
    window.__motionLiveUpdate(local,r.socket.serverNow(),{snapshot});
    return t.motionGuide.dataset.motion;
  })()`);
}
try{
  const page=await until(async()=>{const x=await fetch('http://127.0.0.1:'+port+'/json/list');
    return (await x.json()).find(p=>p.type==='page');},'Chrome CDP',150);
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  ws.onmessage=e=>{
    const d=JSON.parse(String(e.data));
    if(d.method==='Runtime.exceptionThrown')errors.push(d.params?.exceptionDetails?.text??'browser exception');
    const p=pending.get(d.id);if(!p)return;pending.delete(d.id);
    if(d.error)p.reject(Error(d.error.message));else p.resolve(d.result);
  };
  await command('Page.enable');await command('Runtime.enable');
  await command('Page.navigate',{url:base+'/?debug'});
  await until(()=>evalPage("document.querySelector('#loading-veil')?.classList.contains('done')"),'main menu',160);
  await evalPage("document.querySelector('#player-name').value='Motion Probe';document.querySelector('#breakthrough-button').click()");
  await until(()=>evalPage("!document.querySelector('#breakthrough-menu').classList.contains('hidden')"),'team mode menu');
  await evalPage("document.querySelector('[data-arena=high-grounds]').click();document.querySelector('#breakthrough-play-bots').click()");
  await until(()=>evalPage("window.__ssRuntime?.latestSnapshot?.roomState==='PLAYING'"),'live solo match',180);
  await evalPage("window.__ssRuntime.enableTouch();window.__ssRuntime.touch.setActive(true)");
  // Freeze the normal display refresh for deterministic screenshot sampling.
  // Test fixture touches no production code or game state outside the client.
  await evalPage("window.__motionLiveUpdate=window.__ssRuntime.touch.update.bind(window.__ssRuntime.touch);window.__ssRuntime.touch.update=()=>{}");
  const initial=await evalPage(uiState);
  assert.equal(initial.mode,'idle');
  assert.equal(initial.label,'');
  assert.equal(initial.pointerEvents,'none');
  // All assertions below exercise the real exported state decoder through
  // the real TouchControls.update method and browser-computed CSS.
  assert.equal(await display('sprinting'),'sprinting');
  const sprint=await evalPage(uiState);
  assert.equal(sprint.label,'SPRINTING');
  assert.equal(sprint.animation,'touch-motion-rise');
  assert.ok(sprint.wellLeft>sprint.crouchRight,'indicator must clear Crouch hit target');
  await snap('01-sprinting');
  assert.equal(await display('charging'),'charging');
  const charge=await evalPage(uiState);
  assert.equal(charge.label,'CHARGING');
  assert.equal(charge.pointerEvents,'none');
  assert.equal(charge.animation,'touch-motion-rise');
  await snap('02-ram-charging');
  assert.equal(await display('idle'),'idle');
  assert.equal((await evalPage(uiState)).label,'');
  await snap('03-idle-transparent');
  assert.deepEqual(errors,[],'no browser JS exceptions');
  await writeFile(output+'/result.json',JSON.stringify({initial,sprint,charge,errors},null,2));
  console.log('[TOUCH MOTION ACCEPTED]',JSON.stringify({initial:initial.mode,sprint:sprint.label,charge:charge.label}));
}catch(e){
  console.error('[TOUCH MOTION FAILED]',e.stack??String(e));
  await snap('failure').catch(()=>{});
  await writeFile(output+'/failure.json',JSON.stringify({error:String(e),errors},null,2));
  throw e;
}finally{
  ws?.close();chrome.kill('SIGTERM');await sleep(500);
  await rm(profile,{recursive:true,force:true}).catch(()=>{});
}
