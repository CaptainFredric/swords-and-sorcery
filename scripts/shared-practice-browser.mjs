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
 for(const b of [host,guest]){
  await waitFor(()=>b.evaluate("window.__ssRuntime?.socket?.status==='online'"),b.label+' multiplayer online',180);
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
 await host.evaluate("window.__ssRuntime?.requestPointerLock()");
 await waitFor(()=>host.evaluate("Boolean(window.__ssRuntime?.input?.enabled)"),'host gameplay focus',80);
 await host.key('W','rawKeyDown');
 await waitFor(()=>host.evaluate("(() => {const r=window.__ssRuntime,p=r.localAuth.position,m=r.latestSnapshot.fightFlight;return Math.hypot(p.x-m.x,p.z-m.z)<2.2;})()"),'host walks physically to the machine',170);
 await host.key('W','keyUp');await host.tap('T');
 await waitFor(()=>guest.evaluate("Boolean(window.__ssRuntime?.latestSnapshot?.fightFlight?.operatorId==='"+hostRoom.id+"')"),'guest sees host operating shared flight',120);
 await host.screenshot('host-mounted');await guest.screenshot('guest-observes-pilot');
 const start=await guest.evaluate("(() => {const r=window.__ssRuntime;return {...r.localAuth.position};})()");
 await guest.evaluate("window.__ssRuntime?.requestPointerLock()");
 await waitFor(()=>guest.evaluate("Boolean(window.__ssRuntime?.input?.enabled)"),'guest gameplay focus');
 await guest.key('W','rawKeyDown');
 await waitFor(()=>host.evaluate("(() => {const r=window.__ssRuntime,p=r.latestSnapshot.players.find(p=>p.id==='"+guestRoom.id+"');return p&&Math.hypot(p.position.x-"+start.x+",p.position.z-"+start.z+")>.65;})()"),'host sees guest physical network locomotion',140);
 await guest.key('W','keyUp');
 // Real guest sword action is replicated while the host operates the machine.
 await guest.send('Input.dispatchMouseEvent',{type:'mousePressed',x:640,y:420,button:'left',clickCount:1});
 await waitFor(()=>host.evaluate("(() => {const r=window.__ssRuntime,p=r.latestSnapshot.players.find(p=>p.id==='"+guestRoom.id+"');return Boolean(p&&(p.attackActive||p.attackCommitted>0));})()"),'host observes guest melee action',110);
 await guest.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:640,y:420,button:'left',clickCount:1});
 await host.send('Input.dispatchMouseEvent',{type:'mousePressed',x:640,y:420,button:'right',clickCount:1});
 await waitFor(()=>guest.evaluate("Boolean(window.__ssRuntime?.latestSnapshot?.fightFlight?.shotSeq>0)"),'guest sees host fire real network repeater',140);
 await host.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:640,y:420,button:'right',clickCount:1});
 const result={roomCode:hostRoom.code,host:hostRoom.id,guest:guestRoom.id,hostAndGuestInSameRoom:true,
  machine:await guest.evaluate("(() => {const m=window.__ssRuntime?.latestSnapshot?.fightFlight;return {id:m.id,operatorId:m.operatorId,shotSeq:m.shotSeq,ammo:m.ammo};})()"),
  players:await host.evaluate("window.__ssRuntime?.latestSnapshot?.players?.filter(p=>p.actorKind==='human').map(p=>({id:p.id,position:p.position,attackCommitted:p.attackCommitted}))"),
  errors:[...host.errors,...guest.errors]};
 await host.screenshot('host-attacks');await guest.screenshot('guest-sees-bolt');
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
