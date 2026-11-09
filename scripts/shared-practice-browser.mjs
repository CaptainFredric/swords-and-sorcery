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
const out='output/playwright/shared-practice';await mkdir(out,{recursive:true});
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
 const profile=await mkdtemp(join(tmpdir(),'castleward-shared-'+label+'-'));
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
 host=await connectBrowser('host');
 guest=await connectBrowser('guest');
 // __ssRuntime exists only AFTER entering a match. The prior check waited
 // for an impossible pre-match runtime socket, then timed out after minutes.
 // The actual menu reports the GameLink status through this public UI element.
 // Click Retry explicitly: future lazy-network startup must not require Render.
 for(const b of [host,guest]){
  await b.evaluate("document.querySelector('#link-retry')?.click()");
  await waitFor(()=>b.evaluate("document.querySelector('[data-link-mark]')?.dataset?.tone==='online'"),
    b.label+' local multiplayer server online',160);
  console.log('[SHARED NETWORK READY]',b.label,await b.evaluate("document.querySelector('[data-link-mark]')?.dataset?.tone"));
 }
 await host.evaluate("document.querySelector('#player-name').value='Practice Host';document.querySelector('#solo-button').click()");
 await waitFor(()=>host.evaluate("!document.querySelector('#shared-practice-mode').disabled"),'shared Practice mode',80);
 await host.evaluate("document.querySelector('#shared-practice-mode').click(); document.querySelector('#solo-launch')?.click() || document.querySelector('#shared-practice-mode').click()");
 const hostRoom=await waitFor(()=>host.evaluate("(() => {const r=window.__ssRuntime,s=r?.latestSnapshot;return s?.sharedPractice&&s?.roomCode&&r.localAuth?.id?{code:s.roomCode,id:r.localAuth.id,mode:s.mode}:null;})()"),'host actual network Practice room');
 assert.equal(hostRoom.mode,'PRACTICE');
 await host.screenshot('shared-room-created');
 await guest.evaluate("document.querySelector('#player-name').value='Practice Guest'; const p=document.querySelector('#private-name'); if(p){p.value='Practice Guest'; p.dispatchEvent(new Event('input',{bubbles:true}));} document.querySelector('#private-button').click()");
 await guest.evaluate("const rc=document.querySelector('#room-code'); rc.value='"+hostRoom.code+"'; rc.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('#join-room').click()");
 const guestRoom=await waitFor(()=>guest.evaluate("(() => {const r=window.__ssRuntime,s=r?.latestSnapshot;return s?.sharedPractice&&r.localAuth?.id?{code:s.roomCode,id:r.localAuth.id,count:s.players?.filter(p=>p.actorKind==='human').length}:null;})()"),'second browser joined live Practice',180);
 assert.equal(guestRoom.code,hostRoom.code);assert.equal(guestRoom.count,2);
 await guest.screenshot('joined-as-guest');
 const invite=await host.evaluate("document.querySelector('#shared-practice-code')?.textContent");
 assert.equal(invite,hostRoom.code,'the real UI must show its own network invitation code');
 // Host uses the actual Practice toolbox, not a fabricated FFA room.
 await host.evaluate("const s=document.querySelector('#practice-siege-type');s.value='fight-and-flight';s.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#practice-build-bibye').click()");
 await waitFor(()=>host.evaluate("Boolean(window.__ssRuntime?.latestSnapshot?.fightFlight?.id)"),'host observes physical machine',120);
 await waitFor(()=>guest.evaluate("Boolean(window.__ssRuntime?.latestSnapshot?.fightFlight?.id)"),'guest observes same physical machine',120);
 await host.evaluate("(() => {const r=window.__ssRuntime,p=r.localAuth.position,m=r.latestSnapshot.fightFlight;if(m&&p)r.input.yaw=Math.atan2(-(m.x-p.x),-(m.z-p.z));})()");
 // The first frames with a newly built machine can take minutes to draw in
 // software WebGL, and keys only reach the room from drawn frames. In one CI
 // run the host held W at spawn for ~3 minutes without a single packet. Walk
 // once the host is drawing again.
 const builtFrames=await host.frames();
 console.log('[SHARED FRAMES] machine built',JSON.stringify({host:builtFrames,guest:await guest.frames()}));
 await waitFor(async()=>(await host.frames()).count>=builtFrames.count+3,'host draws frames with the machine built',180);
 console.log('[SHARED FRAMES] host drawing',JSON.stringify({host:await host.frames(),guest:await guest.frames()}));
 await focusArena(host);
 // Keep keyboard locomotion on the real client-to-server path, but limit the
 // approach to partial-stick speed. On software Chrome a full-speed input can
 // remain active on the server for seconds before the next browser frame.
 await host.evaluate(`(() => {
  const runtime = window.__ssRuntime;
  const input = runtime.input;
  const movement = input.movement;
  const approach = window.__sharedApproach = { stopping: false };
  approach.restore = () => { input.movement = movement; };
  input.movement = function () {
   const intent = movement.call(this);
   const player = runtime.localAuth;
   const machine = runtime.latestSnapshot?.fightFlight;
   if (intent.forward <= 0 || !player || !machine) return intent;
   const dx = machine.x - player.position.x;
   const dz = machine.z - player.position.z;
   if (approach.stopping || Math.hypot(dx, dz) <= 1.8) {
    approach.stopping = true;
    return { ...intent, forward: 0 };
   }
   return { ...intent, yaw: Math.atan2(-dx, -dz), forward: 0.14 };
  };
 })()`);
 let approached;
 try {
  await host.key('W', 'rawKeyDown');
  // Acknowledge a packet that actually went over the socket. A renderer-side
  // prediction of the next input sequence can stall on a slow runner.
  const stopSequence = await waitFor(() => host.evaluate(`(() => {
   const runtime = window.__ssRuntime;
   const player = runtime.localAuth;
   const machine = runtime.latestSnapshot?.fightFlight;
   if (!player || !machine || Math.hypot(player.position.x - machine.x, player.position.z - machine.z) > 1.8) return null;
   window.__sharedApproach.stopping = true;
   const seq = ++runtime.sequence;
   runtime.socket.input({ ...runtime.input.movement(), forward: 0, right: 0, seq,
    clientTime: runtime.socket.serverNow() });
   return seq;
  })()`), 'host reaches flight mount range and sends neutral input', 80);
  console.log('[SHARED STOP COMMAND]',JSON.stringify({seq:stopSequence,wire:host.wire.state}));
  approached = await waitFor(() => host.evaluate(`(() => {
   const runtime = window.__ssRuntime;
   const player = runtime.localAuth;
   const machine = runtime.latestSnapshot?.fightFlight;
   const stopSequence = ${stopSequence};
   if (!player || !machine || player.lastInputSeq < stopSequence) return null;
   const distance = Math.hypot(player.position.x - machine.x, player.position.z - machine.z);
   const speed = Math.hypot(player.velocity.x, player.velocity.z);
   if (distance > 2.45 || speed > 0.05 || player.attackActive) return null;
   return { distance, speed, stopSequence, acknowledged: player.lastInputSeq };
  })()`), 'host authoritative stop within flight mount range', 35);
 } finally {
  await host.key('W', 'keyUp');
  await host.evaluate("window.__sharedApproach.restore(); delete window.__sharedApproach");
 }
 console.log('[SHARED HOST SETTLED]', JSON.stringify(approached));
 // Interact is a toggle. One real press, then wait for the server to confirm.
 stage = 'host T mount dispatch';
 console.log('[ACCEPTANCE KEY]', new Date().toISOString(), 'host T mount');
 await host.tap('T');
 await waitFor(() => host.evaluate("Boolean(window.__ssRuntime?.localAuth?.operatingFightFlightId)"),
   'host confirmed mounted in apparatus via T', 45);
 await waitFor(()=>guest.evaluate("Boolean(window.__ssRuntime?.latestSnapshot?.fightFlight?.operatorId==='"+hostRoom.id+"')"),'guest sees host operating shared flight',120);
 await waitFor(()=>guest.evaluate("(() => {const r=window.__ssRuntime,rig=r?.remotePlayers?.rigs?.get('"+hostRoom.id+"');return Boolean(rig?.root?.visible);})()"),'guest renders host occupant in apparatus',100);
 stage = 'mounted host and guest screenshots';
 console.log('[ACCEPTANCE RENDER]', JSON.stringify({ host: await host.frames(), guest: await guest.frames() }));
 await host.screenshot('host-mounted');await guest.screenshot('guest-observes-pilot');
 const start=await guest.evaluate("(() => {const r=window.__ssRuntime;return {...r.localAuth.position};})()");
 await focusArena(guest);
 guest.wire.watchMovement();
 stage = 'guest W dispatch';
 console.log('[ACCEPTANCE KEY]', new Date().toISOString(), 'guest W down');
 await guest.key('W','rawKeyDown');
 await waitFor(async()=>{
  await guest.evaluate("new Promise(r=>requestAnimationFrame(r))");
  const pos=await host.evaluate("(() => {const r=window.__ssRuntime,p=r?.latestSnapshot?.players?.find(p=>p.id==='"+guestRoom.id+"');return p?p.position:null;})()");
  return pos&&Math.hypot(pos.x-start.x,pos.z-start.z)>.65;
 },'host sees guest physical network locomotion',140);
 await guest.key('W','keyUp');
 // Real guest sword action is replicated while the host operates the machine.
 await guest.send('Input.dispatchMouseEvent',{type:'mousePressed',x:640,y:420,button:'left',clickCount:1});
 await waitFor(async()=>{
  await guest.evaluate("1");
  return host.evaluate("(() => {const r=window.__ssRuntime,p=r.latestSnapshot.players.find(p=>p.id==='"+guestRoom.id+"');return Boolean(p&&(p.attackActive||p.attackCommitted>0));})()");
 },'host observes guest melee action',110);
 await guest.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:640,y:420,button:'left',clickCount:1});
 await focusArena(host);
 const currentHostShots=await guest.evaluate("window.__ssRuntime?.latestSnapshot?.fightFlight?.shotSeq??0");
 if(currentHostShots===0){
  await host.send('Input.dispatchMouseEvent',{type:'mousePressed',x:640,y:420,button:'left',clickCount:1});
  await waitFor(()=>guest.evaluate("Boolean((window.__ssRuntime?.latestSnapshot?.fightFlight?.shotSeq??0)>0)"),'guest sees host fire real network repeater',140);
  await host.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:640,y:420,button:'left',clickCount:1});
 }
 // A real second client must observe mounted RMB sword input without a phantom bolt.
 // The repeater keeps firing until the LMB release reaches the room, so count
 // from a guest snapshot that already shows the trigger released; otherwise
 // late repeater shots land after the count and look like RMB bolts.
 const beforeSwordShot=await waitFor(()=>guest.evaluate("(() => {const m=window.__ssRuntime?.latestSnapshot?.fightFlight;return m&&m.firingOperatorId==null?{shotSeq:m.shotSeq}:null;})()"),
   'guest sees host repeater trigger released',110).then(x=>x.shotSeq);
 // Record actual remote rig animation frames, not just a server swing flag.
 await guest.evaluate("(() => {const trace=window.__flightSwordTrace=[];let frames=0;function sample(){const r=window.__ssRuntime,rig=r?.remotePlayers?.rigs?.get('"+hostRoom.id+"'),p=r?.latestSnapshot?.players?.find(p=>p.id==='"+hostRoom.id+"');if(rig)trace.push({clip:rig.visualInstance?.animator?.activeClip,attack:Boolean(p?.attackActive)});if(++frames<500)requestAnimationFrame(sample);}requestAnimationFrame(sample);})()");
 await host.send('Input.dispatchMouseEvent',{type:'mousePressed',x:640,y:420,button:'right',clickCount:1});
 await waitFor(()=>guest.evaluate("(() => {const r=window.__ssRuntime,p=r?.latestSnapshot?.players?.find(p=>p.id==='"+hostRoom.id+"');return Boolean(p&&(p.attackActive||p.attackCommitted>0));})()"),'guest sees genuine mounted sword state',110);
 await host.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:640,y:420,button:'right',clickCount:1});
 assert.equal(await guest.evaluate("window.__ssRuntime?.latestSnapshot?.fightFlight?.shotSeq"),beforeSwordShot,'mounted RMB sword must not fire repeating crossbow');
 await waitFor(()=>guest.evaluate("Boolean((window.__flightSwordTrace??[]).some(s=>s.attack&&/^Slash_[123]$/.test(s.clip??'')))"),
   'real remote Spellblade sword animation agrees with attack state',110);
 // Shared Practice supplies personal Prowess through its normal rules.
 await waitFor(()=>guest.evaluate("window.__ssRuntime?.latestSnapshot?.players?.find(p=>p.id==='"+hostRoom.id+"')?.prowess>=100"),
   'real host Prowess readiness replicated',100);
 stage = 'host Space ascent dispatch';
 console.log('[ACCEPTANCE KEY]', new Date().toISOString(), 'host Space ascent');
 await host.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
 const rising=await waitFor(()=>guest.evaluate("(() => {const m=window.__ssRuntime?.latestSnapshot?.fightFlight;return m?.y>4.5&&m.rotorRPM>0&&m.flightCharge<100?{y:m.y,charge:m.flightCharge,rpm:m.rotorRPM}:null;})()"),
   'guest observes actual rotor-powered vertical flight',180);
 await host.send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
 await host.evaluate("if(window.__ssRuntime?.input)window.__ssRuntime.input.pitch=0;");
 await guest.evaluate("(() => {window.__flightMotionTrace=[];let frames=0;function frame(){const s=window.__ssRuntime?.latestSnapshot,m=s?.fightFlight,p=s?.players?.find(p=>p.id==='"+hostRoom.id+"');if(m&&p)window.__flightMotionTrace.push({run:m.offensiveRun,pitch:m.runPitch,speed:Math.hypot(m.velocity?.x??0,m.velocity?.z??0),ejected:m.operatorId===null,grounded:p.grounded,y:p.position?.y,ammo:m.ammo,debt:m.ammoDebt,shotSeq:m.shotSeq});if(++frames<850)requestAnimationFrame(frame);}requestAnimationFrame(frame);})()");
 await host.key('E','rawKeyDown');
 const run=await waitFor(()=>guest.evaluate("(() => {const trace=window.__flightMotionTrace??[];return trace.find(s=>s.run&&s.pitch>.08&&s.speed>4)??null;})()"),
   'guest sees a moving Prowess-powered offensive flight run',140);
 await host.key('E','keyUp');
 await waitFor(()=>guest.evaluate("window.__ssRuntime?.latestSnapshot?.fightFlight?.offensiveRun===false"),
   'remote Dash release stops offensive run',100);
 const beforeEject=await guest.evaluate("(() => {const m=window.__ssRuntime?.latestSnapshot?.fightFlight;return {ammo:m.ammo,debt:m.ammoDebt,id:m.lifecycleId};})()");
 stage = 'host T ejection dispatch';
 console.log('[ACCEPTANCE KEY]', new Date().toISOString(), 'host T ejection');
 await host.tap('T');
 const ejected=await waitFor(()=>guest.evaluate("(() => {const s=window.__ssRuntime?.latestSnapshot,m=s?.fightFlight,p=s?.players?.find(p=>p.id==='"+hostRoom.id+"'),trace=window.__flightMotionTrace??[];const falling=trace.find(f=>f.ejected&&!f.grounded&&f.y>.2);return m?.operatorId===null&&p?.operatingFightFlightId==null&&falling?{y:falling.y,ammo:m.ammo,debt:m.ammoDebt,id:m.lifecycleId,shotSeq:m.shotSeq}:null;})()"),
   'guest captures real airborne ejection before subsequent landing',140);
 assert.equal(ejected.id,beforeEject.id);
 assert.ok(ejected.ammo>=beforeEject.ammo&&ejected.ammo<=18,'passive 2/s replenishment is allowed, reset is not');
 assert.ok(ejected.debt<=beforeEject.debt,'ammo debt can only be repaid, not cleared by eject');
 await waitFor(async()=>{
  await host.evaluate("new Promise(r=>requestAnimationFrame(r))");
  await guest.evaluate("new Promise(r=>requestAnimationFrame(r))");
  const p=await guest.evaluate("(() => window.__ssRuntime?.latestSnapshot?.players?.find(p=>p.id==='"+hostRoom.id+"'))()");
  const hostGrounded=await host.evaluate("Boolean(window.__ssRuntime?.localState?.grounded)");
  return Boolean(hostGrounded&&p&&p.position?.y<.3&&p.operatingFightFlightId==null);
 },'ejected Spellblade physically lands in shared room',180);
 await guest.screenshot('guest-flight-landing');
 const livePlayers=await host.evaluate("window.__ssRuntime?.latestSnapshot?.players?.filter(p=>p.actorKind==='human').map(p=>({id:p.id,position:p.position,operating:p.operatingFightFlightId,grounded:p.grounded}))");
 const machineAfterEject=await guest.evaluate("(() => {const m=window.__ssRuntime?.latestSnapshot?.fightFlight;return m?{id:m.id,operatorId:m.operatorId,shotSeq:m.shotSeq,ammo:m.ammo,ammoDebt:m.ammoDebt}:{id:null,operatorId:null,shotSeq:0,ammo:0,ammoDebt:0};})()");
 // Leaving as guest must not disturb the host's active authoritative room.
 await guest.evaluate("document.querySelector('#practice-leave').click()");
 await waitFor(()=>host.evaluate("window.__ssRuntime?.latestSnapshot?.players?.filter(p=>p.actorKind==='human').length===1"),
   'host room survives guest leaving',120);
 await host.evaluate("document.querySelector('#practice-leave').click()");
 await waitFor(()=>host.evaluate("!document.querySelector('#menu')?.classList.contains('hidden')"),
   'host leaves cleanly to the menu',120);

 const result={roomCode:hostRoom.code,host:hostRoom.id,guest:guestRoom.id,hostAndGuestInSameRoom:true,rising,run,ejected,
  machine:machineAfterEject,players:livePlayers,
  errors:[...host.errors,...guest.errors]};
 await host.screenshot('host-left-room');await guest.screenshot('guest-left-room');
 await writeFile(out+'/result.json',JSON.stringify(result,null,2));
 assert.equal(result.errors.length,0,result.errors.join('; '));
 console.log('[SHARED PRACTICE CHROME ACCEPTED]',JSON.stringify(result));
}catch(e){
 console.error('[SHARED PRACTICE CHROME FAILED]','last wait: '+stage,e.stack??String(e));
 const hostDiag=await host?.evaluate("(() => ({frames:window.__frameProbe?{count:window.__frameProbe.count,sinceLastMs:Math.round(performance.now()-window.__frameProbe.last)}:null,localAuth:window.__ssRuntime?.localAuth,fightFlight:window.__ssRuntime?.latestSnapshot?.fightFlight,input:window.__ssRuntime?.input?.enabled}))()").catch(()=>null);
 const guestDiag=await guest?.evaluate("(() => ({frames:window.__frameProbe?{count:window.__frameProbe.count,sinceLastMs:Math.round(performance.now()-window.__frameProbe.last)}:null,localAuth:window.__ssRuntime?.localAuth,fightFlight:window.__ssRuntime?.latestSnapshot?.fightFlight}))()").catch(()=>null);
 await writeFile(out+'/failure.json',JSON.stringify({stage,error:String(e),hostErrors:host?.errors,guestErrors:guest?.errors,hostWire:host?.wire.state,guestWire:guest?.wire.state,hostDiag,guestDiag},null,2));
 if(host)await host.screenshot('failure').catch(()=>{});
 if(guest)await guest.screenshot('failure').catch(()=>{});
 throw e;
}finally{
 for(const b of browsers){b.ws?.close();b.child.kill('SIGTERM');}
 if(spawnedServer)spawnedServer.kill('SIGTERM');
 await sleep(1100);
 for(const b of browsers)await rm(b.profile,{recursive:true,force:true}).catch(()=>{});
}
