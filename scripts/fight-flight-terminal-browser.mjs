// Real Chrome/CDP Gate-C3 terminal Valkyrie acceptance against an actual local Practice arena.
// Drives Practice DOM and actual keyboard controls; records screenshots and authoritative state.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const base=(process.env.FAF_TERMINAL_URL??process.env.FAF_BROWSER_URL??'http://127.0.0.1:3001').replace(/\/$/,'');
const chromeBin=process.env.CHROME_BIN??(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'chromium'),port=9247;
const profile=await mkdtemp(join(tmpdir(),'ss-faf-chrome-'));
let stage='Chrome launch';
const folder='output/playwright/fight-flight-terminal';
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
async function down(key){
  const code = key === ' ' ? 'Space' : 'Key' + key.toUpperCase();
  const vk = key === ' ' ? 32 : key.toUpperCase().charCodeAt(0);
  const text = key === ' ' ? ' ' : key.toLowerCase();
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:text,code,text,windowsVirtualKeyCode:vk});
}
async function up(key){
  const code = key === ' ' ? 'Space' : 'Key' + key.toUpperCase();
  const vk = key === ' ' ? 32 : key.toUpperCase().charCodeAt(0);
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:key===' '?' ':key.toLowerCase(),code,windowsVirtualKeyCode:vk});
}
async function tap(key){await down(key);await sleep(90);await up(key);}
async function screenshot(name){const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(folder+'/'+name+'.png',Buffer.from(r.data,'base64'));}
const flightState="(() => {const r=window.__ssRuntime,m=r?.latestSnapshot?.fightFlight,p=r?.localAuth;return {ready:Boolean(m&&r?.flightRenderer?.model),machine:m?{id:m.id,mode:m.mode,x:m.x,y:m.y,z:m.z,charge:m.flightCharge,rotor:m.rotorAngle,operator:m.operatorId,grounded:m.grounded,terminalPrep:m.terminalPrep,terminalDive:m.terminalDive,terminalDiveSpent:m.terminalDiveSpent,health:m.health,runPitch:m.runPitch}:null,player:p?{id:p.id,operating:p.operatingFightFlightId,position:p.position,prowess:p.prowess,ultimate:p.ultimate,alive:p.alive}:null,cam:r?.camera?.position.toArray(),view:r?.siegeView,model:r?.flightRenderer?.model?.name,herald:r?.flightRenderer?.nodes.get('Rear_Banner_Heraldic_Emblem')?.visible,grip:Boolean(r?.flightRenderer?.nodes.get('operator_hand_L_crossbow_grip')),riderVisible:Boolean(r?.remotePlayers?.self?.root?.visible),riderPos:r?.remotePlayers?.self?.root?.position.toArray(),riderPitch:r?.remotePlayers?.self?.root?.rotation.x};})()";
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
 await evaluate("document.querySelector('#player-name').value='Terminal Valkyrie flight probe';document.querySelector('#armory-button').click()");
 await until(()=>evaluate("Boolean(document.querySelector('#armory-ultimates [data-ultimate=\"chivalry\"]'))"),'Chivalry armory choice');
 await evaluate("document.querySelector('#armory-ultimates [data-ultimate=\"chivalry\"]').click()");
 await evaluate("document.querySelector('#armory-back').click();document.querySelector('#solo-button').click()");
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
 await send('Page.bringToFront');
 await evaluate("window.focus()");
 await send('Input.dispatchMouseEvent',{type:'mousePressed',x:640,y:420,button:'left',clickCount:1});
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:640,y:420,button:'left',clickCount:1});
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
 await send('Page.bringToFront');
 await evaluate("window.focus?.(); document.querySelector('canvas')?.focus?.();");
 if(!await evaluate("Boolean(window.__ssRuntime?.input?.enabled)")){
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:640,y:420,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:640,y:420,button:'left',clickCount:1});
  await until(()=>evaluate("Boolean(window.__ssRuntime?.input?.enabled)"),'genuine enabled gameplay input before flight',40);
 }
 await down('W');
 await down(' ');
 await until(async()=>{
  const y=await evaluate("window.__ssRuntime?.latestSnapshot?.fightFlight?.y");
  if(y>1)return true;
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',text:' ',windowsVirtualKeyCode:32,autoRepeat:true});
  return false;
 },'powered flight from actual Space input',160);
 await up('W');
 await up(' ');
 await sleep(420);
 const flying=await evaluate(flightState);await screenshot('03-airborne');

 // Practice's actual Ready Ultimate control supplies a legitimate full Chivalry meter.
 await evaluate("document.querySelector('#practice-ultimate').click()");
 await until(()=>evaluate("(() => {const p=window.__ssRuntime?.localAuth;return p?.ultimate==='chivalry'&&p?.prowess>=100;})()"),'ready unspent Chivalry in Practice',100);
 await up('W');
 await up(' ');
 const beforeChord=await evaluate(flightState);
 assert.ok(beforeChord.machine.y>.5,'must be airborne at terminal input');
 // Observe rendered Spellblade frames across a subsecond terminal dive.
 // Sparse Chrome debugger polls otherwise miss an entire genuine animation.
 await evaluate("(() => {const samples=window.__terminalPitchTrace=[];let frames=0;const sample=()=>{const r=window.__ssRuntime,m=r?.latestSnapshot?.fightFlight,root=r?.remotePlayers?.self?.root;if(m?.terminalDive&&m.runPitch>.2&&root)samples.push({pitch:m.runPitch,rider:root.rotation.x,visible:Boolean(root.visible),resolved:Boolean(m.terminalDive.resolved)});const zones=r?.latestSnapshot?.flightBurnZones;if(zones?.length)(window.__terminalBurnTrace??=[]).push(zones.map(z=>({point:{...z.point},expiresAt:z.expiresAt})));if(++frames<1000)requestAnimationFrame(sample);};requestAnimationFrame(sample);})()");
 await down('E');await down('R');
 await until(()=>evaluate("Boolean(window.__ssRuntime?.latestSnapshot?.fightFlight?.terminalPrep)"),'visible one-second terminal chord preparation',100);
 const prep=await evaluate(flightState);
 assert.equal(prep.machine.terminalDiveSpent,false,'preparation must not pre-consume final dive');
 assert.ok(prep.player.prowess>=100,'precommit meter must remain unspent');
 await screenshot('04-terminal-preparing');
 await until(()=>evaluate("Boolean(window.__ssRuntime?.latestSnapshot?.fightFlight?.terminalDive)"),'real one-second Valkyrie commitment',160);
 const pitchEvidence=await until(()=>evaluate("(() => {const trace=window.__terminalPitchTrace??[],m=window.__ssRuntime?.latestSnapshot?.fightFlight,found=trace.find(s=>s.visible&&s.pitch>.3&&Math.abs(s.rider+s.pitch)<.12);return found?{observed:true,...found}:m?.terminalDive?.resolved?{observed:false,resolved:true}:null;})()"),'rendered Spellblade pitch during physical terminal dive',150);
 assert.equal(pitchEvidence.observed,true,'a real visible rider frame must match chassis pitch, not merely the server state');
 const committed=await evaluate(flightState);
 assert.ok(committed.machine.terminalDiveSpent,'the machine spends one terminal opportunity');
 assert.equal(committed.player.prowess,0,'only the committed dive consumes the ready personal Ultimate');
 await screenshot('05-terminal-committed');
 await up('R');await up('E');
 await until(()=>evaluate("window.__ssRuntime?.latestSnapshot?.fightFlight?.mode==='DESTROYED'"),'physical terminal impact and resolution',220);
 const aftermath=await evaluate("(() => {const r=window.__ssRuntime,s=r?.latestSnapshot,m=s?.fightFlight;return {machine:{id:m?.id,mode:m?.mode,terminalDiveSpent:m?.terminalDiveSpent,resolved:m?.terminalDive?.resolved,impactAt:m?.terminalDive?.impactAt,resolvedAt:m?.terminalDive?.resolvedAt,startedAt:m?.terminalDive?.startedAt},burnZones:s?.flightBurnZones,events:(r?.latestEvents??[]).filter(e=>e.type?.startsWith('fightFlightTerminal'))};})()");
 assert.equal(aftermath.machine.resolved,true,'one authoritative terminal outcome must resolve');
 assert.ok(aftermath.machine.impactAt!=null,'terminal dive must actually hit geometry, not time out suspended in midair');
 assert.ok(aftermath.machine.resolvedAt-aftermath.machine.startedAt<4.5,'the collision must finish the dive promptly');
 // Observe real networked fire while it is alive. Heavy Chrome capture and
 // debugger latency can exceed the seven-second burn lifetime after impact.
 const observedBurn=await evaluate("window.__terminalBurnTrace?.[0]??null");
 const actualBurn=aftermath.burnZones?.length?aftermath.burnZones:observedBurn;
 assert.ok(actualBurn?.length>0,'networked ground fire must exist after real terminal impact');
 assert.ok(Math.abs(actualBurn[0].point.y)<.3,'burning ground must rest on the Practice Yard floor');
 await screenshot('06-terminal-aftermath');
 await writeFile(folder+'/result.json',JSON.stringify({before,mounted,flying,beforeChord,prep,pitchEvidence,pitchTrace:await evaluate('window.__terminalPitchTrace'),burnTrace:await evaluate('window.__terminalBurnTrace'),committed,aftermath,errors},null,2));
 assert.equal(errors.length,0,'Unexpected browser exceptions: '+errors.join('; '));
 console.log('Fight-and-Flight Chrome Gate-C3 terminal acceptance:',JSON.stringify({prepHeld:true,committed:true,spent:committed.machine.terminalDiveSpent,mode:aftermath.machine.mode,burnZones:aftermath.burnZones?.length,errors}));

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