// Real Chrome/CDP Gate-A acceptance against a locally served *PR branch*, not Director Mode.
// Drives Practice DOM and actual keyboard controls; records screenshots and authoritative state.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const base=(process.env.FAF_BROWSER_URL??'http://127.0.0.1:3001').replace(/\/$/,'');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

let spawnedServer = null;
try {
  const res = await fetch(base + '/health');
  if (!res.ok) throw new Error('health check not ok');
} catch {
  const p = new URL(base).port || '3001';
  spawnedServer = spawn('node', ['server/src/server.mjs'], {
    env: { ...process.env, PORT: p, HOST: '127.0.0.1' },
    stdio: 'ignore'
  });
  await sleep(1500);
}

const chromeBin=process.env.CHROME_BIN??(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'chromium'),port=9247;
const profile=await mkdtemp(join(tmpdir(),'ss-faf-chrome-'));
let stage='Chrome launch';
const folder='output/playwright/fight-flight-valkyrie-steering';
await mkdir(folder,{recursive:true});
const chrome=spawn(chromeBin,['--headless=new','--no-sandbox','--disable-dev-shm-usage',
  '--enable-unsafe-swiftshader','--disable-background-timer-throttling',
  '--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows',
  '--remote-allow-origins=*','--window-size=1280,800',
  '--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
let ws,seq=0;const pending=new Map(),errors=[];
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
  const isSpace = key === ' ';
  const code = isSpace ? 'Space' : 'Key' + key.toUpperCase();
  const vk = isSpace ? 32 : key.toUpperCase().charCodeAt(0);
  const text = isSpace ? ' ' : key.toLowerCase();
  await send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:text,code,windowsVirtualKeyCode:vk});
}
async function up(key){
  const isSpace = key === ' ';
  const code = isSpace ? 'Space' : 'Key' + key.toUpperCase();
  const vk = isSpace ? 32 : key.toUpperCase().charCodeAt(0);
  const text = isSpace ? ' ' : key.toLowerCase();
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:text,code,windowsVirtualKeyCode:vk});
}
async function tap(key){await down(key);await sleep(90);await up(key);}
async function screenshot(name){const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(folder+'/'+name+'.png',Buffer.from(r.data,'base64'));}
const flightState="(() => {const r=window.__ssRuntime,m=r?.latestSnapshot?.fightFlight,p=r?.localAuth;return {ready:Boolean(m&&r?.flightRenderer?.model),machine:m?{id:m.id,mode:m.mode,x:m.x,y:m.y,z:m.z,charge:m.flightCharge,rotor:m.rotorAngle,ammo:m.ammo,operator:m.operatorId,grounded:m.grounded,intent:m.verticalIntent,lastImpactAt:m.lastImpactAt,velocity:m.velocity,heading:m.heading,runPitch:m.runPitch,runFlightPitch:m.runFlightPitch,runTravel:m.runTravel,offensiveRun:m.offensiveRun,dashHeld:m.flightDashHeld}:null,player:p?{id:p.id,operating:p.operatingFightFlightId,position:p.position,flightInputAt:p.flightInputAt}:null,keys:Array.from(r?.input?.keys??[]),blocked:Array.from(r?.input?.blockedKeys??[]),jumpInput:Boolean(r?.input?.movement?.()?.jump),inputEnabled:Boolean(r?.input?.enabled),cam:r?.camera?.position.toArray(),view:r?.siegeView,model:r?.flightRenderer?.model?.name,herald:r?.flightRenderer?.nodes.get('Rear_Banner_Heraldic_Emblem')?.visible,grip:Boolean(r?.flightRenderer?.nodes.get('operator_hand_L_crossbow_grip')),riderVisible:Boolean(r?.remotePlayers?.self?.root?.visible),riderPos:r?.remotePlayers?.self?.root?.position.toArray()};})()";
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
 if(!await evaluate("Boolean(window.__ssRuntime?.input?.enabled && document.pointerLockElement)")){
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:640,y:420,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:640,y:420,button:'left',clickCount:1});
  await until(()=>evaluate("Boolean(window.__ssRuntime?.input?.enabled && document.pointerLockElement)"),'genuine enabled gameplay input before flight',40);
 }
 await up(' ');
 await down(' ');
 await until(async()=>{
  const y=await evaluate("window.__ssRuntime?.latestSnapshot?.fightFlight?.y");
  if(y>1)return true;
  if(!await evaluate("Boolean(window.__ssRuntime?.input?.keys?.has?.('Space'))"))await down(' ');
  return false;
 },'powered flight from actual Space input',160);
 await up(' ');
 await sleep(420);
 const flying=await evaluate(flightState);await screenshot('03-airborne');

 // Execute the *ordinary* E Dash in the actual networked Practice canvas.
 // No Ultimate key is pressed: the separate terminal chord is never attempted.
 await down(' '); // climb high enough for the real attack to descend
 await until(()=>evaluate("window.__ssRuntime?.latestSnapshot?.fightFlight?.y>5.5"),'clearance for a true descending launch',180);
 await up(' ');await sleep(600);
 await evaluate("document.querySelector('#practice-ultimate').click()");
 await until(()=>evaluate("(window.__ssRuntime?.localAuth?.prowess??0)>=99"),'legitimate full Practice Prowess',80);
 await evaluate("window.__ssRuntime.input.pitch=0");
 const ready=await evaluate(flightState);
 const startHeading=ready.machine.heading;
 // The game runs real 30Hz ticks; a CDP round-trip can exceed the complete
 // 360ms launch in software Chrome. Sample every rendered update *in Chrome*,
 // then inspect those immutable authoritative snapshots from CDP.
 await evaluate("(() => {const trace=window.__valkyrieTrace=[];let count=0;const capture=()=>{const r=window.__ssRuntime,m=r?.latestSnapshot?.fightFlight;if(m&&count<2000)trace.push({at:performance.now(),x:m.x,y:m.y,z:m.z,heading:m.heading,vy:m.velocity?.y,runPitch:m.runPitch,runFlightPitch:m.runFlightPitch,travel:m.runTravel,run:Boolean(m.offensiveRun),terminal:Boolean(m.terminalDive)});if(++count<2000)requestAnimationFrame(capture);};requestAnimationFrame(capture);})()");
 await down('E');
 const committed=await until(async()=>{
  const trace=await evaluate("window.__valkyrieTrace?.find(s=>s.run&&s.runPitch>.2&&s.vy<-.35&&s.y<"+JSON.stringify(ready.machine.y)+"-.02)??null");
  return trace?{machine:{...trace,velocity:{y:trace.vy},terminalDive:trace.terminal}}:false;
 },'physical nose-down Valkyrie launch from captured live simulation frames',85);
 assert.ok(committed.machine.y<ready.machine.y,'actual Y descends, not camera alone');
 assert.equal(await evaluate("Boolean(window.__ssRuntime?.latestSnapshot?.fightFlight?.terminalDive)"),false);
 await screenshot('04-valkyrie-physical-dive');
 // The initial reticle changes cannot teleport thrust to the new vector.
 // Hold E to enter the slower, acceleration-limited steering phase.
 await evaluate("window.__ssRuntime.input.yaw="+JSON.stringify(startHeading)+"+Math.PI/2;window.__ssRuntime.input.pitch=.5");
 const curved=await until(async()=>{
  const s=await evaluate(flightState);
  const delta=Math.atan2(Math.sin(s.machine?.heading-startHeading),Math.cos(s.machine?.heading-startHeading));
  const v=s.machine?.velocity;
  const along=v?-Math.sin(s.machine.heading)*v.x-Math.cos(s.machine.heading)*v.z:0;
  return s.machine?.offensiveRun&&delta>.45&&along>3?s:false;
 },'held Dash genuinely turns and accelerates in world space',80);
 assert.ok(Math.atan2(Math.sin(curved.machine.heading-startHeading),Math.cos(curved.machine.heading-startHeading))>.4,'server-owned yaw follows later aim');
 assert.ok(curved.machine.runFlightPitch>-.2,'flight angle starts recovering toward elevation aim');
 await screenshot('05-valkyrie-held-steering');
 await up('E');
 const recovered=await until(async()=>{
  const s=await evaluate(flightState);
  return s.machine&&!s.machine.offensiveRun&&!s.machine.dashHeld?s:false;
 },'released Dash returns to ordinary flight',80);
 assert.equal(recovered.machine.dashHeld,false);
 assert.ok(recovered.machine.runTravel>=10||recovered.machine.grounded||Number.isFinite(recovered.machine.lastImpactAt),
  'short launch must travel 10m unless real collision or landing interrupts it');
 assert.equal(await evaluate("Boolean(window.__ssRuntime?.latestSnapshot?.fightFlight?.terminalDive)"),false);
 await screenshot('06-valkyrie-recovered');
 const trace=await evaluate("window.__valkyrieTrace??[]");
 const result={before,mounted,flying,ready,committed,curved,recovered,trace,
  travelMetres:recovered.machine.runTravel,
  turnRadians:Math.atan2(Math.sin(curved.machine.heading-startHeading),Math.cos(curved.machine.heading-startHeading)),errors};
 await writeFile(folder+'/result.json',JSON.stringify(result,null,2));
 assert.equal(errors.length,0,'Browser exceptions: '+errors.join('; '));
 console.log('[FAF VALKYRIE] world measurements',JSON.stringify({
  travelMetres:result.travelMetres,turnRadians:result.turnRadians,
  initialVerticalVelocity:committed.machine.velocity.y,
  pitch:committed.machine.runPitch,errors}));
}catch(err){
 console.error('[FAF FAILED]',stage,err.stack??String(err));
 const state=ws?await evaluate(flightState).catch(e=>({diagnosticError:String(e)})):null;
 console.error('[FAF FAILED STATE]',JSON.stringify(state));
 await writeFile(folder+'/failure.json',JSON.stringify({stage,error:String(err),state,errors},null,2));
 if(ws)await screenshot('failure').catch(()=>{});
 throw err;
}finally{
 ws?.close();chrome.kill('SIGTERM');
 if(spawnedServer)spawnedServer.kill('SIGTERM');
 // Chrome creates profile files during shutdown; never mask gameplay failure with ENOTEMPTY.
 await sleep(900);await rm(profile,{recursive:true,force:true}).catch(e=>console.warn('Chrome profile cleanup:',e.message));
}