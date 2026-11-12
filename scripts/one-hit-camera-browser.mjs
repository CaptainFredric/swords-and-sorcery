// Play real Practice inputs and observe the authority and the rendered view.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { CdpClient } from './browser-cdp.mjs';
import { launchAcceptanceChrome } from './acceptance-chrome.mjs';

const url=(process.env.PUBLIC_URL??'http://127.0.0.1:3001').replace(/\/$/,'');
const bin=process.env.CHROME_BIN||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'chromium');
const profile=await mkdtemp(join(tmpdir(),'castleward-disaster-camera-'));
const output='output/playwright/all-natural-disaster';
await mkdir(output,{recursive:true});
const chrome=launchAcceptanceChrome(bin,profile,join(output,'chrome.log'),{width:960,height:600});
let cdp,stage='Chrome startup';
const evidence={};
async function poll(fn,label,ms=25000){
  stage=label;
  const deadline=Date.now()+ms;
  while(Date.now()<deadline){
    const value=await fn();
    if(value)return value;
    await sleep(65);
  }
  throw Error('Timed out: '+label);
}
async function evaluate(expression){
  const r=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);
  return r.result?.value;
}
const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)})?.click()`);
async function snap(name){
  const r=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(join(output,name+'.png'),Buffer.from(r.data,'base64'));
}
const key=type=>cdp.send('Input.dispatchKeyEvent',{type,key:'r',code:'KeyR',windowsVirtualKeyCode:82});
const observed=expression=>evaluate(`window.__disasterRun?.${expression}`);
const rt='window.__ssRuntime';
const control=`(() => {
  const rt=${rt},host=rt.socket.local.player;
  return {enabled:rt.input.enabled,locked:!!document.pointerLockElement,
    held:rt.input.keys.has('KeyR'),grounded:host.grounded,y:host.position.y,tiers:host.practiceOneHit?.stages,
    now:rt.socket.serverNow(),recover:host.recoverUntil,stagger:host.staggerUntil,wave:rt.input.oneHitWaveId};
})()`;
async function focusArena(){
  if(await evaluate(`${rt}.input.enabled`))return;
  await cdp.send('Page.bringToFront');
  const xy=await evaluate(`(() => {
    const menu=document.querySelector('#pause-menu');
    const target=menu&&!menu.classList.contains('hidden')
      ? document.querySelector('#resume-game') : ${rt}.renderer.domElement;
    const b=target.getBoundingClientRect();
    return {x:b.x+b.width*.5,y:b.y+b.height*.5};
  })()`);
  for(const type of ['mousePressed','mouseReleased'])
    await cdp.send('Input.dispatchMouseEvent',{type,...xy,button:'left',clickCount:1});
  await poll(()=>evaluate(`${rt}.input.enabled`),'real arena focus');
}
async function play(name,{preset='simple',aerial=false,hold=false,lightning=false,interrupt=false}={}){
  await poll(()=>evaluate(`(() => {
    const rt=${rt},host=rt.socket.local.player,now=rt.socket.serverNow();
    // The same physical key detonates a previous live wave. A camera that
    // has returned to first person does not imply the wave has expired.
    return !host.ultimateState&&!rt.input.oneHitWaveId&&
      !rt.socket.local.room.oneHitWaves?.some(w=>w.ownerId===host.id)&&
      now>=Math.max(host.recoverUntil??0,host.ultimateLockedUntil??0);
  })()`),name+' recovery finished');
  await focusArena();
  await evaluate(`(() => {
    const rt=${rt}, host=rt.socket.local.player;
    // The preceding teleport can leave us away from the supported test yard.
    document.querySelector('#practice-reset').click();
    document.querySelector('[data-one-hit-preset=${preset}]').click();
    if(${aerial}){
      // Stage in the real key event so CDP delays before dispatch cannot
      // spend the entire fall. The game still processes the key normally.
      const stage=event=>{
        if(event.code!=='KeyR')return;
        document.removeEventListener('keydown',stage,true);
        document.querySelector('[data-one-hit-action=aerial]').click();
        if(!host.grounded)host.position.y+=5;
      };
      document.addEventListener('keydown',stage,true);
    }
    rt.input.pitch=${aerial?-.25:0};
    window.__disasterRun={name:${JSON.stringify(name)},frames:[],events:[],keys:[]};
  })()`);
  await poll(()=>evaluate(`${rt}.localAuth?.grounded`),name+' supported reset');
  console.log('[DISASTER INPUT READY]',name,JSON.stringify(await evaluate(control)));
  if(hold||lightning)await key('rawKeyDown');
  else await Promise.all([key('rawKeyDown'),key('keyUp')]);
  if(lightning){
    await poll(()=>observed('frames.find(f=>f.holding&&f.body&&!f.hands)'),name+' visible aimable hold');
    if(interrupt){
      assert.ok(await evaluate('Boolean(document.pointerLockElement)'));
      await evaluate('document.exitPointerLock()');
      await poll(()=>evaluate('!document.pointerLockElement'),name+' browser lock exited');
    }
    await key('keyUp');
  }
  const type=interrupt?'ultimateInterrupted':'oneHitCommitted';
  const commit=await poll(()=>observed(`events.find(e=>e.type===${JSON.stringify(type)})`),name+' '+type);
  if(hold)await key('keyUp');
  if(!interrupt)assert.equal(commit.form,aerial?'aerial':'ground');
  await poll(()=>observed('frames.find(f=>f.chase>.18&&f.body&&!f.hands)'),name+' actual third person');
  const restored=await poll(()=>observed('frames.find(f=>f.restored)'),name+' first person restored');
  const run=await observed('valueOf()');
  const start=run.events.find(e=>e.type==='ultimateStart');
  assert.ok(start,name+' authoritative startup');
  if(!lightning){
    assert.ok(Math.abs(start.commitAt-start.at-(preset==='partial'?.36:.92))<1e-6);
    assert.ok(commit.at>=start.commitAt-1e-6);
    if(hold)assert.ok(commit.at>=start.commitAt+.31,name+' hold survived default commit time');
  }
  if(interrupt)assert.ok(!run.events.some(e=>e.type==='oneHitCommitted'));
  if (process.env.DISASTER_AERIAL_WINDUP_CHECK==='1' && aerial && !interrupt) {
    const clip='AllNatural_Aerial_Vortex_Wave';
    const beginning=run.frames.filter(f=>f.phase==='startup'&&f.clip===clip&&Number.isFinite(f.clipTime));
    const after=run.frames.filter(f=>f.phase==='active'&&f.clip===clip&&Number.isFinite(f.clipTime));
    const launched=run.events.find(e=>e.type==='oneHitWave');
    if (!lightning) {
      assert.ok(beginning.length>=3,'the NORMAL Full Gale aerial wind-up starts during startup');
      assert.ok(beginning.at(-1).clipTime>beginning[0].clipTime+.04,
        'the aerial sword actually advances during startup rather than hovering');
      assert.ok(after.length>=2,'the same vortex clip continues after commit');
      assert.ok(after[0].clipTime>=beginning.at(-1).clipTime-.07,
        'the aerial wind-up must not restart from frame zero on commit');
    } else {
      assert.ok(after.length>=3,'aerial Lightning arrival plays wind-up rather than hovering');
      assert.ok(after[0].clipTime>.40,'teleport arrival skips directly to the final winding frames');
      assert.ok(after.some(f=>f.clipTime>after[0].clipTime+.07),
        'the sword winds up during the steerable post-teleport aim window');
    }
    assert.ok(launched,'the authoritative aerial wave actually launched');
    console.log('[AERIAL WINDUP PASS]',name,JSON.stringify({
      startupSamples:beginning.length,arrivalSamples:after.length,
      first:beginning[0]?.clipTime??after[0]?.clipTime,
      last:beginning.at(-1)?.clipTime??after.at(-1)?.clipTime,
      launchAt:launched.at,
    }));
  }
  evidence[name]={...run,restored};
  console.log('[DISASTER CAMERA PASS]',name,JSON.stringify({
    start:start.at,commit:commit.at,form:commit.form,peakChase:Math.max(...run.frames.map(f=>f.chase)),
    firstActive:run.frames.find(f=>f.phase==='active'),restored,
  }));
}

try{
  const target=await chrome.target();
  cdp=new CdpClient(target.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Page.navigate',{url:url+'/?debug'});
  await poll(()=>evaluate("document.querySelector('#loading-veil')?.classList.contains('done')"),'main menu',45000);
  await click('[data-tutorial-onboarding-skip]');
  await evaluate(`(() => {
    const input=document.querySelector('#player-name');
    input.value='Disaster Tester';input.dispatchEvent(new Event('input',{bubbles:true}));
  })()`);
  await click('#armory-button');
  await click('#armory-slot-masterstroke');
  await click('#armory-ultimates [data-ultimate=one_hit_of_wonders]');
  await click('#armory-equip-btn');
  await click('#armory-inspector-close');
  await click('#armory-back');
  await click('#solo-button');
  await click('#practice-mode');
  await click('#solo-launch');
  await poll(()=>evaluate(`${rt}?.localAuth?.ultimate==='one_hit_of_wonders' &&
    document.querySelector('#arena-gate').classList.contains('hidden')`),'equipped local Practice',45000);
  await click('#practice-drawer-close');
  if(process.env.DISASTER_AERIAL_WINDUP_CHECK==='1'){
    // The acceptance is about the authored clip, not the provisional
    // Slash_3 used while the production GLB finishes downloading.
    await evaluate("import('/client/game/SpellbladeAssets.mjs').then(m=>m.preloadSpellbladeAssets())");
    await poll(()=>evaluate("Boolean(window.__ssRuntime.remotePlayers.self?.visualInstance?.animator?.actions?.has('AllNatural_Aerial_Vortex_Wave'))"),
      'authored Gale animation loaded before aerial playback',30000);
  }
  await evaluate(`(() => {
    const rt=${rt};
    for(const type of ['keydown','keyup'])document.addEventListener(type,event=>{
      if(event.code==='KeyR')window.__disasterRun?.keys.push({type,repeat:event.repeat,...${control}});
    });
    rt.socket.on('events',batch=>{
      const run=window.__disasterRun;
      if(run)run.events.push(...batch.events.filter(e=>e.playerId===rt.playerId&&
        ['ultimateStart','oneHitCommitted','oneHitWave','ultimateInterrupted'].includes(e.type)));
    });
    const frame=()=>{
      const run=window.__disasterRun, a=rt.localAuth?.ultimateState;
      if(run && run.frames.length<3000){
        const chase=rt.chase??0, body=!!rt.remotePlayers.self?.root.visible, hands=rt.weapon.group.visible;
        const animator=rt.remotePlayers.self?.visualInstance?.animator;
        run.frames.push({now:rt.socket.serverNow(),phase:a?.phase,commitAt:a?.commitAt,
          clip:animator?.activeClip??null,clipTime:animator?.activeAction?.time??null,
          holding:a?.phase==='startup'&&Number.isFinite(a?.teleportHoldAt),chase,body,hands,wave:rt.input.oneHitWaveId,
          restored:!a&&chase<.05&&hands&&!body&&
            run.events.some(e=>e.type==='oneHitCommitted'||e.type==='ultimateInterrupted')});
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  })()`);
  if(process.env.DISASTER_AERIAL_WINDUP_CHECK==='1'){
    // Isolate the two changed aerial animations; unrelated ground-camera
    // fixtures must not obscure a failed or passing aerial regression.
    await play('aerial Gale',{preset:'gale',aerial:true});
    await play('aerial Full Lightning',{preset:'gale-lightning',aerial:true,lightning:true});
  }else{
    await play('ground tap');
    await play('ordinary hold',{hold:true});
    await play('partial Lightning',{preset:'partial'});
    await play('ground Full Lightning',{preset:'full',lightning:true});
    await play('aerial Gale',{preset:'gale',aerial:true});
    await play('aerial Full Lightning',{preset:'gale-lightning',aerial:true,lightning:true});
    await play('interrupted Full Lightning',{preset:'full',lightning:true,interrupt:true});
  }
  await snap('first-person-restored');
  await writeFile(join(output,'result.json'),JSON.stringify(evidence,null,2));
}catch(error){
  console.error('[DISASTER CAMERA FAIL]',stage,error.stack);
  const trace=await observed('valueOf()').catch(()=>null);
  const lastControl=await evaluate(control).catch(()=>null);
  await writeFile(join(output,'failure.json'),JSON.stringify({stage,error:String(error),trace,lastControl,evidence},null,2));
  throw error;
}finally{
  cdp?.close();chrome.child.kill('SIGTERM');await sleep(400);
  await rm(profile,{recursive:true,force:true}).catch(()=>{});
}
