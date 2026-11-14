// Two independent real Chromium processes join the same server-authoritative
// Practice Yard through ordinary menu and canvas interactions (no state edits).
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {observeAcceptanceWire} from './browser-acceptance-wire.mjs';
import {launchAcceptanceChrome} from './acceptance-chrome.mjs';
const url=(process.env.SHARED_PRACTICE_URL??'http://127.0.0.1:3001').replace(/\/$/,'');
const out='output/playwright/bibye-argon-v26-remote';await mkdir(out,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

let spawnedServer = null;
try {
  const res = await fetch(url + '/health');
  if (!res.ok) throw new Error('health check not ok');
} catch {
  const p = new URL(url).port || '3001';
  spawnedServer = spawn('node', ['server/src/server.mjs'], {
    env: { ...process.env, PORT: p, HOST: '127.0.0.1' },
    stdio: 'ignore'
  });
  await sleep(1500);
}
const chromeBin=process.env.CHROME_BIN??(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'chromium');
const browsers=[];
async function connectBrowser(label){
 const profile=await mkdtemp(join(tmpdir(),'castleward-bibye-remote-'+label+'-'));
 const {child,target}=launchAcceptanceChrome(chromeBin,profile,join(out,label+'-chrome.log'),
   process.env.CI ? {width:800,height:450} : {});
 const b={label,child,profile,ws:null,seq:0,pending:new Map(),stage:'connect',errors:[]};browsers.push(b);
 b.wire=observeAcceptanceWire(label);
 stage=label+' Chrome debugger startup';
 const debuggerTarget=await target();
 b.ws=new WebSocket(debuggerTarget.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{b.ws.onopen=resolve;b.ws.onerror=reject;});
 b.ws.onmessage=e=>{const packet=JSON.parse(String(e.data));
  b.wire.observe(packet);
  if(packet.method==='Runtime.exceptionThrown')b.errors.push(packet.params?.exceptionDetails?.text??'unknown');
  const next=b.pending.get(packet.id);if(!next)return;
  b.pending.delete(packet.id);if(packet.error)next.reject(Error(packet.error.message));else next.resolve(packet.result);
 };
 b.send=(method,params={})=>{const id=++b.seq;return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{b.pending.delete(id);reject(Error('CDP '+method+' timeout'));},35000);
   b.pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});
   b.ws.send(JSON.stringify({id,method,params}));
 });};
 b.evaluate=async expression=>{const r=await b.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error('Chrome expression: '+r.exceptionDetails.text);return r.result?.value;};
 b.key=async(letter,type)=>b.send('Input.dispatchKeyEvent',{type,key:letter.toLowerCase(),code:'Key'+letter.toUpperCase(),windowsVirtualKeyCode:letter.toUpperCase().charCodeAt(0)});
 b.tap=async letter=>{await b.key(letter,'rawKeyDown');await sleep(100);await b.key(letter,'keyUp');};
 b.screenshot=async name=>{try{const res=await b.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(out+'/'+label+'-'+name+'.png',Buffer.from(res.data,'base64'));}catch(e){console.warn('[CDP SCREENSHOT SKIP] '+label+'-'+name+': '+e.message);}};
 await b.send('Page.enable');await b.send('Runtime.enable');await b.send('Network.enable');
 if(process.env.CI)await b.send('Emulation.setDeviceMetricsOverride',
   {width:800,height:450,deviceScaleFactor:.5,mobile:false});
 await b.send('Page.navigate',{url:url+'/?debug'});
 await waitFor(()=>b.evaluate("document.querySelector('#loading-veil')?.classList.contains('done')"),'menu ready',160);
 // Input packets leave only from the game's render loop, so how often each
 // browser draws is evidence for every movement step (CI renders in software).
 await b.evaluate("(() => {const p=window.__frameProbe={count:0,last:performance.now(),maxGap:0};function f(){const now=performance.now();p.maxGap=Math.max(p.maxGap,now-p.last);p.last=now;p.count++;requestAnimationFrame(f);}requestAnimationFrame(f);})()");
 b.frames=()=>b.evaluate("(() => {const p=window.__frameProbe,r={count:p.count,sinceLastMs:Math.round(performance.now()-p.last),maxGapMs:Math.round(p.maxGap)};p.maxGap=0;return r;})()");
 return b;
}
// Initial debugger probe must not depend upon a connected WebSocket. Used for
// every wait, not only startup, so the error names the step that stalled.
let stage='startup';
async function waitFor(fn, label, attempts = 180) {
 stage = label;
 console.log('[ACCEPTANCE WAIT]', new Date().toISOString(), label);
 for (let i = 0; i < attempts; i++) {
  try {
   const result = await fn();
   if (result) {
    console.log('[ACCEPTANCE OBSERVED]', new Date().toISOString(), label);
    return result;
   }
  } catch {}
  await sleep(100);
 }
 throw Error('Chrome timed out: ' + label);
}
// Switching Chrome clients can release pointer lock. Click the visible
// Resume button or the arena canvas, never a fixed point over the menu.
async function focusArena(browser) {
 await browser.send('Page.bringToFront');
 const target = await browser.evaluate(`(() => {
  window.focus();
  const runtime = window.__ssRuntime;
  if (!runtime?.localAuth) return { leftRoom: true };
  if (runtime.input.enabled) return { enabled: true };
  const pause = document.querySelector('#pause-menu');
  const element = pause && !pause.classList.contains('hidden')
   ? document.querySelector('#resume-game') : runtime.renderer.domElement;
  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const hit = document.elementFromPoint(x, y);
  return { x, y, clickable: element.contains(hit), hit: hit?.id || hit?.tagName };
 })()`);
 assert.ok(!target.leftRoom, browser.label + ' is still in the room');
 if (target.enabled) return;
 assert.ok(target.clickable, browser.label + ' arena focus blocked by ' + target.hit);
 for (const type of ['mousePressed', 'mouseReleased']) {
  await browser.send('Input.dispatchMouseEvent', { type, x: target.x, y: target.y, button: 'left', clickCount: 1 });
 }
 await waitFor(() => browser.evaluate('Boolean(window.__ssRuntime?.input?.enabled)'),
  browser.label + ' gameplay focus', 80);
}

