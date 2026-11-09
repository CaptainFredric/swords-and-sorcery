// Two independent real Chromium processes join the same server-authoritative
// Practice Yard through ordinary menu and canvas interactions (no state edits).
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {observeAcceptanceWire} from './browser-acceptance-wire.mjs';
const url=(process.env.MULTIPLAYER_BROWSER_URL??'http://127.0.0.1:3001').replace(/\/$/,'');
const out='output/playwright/multiplayer-reliability';await mkdir(out,{recursive:true});
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
async function connectBrowser(label,port){
 const profile=await mkdtemp(join(tmpdir(),'castleward-multi-'+label+'-'));
 const child=spawn(chromeBin,[
  '--headless=new','--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader',
  '--disable-background-timer-throttling','--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  '--remote-allow-origins=*','--window-size=1280,800','--remote-debugging-port='+port,
  '--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 const b={label,child,profile,ws:null,seq:0,pending:new Map(),stage:'connect',errors:[]};browsers.push(b);
 b.wire=observeAcceptanceWire(label);
 const debuggerTarget=await waitFor(async()=>{
  const res=await fetch('http://127.0.0.1:'+port+'/json/list');
  return (await res.json()).find(t=>t.type==='page');
 },'debugger ready',180);
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
 await b.send('Page.enable');await b.send('Runtime.enable');await b.send('Network.enable');await b.send('Page.navigate',{url:url+'/?debug'});
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

let host=null,guest=null;
const summary="(() => {const r=window.__ssRuntime,s=r?.latestSnapshot,p=r?.localAuth,q=r?.localState,f=window.__frameProbe;return {playing:r?.playing??false,room:s?.roomCode,mode:s?.mode,world:s?.worldId,state:s?.roomState,tick:s?.tick,players:s?.players?.length,auth:p?.position,client:q?.position,grounded:p?.grounded,correction:r?.predictionError,fps:r?.fps,renderer:r?.world?.constructor?.name,inputEnabled:r?.input?.enabled,frameCount:f?.count,maxFrameGapMs:f?.maxGap,finiteCamera:Number.isFinite(r?.camera?.position?.y)};})()";
try {
  host=await connectBrowser('host',9268);
  guest=await connectBrowser('guest',9269);
  for(const b of [host,guest]){
    await b.evaluate("document.querySelector('#link-retry')?.click()");
    await waitFor(()=>b.evaluate("document.querySelector('[data-link-mark]')?.dataset?.tone==='online'"),
      b.label+' multiplayer connection',160);
  }
  await host.evaluate("document.querySelector('#player-name').value='Azure Browser';document.querySelector('#breakthrough-button').click()");
  await waitFor(()=>host.evaluate("!document.querySelector('#breakthrough-menu').classList.contains('hidden')"),
    'Breakthrough map chooser',100);
  await host.evaluate("document.querySelector('[data-arena=high-grounds]').click();document.querySelector('#breakthrough-create-private').click()");
  await waitFor(()=>host.evaluate("!document.querySelector('#private-menu').classList.contains('hidden')"),'Private menu for host',100);
  await host.evaluate("document.querySelector('#create-room').click()");
  const roomCode=await waitFor(()=>host.evaluate("window.__ssLink?.roomCode"),'host creates a real 3v3 High Grounds lobby',120);
  await guest.evaluate("document.querySelector('#player-name').value='Crimson Browser';document.querySelector('#private-button').click()");
  await guest.evaluate("document.querySelector('#private-name').value='Crimson Browser';const code=document.querySelector('#room-code');code.value="+JSON.stringify(roomCode)+";code.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#join-room').click()");
  await waitFor(()=>guest.evaluate("window.__ssLink?.roomCode==="+JSON.stringify(roomCode)), 'guest joins same room',150);
  await host.evaluate("window.__ssLink.ready(true)");
  await guest.evaluate("window.__ssLink.ready(true)");
  await waitFor(()=>host.evaluate("window.__ssRuntime?.latestSnapshot?.roomState==='PLAYING'"), 'host real rendered match',220);
  await waitFor(()=>guest.evaluate("window.__ssRuntime?.latestSnapshot?.roomState==='PLAYING'"), 'guest real rendered match',220);
  const before=await Promise.all([host.evaluate(summary),guest.evaluate(summary)]);
  for(const v of before){
    assert.equal(v.mode,'HIGH_GROUNDS');
    assert.equal(v.world,'high-grounds');
    assert.equal(v.players,6,'two real Chromium clients plus four bot actors');
    assert.equal(v.renderer,'HighGroundsRenderer');
  }
  const samples=[];
  const movedByClient=[];
  // The match advances during slow CDP evaluations. Check displacement on
  // the wire and release W as soon as the authoritative assertion is met.
  for(const b of [host,guest]){
    await b.send('Page.bringToFront');
    await b.evaluate("window.focus(); window.__ssRuntime?.requestPointerLock?.(); window.__ssRuntime?.input?.requestPointerLock?.();");
    if(!await b.evaluate("Boolean(window.__ssRuntime?.input?.enabled)")){
      await b.send('Input.dispatchMouseEvent',{type:'mousePressed',x:450,y:400,button:'left',clickCount:1});
      await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:450,y:400,button:'left',clickCount:1});
    }
    await waitFor(()=>b.evaluate("Boolean(window.__ssRuntime?.input?.enabled)"),b.label+' playable focused input',90);
    // Aim directly along the open 15m-wide central road towards map center (0, 0).
    await b.evaluate("(() => { const r = window.__ssRuntime, p = r?.localAuth?.position; if (r?.input && p) r.input.yaw = Math.atan2(p.x, p.z); })()");
    assert.equal(b.wire.state?.roomState, 'PLAYING', b.label+' must begin W while the match is live');
    assert.ok(b.wire.state?.position, b.label+' has an authoritative starting position');
    b.wire.watchMovement();
    stage = b.label+' W dispatch';
    console.log('[ACCEPTANCE KEY]', new Date().toISOString(), b.label+' W down');
    try {
      await b.key('W','rawKeyDown');
      await waitFor(()=>b.evaluate("window.__ssRuntime?.input?.movement()?.forward>0.5"),
        b.label+' real W key reaches input controller',70);
      const movement = await waitFor(() => {
        if (b.wire.movement.peak > 0.25 || b.wire.state?.roomState === 'FINISHED') return b.wire.movement;
        return null;
      }, b.label+' acknowledged W changes authoritative position', 180);
      assert.ok(movement.peak > 0.25, b.label+' match finished before confirmed W displacement');
      movedByClient.push(movement.peak);
    } finally {
      await b.key('W','keyUp');
      console.log('[ACCEPTANCE KEY]', new Date().toISOString(), b.label+' W up');
    }
  }
  const after=await waitFor(async()=>{
    const pair=await Promise.all([host.evaluate(summary),guest.evaluate(summary)]);
    samples.push(pair);
    return pair.every((v,i)=>v.tick>before[i].tick+10&&v.frameCount>before[i].frameCount+2)?pair:null;
  },'both render frames and observe advancing server ticks after W release',25);
  for(let i=0;i<2;i++){
    assert.ok(after[i].tick>before[i].tick+10,'server simulation advanced independently of rendering');
    assert.ok(after[i].frameCount>before[i].frameCount+2,'browser still renders live WebGL frames');
    assert.ok(after[i].finiteCamera,'camera is finite after simultaneous movement');
    assert.ok(after[i].auth && Object.values(after[i].auth).every(Number.isFinite),'authoritative transform remains finite');
    assert.ok(after[i].client && Object.values(after[i].client).every(Number.isFinite),'predicted transform remains finite');
  }
  for(const pair of samples)for(const s of pair){
    assert.equal(s.players,6,'all six combatants survive the active room lifecycle');
    assert.ok(s.auth&&Object.values(s.auth).every(Number.isFinite),'no corrupt network position');
    assert.ok(s.client&&Object.values(s.client).every(Number.isFinite),'no corrupt local prediction');
  }
  console.log('[MULTIPLAYER MOVED BY CLIENT]', movedByClient);
  const moved=movedByClient.every(value=>value>.25);
  assert.ok(moved,'both independent browsers must advance real authoritative positions under keyboard input: ' + JSON.stringify(movedByClient));
  await host.screenshot('six-player-high-grounds');
  await guest.screenshot('second-perspective-high-grounds');
  const health=await(await fetch(url+'/health')).json();
  const result={world:'high-grounds',participants:6,before,after,samples,simulation:health.simulation,
    errors:browsers.flatMap(b=>b.errors)};
  await writeFile(out+'/result.json',JSON.stringify(result,null,2));
  assert.equal(result.errors.length,0,'browser runtime has no uncaught JS errors');
  const errors=samples.flatMap(pair=>pair.map(p=>p.correction)).filter(Number.isFinite).sort((a,b)=>a-b);
  const p95=errors.length?errors[Math.floor((errors.length-1)*.95)]:null;
  console.log('[MULTIPLAYER CHROME ACCEPTED]',JSON.stringify({
    participants:6,world:result.world,
    renderedFrames:after.map((v,i)=>v.frameCount-before[i].frameCount),
    simulatedTicks:after[0].tick-before[0].tick,
    moved,movedByClient,p95PredictionError:p95,maxRenderFrameGapMs:after.map(v=>v.maxFrameGapMs),
    skippedServerTicks:health.simulation.skippedSteps
  }));
}catch(e){
  console.error('[MULTIPLAYER CHROME FAILED]',stage,e.stack??String(e));
  await writeFile(out+'/failure.json',JSON.stringify({stage,error:String(e),
    browsers:browsers.map(b=>({label:b.label,errors:b.errors,wire:b.wire.state,forward:b.wire.forward,movement:b.wire.movement}))},null,2));
  if(host)await host.screenshot('failure').catch(()=>{});
  if(guest)await guest.screenshot('failure').catch(()=>{});
  throw e;
}finally{
  for(const b of browsers){b.ws?.close();b.child.kill('SIGTERM');}
  if(spawnedServer)spawnedServer.kill('SIGTERM');
  await sleep(600);
  for(const b of browsers)await rm(b.profile,{recursive:true,force:true}).catch(()=>{});
}
