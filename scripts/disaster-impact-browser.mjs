// Matched Practice playback, exercising the real input controller and shared room.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGameServer } from '../server/src/server.mjs';
import { oneHitWorldContact } from '../shared/src/oneHitTrajectory.mjs';
import { CdpClient } from './browser-cdp.mjs';

const output='output/playwright/disaster-impact';
await mkdir(output,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'castleward-disaster-impact-'));
const bin=process.env.CHROME_BIN||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'chromium');
const agency=process.env.DISASTER_AGENCY==='1';
const cdpPort=Number(process.env.DISASTER_CDP_PORT??9308);
const chrome=spawn(bin,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader',
  '--remote-allow-origins=*','--window-size=1280,800','--remote-debugging-port='+cdpPort,'--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let cdp,game,peer;
const events=[],sent=[];
async function until(fn,label,ms=16000){
  const end=Date.now()+ms;
  while(Date.now()<end){
    const v=await fn().catch(()=>null);
    if(v)return v;
    await sleep(60);
  }
  throw new Error('Timed out: '+label);
}
async function ev(expression){
  const r=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);
  return r.result?.value;
}
const click=selector=>ev(`document.querySelector(${JSON.stringify(selector)})?.click()`);
async function snap(label){
  const r=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(join(output,label+'.png'),Buffer.from(r.data,'base64'));
}
const runtime='window.__ssRuntime';
const actor=runtime+'?.localAuth';
const authoredAir=process.env.DISASTER_AUTHORED_AIR==='1';
async function load(url,touch,shared=false){
  if(touch){
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});
    await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true});
  }
  await cdp.send('Page.navigate',{url:url+'/?debug'});
  await until(()=>ev("document.querySelector('#loading-veil')?.classList.contains('done')"),'menu ready',40000);
  await click('[data-tutorial-onboarding-skip]');
  await ev(`(() => {
    const input=document.querySelector('#player-name');
    input.value='Disaster Tester';
    input.dispatchEvent(new Event('input',{bubbles:true}));
  })()`);
  await click('#armory-button');
  await click('#armory-slot-masterstroke');
  // Re-equip after opening a saved Armory. The separately reviewed recovery
  // branch fixes startup synchronization; this fixture also runs on old main.
  if(await ev("document.querySelector('#plaque-name-masterstroke').textContent.includes('All-Natural Disaster')")){
    await click('[data-ultimate=chivalry]');
    await click('#armory-equip-btn');
  }
  await click('[data-ultimate=one_hit_of_wonders]');
  await click('#armory-equip-btn');
  await click('#armory-inspector-close');
  await click('#armory-back');
  await click('#solo-button');
  const mode=shared?'#shared-practice-mode':'#practice-mode';
  await click(mode);
  if(await ev("document.querySelector('#solo-launch').getClientRects().length"))await click('#solo-launch');
  else await click(mode);
  await until(()=>ev(`${actor}?.ultimate==='one_hit_of_wonders' && ${actor}?.alive`),'equipped Practice actor').catch(async error=>{
    console.error(await ev(`({mode:window.__ssSnapshot?.mode,ultimate:${actor}?.ultimate,
      errors:[...document.querySelectorAll('.error-copy')].map(e=>e.textContent).filter(Boolean),
      armory:document.querySelector('#armory-menu').className,solo:document.querySelector('#solo-menu').className})`));
    throw error;
  });
  await until(()=>ev("document.querySelector('#arena-gate').classList.contains('hidden')"),'arena title lifted');
  await click('#practice-drawer-close');
  await cdp.send('Page.bringToFront');
  if(touch){
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:422,y:195}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }else{
    const xy=await ev(`(() => {const r=document.querySelector('#game-canvas').getBoundingClientRect();return {x:r.x+r.width*.52,y:r.y+r.height*.47};})()`);
    await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',...xy,button:'left',clickCount:1});
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',...xy,button:'left',clickCount:1});
  }
  await until(()=>ev(`${runtime}?.input.enabled`),'arena controls enabled').catch(async error=>{
    console.error(await ev(`({target:document.elementFromPoint(innerWidth/2,innerHeight/2)?.id, canvas:document.querySelector('#game-canvas').getBoundingClientRect().toJSON(),
      locked:!!document.pointerLockElement, touch:${runtime}?.input.touch, suspended:${runtime}?.input.suspended})`));
    throw error;
  });
}
async function press(touch,down){
  if(touch){
    if(!down)return cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    const at=await ev(`(() => {
      const r=document.querySelector('.touch-btn[data-action="ultimate"]').getBoundingClientRect();
      return {x:r.x+r.width/2,y:r.y+r.height/2};
    })()`);
    assert.ok(at.x>0 && at.y>0);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[at]});
  }else await cdp.send('Input.dispatchKeyEvent',{type:down?'rawKeyDown':'keyUp',key:'r',code:'KeyR',windowsVirtualKeyCode:82});
}
async function captureAirHold(){
  const clip='AllNatural_Lightning_Charge_Air';
  const probe=`() => {
    const rt=${runtime},instance=rt.remotePlayers.self?.visualInstance,animator=instance?.animator;
    const root=animator?.bone('root'),pelvis=animator?.bone('pelvis'),hand=animator?.bone('hand.R');
    return {clip:animator?.activeClip,time:animator?.activeAction?.time,
      root:root?.position.toArray(),rootRotation:root?.quaternion.toArray(),
      pelvis:pelvis?.position.toArray(),hand:hand?.quaternion.toArray(),socket:instance?.sockets.sword?.name,
      feet:rt.localAuth.position, hostFeet:rt.socket.local.player?.position, yaw:rt.input.yaw,hostYaw:rt.localAuth.yaw,
      cameraYaw:rt.camera.rotation.y,roll:rt.camera.rotation.z,outside:rt.inspectionBodyOutside,
      elapsed:rt.socket.serverNow()-rt.localAuth.ultimateState.teleportHoldAt};
  }`;
  const read=()=>ev(`(${probe})()`);
  const first=await until(async()=>{const s=await read();return s.clip===clip&&s.outside?s:null;},
    'canonical airborne Lightning hold actually visible',3500);
  assert.equal(first.socket,'socket_sword');
  assert.ok(first.root?.length===3 && first.rootRotation?.length===4 && first.pelvis?.length===3 && first.hand?.length===4);
  await ev(`(() => {
    const probe=${probe},samples=[];
    window.__airProbe=new Promise(resolve=>{
      const next=()=>{
        const current=probe();
        samples.push(current);
        if(current.elapsed<1.68&&samples.length<240)requestAnimationFrame(next);
        else resolve(samples);
      };
      requestAnimationFrame(next);
    });
  })()`);
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:640,y:370});
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:700,y:370});
  const samples=[first,...await ev('window.__airProbe')];
  const last=samples.at(-1);
  const turn=(a,b)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
  const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
  const wraps=samples.slice(1).filter((s,i)=>samples[i].time-s.time>.4).length;
  const phases=samples.map(s=>s.time);
  assert.ok(last.elapsed>=1.68&&wraps>=1&&Math.min(...phases)<.10&&Math.max(...phases)>.72,
    'the hold spans two periods and the rendered loop covers the full phase');
  assert.ok(samples.every(s=>s.clip===clip&&s.outside&&s.feet.y>0&&Math.abs(s.roll)<.09));
  assert.ok(samples.every(s=>distance(s.root,first.root)<.002 && distance(s.rootRotation,first.rootRotation)<.002));
  assert.ok(samples.every(s=>Math.hypot(s.feet.x-first.feet.x,s.feet.z-first.feet.z)<.08));
  assert.ok(samples.some(s=>distance(s.pelvis,first.pelvis)>.008),'pelvis is animated, beyond the stable root');
  assert.ok(turn(last.yaw,first.yaw)>.03 && turn(last.hostYaw,last.yaw)<.02 && turn(last.cameraYaw,last.yaw)<.03,
    'real mouse movement reaches local aim, authority and the chase camera');
  return {clip,wraps,samples};
}
async function scenario(url,label,touch,enhanced){
  await load(url,touch);
  const verifyAir=authoredAir&&enhanced&&!touch;
  // The Practice preset is public UI. The renderer and simulator are never injected.
  await click('[data-one-hit-preset=full]');
  await until(()=>ev(`${actor}?.practiceOneHit?.stages?.lightning===2`),'four Full infusions');
  if(!verifyAir){
    await press(touch,true);
    await until(()=>ev(`Number.isFinite(${actor}?.ultimateState?.teleportHoldAt)`),'Full Lightning holds on actual input');
    if(enhanced){
      await until(()=>ev(`${runtime}?.chase>.6 && ${runtime}.oneHitEffects.reticle.visible`),
        'charging chase and reachable guide');
      // Exercise the SAME input turn path the mouse/touch look uses while
      // holding Full Lightning + Full Gale. The destination must follow
      // live azimuth and elevation, including after a downward sweep.
      const sample=()=>ev(`(() => {
        const rt=${runtime},p=rt.oneHitEffects.teleportTarget.position;
        return {yaw:rt.input.yaw,pitch:rt.input.pitch,point:[p.x,p.y,p.z],
          visible:rt.oneHitEffects.reticle.visible,vertical:rt.input.disasterThreeDAim};
      })()`);
      const before=await sample();
      assert.ok(before.vertical,'Full Lightning + Gale unlocks live 3D look');
      await ev(`${runtime}.input.turn(Math.PI,.68)`);
      const above=await until(async()=>{
        const s=await sample();
        return s.pitch>before.pitch+.35&&s.point[1]>before.point[1]+1?s:null;
      },'held teleport pitch and behind-the-back destination move');
      assert.ok(Math.abs(above.yaw-before.yaw)>1,'the charging view turns through the rear hemisphere');
      await ev(`${runtime}.input.turn(0,-1.36)`);
      const below=await until(async()=>{
        const s=await sample();
        return s.pitch<-.35&&s.point[1]<above.point[1]-1?s:null;
      },'groundward 3D destination responds to look without releasing charge');
      assert.ok(below.visible&&above.visible);
      console.log('[3D CHARGE AIM]',JSON.stringify({before,above,below}));
      // Restore the staged forward lane before releasing: this is an aiming
      // probe, not a change to the next impact fixture's orientation.
      await ev(`${runtime}.input.yaw=${before.yaw}; ${runtime}.input.pitch=${before.pitch}`);
      await until(async()=>{
        const s=await sample();
        return Math.abs(s.yaw-before.yaw)<.001&&Math.abs(s.pitch-before.pitch)<.001;
      },'original forward lane restored before impact');
    }
    await snap(label+'-charge');
    await until(()=>ev(`${runtime}.socket.serverNow()-${actor}.ultimateState.teleportHoldAt>.55`),'half-second charge');
    await press(touch,false);
    await until(()=>ev(`${actor}?.ultimateState?.phase==='active'`),'ground commit on release');
    await until(()=>ev(`${runtime}?.latestSnapshot?.oneHitBurnZones?.length>0`),'authoritative Full Fire zone');
    await snap(label+'-ground');
    await until(()=>ev(`!${actor}?.ultimateState && (${actor}?.recoverUntil??0)<${runtime}.socket.serverNow() &&
      ${runtime}.latestSnapshot.oneHitBurnZones.length===0`),'recovery and ground zone expiry');
  }
  // The scoped 3D aim / impact CI job needs only the real held-charge
  // ground encounter. The original full capture remains the default and
  // continues into the separate aerial scenario.
  if(process.env.DISASTER_AIM_VFX_GROUND_ONLY==='1'){
    await click('#pause-leave');
    await until(()=>ev("!window.__ssLink?.roomCode"),'left Practice');
    console.log('[DISASTER GROUND & 3D AIM PASS]',label);
    return {label,touch,enhanced,grounded:true,aim3D:true};
  }
  // Match the exact downward aim for the two captures. Cast/release still
  // travel through actual desktop or touch events and authoritative movement.
  if(verifyAir)await ev(`import('./client/game/SpellbladeAssets.mjs').then(m=>m.preloadSpellbladeAssets())`);
  await ev(`${runtime}.input.pitch=-.50`);
  // The aerial Windblade does not throw ground-only stone slabs unless it
  // actually lands as a grounded slam. Observe the terminal projectile event
  // instead of waiting for unrelated ground-only transients.
  await ev(`window.__disasterImpacts=[]; ${runtime}.socket.on('events',
    batch=>{for(const e of batch.events??[])if(e.type==='oneHitImpact')window.__disasterImpacts.push(e);})`);
  const stage=await ev(`new Promise(resolve => {
    const rt=${runtime},host=rt.socket.local?.player;
    document.querySelector('[data-one-hit-action=aerial]').click();
    // Only the dedicated loop test needs extra initial altitude to allow for
    // a cold third person render. Subsequent movement and casts are live.
    if(${verifyAir}&&host&&!host.grounded)host.position.y+=5;
    const end=performance.now()+1500;
    const sample=()=>{
      const p=rt.localAuth;
      if(p?.position.y>${verifyAir?6:2.8}&&!p.grounded)resolve({ok:true,y:p.position.y});
      else if(performance.now()>end)resolve({ok:false,pose:p?.position,grounded:p?.grounded,host:host?.position});
      else requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  })`);
  assert.ok(stage?.ok, 'aerial Practice start: '+JSON.stringify(stage));
  await press(touch,true);
  await until(()=>ev(`Number.isFinite(${actor}?.ultimateState?.teleportHoldAt)`),'aerial hold').catch(async e=>{
    console.error(await ev(`({enabled:${runtime}.input.enabled,grounded:${actor}.grounded,
      tiers:${actor}.practiceOneHit, pose:${actor}.position,recovers:${actor}.recoverUntil})`));
    throw e;
  });
  if(verifyAir)await ev(`(() => {
    const socket=${runtime}.socket;
    window.__airReleaseEvents=[];
    socket.on('events',batch=>window.__airReleaseEvents.push(...batch.events.filter(e=>[
      'oneHitCommitted','oneHitTeleport','oneHitWave','oneHitImpact','ultimateInterrupted',
    ].includes(e.type))));
  })()`);
  const air=verifyAir?await captureAirHold():null;
  await press(touch,false);
  await until(()=>ev(`${actor}?.ultimateState?.oneHit?.form==='aerial'`),'aerial commitment').catch(async error=>{
    console.error(JSON.stringify({last:air?.samples.at(-1),state:await ev(`({authoritative:${runtime}.socket.local?.player?.position,
      input:${runtime}.input.pitch,pose:${actor}?.position,action:${actor}?.ultimateState,health:${actor}?.health,
      events:window.__airReleaseEvents})`)},null,2));
    throw error;
  });
  if(air)air.release=await until(()=>ev(`(() => {
    const rt=${runtime},clip=rt.remotePlayers.self?.visualInstance?.animator?.activeClip;
    return clip==='Slash_3'&&rt.chase>.5?{clip,chase:rt.chase}:null;
  })()`),'release transitions to provisional slam');
  if(enhanced&&!air){
    const terminal=await until(()=>ev('window.__disasterImpacts?.find(e=>e.impactId)'),
      'authoritative Windblade terminal impact',5000);
    assert.ok(terminal.impactId,'aerial Wave actually terminated');
    await until(()=>ev(`${runtime}.oneHitEffects.elements.census().glow>2`),
      'elemental terminal burst visible',4000);
    await snap(label+'-aerial-impact');
  }else if(!air)await snap(label+'-aerial-release');
  if(air){
    air.recovered=await until(()=>ev(`!${actor}.ultimateState && ${runtime}.chase<.03 && ${runtime}.weapon.group.visible`),
      'release returns to first person');
    air.events=await ev('window.__airReleaseEvents');
    assert.ok(air.events.some(e=>e.type==='oneHitCommitted'&&e.form==='aerial'));
    await writeFile(join(output,'authored-air.json'),JSON.stringify(air,null,2)+'\n');
  }
  await click('#pause-leave');
  await until(()=>ev("!window.__ssLink?.roomCode"),'left Practice');
  console.log('[PLAYED]',label);
  return {label,touch,enhanced,grounded:!verifyAir,aerial:true};
}