let host=null,guest=null;
try{
 host=await connectBrowser('pilot');
 guest=await connectBrowser('observer');
 for(const b of [host,guest]){
  await b.evaluate("document.querySelector('#link-retry')?.click()");
  await waitFor(()=>b.evaluate("document.querySelector('[data-link-mark]')?.dataset?.tone==='online'"),
    b.label+' network connection ready',180);
 }
 // Equip through a real Armory UI, not an inspection-only player override.
 await host.evaluate("document.querySelector('#armory-button').click()");
 await waitFor(()=>host.evaluate("!document.querySelector('#armory-menu').classList.contains('hidden')"),
   'pilot Armory visible');
 await host.evaluate("document.querySelector('#armory-siege-tab').click();document.querySelector('[data-siege-tab=biBye]').click();document.querySelector('[data-siege-skill=lookAroundAndFindOut]').click()");
 assert.equal(await host.evaluate("document.querySelector('[data-siege-skill=lookAroundAndFindOut]').getAttribute('aria-checked')"),'true');
 await host.evaluate("document.querySelector('#armory-back').click();document.querySelector('#player-name').value='Argon v26 Pilot';document.querySelector('#solo-button').click()");
 await waitFor(()=>host.evaluate("!document.querySelector('#shared-practice-mode').disabled"),'shared Practice mode',80);
 await host.evaluate("document.querySelector('#shared-practice-mode').click();document.querySelector('#solo-launch')?.click()||document.querySelector('#shared-practice-mode').click()");
 const h=await waitFor(()=>host.evaluate("(() => {const r=window.__ssRuntime,s=r?.latestSnapshot;return s?.sharedPractice&&s?.roomCode&&r?.localAuth?.id?{code:s.roomCode,id:r.localAuth.id}:null;})()"),'real network Practice pilot',180);
 await guest.evaluate("document.querySelector('#player-name').value='Argon v26 Observer';const p=document.querySelector('#private-name');if(p){p.value='Argon v26 Observer';p.dispatchEvent(new Event('input',{bubbles:true}));}document.querySelector('#private-button').click()");
 await guest.evaluate("const rc=document.querySelector('#room-code');rc.value='"+h.code+"';rc.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#join-room').click()");
 const g=await waitFor(()=>guest.evaluate("(() => {const r=window.__ssRuntime,s=r?.latestSnapshot;return s?.sharedPractice&&r?.localAuth?.id?{code:s.roomCode,id:r.localAuth.id,count:s.players?.filter(p=>p.actorKind==='human').length}:null;})()"),'actual second Chrome client connected',180);
 assert.equal(g.code,h.code);assert.equal(g.count,2);
 // The existing Practice Foundry is server-authoritative; it places one valid
 // siege engine in a real world. No fake room snapshots or forced operator.
 await host.evaluate("const s=document.querySelector('#practice-siege-type');s.value='bi-bye-llista';s.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#practice-build-bibye').click()");
 await waitFor(()=>host.evaluate("Boolean(window.__ssRuntime?.latestSnapshot?.bibyeBallista?.id)"),'real ballista spawned',140);
 await waitFor(()=>guest.evaluate("Boolean(window.__ssRuntime?.latestSnapshot?.bibyeBallista?.id)"),'observer receives same ballista',140);
 const model=await waitFor(()=>guest.evaluate("(() => {const b=window.__ssRuntime?.world?.biByeLlista;return b?.actions?.has('22_BiBye_A_Sharp_Turn')&&b.actions.has('23_BiBye_Look_Around_Spin_Loop')&&b.actions.has('24_BiBye_Look_Around_Reversed_Fire_Settle')&&b.nodes.has('frame_sweep_volume_L')&&b.nodes.has('frame_sweep_volume_R')?{clips:b.actions.size,hasLocators:true}:null;})()"),'actual v26 GLB and bow locator meshes loaded on second client',180);
 const before=await host.frames();await waitFor(async()=>(await host.frames()).count>=before.count+3,'pilot frames progress',160);
 await focusArena(host);
 // Input stays physical W through GameLink if an approach is necessary. The
 // first legitimate collision-resolved standing spot is ~3.027m from the
 // chassis: demanding <2.85m deadlocks against real machine solids. Stop
 // INSIDE the actual 3.2m interaction radius instead of moving inside wood.
 await host.evaluate("(() => {const rt=window.__ssRuntime,inp=rt.input,original=inp.movement;window.__bibyeApproach={stopped:false,restore:()=>{inp.movement=original}};inp.movement=function(){const move=original.call(this),p=rt.localAuth,b=rt.latestSnapshot?.bibyeBallista;if(!p||!b||move.forward<=0)return move;const dx=b.x-p.position.x,dz=b.z-p.position.z;if(window.__bibyeApproach.stopped||Math.hypot(dx,dz)<=3.10){window.__bibyeApproach.stopped=true;return {...move,forward:0,right:0}}return {...move,forward:.33,right:0,yaw:Math.atan2(-dx,-dz)};};})()");
 let stopSeq=null;
 try{
  await host.key('W','rawKeyDown');
  stopSeq=await waitFor(()=>host.evaluate("(() => {const rt=window.__ssRuntime,p=rt.localAuth,b=rt.latestSnapshot?.bibyeBallista;if(!p||!b||Math.hypot(p.position.x-b.x,p.position.z-b.z)>3.15)return null;window.__bibyeApproach.stopped=true;const seq=++rt.sequence;rt.socket.input({...rt.input.movement(),forward:0,right:0,seq,clientTime:rt.socket.serverNow()});return seq;})()"),'real W approach reaches boarding range',170);
 }finally{
  await host.key('W','keyUp');
  await host.evaluate("window.__bibyeApproach?.restore();delete window.__bibyeApproach");
 }
 await waitFor(()=>host.evaluate("(() => {const r=window.__ssRuntime,p=r?.localAuth,b=r?.latestSnapshot?.bibyeBallista;return p&&b&&p.lastInputSeq>="+stopSeq+"&&Math.hypot(p.position.x-b.x,p.position.z-b.z)<3.2?true:false;})()"),'server acknowledges neutral stop before mount',80);
 const initial=await host.evaluate("(() => {const b=window.__ssRuntime.latestSnapshot.bibyeBallista;return {heading:b.heading,mainYaw:b.mainYaw};})()");
 await host.tap('T');
 await waitFor(()=>host.evaluate("Boolean(window.__ssRuntime?.localAuth?.operatingBallistaId)"),'real physical T mounts pilot',100);
 await waitFor(()=>guest.evaluate("window.__ssRuntime?.latestSnapshot?.bibyeBallista?.operatorId==='"+h.id+"'"),'observer receives real pilot assignment',140);
 await guest.screenshot('observer-mounted-operator');
 await host.screenshot('pilot-mounted');
 // Persist network observations when frame rate is low, including brief
 // one-revolution episodes that are shorter than one guest screenshot.
 await guest.evaluate("(() => {window.__remoteBiBye={events:[],angles:[],states:[]};const rt=window.__ssRuntime;rt.socket.on('events',e=>{window.__remoteBiBye.events.push(...(e?.events??[]).filter(x=>/^(bibyeSweep|bibyeFired|siegeSkill)$/.test(x.type)));});rt.socket.on('snapshot',s=>{const b=(s?.snapshot??s)?.bibyeBallista;if(b?.sweep)window.__remoteBiBye.angles.push({angle:b.sweep.angle,phase:b.sweep.phase,mainYaw:b.mainYaw,heading:b.heading,time:s.serverTime});});})()");
 await host.tap('K');
 await waitFor(()=>guest.evaluate("window.__remoteBiBye.events.some(e=>e.type==='bibyeSweep'&&e.kind==='single'&&e.action==='started')"),'observer receives authoritative single sweep',120);
 await waitFor(()=>guest.evaluate("window.__remoteBiBye.events.some(e=>e.type==='bibyeSweep'&&e.action==='ended')"),'observer receives completed one-turn sweep',120);
 await host.tap('U');
 await waitFor(()=>guest.evaluate("window.__ssRuntime?.latestSnapshot?.bibyeBallista?.sweep?.phase==='loop'"),'observer sees continuous stationary spin',150);
 const observed=await guest.evaluate("(() => {const r=window.__ssRuntime,b=r.latestSnapshot.bibyeBallista,mesh=r.world?.biByeLlista;return {phase:b.sweep.phase,angle:b.sweep.angle,heading:b.heading,mainYaw:b.mainYaw,activeAction:mesh?.activeActionName,loaded:b.mainBoltLoaded,skill:b.skill,observerCount:r.latestSnapshot?.players?.length};})()");
 assert.equal(observed.phase,'loop');
 assert.equal(observed.heading,initial.heading,'carriage chassis stays fixed while main traverse rotates');
 assert.equal(observed.activeAction,'23_BiBye_Look_Around_Spin_Loop','remote renderer samples the real v26 loop');
 assert.ok(observed.skill.readyAt===0,'machine cooldown unspent while looping');
 await guest.screenshot('observer-original-clip23-loop');
 await host.send('Input.dispatchMouseEvent',{type:'mousePressed',x:400,y:230,button:'left',clickCount:1});
 await sleep(130);
 await host.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:400,y:230,button:'left',clickCount:1});
 await waitFor(()=>guest.evaluate("window.__remoteBiBye.events.some(e=>e.type==='bibyeSweep'&&e.action==='ended'&&e.reason==='firing')"),'remote observer sees true Skill stop-to-fire resolution',130);
 const finished=await waitFor(()=>guest.evaluate("(() => {const b=window.__ssRuntime?.latestSnapshot?.bibyeBallista;return !b?.sweep&&b?.skill?.phase==='idle'&&b.skill.readyAt>window.__ssRuntime.latestSnapshot.serverTime?{readyAt:b.skill.readyAt,mainLoaded:b.mainBoltLoaded,heading:b.heading}:null;})()"),'remote observes 24s cooldown after real resolution',130);
 await guest.screenshot('observer-after-physical-settle');
 const proof={roomCode:h.code,pilot:h.id,observer:g.id,model,initial,observed,finished,
   networkEvents:await guest.evaluate("window.__remoteBiBye.events"),
   snapshots:await guest.evaluate("window.__remoteBiBye.angles"),
   errors:[...host.errors,...guest.errors]};
 assert.deepEqual(proof.errors,[]);
 await writeFile(out+'/result.json',JSON.stringify(proof,null,2));
 console.log('[BI-BYE TWO-CLIENT ACCEPTED]',JSON.stringify({room:h.code,model:proof.model,observed:proof.observed,finished:proof.finished,events:proof.networkEvents.length}));
}catch(e){
 console.error('[BI-BYE TWO-CLIENT FAILED]',stage,e.stack??String(e));
 const hostState=await host?.evaluate("(() => ({p:window.__ssRuntime?.localAuth,b:window.__ssRuntime?.latestSnapshot?.bibyeBallista,inputs:window.__ssRuntime?.input?.enabled}))()").catch(()=>null);
 const guestState=await guest?.evaluate("(() => ({p:window.__ssRuntime?.localAuth,b:window.__ssRuntime?.latestSnapshot?.bibyeBallista,visual:window.__ssRuntime?.world?.biByeLlista?.activeActionName,events:window.__remoteBiBye?.events}))()").catch(()=>null);
 await writeFile(out+'/failure.json',JSON.stringify({stage,error:String(e),hostState,guestState},null,2));
 await host?.screenshot('failure');await guest?.screenshot('failure');
 throw e;
}finally{
 for(const b of browsers){b.ws?.close();b.child.kill('SIGTERM');}
 if(spawnedServer)spawnedServer.kill('SIGTERM');
 await sleep(850);
 for(const b of browsers)await rm(b.profile,{recursive:true,force:true}).catch(()=>{});
}
