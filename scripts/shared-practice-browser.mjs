// Two independent real Chromium processes join the same server-authoritative
// Practice Yard through ordinary menu and canvas interactions (no state edits).
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const url=(process.env.SHARED_PRACTICE_URL??'http://127.0.0.1:3001').replace(/\/$/,'');
const out='output/playwright/shared-practice';await mkdir(out,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const browsers=[];
async function connectBrowser(label,port){
 const profile=await mkdtemp(join(tmpdir(),'castleward-shared-'+label+'-'));
 const child=spawn(process.env.CHROME_BIN??'chromium',[
  '--headless=new','--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader',
  '--disable-background-timer-throttling','--disable-renderer-backgrounding',
  '--remote-allow-origins=*','--window-size=1280,800','--remote-debugging-port='+port,
  '--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 const b={label,child,profile,ws:null,seq:0,pending:new Map(),stage:'connect',errors:[]};browsers.push(b);
 const debuggerTarget=await waitFor(async()=>{
  const res=await fetch('http://127.0.0.1:'+port+'/json/list');
  return (await res.json()).find(t=>t.type==='page');
 },'debugger ready',180);
 b.ws=new WebSocket(debuggerTarget.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{b.ws.onopen=resolve;b.ws.onerror=reject;});
 b.ws.onmessage=e=>{const packet=JSON.parse(String(e.data));
  if(packet.method==='Runtime.exceptionThrown')b.errors.push(packet.params?.exceptionDetails?.text??'unknown');
  const next=b.pending.get(packet.id);if(!next)return;
  b.pending.delete(packet.id);if(packet.error)next.reject(Error(packet.error.message));else next.resolve(packet.result);
 };
 b.send=(method,params={})=>{const id=++b.seq;return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{b.pending.delete(id);reject(Error('CDP '+method+' timeout'));},13000);
   b.pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});
   b.ws.send(JSON.stringify({id,method,params}));
 });};
 b.evaluate=async expression=>{const r=await b.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error('Chrome expression: '+r.exceptionDetails.text);return r.result?.value;};
 b.key=async(letter,type)=>b.send('Input.dispatchKeyEvent',{type,key:letter.toLowerCase(),code:'Key'+letter.toUpperCase(),windowsVirtualKeyCode:letter.toUpperCase().charCodeAt(0)});
 b.tap=async letter=>{await b.key(letter,'rawKeyDown');await sleep(100);await b.key(letter,'keyUp');};
 b.screenshot=async name=>{const res=await b.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(out+'/'+label+'-'+name+'.png',Buffer.from(res.data,'base64'));};
 await b.send('Page.enable');await b.send('Runtime.enable');await b.send('Page.navigate',{url:url+'/?debug'});
 await waitFor(()=>b.evaluate("document.querySelector('#loading-veil')?.classList.contains('done')"),'menu ready',160);
 return b;
}
// Initial debugger probe must not depend upon a connected WebSocket.
async function waitFor(fn,label,attempts=180){for(let i=0;i<attempts;i++){try{const x=await fn();if(x)return x;}catch{}await sleep(100);}throw Error('Chrome startup: '+label);}
let host=null,guest=null;
try{
 host=await connectBrowser('host',9263);
 guest=await connectBrowser('guest',9264);
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
 await host.evaluate("document.querySelector('#shared-practice-mode').click()");
 const hostRoom=await waitFor(()=>host.evaluate("(() => {const r=window.__ssRuntime,s=r?.latestSnapshot;return s?.sharedPractice&&s?.roomCode&&r.localAuth?.id?{code:s.roomCode,id:r.localAuth.id,mode:s.mode}:null;})()"),'host actual network Practice room');
 assert.equal(hostRoom.mode,'PRACTICE');
 await host.screenshot('shared-room-created');
 await guest.evaluate("document.querySelector('#private-name').value='Practice Guest';document.querySelector('#private-button').click()");
 await guest.evaluate("document.querySelector('#room-code').value='"+hostRoom.code+"';document.querySelector('#join-room').click()");
 const guestRoom=await waitFor(()=>guest.evaluate("(() => {const r=window.__ssRuntime,s=r?.latestSnapshot;return s?.sharedPractice&&r.localAuth?.id?{code:s.roomCode,id:r.localAuth.id,count:s.players?.filter(p=>p.actorKind==='human').length}:null;})()"),'second browser joined live Practice',180);
 assert.equal(guestRoom.code,hostRoom.code);assert.equal(guestRoom.count,2);
 await guest.screenshot('joined-as-guest');
 const invite=await host.evaluate("document.querySelector('#shared-practice-code')?.textContent");
 assert.equal(invite,hostRoom.code,'the real UI must show its own network invitation code');
 // Host uses the actual Practice toolbox, not a fabricated FFA room.
 await host.evaluate("const s=document.querySelector('#practice-siege-type');s.value='fight-and-flight';s.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#practice-build-bibye').click()");
 await waitFor(()=>guest.evaluate("Boolean(window.__ssRuntime?.latestSnapshot?.fightFlight?.id)"),'guest observes same physical machine',100);
 await host.evaluate("(() => {const r=window.__ssRuntime,p=r.localAuth.position,m=r.latestSnapshot.fightFlight;r.input.yaw=Math.atan2(-(m.x-p.x),-(m.z-p.z));})()");
 await host.send('Page.bringToFront');
 await host.send('Input.dispatchMouseEvent',{type:'mousePressed',x:640,y:420,button:'left',clickCount:1});
 await host.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:640,y:420,button:'left',clickCount:1});
 await waitFor(()=>host.evaluate("Boolean(window.__ssRuntime?.input?.enabled)"),'host gameplay focus',80);
 await host.key('W','rawKeyDown');
 await waitFor(()=>host.evaluate("(() => {const r=window.__ssRuntime,p=r.localAuth.position,m=r.latestSnapshot.fightFlight;return Math.hypot(p.x-m.x,p.z-m.z)<2.2;})()"),'host walks physically to the machine',170);
 await host.key('W','keyUp');await host.tap('T');
 await waitFor(()=>guest.evaluate("Boolean(window.__ssRuntime?.latestSnapshot?.fightFlight?.operatorId==='"+hostRoom.id+"')"),'guest sees host operating shared flight',120);
 await host.screenshot('host-mounted');await guest.screenshot('guest-observes-pilot');
 const start=await guest.evaluate("(() => {const r=window.__ssRuntime;return {...r.localAuth.position};})()");
 await guest.send('Page.bringToFront');
 await guest.send('Input.dispatchMouseEvent',{type:'mousePressed',x:640,y:420,button:'left',clickCount:1});
 await guest.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:640,y:420,button:'left',clickCount:1});
 await waitFor(()=>guest.evaluate("Boolean(window.__ssRuntime?.input?.enabled)"),'guest gameplay focus');
 await guest.key('W','rawKeyDown');
 await waitFor(()=>host.evaluate("(() => {const r=window.__ssRuntime,p=r.latestSnapshot.players.find(p=>p.id==='"+guestRoom.id+"');return p&&Math.hypot(p.position.x-"+start.x+",p.position.z-"+start.z+")>.65;})()"),'host sees guest physical network locomotion',140);
 await guest.key('W','keyUp');
 // Real guest sword action is replicated while the host operates the machine.
 await guest.send('Input.dispatchMouseEvent',{type:'mousePressed',x:640,y:420,button:'left',clickCount:1});
 await waitFor(()=>host.evaluate("(() => {const r=window.__ssRuntime,p=r.latestSnapshot.players.find(p=>p.id==='"+guestRoom.id+"');return Boolean(p&&(p.attackActive||p.attackCommitted>0));})()"),'host observes guest melee action',110);
 await guest.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:640,y:420,button:'left',clickCount:1});
 await host.send('Input.dispatchMouseEvent',{type:'mousePressed',x:640,y:420,button:'left',clickCount:1});
 await waitFor(()=>guest.evaluate("Boolean(window.__ssRuntime?.latestSnapshot?.fightFlight?.shotSeq>0)"),'guest sees host fire real network repeater',140);
 await host.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:640,y:420,button:'left',clickCount:1});
 // A real second client must observe mounted RMB sword input without a phantom bolt.
 const beforeSwordShot=await guest.evaluate("window.__ssRuntime?.latestSnapshot?.fightFlight?.shotSeq");
 // Record actual remote rig animation frames, not just a server swing flag.
 await guest.evaluate("(() => {const trace=window.__flightSwordTrace=[];let frames=0;function sample(){const r=window.__ssRuntime,rig=r?.remotePlayers?.rigs?.get('"+hostRoom.id+"'),p=r?.latestSnapshot?.players?.find(p=>p.id==='"+hostRoom.id+"');if(rig)trace.push({clip:rig.visualInstance?.animator?.activeClip,attack:Boolean(p?.attackActive)});if(++frames<500)requestAnimationFrame(sample);}requestAnimationFrame(sample);})()");
 await host.send('Input.dispatchMouseEvent',{type:'mousePressed',x:640,y:420,button:'right',clickCount:1});
 await waitFor(()=>guest.evaluate("(() => {const r=window.__ssRuntime,p=r?.latestSnapshot?.players?.find(p=>p.id==='"+hostRoom.id+"');return Boolean(p&&(p.attackActive||p.attackCommitted>0));})()"),'guest sees genuine mounted sword state',110);
 await host.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:640,y:420,button:'right',clickCount:1});
 assert.equal(await guest.evaluate("window.__ssRuntime?.latestSnapshot?.fightFlight?.shotSeq"),beforeSwordShot,'mounted RMB sword must not fire repeating crossbow');
 await waitFor(()=>guest.evaluate("Boolean((window.__flightSwordTrace??[]).some(s=>s.attack&&/^Slash_[123]$/.test(s.clip??'')))"),
   'real remote Spellblade sword animation agrees with attack state',110);
 // Prepare *personal* Prowess using the real Practice action, not state editing.
 await host.evaluate("document.querySelector('#practice-ultimate').click()");
 await waitFor(()=>guest.evaluate("window.__ssRuntime?.latestSnapshot?.players?.find(p=>p.id==='"+hostRoom.id+"')?.prowess>=100"),
   'real host Prowess readiness replicated',100);
 await host.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
 const rising=await waitFor(()=>guest.evaluate("(() => {const m=window.__ssRuntime?.latestSnapshot?.fightFlight;return m?.y>1.2&&m.rotorRPM>0&&m.flightCharge<100?{y:m.y,charge:m.flightCharge,rpm:m.rotorRPM}:null;})()"),
   'guest observes actual rotor-powered vertical flight',170);
 await host.send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
 await host.key('E','rawKeyDown');
 const run=await waitFor(()=>guest.evaluate("(() => {const m=window.__ssRuntime?.latestSnapshot?.fightFlight;return m?.offensiveRun&&m.runPitch>.08&&Math.hypot(m.velocity?.x??0,m.velocity?.z??0)>4?{pitch:m.runPitch,charge:m.flightCharge,velocity:m.velocity}:null;})()"),
   'guest sees a moving Prowess-powered offensive flight run',140);
 await host.key('E','keyUp');
 await waitFor(()=>guest.evaluate("window.__ssRuntime?.latestSnapshot?.fightFlight?.offensiveRun===false"),
   'remote Dash release stops offensive run',100);
 const beforeEject=await guest.evaluate("(() => {const m=window.__ssRuntime?.latestSnapshot?.fightFlight;return {ammo:m.ammo,debt:m.ammoDebt,id:m.lifecycleId};})()");
 await host.tap('T');
 const ejected=await waitFor(()=>guest.evaluate("(() => {const s=window.__ssRuntime?.latestSnapshot,m=s?.fightFlight,p=s?.players?.find(p=>p.id==='"+hostRoom.id+"');return m?.operatorId===null&&p?.operatingFightFlightId==null&&!p.grounded?{y:p.position.y,velocity:p.velocity,ammo:m.ammo,debt:m.ammoDebt,id:m.lifecycleId}:null;})()"),
   'guest sees genuine airborne ejection and inherited falling velocity',140);
 assert.equal(ejected.id,beforeEject.id);
 assert.equal(ejected.ammo,beforeEject.ammo);
 assert.equal(ejected.debt,beforeEject.debt);
 await waitFor(()=>guest.evaluate("(() => {const s=window.__ssRuntime?.latestSnapshot,p=s?.players?.find(p=>p.id==='"+hostRoom.id+"');return Boolean(p?.grounded&&p.position.y<.2&&p.operatingFightFlightId==null);})()"),
   'ejected Spellblade physically lands in shared room',180);
 await guest.screenshot('guest-flight-landing');
 const livePlayers=await host.evaluate("window.__ssRuntime?.latestSnapshot?.players?.filter(p=>p.actorKind==='human').map(p=>({id:p.id,position:p.position,operating:p.operatingFightFlightId,grounded:p.grounded}))");
 const machineAfterEject=await guest.evaluate("(() => {const m=window.__ssRuntime?.latestSnapshot?.fightFlight;return {id:m.id,operatorId:m.operatorId,shotSeq:m.shotSeq,ammo:m.ammo,ammoDebt:m.ammoDebt};})()");
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
 console.error('[SHARED PRACTICE CHROME FAILED]',e.stack??String(e));
 await writeFile(out+'/failure.json',JSON.stringify({error:String(e),hostErrors:host?.errors,guestErrors:guest?.errors},null,2));
 if(host)await host.screenshot('failure').catch(()=>{});
 if(guest)await guest.screenshot('failure').catch(()=>{});
 throw e;
}finally{
 for(const b of browsers){b.ws?.close();b.child.kill('SIGTERM');}
 await sleep(1100);
 for(const b of browsers)await rm(b.profile,{recursive:true,force:true}).catch(()=>{});
}