async function observePeer(url,code){
  const seen=[];
  peer=new WebSocket(url.replace(/^http/,'ws')+'/ws');
  peer.addEventListener('message',e=>{
    const m=JSON.parse(e.data);
    if(m.type==='events')seen.push(...m.events);
    else if(m.type==='joined')seen.playerId=m.playerId;
  });
  await new Promise((resolve,reject)=>{
    peer.addEventListener('open',resolve,{once:true});
    peer.addEventListener('error',reject,{once:true});
  });
  peer.send(JSON.stringify({type:'joinRoom',code,name:'Wave Witness'}));
  await until(async()=>seen.playerId,'second network client joined');
  return seen;
}

async function agencyScenario(url,device){
  const touch=device==='touch';
  await load(url,touch,true);
  const code=await ev("window.__ssLink.roomCode");
  const id=await ev(`${actor}.id`);
  const room=game.roomManager.findByCode(code);
  const knight=room.players.get(id);
  const observer=await observePeer(url,code);
  assert.equal(await ev("window.__ssLink.hosting"),'remote');
  if(device==='mouse')await ev(`(() => {
    const input=${runtime}.input,bindings={...input.bindings,ultimate:['Mouse1']};
    input.configure({bindings});
  })()`);
  const use=async down=>{
    if(device!=='mouse')return press(touch,down);
    await cdp.send('Input.dispatchMouseEvent',{type:down?'mousePressed':'mouseReleased',x:640,y:370,
      button:'middle',clickCount:1,buttons:down?4:0});
  };
  const start=()=>events.find(e=>e.type==='ultimateStart'&&e.playerId===id);
  const impacts=()=>events.filter(e=>e.type==='oneHitImpact'&&e.playerId===id);
  events.length=0;sent.length=0;
  await click('[data-one-hit-preset=partial]');
  await until(async()=>knight.practiceOneHit?.stages?.lightning===1,'partial preset at authority');
  await use(true);
  const started=await until(async()=>start(),'real held input reached the room');
  await until(async()=>game.now()>=started.commitAt+.07,'beyond the original commit time');
  assert.equal(knight.ultimateState?.phase,'startup');
  assert.equal(impacts().length,0);
  await use(false);
  const slam=await until(async()=>impacts()[0],'ground release');
  assert.equal(slam.form,'ground');
  assert.ok(slam.at-started.commitAt>=.05 && slam.at-started.commitAt<.32);
  assert.ok(sent.some(m=>m.type==='ultimate'&&m.held)&&sent.some(m=>m.type==='oneHitRelease'));
  assert.deepEqual(await until(async()=>observer.find(e=>e.type==='oneHitImpact'&&e.at===slam.at),'peer sees identical ground release'),slam);
  await until(async()=>!knight.ultimateState&&game.now()>knight.recoverUntil,'ground recovery finished');

  events.length=0;sent.length=0;
  await click('[data-one-hit-preset=gale]');
  await click('[data-one-hit-action=aerial]');
  await until(async()=>knight.practiceOneHit?.stages?.gale===2&&!knight.grounded,'aerial setup applied');
  const origin={...knight.position,y:knight.position.y-.7};
  const aims=Array.from({length:16},(_,i)=>i*Math.PI/8);
  const yaw=aims.find(a=>!oneHitWorldContact(origin,{x:origin.x-Math.sin(a)*18,y:origin.y,z:origin.z-Math.cos(a)*18},room.world));
  assert.ok(Number.isFinite(yaw),'open arena line for a travelling wave');
  await ev(`${runtime}.input.yaw=${yaw}; ${runtime}.input.pitch=0`);
  await use(true);await use(false);
  const wave=await until(async()=>room.oneHitWaves?.find(w=>w.ownerId===id),'aerial wave launched');
  await until(()=>ev(`${runtime}.input.oneHitWaveId===${JSON.stringify(wave.id)}`),'actual wave reaches input controller',1500);
  await use(true);await use(false);
  const terminal=await until(async()=>impacts().find(e=>e.impactId===wave.id),'explicit manual impact',2500);
  assert.equal(terminal.cause,'manual');
  assert.ok(Math.hypot(terminal.point.x-wave.position.x,terminal.point.y-wave.position.y,terminal.point.z-wave.position.z)<1e-8);
  assert.deepEqual(await until(async()=>observer.find(e=>e.type==='oneHitImpact'&&e.impactId===wave.id),'peer sees same manual impact'),terminal);
  assert.deepEqual(sent.filter(m=>m.type==='oneHitDetonate'),[{type:'oneHitDetonate',waveId:wave.id}]);
  assert.equal(impacts().length,1);
  assert.ok(!room.oneHitWaves.some(w=>w.id===wave.id));
  await snap('agency-'+device+'-detonation');
  peer.close();peer=null;
  await click('#pause-leave');
  await until(()=>ev("!window.__ssLink?.roomCode"),'left Shared Practice');
  console.log('[AGENCY PASS]',device,slam.at-started.commitAt,terminal.impactId);
  return {device,groundDelaySec:slam.at-started.commitAt,manual:terminal,peerMatched:true};
}

