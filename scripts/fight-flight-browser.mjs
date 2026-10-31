// Real Chrome/CDP Gate-A acceptance against a locally served *PR branch*, not Director Mode.
// Drives Practice DOM and actual keyboard controls; records screenshots and authoritative state.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const base=(process.env.FAF_BROWSER_URL??'http://127.0.0.1:3001').replace(/\/$/,'');
const chromeBin=process.env.CHROME_BIN??(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'chromium'),port=9247;
const profile=await mkdtemp(join(tmpdir(),'ss-faf-chrome-'));
let stage='Chrome launch';
const folder='output/playwright/fight-flight-gate-a';
await mkdir(folder,{recursive:true});
const chrome=spawn(chromeBin,['--headless=new','--no-sandbox','--disable-dev-shm-usage',
  '--enable-unsafe-swiftshader','--remote-allow-origins=*','--window-size=1280,800',
  '--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
let ws,seq=0;const pending=new Map(),errors=[];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,name,limit=300){
  stage=name;const started=Date.now();let lastError=null;
  for(let i=0;i<limit;i++){
    try{const x=await fn();if(x){console.log('[FAF PASS]',name,'after',Date.now()-started,'ms');return x;}}
    catch(e){lastError=e;}
    if(i%25===24)console.log('[FAF WAIT]',name,'attempt',i+1,'elapsed',Date.now()-started,'ms',lastError?.message??'');
    await sleep(100);
  }
  throw Error('Chrome acceptance timed out: '+name+' (elapsed '+(Date.now()-started)+'ms; last error '+(lastError?.message??'none')+')');
}
async function send(method,params={}){
  const id=++seq;
  const promise=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},12000);
    pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});
  });
  ws.send(JSON.stringify({id,method,params}));
  return promise;
}
async function evaluate(expression){
  const x=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(x.exceptionDetails)throw Error(x.exceptionDetails.text);
  return x.result?.value;
}
async function down(key){await send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:key.toLowerCase(),code:'Key'+key.toUpperCase(),windowsVirtualKeyCode:key.toUpperCase().charCodeAt(0)});}
async function up(key){await send('Input.dispatchKeyEvent',{type:'keyUp',key:key.toLowerCase(),code:'Key'+key.toUpperCase(),windowsVirtualKeyCode:key.toUpperCase().charCodeAt(0)});}
async function tap(key){await down(key);await sleep(90);await up(key);}
async function screenshot(name){const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(folder+'/'+name+'.png',Buffer.from(r.data,'base64'));}
const flightState="(() => {const r=window.__ssRuntime,m=r?.latestSnapshot?.fightFlight,p=r?.localAuth;return {ready:Boolean(m&&r?.flightRenderer?.model),machine:m?{id:m.id,mode:m.mode,x:m.x,y:m.y,z:m.z,charge:m.flightCharge,rotor:m.rotorAngle,ammo:m.ammo,operator:m.operatorId,grounded:m.grounded}:null,player:p?{id:p.id,operating:p.operatingFightFlightId,position:p.position}:null,cam:r?.camera?.position.toArray(),view:r?.siegeView,model:r?.flightRenderer?.model?.name,herald:r?.flightRenderer?.nodes.get('Rear_Banner_Heraldic_Emblem')?.visible,grip:Boolean(r?.flightRenderer?.nodes.get('operator_hand_L_crossbow_grip')),riderVisible:Boolean(r?.remotePlayers?.self?.root?.visible),riderPos:r?.remotePlayers?.self?.root?.position.toArray()};})()";
try{
 const target=await until(async()=>{
  const r=await fetch('http://127.0.0.1:'+port+'/json/list');
  return (await r.json()).find(x=>x.type==='page');
 },'Chrome debugging target');
 ws=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 ws.onmessage=e=>{
  const m=JSON.parse(String(e.data));
  if(m.method==='Runtime.exceptionThrown')errors.push(m.params?.exceptionDetails?.text??'uncaught');
  if(!m.id)return;const fn=pending.get(m.id);if(!fn)return;
  pending.delete(m.id);if(m.error)fn.reject(Error(m.error.message));else fn.resolve(m.result);
 };
 await send('Page.enable');await send('Runtime.enable');
 await send('Page.navigate',{url:base+'/?debug'});
 await until(()=>evaluate("document.querySelector('#loading-veil')?.classList.contains('done')"),'fully loaded menu');
 await evaluate("document.querySelector('#player-name').value='Flight browser probe';document.querySelector('#solo-button').click()");
 await until(()=>evaluate("Boolean(document.querySelector('#practice-mode')&&!document.querySelector('#practice-mode').disabled)"),'Practice entry');
 await evaluate("document.querySelector('#practice-mode').click()");
 await until(()=>evaluate("Boolean(window.__ssRuntime?.localAuth && window.__ssRuntime?.playing)"),'Practice arena');
 await evaluate("const s=document.querySelector('#practice-siege-type');s.value='fight-and-flight';s.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#practice-build-bibye').click()");
 await until(async()=>{const s=await evaluate(flightState);return s?.ready&&s.machine;},'authoritative built Fight-and-Flight and canonical GLB');
 const before=await evaluate(flightState);
 assert.equal(before.herald,false,'unapproved trident must be hidden');
 assert.equal(before.grip,true,'authored crossbow hand socket must be present');
 await screenshot('01-built-unmarked');console.log('[FAF] Built machine',JSON.stringify(before));
 // Physically drive the real held movement input toward the operator station.
 await evaluate("(() => {const r=window.__ssRuntime,p=r.localAuth.position,b=r.latestSnapshot.fightFlight; r.input.yaw=Math.atan2(-(b.x-p.x),-(b.z-p.z));})()");
 await send('Input.dispatchMouseEvent',{type:'mousePressed',x:640,y:420,button:'left',clickCount:1});
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:640,y:420,button:'left',clickCount:1});
 // A headless Chrome tab can retain pointer lock across a focus transition
 // while the actual InputController correctly keeps input disabled. Restore
 // the lock through real browser pointer events instead of injecting enabled.
 await send('Page.bringToFront');
 if(await evaluate("Boolean(document.pointerLockElement)&&!window.__ssRuntime?.input?.enabled")){
   await evaluate("document.exitPointerLock?.()");
   await until(()=>evaluate("document.pointerLockElement===null"),'release stale browser pointer lock',40);
   await send('Page.bringToFront');
   await send('Input.dispatchMouseEvent',{type:'mousePressed',x:640,y:420,button:'left',clickCount:1});
   await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:640,y:420,button:'left',clickCount:1});
 }
 await until(()=>evaluate("Boolean(window.__ssRuntime?.input?.enabled)"),'genuine enabled gameplay input',40);
 console.log('[FAF] Focus',await evaluate("({enabled:window.__ssRuntime?.input?.enabled,locked:document.pointerLockElement!=null,playing:window.__ssRuntime?.playing,yaw:window.__ssRuntime?.input?.yaw,keys:window.__ssRuntime?.input?.bindings?.forward,at:window.__ssRuntime?.localAuth?.position})"));
 await down('W');
 await until(async()=>{
  const x=await evaluate("(() => {const r=window.__ssRuntime,p=r.localAuth.position,m=r.latestSnapshot.fightFlight;return {dist:Math.hypot(p.x-m.x,p.z-m.z),position:p,heading:r.input.yaw,enabled:r.input.enabled,forward:r.input.movement().forward};})()");
  if(x?.dist<2.2)return x;
  if(x?.dist>30)throw Error('Moving away from flight machine: '+JSON.stringify(x));
  return false;
 },'walking into mount range',125);
 await up('W');await sleep(120);
 await tap('T');
 await until(()=>evaluate("Boolean(window.__ssRuntime?.localAuth?.operatingFightFlightId)"),'actual mount via T');
 await until(()=>evaluate("Boolean(window.__ssRuntime?.remotePlayers?.self?.root?.visible)"),'third-person genuine Spellblade pilot visible',50);
 const mounted=await evaluate(flightState);await screenshot('02-mounted');
 assert.equal(mounted.riderVisible,true,'the actual Spellblade is drawn inside the wearable apparatus');
 assert.ok(Math.hypot(mounted.riderPos[0]-mounted.machine.x,mounted.riderPos[2]-mounted.machine.z)<.4,'pilot remains fitted to current machine position');
 if(mounted.view!=='sight'){await tap('Z');}
 await until(()=>evaluate("window.__ssRuntime?.siegeView==='sight'"),'authored first-person flight view',50);
 await screenshot('02a-cockpit');
 await tap('Z');await until(()=>evaluate("window.__ssRuntime?.siegeView==='third'"),'return to mounted third-person view',50);
 await down('W');
 await send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
 await until(()=>evaluate("window.__ssRuntime?.latestSnapshot?.fightFlight?.y > 1"),'powered flight from actual Space input',160);
 await sleep(420);
 const flying=await evaluate(flightState);await screenshot('03-airborne');
 // Real mounted left mouse hold must release finite bolts and replenish only at 2/s.
 const startingAmmo=await evaluate("window.__ssRuntime?.latestSnapshot?.fightFlight?.ammo");
 await send('Input.dispatchMouseEvent',{type:'mousePressed',x:640,y:420,button:'left',clickCount:1});
 await until(()=>evaluate("window.__ssRuntime?.latestSnapshot?.fightFlight?.shotSeq > 0"),'live repeater releases a physical bolt',80);
 await screenshot('03b-repeater');
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:640,y:420,button:'left',clickCount:1});
 const afterAmmo=await evaluate("window.__ssRuntime?.latestSnapshot?.fightFlight?.ammo");
 assert.ok(afterAmmo<startingAmmo,'live right-button repeater must consume ammo');
 // The accessible mounted B shortcut must activate the real machine Skill.
 await tap('B');
 await until(()=>evaluate("window.__ssRuntime?.latestSnapshot?.fightFlight?.skill?.phase==='active'"),'mounted B activates Fire Away Skill',45);
 const activeSkill=await evaluate("(() => {const m=window.__ssRuntime?.latestSnapshot?.fightFlight;return {phase:m?.skill?.phase,borrowed:m?.skill?.borrowed,ammoDebt:m?.ammoDebt,readyAt:m?.skill?.readyAt};})()");
 assert.equal(activeSkill.borrowed,0,'activation must not invent borrowed bolts');
 await screenshot('03c-fire-away');
 assert.ok(flying.machine.y>1,'airborne model must move physically');
 assert.ok(flying.machine.charge<before.machine.charge,'ascent spends actual flight charge');
 assert.ok(flying.cam?.[1]>before.cam?.[1],'mounted camera must follow changing altitude');
 assert.equal(flying.machine.operator,flying.player.id);
 // Airborne ejection is now intentional, so first verify a normal powered
 // ascent -> powered descent -> landing while staying seated.
 await up('W');
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
 await down('C');
 await until(()=>evaluate("Boolean(window.__ssRuntime?.latestSnapshot?.fightFlight?.grounded)"),'controlled landing',190);
 await up('C');
 const landed=await evaluate(flightState);await screenshot('04-landed');
 await tap('T');
 await until(()=>evaluate("!window.__ssRuntime?.localAuth?.operatingFightFlightId"),'safe grounded dismount');
 // Reenter through the actual T interaction and validate an actual *airborne*
 // tap-to-eject as a separate physical operation, preserving machine ammo.
 await tap('T');
 await until(()=>evaluate("Boolean(window.__ssRuntime?.localAuth?.operatingFightFlightId)"),'real remount for aerial ejection',75);
 await send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
 await until(()=>evaluate("window.__ssRuntime?.latestSnapshot?.fightFlight?.y>1.1"),'second powered takeoff before aerial ejection',160);
 const beforeEject=await evaluate(flightState);
 await tap('T');
 const ejected=await until(async()=>{const s=await evaluate(flightState);return s.player?.operating===null&&s.machine?.operator===null?s:false;},'real airborne eject',75);
 assert.equal(ejected.machine.id,beforeEject.machine.id);
 assert.ok(ejected.machine.y>.5,'ejection cannot secretly land the machine');
 assert.equal(ejected.machine.ammo,beforeEject.machine.ammo,'ejection cannot reload or regenerate ammo');
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
 const result={before,mounted,flying,activeSkill,landed,after:await evaluate(flightState),errors};
 await writeFile(folder+'/result.json',JSON.stringify(result,null,2));
 assert.equal(errors.length,0,'Browser JS exceptions: '+errors.join('; '));
 console.log('Fight-and-Flight Chrome Gate-A acceptance:',JSON.stringify({takeoff:flying.machine.y,landing:landed.machine.y,charge:flying.machine.charge,model:flying.model,herald:flying.herald,errors}));
}catch(err){
 console.error('[FAF FAILED]',stage,err.stack??String(err));
 const state=ws?await evaluate(flightState).catch(e=>({diagnosticError:String(e)})):null;
 console.error('[FAF FAILED STATE]',JSON.stringify(state));
 await writeFile(folder+'/failure.json',JSON.stringify({stage,error:String(err),state,errors},null,2));
 if(ws)await screenshot('failure').catch(()=>{});
 throw err;
}finally{
 ws?.close();chrome.kill('SIGTERM');
 // Chrome creates profile files during shutdown; never mask gameplay failure with ENOTEMPTY.
 await sleep(900);await rm(profile,{recursive:true,force:true}).catch(e=>console.warn('Chrome profile cleanup:',e.message));
}