// End-to-end Chrome acceptance: dragging the Ultimate button must actually
// teleport UP with Full Gale + Full Lightning, not just turn the guide.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {createGameServer} from '../server/src/server.mjs';
import {launchAcceptanceChrome} from './acceptance-chrome.mjs';
import {CdpClient} from './browser-cdp.mjs';

const output='output/playwright/disaster-3d-teleport';
await mkdir(output,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'castleward-disaster-3d-'));
const game=createGameServer({host:'127.0.0.1',port:0});
let chrome,cdp;
const recordings=[];
const runtime='window.__ssRuntime';
const actor=runtime+'?.localAuth';
const wait=async(fn,label,timeout=40000)=>{
  const limit=Date.now()+timeout;
  while(Date.now()<limit){
    const value=await fn().catch(()=>null);
    if(value)return value;
    await sleep(90);
  }
  throw Error('Timed out: '+label);
};
const evaluate=async expression=>{
  const r=await cdp.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);
  return r.result?.value;
};
const click=selector=>evaluate('document.querySelector('+JSON.stringify(selector)+')?.click()');
const shot=async name=>{
  const r=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(join(output,name+'.png'),Buffer.from(r.data,'base64'));
};
async function load(url,touch){
  await cdp.send('Emulation.setDeviceMetricsOverride',{
    width:touch?844:1280,height:touch?390:800,deviceScaleFactor:1,mobile:touch,
    ...(touch?{screenOrientation:{type:'landscapePrimary',angle:90}}:{})
  });
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:touch,maxTouchPoints:5});
  await cdp.send('Page.navigate',{url:url+'/?debug'});
  await wait(()=>evaluate("document.querySelector('#loading-veil')?.classList.contains('done')"),'menu');
  await click('[data-tutorial-onboarding-skip]');
  await evaluate("(()=>{const input=document.querySelector('#player-name');input.value='Disaster Tester';input.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await click('#armory-button');
  await click('#armory-slot-masterstroke');
  await click('#armory-ultimates [data-ultimate=one_hit_of_wonders]');
  await click('#armory-equip-btn');
  await click('#armory-inspector-close');
  await click('#armory-back');
  await click('#solo-button');
  await click('#practice-mode');
  await click('#solo-launch');
  await wait(()=>evaluate(actor+"?.ultimate==='one_hit_of_wonders'&&"+actor+"?.alive"),'equipped Practice player')
    .catch(async error=>{
      console.error('[PRACTICE BOOT]',await evaluate("(()=>({screen:document.querySelector('#solo-menu')?.className,loadout:document.querySelector('#plaque-name-masterstroke')?.textContent,actor:window.__ssRuntime?.localAuth?.ultimate,mode:window.__ssSnapshot?.mode,errors:[...document.querySelectorAll('.error-copy')].map(n=>n.textContent).filter(Boolean)}))()"));
      throw error;
    });
  await wait(()=>evaluate("document.querySelector('#arena-gate')?.classList.contains('hidden')"),'arena title lifted');
  await click('#practice-drawer-close');
  if(touch){
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:415,y:195,id:94}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }else{
    const xy=await evaluate("(()=>{const r=document.querySelector('#game-canvas').getBoundingClientRect();return {x:r.x+r.width*.52,y:r.y+r.height*.47};})()");
    await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',...xy,button:'left',clickCount:1});
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',...xy,button:'left',clickCount:1});
  }
  await wait(()=>evaluate(runtime+'?.input.enabled'),'live input enabled');
  await click('[data-one-hit-preset=full]');
  await wait(()=>evaluate(actor+'?.practiceOneHit?.stages?.gale===2&&'+actor+'?.practiceOneHit?.stages?.lightning===2'),
    'Full Gale and Full Lightning equipped');
  await evaluate("window.__disasterTeleportEvents=[];"+runtime+".socket.on('events',batch=>{for(const e of batch.events??[])if(e.type==='oneHitTeleport'||e.type==='oneHitCommitted')window.__disasterTeleportEvents.push(e);})");
}
async function run(url,touch){
  const name=touch?'touch':'desktop';
  await load(url,touch);
  const before=await evaluate('(()=>{const rt='+runtime+';return {yaw:rt.input.yaw,pitch:rt.input.pitch,position:{...rt.localAuth.position}};})()');
  let pressStart;
  if(touch){
    pressStart=await evaluate("(()=>{const b=document.querySelector('.touch-btn[data-action=\"ultimate\"]');const r=b.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()");
    assert.ok(pressStart.x>100&&pressStart.y>40,'Ultimate button is visible');
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...pressStart,id:17}]});
  }else{
    await cdp.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'r',code:'KeyR',windowsVirtualKeyCode:82});
  }
  await wait(()=>evaluate('Number.isFinite('+actor+'?.ultimateState?.teleportHoldAt)'),'held Full Lightning charge');
  await wait(()=>evaluate(runtime+'?.input.disasterThreeDAim'),'3D aim policy enabled');
  if(touch){
    const one={x:Math.max(45,pressStart.x-130),y:Math.max(18,pressStart.y-95),id:17};
    const two={x:Math.max(25,pressStart.x-240),y:Math.max(7,pressStart.y-215),id:17};
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[one]});
    await sleep(110);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[two]});
  }else{
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:850,y:500,button:'none'});
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:600,y:250,button:'none'});
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:410,y:75,button:'none'});
    // Software-rendered headless Chrome can zero pointer-lock movementX when
    // dispatchMouseEvent re-centers the locked cursor. Exercise the exact
    // production document mousemove listener using explicit movement deltas.
    // This does NOT write input.yaw/pitch or bypass the controller.
    await evaluate("(()=>{const move=(dx,dy)=>{const e=new MouseEvent('mousemove',{bubbles:true});"+
      "Object.defineProperty(e,'movementX',{value:dx});Object.defineProperty(e,'movementY',{value:dy});"+
      "document.dispatchEvent(e);};move(-240,-80);move(-175,-30);})()");
  }
  const sample='(()=>{const rt='+runtime+',p=rt.oneHitEffects.teleportTarget.position;'+
    'if(rt.input.pitch<.42||Math.abs(rt.input.yaw-'+before.yaw+')<.35||p.y-rt.localAuth.position.y<4)return null;'+
    'return {yaw:rt.input.yaw,pitch:rt.input.pitch,vertical:rt.input.disasterThreeDAim,'+
      'marker:{x:p.x,y:p.y,z:p.z},current:{...rt.localAuth.position},'+
      'held:Number.isFinite(rt.localAuth.ultimateState?.teleportHoldAt)};})()';
  const aimed=await wait(()=>evaluate(sample),'real drag moves both yaw and elevated destination',14000)
    .catch(async error=>{
      console.error('[3D AIM INPUT DIAGNOSTICS]',name,JSON.stringify(await evaluate(
        '(()=>{const rt='+runtime+',p=rt.oneHitEffects.teleportTarget.position;return {'+
        'pitch:rt.input.pitch,yaw:rt.input.yaw,locked:rt.input.pointerLocked,'+
        'touchFocus:rt.input.touchFocus,enabled:rt.input.enabled,disasterThreeDAim:rt.input.disasterThreeDAim,'+
        'view:[p.x,p.y,p.z],origin:rt.localAuth.position,'+
        'holding:rt.localAuth.ultimateState?.teleportHoldAt,'+
        'state:rt.localAuth.ultimateState?.phase,gesture:rt.input.ultimateGesture,'+
        'touchHeld:[...(rt.touch?.held?.entries?.()??[])],touchLook:rt.touch?.look,'+
        'touchAim:[...(rt.touch?.aim?.entries?.()??[])]};})()'
      )));
      throw error;
    });
  assert.ok(aimed.held&&aimed.vertical);
  await shot(name+'-upward-preview');
  // Screenshots in software-rendered Chrome can take several seconds; the
  // logarithmic range keeps growing while the player holds Ultimate. Read the
  // latest destination immediately before release rather than comparing the
  // final distance to a stale screenshot-frame marker.
  const finalPreview=await evaluate('(()=>{const rt='+runtime+
    ';const p=rt.oneHitEffects.teleportTarget.position;return {marker:{x:p.x,y:p.y,z:p.z},'+
    'origin:{...rt.localAuth.position}};})()');
  if(touch)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  else await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'r',code:'KeyR',windowsVirtualKeyCode:82});
  const event=await wait(()=>evaluate("window.__disasterTeleportEvents.find(e=>e.type==='oneHitTeleport')"),
    'authoritative 3D teleport');
  assert.equal(event.grounded,false);
  assert.ok(event.to.y-event.from.y>4,'the knight actually teleports UP');
  assert.ok(Math.hypot(event.to.x-event.from.x,event.to.z-event.from.z)>2,
    'the player also selects a horizontal direction');
  const previewVector={
    x:finalPreview.marker.x-finalPreview.origin.x,
    y:finalPreview.marker.y-1.45-finalPreview.origin.y,
    z:finalPreview.marker.z-finalPreview.origin.z,
  };
  const resultVector={x:event.to.x-event.from.x,y:event.to.y-event.from.y,z:event.to.z-event.from.z};
  const dot=previewVector.x*resultVector.x+previewVector.y*resultVector.y+previewVector.z*resultVector.z;
  const agreement=dot/(Math.hypot(...Object.values(previewVector))*Math.hypot(...Object.values(resultVector)));
  assert.ok(agreement>.98,'preview and authoritative 3D teleport have same bearing/elevation: '+agreement);
  await shot(name+'-upward-arrival');
  recordings.push({name,before,aimed,finalPreview,event,agreement});
  console.log('[REAL 3D TELEPORT PASS]',name,JSON.stringify({
    pitch:aimed.pitch,yaw:aimed.yaw,gainY:event.to.y-event.from.y,agreement
  }));
}
try{
  await game.start();
  const url='http://127.0.0.1:'+game.address().port;
  chrome=launchAcceptanceChrome(process.env.CHROME_BIN??'chromium',profile,join(output,'chrome.log'),{width:1280,height:800});
  const target=await chrome.target();
  cdp=new CdpClient(target.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await run(url,false);
  await run(url,true);
  await writeFile(join(output,'result.json'),JSON.stringify(recordings,null,2)+'\n');
}catch(error){
  console.error('[REAL 3D TELEPORT FAIL]',error.stack);
  await writeFile(join(output,'failure.json'),JSON.stringify({error:String(error),recordings},null,2));
  process.exitCode=1;
}finally{
  cdp?.close();
  chrome?.child?.kill('SIGTERM');
  await game.stop().catch(()=>{});
  await sleep(350);
  await rm(profile,{recursive:true,force:true}).catch(()=>{});
}