try{
  const target=await until(async()=> (await (await fetch('http://127.0.0.1:'+cdpPort+'/json/list')).json()).find(p=>p.type==='page'),'Chrome');
  cdp=new CdpClient(target.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');await cdp.send('Runtime.enable');
  cdp.on('Runtime.exceptionThrown',e=>console.error('[browser]',e.exceptionDetails?.exception?.description??e.exceptionDetails?.text));
  const base=process.env.DISASTER_BASE_URL;
  let candidate=process.env.DISASTER_CANDIDATE_URL;
  const result=[];
  if(agency){
    game=createGameServer({host:'127.0.0.1',port:0});
    await game.start();
    await cdp.send('Network.enable');
    const record=target=>({response})=>{
      if(response.opcode!==1)return;
      const m=JSON.parse(response.payloadData);
      if(m.type==='events')target.push(...m.events.filter(e=>e.type==='ultimateStart'||e.type==='oneHitImpact'));
      if(['ultimate','oneHitRelease','oneHitDetonate'].includes(m.type))target.push(m);
    };
    cdp.on('Network.webSocketFrameSent',record(sent));
    cdp.on('Network.webSocketFrameReceived',record(events));
    const url='http://127.0.0.1:'+game.address().port;
    for(const device of (process.env.DISASTER_INPUTS??'keyboard,mouse,touch').split(','))result.push(await agencyScenario(url,device));
    await writeFile(join(output,'agency.json'),JSON.stringify(result,null,2)+'\n');
  }else{
    if(!candidate){
      game=createGameServer({host:'127.0.0.1',port:0});
      await game.start();
      candidate='http://127.0.0.1:'+game.address().port;
    }
    if(base)result.push(await scenario(base,'before-desktop',false,false));
    if(!process.env.DISASTER_TOUCH_ONLY)result.push(await scenario(candidate,'after-desktop',false,true));
    if(!process.env.DISASTER_DESKTOP_ONLY)result.push(await scenario(candidate,'after-touch',true,true));
    await writeFile(join(output,'result.json'),JSON.stringify(result,null,2)+'\n');
  }
  console.log(result);
} catch(e){ console.error(e);process.exitCode=1; }
finally{
  peer?.close();cdp?.close();chrome.kill();
  if(game)await game.stop();
  await sleep(500);
  await rm(profile,{recursive:true,force:true,maxRetries:3});
}
