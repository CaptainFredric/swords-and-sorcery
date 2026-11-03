// Real Chrome layout evidence, using production TouchControls in a local game.
// The per-state mounted snapshot is an explicit UI fixture, NOT a forged server
// claim or a gameplay firing test; real command routing is tested separately.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const base=(process.env.SIEGE_BROWSER_URL??'http://127.0.0.1:3001').replace(/[/]$/,'');
const output='output/playwright/bi-bye-controls';
await mkdir(output,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'ss-bibye-controls-'));
const port=9297;
const chrome=spawn(process.env.CHROME_BIN??'chromium',[
 '--headless=new','--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader',
 '--remote-allow-origins=*','--window-size=960,560',
 '--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank',
],{stdio:'ignore'});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let ws,id=0;const pending=new Map(),exceptions=[],evidence=[];
async function until(fn,label,attempts=160){
 for(let i=0;i<attempts;i++){try{const found=await fn();if(found)return found;}catch{}await sleep(150);}
 throw Error('Timed out: '+label);
}
async function command(method,params={}){
 const key=++id;
 const result=new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{pending.delete(key);reject(Error(method+' timed out'));},10000);
  pending.set(key,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});
 });
 ws.send(JSON.stringify({id:key,method,params}));return result;
}
async function evalPage(expression){
 const result=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
 if(result.exceptionDetails)throw Error(result.exceptionDetails.text);
 return result.result?.value;
}
async function snap(name){
 const s=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
 await writeFile(output+'/'+name+'.png',Buffer.from(s.data,'base64'));
}
const overlaps=(a,b)=>a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1;
const stateUI=`(() => {
 const r=window.__ssRuntime,t=r.touch;
 const buttons=['attack','siegeSkill','siegeBoth','deploy','siegeWeapon','interact','siegeView','spell'];
 const items=Object.fromEntries(buttons.map(a=>{
  const node=t.buttons[a],rect=node.getBoundingClientRect(),css=getComputedStyle(node);
  return [a,{visible:!node.hidden&&css.display!=='none',rect:{left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom},
   label:node.querySelector('span')?.textContent,icon:node.dataset.icon,disabled:node.getAttribute('aria-disabled')}];
 }));
 return {width:innerWidth,height:innerHeight,items,mounted:t.layer.classList.contains('touch-ballista')};
})()`;
async function show(mode,phase,steel=false,focus='UPPER'){
 return evalPage(`(() => {
  const r=window.__ssRuntime,t=r.touch,now=r.socket.serverNow();
  const local={...r.localAuth,alive:true,operatingBallistaId:'bb-control-capture',operatingRamId:null,
   operatingFightFlightId:null,spell:'${steel?'steel':'fireball'}',spellReadyAt:0};
  const b={...(r.latestSnapshot?.bibyeBallista??{}),id:'bb-control-capture',
   position:{x:0,z:0},health:650,maxHealth:650,retired:false,
   mode:'${mode}',weaponFocus:'${focus}',state:'LOADED',mainBoltLoaded:true,
   smallBoltReady:true,smallBoltReadyAt:0,upperPending:false,upperQueued:false,
   pendingIndependent:null,mobileShotPendingAt:null,combinedUpperPendingAt:null,
   pendingCoupledFromUpper:false,deploymentSupported:true,
   coupling:'INDEPENDENT',heavySkill:null,
   skill:{id:'boltToTheOccasion',phase:'${phase}',readyAt:0,primedAt:now-1,boltIReleasedAt:null}};
  t.setActive(true);
  window.__bibyeActualUpdate(local,now,{snapshot:{...r.latestSnapshot,bibyeBallista:b}});
  return {mode:b.mode,phase:b.skill.phase,focus:b.weaponFocus,steel:Boolean(${steel})};
 })()`);
}
try{
 const page=await until(async()=>{const d=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();return d.find(p=>p.type==='page');},'Chrome CDP');
 ws=new WebSocket(page.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 ws.onmessage=event=>{
  const d=JSON.parse(String(event.data));
  if(d.method==='Runtime.exceptionThrown')exceptions.push(d.params?.exceptionDetails?.text??'browser exception');
  const p=pending.get(d.id);if(!p)return;pending.delete(d.id);
  if(d.error)p.reject(Error(d.error.message));else p.resolve(d.result);
 };
 await command('Page.enable');await command('Runtime.enable');
 await command('Page.navigate',{url:base+'/?debug'});
 await until(()=>evalPage(`document.querySelector('#loading-veil')?.classList.contains('done')`),'menu');
 await until(()=>evalPage(`(() => {
  const offer=document.querySelector('#tutorial-onboarding');
  if(offer&&!offer.hidden)document.querySelector('[data-tutorial-onboarding-skip]')?.click();
  const name=document.querySelector('#player-name');if(name)name.value='Touch Layout Probe';
  const solo=document.querySelector('#solo-menu');if(solo&&!solo.classList.contains('hidden'))return true;
  document.querySelector('#solo-button')?.click();return false;
 })()`),'Solo menu');
 await evalPage(`document.querySelector('#practice-mode').click()`);
 await until(()=>evalPage(`Boolean(window.__ssRuntime?.localAuth&&window.__ssRuntime?.latestSnapshot)`),'Practice Yard',220);
 await evalPage(`(() => {
  const r=window.__ssRuntime;r.enableTouch();r.touch.setActive(true);
  window.__bibyeActualUpdate=r.touch.update.bind(r.touch);
  r.touch.update=()=>{}; // preserve fixture state through the normal render loop
 })()`);
 for(const [width,height] of [[844,390],[568,320],[1024,600]]){
  await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
  await sleep(300);
  for(const [mode,phase,steel,focus] of [['MOBILE','idle',false,'UPPER'],['MOBILE','primed',false,'UPPER'],['DEPLOYED','idle',false,'MAIN'],['DEPLOYED','idle',false,'UPPER'],['DEPLOYED','primed',false,'MAIN'],['DEPLOYED','primed',false,'UPPER'],['DEPLOYED','primed',true,'UPPER']]){
   await show(mode,phase,steel,focus);await sleep(130);
   const view=await evalPage(stateUI);
   assert.equal(view.mounted,true);
   assert.equal(view.width,width);assert.equal(view.height,height);
   const items=view.items,active=Object.entries(items).filter(([k,v])=>v.visible);
   for(const [name,item] of active){
    const a=item.rect;assert.ok(a.left>=-2&&a.top>=-2&&a.right<=width+2&&a.bottom<=height+2,name+' outside viewport');
    for(const [other,otherItem] of active.filter(([k])=>k!==name)){
     assert.equal(overlaps(a,otherItem.rect),false,name+' overlaps '+other);
    }
   }
   const coupledPrimary=mode==='DEPLOYED'&&focus==='MAIN'&&phase!=='primed';
   assert.equal(items.attack.icon,coupledPrimary?'boltBoth':'boltI');
   assert.equal(items.siegeSkill.icon,phase==='primed'?'boltII':'boltToTheOccasion');
   assert.equal(items.deploy.icon,mode==='DEPLOYED'?'ballistaWheel':'boltII');
   assert.equal(items.deploy.label,mode==='DEPLOYED'?'MOBILE':'HEAVY');
   const secondary=phase==='primed'?'skill':mode==='DEPLOYED'&&focus==='UPPER'?'coupled':null;
   assert.equal(items.siegeBoth.visible,Boolean(secondary));
   if(secondary)assert.equal(items.siegeBoth.label,'BOTH');
   assert.equal(items.siegeBoth.icon,'boltBoth');
   assert.equal(items.siegeWeapon.visible,mode==='DEPLOYED');
   if(steel)assert.equal(items.spell.visible,true);
   const name=`${width}x${height}-${mode.toLowerCase()}-${focus.toLowerCase()}-${phase}${steel?'-steel':''}`;
   await snap(name);
   evidence.push({name,...view});
  }
 }
 assert.deepEqual(exceptions,[],'no browser JavaScript exceptions');
 await writeFile(output+'/results.json',JSON.stringify({evidence,exceptions,fixture:'rendered gameplay HUD with test-only mounted snapshots'},null,2));
 console.log('BI-BYE TOUCH BROWSER ACCEPTED: '+evidence.length+' rendered states and screenshots');
}catch(e){
 await writeFile(output+'/failure.json',JSON.stringify({error:e.stack??String(e),exceptions,evidence},null,2));
 await snap('failure').catch(()=>{});throw e;
}finally{
 ws?.close();chrome.kill('SIGTERM');await sleep(400);
 await rm(profile,{recursive:true,force:true}).catch(()=>{});
}
