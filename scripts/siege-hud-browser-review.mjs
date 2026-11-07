// Chrome acceptance for the actual HUD DOM using simulated authoritative snapshots.
// No synthetic damage enters RoomManager; the fixture only exercises display state.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const host=(process.env.SIEGE_BROWSER_URL??'http://127.0.0.1:3001').replace(/\/$/,'');
const output='output/playwright/siege-hud-review';
await mkdir(output,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'ss-siege-hud-'));
const port=9276;
const chrome=spawn(process.env.CHROME_BIN??'chromium',[
  '--headless=new','--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader',
  '--remote-allow-origins=*','--window-size=960,560',
  '--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws,seq=0;
const pending=new Map(),errors=[];
async function until(fn,label,attempts=150) {
  let last;
  for(let i=0;i<attempts;i++){try{const v=await fn();if(v)return v;}catch(e){last=e;}await sleep(150);}
  throw Error('Timed out: '+label+(last?': '+last.message:''));
}
async function command(method,params={}) {
  const id=++seq;
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'));},12000);
    pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});
    ws.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression) {
  const d=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(d.exceptionDetails)throw Error(d.exceptionDetails.exception?.description??d.exceptionDetails.text);
  return d.result?.value;
}
async function capture(name) {
  const result=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(output+'/'+name+'.png',Buffer.from(result.data,'base64'));
}
const probe=`(() => {
  const root=document.querySelector('.machine-gauge'),drive=document.querySelector('.drive-housing'),
    player=document.querySelector('.health-block'),stamina=document.querySelector('#guard-block'),
    info=document.querySelector('.hud-status-stack');
  const box=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
  const overlap=(a,b)=>a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom;
  return {kind:root.dataset.kind,componentState:root.dataset.componentState,
    machine:root.querySelector('[data-machine-hp]').textContent,
    part:root.querySelector('[data-component-hp]').textContent,
    fill:root.querySelector('[data-machine-fill]').style.width,
    componentFill:root.querySelector('[data-component-fill]').style.width,
    label:root.querySelector('[data-machine-context]').textContent,
    pitch:root.querySelector('[data-ram-pitch]').textContent,
    pressure:drive.querySelector('[data-drive-value]').textContent,
    headerHidden:document.querySelector('.ballista-hud').hidden,
    mounted:document.querySelector('#hud').classList.contains('ram-mounted'),
    gaugeRect:box(root),playerRect:box(player),staminaRect:box(stamina),driveRect:box(drive),
    scoreRect:box(info),gaugeDisplay:getComputedStyle(root).display,
    pressureDisplay:getComputedStyle(drive).display,
    captionVisible:document.querySelector('#subtitle')?.classList.contains('show') ?? false,
    captionRect:box(document.querySelector('#subtitle')),
    captionOverlap:document.querySelector('#subtitle')?.classList.contains('show')
      ? overlap(box(root),box(document.querySelector('#subtitle'))) : false,
    raisedBadgeOverlap:(()=>{
      const captions=document.querySelector('#subtitle');
      if(!captions?.classList.contains('show'))return false;
      return [...root.querySelectorAll('.machine-piston,.machine-gauge-context')]
        .some(el=>el.textContent?.trim()&&getComputedStyle(el).display!=='none'&&
          overlap(box(el),box(captions)));
    })(),
    pistonContextOverlap:(()=>{
      const piston=root.querySelector('.machine-piston'),
        context=root.querySelector('.machine-gauge-context');
      return getComputedStyle(piston).display!=='none'&&context.textContent.trim()&&
        overlap(box(piston),box(context));
    })(),
    playerOverlapsStamina:overlap(box(player),box(stamina)),
    gaugeOutsideViewport:box(root).left < -2 || box(root).right > innerWidth+2};
})()`;
async function render(machine,phase='attached') {
  return evaluate(`(async()=>{
    const r=window.__ssRuntime, local={...r.localAuth,alive:true};
    const state={...r.latestSnapshot},now=r.socket.serverNow();
    local.operatingRamId=local.operatingBallistaId=local.operatingFightFlightId=null;
    const ram=r.__gaugeFixture.ram,bb=r.__gaugeFixture.bb,flight=r.__gaugeFixture.flight;
    if('${machine}'==='ram'){
      local.operatingRamId=ram.id;
      const fist=ram.components.Fist;
      fist.health='${phase}'==='destroyed'?0:'${phase}'==='attached'?235:135;
      ram.health='${phase}'==='attached'?1400:620;
      ram.fistMounted=['attached','damaged','reattached'].includes('${phase}');
      ram.detachedFist=ram.fistMounted?null:{state:'${phase}'==='destroyed'?'resting':'${phase}'==='recovering'?'recovering':'flying'};
      state.soFistication={...ram,components:{...ram.components,Fist:{...fist}}};
    }
    if('${machine}'==='ballista'){local.operatingBallistaId=bb.id;state.bibyeBallista={...bb,health:321};}
    if('${machine}'==='flight'){local.operatingFightFlightId=flight.id;state.fightFlight={...flight,health:180,rotorHP:44};}
    r.__updateGaugeHud(local,state,now);
    return true;
  })()`);
}
try {
  const page=await until(async()=>{const r=await fetch('http://127.0.0.1:'+port+'/json/list');
    return (await r.json()).find(p=>p.type==='page');},'Chrome debug target',170);
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  ws.onmessage=e=>{const d=JSON.parse(String(e.data));
    if(d.method==='Runtime.exceptionThrown')errors.push(d.params?.exceptionDetails?.text??'unknown JS exception');
    const task=pending.get(d.id);if(!task)return;
    pending.delete(d.id);if(d.error)task.reject(Error(d.error.message));else task.resolve(d.result);};
  await command('Page.enable');await command('Runtime.enable');
  await command('Page.navigate',{url:host+'/?debug'});
  await until(()=>evaluate("document.querySelector('#loading-veil')?.classList.contains('done')"),'menu loaded',170);
  await evaluate("document.querySelector('#player-name').value='Gauge Tester';document.querySelector('#breakthrough-button').click()");
  await until(()=>evaluate("!document.querySelector('#breakthrough-menu').classList.contains('hidden')"),'modes menu');
  await evaluate("document.querySelector('[data-arena=high-grounds]').click();document.querySelector('#breakthrough-play-bots').click()");
  await until(()=>evaluate("window.__ssRuntime?.latestSnapshot?.roomState==='PLAYING'"),'gameplay',200);
  await evaluate(`(async()=>{
    const r=window.__ssRuntime;
    r.enableTouch();r.touch.setActive(true);
    const [ramM,bbM,flightM]=await Promise.all([
      import('/shared/sim/soFistication.mjs'),import('/shared/sim/biByeLlista.mjs'),import('/shared/sim/fightFlight.mjs')]);
    r.__gaugeFixture={
      ram:ramM.createSoFistication({id:'hud-test-ram',x:0,y:0,z:0}),
      bb:bbM.createBiByeLlista({id:'hud-test-bb',x:0,y:0,z:0,baseYaw:0}),
      flight:flightM.createFightFlight({id:'hud-test-flight'})
    };
    r.__gaugeFixture.ram.ramElevPitch=Math.PI/6;
    r.__updateGaugeHud=r.hud.update.bind(r.hud);
    r.hud.update=()=>{};
  })()`);
  const result={};
  for(const phase of ['attached','damaged','launched','recovering','reattached','destroyed']){
    await render('ram',phase);
    const d=await evaluate(probe);result['ram-'+phase]=d;
    assert.equal(d.kind,'ram');
    assert.equal(d.headerHidden,true,'no giant ram status header');
    assert.equal(d.mounted,true);
    assert.equal(d.gaugeOutsideViewport,false);
    assert.equal(d.playerOverlapsStamina,false,'stamina must follow player health, not overlap');
    assert.equal(d.pressure,'100/100');
    assert.match(d.pitch,/30°/);
    assert.equal(d.componentState,phase==='destroyed'?'destroyed':
      ['launched','recovering'].includes(phase)?'detached':'attached');
    if(phase==='reattached')assert.equal(d.part,'135/500','reconnection preserves remaining fist HP');
    if(phase==='damaged'){assert.equal(d.machine,'620/1400');assert.equal(d.part,'135/500');}
    await sleep(410);await capture('ram-'+phase);
  }
  await render('ballista');
  result.ballista=await evaluate(probe);
  assert.equal(result.ballista.machine,'321/650');
  assert.equal(result.ballista.kind,'ballista');
  await capture('ballista');
  await render('flight');
  result.flight=await evaluate(probe);
  assert.equal(result.flight.machine,'180/250');
  assert.equal(result.flight.part,'44/100');
  await capture('flight');
  await evaluate("window.__ssRuntime.hud.subtitle({text:'Nothing can stand before a proper siege, so long as the knight operating it remembers to look where he is going.',name:'SIEGE ENGINEER',seconds:35})");
  await sleep(180);
  const desktopCaption=await evaluate(probe);
  assert.equal(desktopCaption.captionOverlap,false,'desktop subtitle must not overlap siege health');
  await capture('flight-desktop-caption-clearance');
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true,screenWidth:390,screenHeight:844});
  await sleep(300);
  await evaluate("document.body.classList.add('touch-ui')");
  await sleep(320); // font wrapping and caption ResizeObserver settle at mobile width
  for(const kind of ['ram','ballista','flight']){
    await render(kind,'attached');
    await sleep(240); // final font wrapping; subtitles stay in the lane ABOVE the bottom-anchored gauge
    const measure=await evaluate(probe);
    result['mobile-'+kind]=measure;
    assert.equal(measure.gaugeOutsideViewport,false,kind+' gauge stays within portrait screen');
    assert.equal(measure.captionVisible,true,'the long test subtitle is actually showing');
    assert.equal(measure.captionOverlap,false,kind+' gauge must never cover an active subtitle');
    assert.equal(measure.raisedBadgeOverlap,false,kind+' raised instrument badges must not cover subtitles');
    assert.equal(measure.pistonContextOverlap,false,kind+' piston badge must not overlap condition label');
    assert.ok(measure.captionRect.bottom <= measure.gaugeRect.top - 6,
      kind+' keeps a visible gap below the subtitle and ABOVE the bottom-anchored gauge');
    assert.ok(measure.gaugeRect.bottom >= 844 - 35,
      kind+' docks its machine health toward the physical bottom safe area');
    await capture(kind+'-mobile-caption-clearance');
  }
  result.mobile=result['mobile-ram'];
  await capture('ram-mobile-portrait');
  await writeFile(output+'/result.json',JSON.stringify({result,errors},null,2));
  assert.deepEqual(errors,[],'no uncaught page errors');
  console.log('[SIEGE HUD ACCEPTED]',JSON.stringify({kinds:['ram','ballista','flight'],states:Object.keys(result).length}));
} catch(e) {
  console.error('[SIEGE HUD FAILED]',e.stack??String(e));
  await capture('failure').catch(()=>{});
  await writeFile(output+'/failure.json',JSON.stringify({error:String(e),errors},null,2));
  throw e;
} finally {
  ws?.close();chrome.kill('SIGTERM');await sleep(500);
  await rm(profile,{recursive:true,force:true}).catch(()=>{});
}
