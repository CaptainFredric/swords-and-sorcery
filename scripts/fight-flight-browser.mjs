// Real Chrome/CDP Gate-A acceptance against a locally served *PR branch*, not Director Mode.
// Drives Practice DOM and actual keyboard controls; records screenshots and authoritative state.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const base=(process.env.FAF_BROWSER_URL??'http://127.0.0.1:3001').replace(/\/$/,'');
const chromeBin=process.env.CHROME_BIN??'chromium',port=9247;
const profile=await mkdtemp(join(tmpdir(),'ss-faf-chrome-'));
const folder='output/playwright/fight-flight-gate-a';
await mkdir(folder,{recursive:true});
const chrome=spawn(chromeBin,['--headless=new','--no-sandbox','--disable-dev-shm-usage',
  '--enable-unsafe-swiftshader','--remote-allow-origins=*','--window-size=1280,800',
  '--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
let ws,seq=0;const pending=new Map(),errors=[];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,name,limit=300){
  for(let i=0;i<limit;i++){try{const x=await fn();if(x)return x;}catch(e){if(i===limit-1)throw e;}await sleep(100);}
  throw Error('Chrome acceptance timed out: '+name);
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
const flightState="(() => {const r=window.__ssRuntime,m=r?.latestSnapshot?.fightFlight,p=r?.localAuth;return {ready:Boolean(m&&r?.flightRenderer?.model),machine:m?{id:m.id,mode:m.mode,x:m.x,y:m.y,z:m.z,charge:m.flightCharge,rotor:m.rotorAngle,operator:m.operatorId,grounded:m.grounded}:null,player:p?{id:p.id,operating:p.operatingFightFlightId,position:p.position}:null,cam:r?.camera?.position.toArray(),view:r?.siegeView,model:r?.flightRenderer?.model?.name,herald:r?.flightRenderer?.nodes.get('Rear_Banner_Heraldic_Emblem')?.visible,grip:Boolean(r?.flightRenderer?.nodes.get('operator_hand_L_crossbow_grip'))};})()";
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
 await screenshot('01-built-unmarked');
 // Physically drive the real held movement input toward the operator station.
 await evaluate("(() => {const r=window.__ssRuntime,p=r.localAuth.position,b=r.latestSnapshot.fightFlight; r.input.yaw=Math.atan2(-(b.x-p.x),-(b.z-p.z));})()");
 await send('Input.dispatchMouseEvent',{type:'mousePressed',x:640,y:420,button:'left',clickCount:1});
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:640,y:420,button:'left',clickCount:1});
 await down('W');
 await until(()=>evaluate("(() => {const r=window.__ssRuntime,p=r.localAuth.position,m=r.latestSnapshot.fightFlight;return Math.hypot(p.x-m.x,p.z-m.z)<2.2;})()"),'walking into mount range',125);
 await up('W');await sleep(120);
 await tap('T');
 await until(()=>evaluate("Boolean(window.__ssRuntime?.localAuth?.operatingFightFlightId)"),'actual mount via T');
 const mounted=await evaluate(flightState);await screenshot('02-mounted');
 await down('W');
 await send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
 await until(()=>evaluate("window.__ssRuntime?.latestSnapshot?.fightFlight?.y > 1"),'powered flight from actual Space input',160);
 await sleep(420);
 const flying=await evaluate(flightState);await screenshot('03-airborne');
 assert.ok(flying.machine.y>1,'airborne model must move physically');
 assert.ok(flying.machine.charge<before.machine.charge,'ascent spends actual flight charge');
 assert.ok(flying.cam?.[1]>before.cam?.[1],'mounted camera must follow changing altitude');
 assert.equal(flying.machine.operator,flying.player.id);
 await tap('T');
 const still=await evaluate(flightState);
 assert.equal(still.player.operating,still.machine.id,'midair T must not eject pilot');
 await up('W');
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
 await down('C');
 await until(()=>evaluate("Boolean(window.__ssRuntime?.latestSnapshot?.fightFlight?.grounded)"),'controlled landing',190);
 await up('C');
 const landed=await evaluate(flightState);await screenshot('04-landed');
 await tap('T');
 await until(()=>evaluate("!window.__ssRuntime?.localAuth?.operatingFightFlightId"),'safe grounded dismount');
 const result={before,mounted,flying,landed,after:await evaluate(flightState),errors};
 await writeFile(folder+'/result.json',JSON.stringify(result,null,2));
 assert.equal(errors.length,0,'Browser JS exceptions: '+errors.join('; '));
 console.log('Fight-and-Flight Chrome Gate-A acceptance:',JSON.stringify({takeoff:flying.machine.y,landing:landed.machine.y,charge:flying.machine.charge,model:flying.model,herald:flying.herald,errors}));
}finally{
 ws?.close();chrome.kill('SIGTERM');
 await rm(profile,{recursive:true,force:true});
}