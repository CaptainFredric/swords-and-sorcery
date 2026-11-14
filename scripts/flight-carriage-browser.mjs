// Real-Chrome look at the Fight-and-Flight apparatus on the ground (flightGroundCarriage.mjs): Practice, the real
// keys, the real mount; then a walk, a sprint, a stop, a turning walk and a take-off, with the chassis, the rider, the
// stirrups and the aiming eye sampled every frame. --baseline switches the carriage layer off (the machine as it was).
//
//   node scripts/flight-carriage-browser.mjs [--baseline] [--out dir]
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const base=(process.env.FAF_BROWSER_URL??'http://127.0.0.1:3417').replace(/\/$/,'');
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

const chromeBin=process.env.CHROME_BIN??(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'chromium'),port=9251;
const profile=await mkdtemp(join(tmpdir(),'ss-faf-chrome-'));
let stage='Chrome launch';
const args=process.argv.slice(2);const option=(n,f)=>{const i=args.indexOf(n);return i>=0?args[i+1]:f;};
const baseline=args.includes('--baseline');
const folder=option('--out','output/flight-carriage/'+(baseline?'baseline':'carriage'));
await mkdir(folder,{recursive:true});
const chrome=spawn(chromeBin,['--headless=new','--no-sandbox','--disable-dev-shm-usage',
  '--use-angle=metal','--enable-gpu-rasterization','--ignore-gpu-blocklist','--disable-background-timer-throttling',
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
    const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},30000);
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
const flightState="(() => {const r=window.__ssRuntime,m=r?.latestSnapshot?.fightFlight,p=r?.localAuth;return {ready:Boolean(m&&r?.flightRenderer?.model),machine:m?{id:m.id,mode:m.mode,x:m.x,y:m.y,z:m.z,charge:m.flightCharge,rotor:m.rotorAngle,ammo:m.ammo,operator:m.operatorId,grounded:m.grounded,intent:m.verticalIntent}:null,player:p?{id:p.id,operating:p.operatingFightFlightId,position:p.position,flightInputAt:p.flightInputAt}:null,keys:Array.from(r?.input?.keys??[]),blocked:Array.from(r?.input?.blockedKeys??[]),jumpInput:Boolean(r?.input?.movement?.()?.jump),inputEnabled:Boolean(r?.input?.enabled),cam:r?.camera?.position.toArray(),view:r?.siegeView,model:r?.flightRenderer?.model?.name,herald:r?.flightRenderer?.nodes.get('Rear_Banner_Heraldic_Emblem')?.visible,grip:Boolean(r?.flightRenderer?.nodes.get('operator_hand_L_crossbow_grip')),riderVisible:Boolean(r?.remotePlayers?.self?.root?.visible),riderPos:r?.remotePlayers?.self?.root?.position.toArray()};})()";
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
 await evaluate("document.querySelector('#practice-mode').click();document.querySelector('#solo-launch')?.click()||document.querySelector('#practice-mode').click()");
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

 // --- the run: third person, on the ground; a walk, a sprint, a stop, a turning walk, then take-off
 if(await evaluate("window.__ssRuntime?.siegeView")!=='third'){await tap('Z');await until(()=>evaluate("window.__ssRuntime?.siegeView==='third'"),'third-person mounted view',50);}
 if(baseline)await evaluate("(() => {const a=window.__ssRuntime.flightRenderer.animation;a.applyCarriage=()=>{a.carriageOffset=null;a.carriageQ=null;};})()");
 await evaluate(`(() => {
   const r=window.__ssRuntime,f=r.flightRenderer,a=f.animation,THREE_V=a.chassis.position.constructor;
   const trace=window.__carriageTrace=[];let label='settle';window.__carriageLabel=v=>{label=v;};
   const world=n=>{const v=new THREE_V();a.nodes.get(n)?.getWorldPosition(v);return v;};
   function frame(){
     const m=r.latestSnapshot?.fightFlight;
     if(m&&f.model&&trace.length<6000){
       f.group.updateMatrixWorld(true);
       const eye=f.getMountedCameraPosition('sight'),q=a.chassis.quaternion;
       const an=r.remotePlayers?.self?.visualInstance?.animator,pelvis=an?.bones?.get?.('pelvis')??null,footBone=an?.bones?.get?.('footL')??an?.bones?.get?.('foot.L')??null;
       let pelvisY=null;if(pelvis){const v=new THREE_V();pelvis.getWorldPosition(v);pelvisY=v.y;}
       let footGap=null;if(footBone){const v=new THREE_V();footBone.getWorldPosition(v);footGap=v.distanceTo(world('operator_foot_stirrup_L'));}
       const stir=[world('operator_foot_stirrup_L').y,world('operator_foot_stirrup_R').y];
       trace.push({t:performance.now()/1000,label,grounded:m.grounded,mode:m.mode,speed:Math.hypot(m.velocity?.x??0,m.velocity?.z??0),my:m.y,
         chassisY:a.chassis.position.y,pitch:2*Math.atan2(q.x,q.w),roll:2*Math.atan2(q.z,q.w),twist:2*Math.atan2(q.y,q.w),weight:a.carriageOffset?.weight??0,
         clip:a.plan?.posture?.clip??null,footGap,waistY:world('operator_waist_harness_anchor').y,pelvisY,stirrupLow:Math.min(...stir),eyeY:eye?eye.y-m.y:null,
         eyeAhead:eye?Math.hypot(eye.x-m.x,eye.z-m.z):null,hubY:world('Rotor_Hub').y});
     }
     requestAnimationFrame(frame);
   }
   requestAnimationFrame(frame);
 })()`);
 const mark=label=>evaluate("window.__carriageLabel("+JSON.stringify(label)+")");
 const shift=d=>send('Input.dispatchKeyEvent',{type:d?'rawKeyDown':'keyUp',key:'Shift',code:'ShiftLeft',windowsVirtualKeyCode:16,modifiers:d?8:0});
 await sleep(900);
 await mark('walk');await down('W');await sleep(900);await screenshot('01-walk-a');await sleep(240);await screenshot('02-walk-b');await sleep(1400);
 await mark('sprint');await shift(true);await sleep(1100);await screenshot('03-sprint');await sleep(900);await shift(false);
 await mark('stop');await up('W');await sleep(350);await screenshot('04-stopping');await sleep(1700);
 await mark('turn');await down('W');
 for(let i=0;i<45;i++){await evaluate("window.__ssRuntime.input.yaw+=0.045");await sleep(33);if(i===30)await screenshot('05-turning');}
 await up('W');await sleep(1500);
 await mark('takeoff');await down(' ');await sleep(1800);await screenshot('06-airborne');await up(' ');
 await mark('air');await sleep(700);
 const trace=await evaluate("window.__carriageTrace");
 const span=(rows,key)=>{const v=rows.map(r=>r[key]).filter(Number.isFinite);return v.length?+(Math.max(...v)-Math.min(...v)).toFixed(4):null;};
 const mean=(rows,key)=>{const v=rows.map(r=>r[key]).filter(Number.isFinite);return v.length?+(v.reduce((a,b)=>a+b,0)/v.length).toFixed(4):null;};
 const step=(rows,key)=>{let w=0;for(let i=1;i<rows.length;i++)if(Number.isFinite(rows[i][key])&&Number.isFinite(rows[i-1][key]))w=Math.max(w,Math.abs(rows[i][key]-rows[i-1][key]));return +w.toFixed(4);};
 const summary={baseline,frames:trace.length,fps:+(trace.length/(trace.at(-1).t-trace[0].t)).toFixed(1),errors,phases:{}};
 for(const label of ['walk','sprint','stop','turn','takeoff','air']){
   const rows=trace.filter(r=>r.label===label),ground=rows.filter(r=>r.grounded);
   summary.phases[label]={frames:rows.length,grounded:ground.length,topSpeed:+Math.max(0,...rows.map(r=>r.speed)).toFixed(2),clips:[...new Set(rows.map(r=>r.clip))],
     chassisBobM:span(ground.length?ground:rows,'chassisY'),pitchMeanDeg:+(mean(rows,'pitch')*180/Math.PI).toFixed(2),pitchSpanDeg:+(span(rows,'pitch')*180/Math.PI).toFixed(2),
     rollSpanDeg:+(span(rows,'roll')*180/Math.PI).toFixed(2),riderPelvisBobM:span(ground.length?ground:rows,'pelvisY'),
     riderToHarnessGapSpanM:span(ground.map(r=>({g:Number.isFinite(r.pelvisY)?r.pelvisY-r.waistY:NaN})),'g'),riderFootToStirrupSpanM:span(ground,'footGap'),lowestStirrupM:+Math.min(...rows.map(r=>r.stirrupLow-r.my)).toFixed(3),
     aimEyeHeightSpanM:span(ground.length?ground:rows,'eyeY'),aimEyeAheadSpanM:span(ground.length?ground:rows,'eyeAhead'),
     worstChassisStepM:step(rows,'chassisY'),worstPitchStepDeg:+(step(rows,'pitch')*180/Math.PI).toFixed(2),endWeight:rows.at(-1)?.weight};
 }
 await writeFile(folder+'/trace.json',JSON.stringify(trace));
 await writeFile(folder+'/summary.json',JSON.stringify(summary,null,2));
 console.log('[CARRIAGE]',JSON.stringify(summary,null,1));
 assert.deepEqual(errors,[],'no page errors');
}catch(e){console.error('[CARRIAGE FAILED]',stage,e);process.exitCode=1;}
finally{try{ws?.close();}catch{}chrome.kill();spawnedServer?.kill();await rm(profile,{recursive:true,force:true}).catch(()=>{});}
