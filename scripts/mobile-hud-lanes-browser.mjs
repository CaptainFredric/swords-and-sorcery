// Exercise actual HUD/touch DOM in real landscape-phone Chrome.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {createGameServer} from '../server/src/server.mjs';
import {launchAcceptanceChrome} from './acceptance-chrome.mjs';
import {CdpClient} from './browser-cdp.mjs';

const output='output/playwright/mobile-hud-lanes';
await mkdir(output,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'castleward-hud-lanes-'));
const game=createGameServer({host:'127.0.0.1',port:0});
let chrome,cdp;
const results=[];
async function ev(expression){
  const r=await cdp.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);
  return r.result?.value;
}
async function poll(fn,what,ms=35000){
  const until=Date.now()+ms;
  while(Date.now()<until){if(await fn().catch(()=>false))return;await sleep(110);}
  throw Error('Timed out: '+what);
}
async function shot(name){
  const r=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(join(output,name+'.png'),Buffer.from(r.data,'base64'));
}
const clear=(a,b,gap=1)=>a.right+gap<=b.left||b.right+gap<=a.left||
  a.bottom+gap<=b.top||b.bottom+gap<=a.top;
async function stage(kind){
  const js=[
    '(async()=>{const rt=window.__ssRuntime,now=rt.socket.serverNow();',
    "const local={...rt.localAuth,alive:true,spell:'steel',spellReadyAt:0},snap={...rt.latestSnapshot};",
    'local.operatingRamId=null;local.operatingBallistaId=null;local.operatingFightFlightId=null;',
    "if('",kind,"'==='ram'){local.operatingRamId=rt.__hudMachines.ram.id;snap.soFistication=rt.__hudMachines.ram;}",
    "if('",kind,"'==='ballista'){local.operatingBallistaId=rt.__hudMachines.ballista.id;snap.bibyeBallista=rt.__hudMachines.ballista;}",
    "if('",kind,"'==='flight'){local.operatingFightFlightId=rt.__hudMachines.flight.id;snap.fightFlight=rt.__hudMachines.flight;}",
    'rt.__lastHudLocal=local;rt.__lastHudSnap=snap;',
    'rt.__hudUpdate(local,snap,now);rt.__touchUpdate(local,now,{snapshot:snap,practice:false});',
    "rt.hud.addFeed('Squire Rowan was defeated by Warden Alden and his unreasonably large equipment');",
    "rt.hud.subtitle({text:'What!? But I am a knight!',name:'SQUIRE ROWAN',seconds:9});",
    '})()',
  ].join('');
  await ev(js);
  await sleep(275); // allow frame-throttled Steel collision adjustment
  await ev("(()=>{const rt=window.__ssRuntime;rt.__touchUpdate(rt.__lastHudLocal,"+
    "rt.socket.serverNow(),{snapshot:rt.__lastHudSnap,practice:false})})()");
  await sleep(120);
}
async function measure(){
  return ev("(()=>{const box=el=>{if(!el)return null;const r=el.getBoundingClientRect();"+
    "return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,"+
    "visible:!el.hidden&&getComputedStyle(el).display!=='none'};};"+
    "const b=s=>box(document.querySelector(s)),sh=document.querySelector('#game-shell').getBoundingClientRect();"+
    "return {w:sh.width,h:sh.height,objective:b('#breakthrough-hud'),feed:b('#kill-feed'),"+
    "leave:b('.touch-interact'),view:b('.touch-siegeView'),hp:b('.health-block'),"+
    "drive:b('.drive-housing'),subtitle:b('#subtitle'),gauge:b('.machine-gauge'),flightHud:b('.flight-charge-rail'),"+
    "steel:b('.touch-spell'),prime:b('.touch-siegeSkill')};})()");
}
function verify(kind,x,screen){
  const {objective:o,feed:f,leave:l,view:v,hp,drive:d,subtitle:s,gauge:g,steel,prime}=x;
  assert.ok(o.visible&&o.width>90&&o.width<=240&&o.height<85,screen+' '+kind+' compact objective');
  assert.ok(o.left>hp.right+2,screen+' '+kind+' objective clears personal HP');
  assert.ok(o.top<110,screen+' '+kind+' objective moved upward');
  assert.ok(f.visible&&f.top>l.bottom+6,
    screen+' '+kind+' feed below LEAVE');
  // Ballista VIEW is intentionally near BOTH, well below the compact feed;
  // other View buttons occupy the top-right row, directly above the feed.
  assert.ok(clear(f,v,4),screen+' '+kind+' feed never covers VIEW');
  assert.ok(f.right<=x.w+2&&f.left>=0,screen+' '+kind+' feed in viewport');
  assert.ok(clear(o,f,2),screen+' '+kind+' objective and killfeed clear');
  assert.ok(s.visible&&s.bottom<=x.h+3,screen+' '+kind+' subtitle visible');
  if(kind!=='foot'){
    assert.ok(g.visible&&g.bottom<=x.h+3,screen+' '+kind+' siege health visible');
    assert.ok(s.bottom<=g.top-5&&s.bottom>=g.top-15,
      screen+' '+kind+' subtitle just above siege health');
  }else assert.ok(s.bottom>x.h-55,screen+' on-foot subtitle remains low');
  if(kind==='flight'){
    const flight=x.flightHud;
    assert.ok(flight.visible&&flight.width>=100&&flight.width<=170,
      screen+' Flight charge rail remains compact below personal stamina');
    assert.ok(clear(flight,f,3)&&clear(flight,o,3),
      screen+' Flight meters stay in a lane separate from objective and kills');
  }
  if(kind==='ram'){
    assert.ok(d.visible&&d.top>=hp.bottom+2&&d.top<hp.bottom+55,
      screen+' Drive Pressure beside personal HUD');
    assert.ok(Math.abs(d.left-hp.left)<22,screen+' Drive Pressure left aligned');
    assert.ok(clear(d,o,2),screen+' Drive Pressure avoids objective');
    if(steel.visible&&prime.visible)
      assert.ok(clear(steel,prime,7),screen+' Steel and Prime touch targets do not overlap');
  }
}
try{
  await game.start();
  const url='http://127.0.0.1:'+game.address().port;
  chrome=launchAcceptanceChrome(process.env.CHROME_BIN??'chromium',profile,
    join(output,'chrome.log'),{width:844,height:390});
  const target=await chrome.target();
  cdp=new CdpClient(target.webSocketDebuggerUrl);
  await cdp.connect();await cdp.send('Page.enable');await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true,
    screenOrientation:{type:'landscapePrimary',angle:90}});
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  await cdp.send('Page.navigate',{url:url+'/?debug'});
  await poll(()=>ev("document.querySelector('#loading-veil')?.classList.contains('done')"),'menu loaded');
  await ev("document.querySelector('[data-tutorial-onboarding-skip]')?.click();"+
    "document.querySelector('#player-name').value='HUD Tester';"+
    "document.querySelector('#breakthrough-button').click()");
  await poll(()=>ev("!document.querySelector('#breakthrough-menu')?.classList.contains('hidden')"),'battle menu');
  await ev("document.querySelector('[data-arena=\"bastion-breach\"]').click();"+
    "document.querySelector('#breakthrough-play-bots').click()");
  await poll(()=>ev("Boolean(window.__ssRuntime?.latestSnapshot?.roomState==='PLAYING'&&window.__ssRuntime?.localAuth?.alive)"),
    'in live battle',40000);
  await ev(["(async()=>{const rt=window.__ssRuntime;rt.enableTouch();rt.touch.setActive(true);",
    "document.body.classList.add('touch-ui');",
    "const [ram,bb,flight]=await Promise.all([import('/shared/sim/soFistication.mjs'),",
    "import('/shared/sim/biByeLlista.mjs'),import('/shared/sim/fightFlight.mjs')]);",
    "rt.__hudMachines={ram:ram.createSoFistication({id:'safe-ram',x:0,y:0,z:0}),",
    "ballista:bb.createBiByeLlista({id:'safe-bb',x:0,y:0,z:0,baseYaw:0}),",
    "flight:flight.createFightFlight({id:'safe-flight'})};",
    "rt.__hudUpdate=rt.hud.update.bind(rt.hud);rt.__touchUpdate=rt.touch.update.bind(rt.touch);",
    "rt.hud.update=()=>{};rt.touch.update=()=>{};})()"].join(''));
  for(const [w,h] of [[844,390],[768,354]]){
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:true,
      screenOrientation:{type:'landscapePrimary',angle:90}});
    await sleep(230);
    for(const kind of ['foot','ram','ballista','flight']){
      await stage(kind);
      const boxes=await measure();
      verify(kind,boxes,w+'x'+h);
      results.push({screen:w+'x'+h,kind,boxes});
      await shot(w+'x'+h+'-'+kind);
      console.log('[MOBILE HUD PASS]',w+'x'+h,kind);
    }
    // Simulate a previously customized ram layout with overlapping controls.
    await ev("(()=>{const rt=window.__ssRuntime;"+
      "rt.touch.layouts.ram.spell={right:100,bottom:60,size:54,custom:true};"+
      "rt.touch.applyLayout(rt.touch.layouts)})()");
    await stage('ram');
    const boxes=await measure();
    verify('ram',boxes,w+'x'+h+' custom');
    results.push({screen:w+'x'+h,kind:'custom-ram',boxes});
    await shot(w+'x'+h+'-custom-ram');
    console.log('[CUSTOM STEEL CLEARANCE PASS]',w+'x'+h);
  }
  // A portrait-locked browser can rotate the whole game shell. The gauge's
  // screen rectangle is then wide/tall SWAPPED, but its subtitle clearance
  // MUST remain the native layout height in the game's coordinate system.
  const rotated=await ev("(()=>{const shell=document.querySelector('#game-shell');"+
    "shell.style.transform='rotate(90deg)';"+
    "const rt=window.__ssRuntime;rt.hud.subtitle({text:'Squire Rowan insists he remains a knight',"+
    "name:'SQUIRE ROWAN',seconds:3});return true})()");
  assert.equal(rotated,true);
  await sleep(220);
  const rotatedMeasure=await ev("(()=>{const rt=window.__ssRuntime,g=rt.hud.machineGauge;"+
    "return {native:g.offsetHeight,screen:g.getBoundingClientRect().height,"+
    "clearance:parseFloat(rt.hud.root.style.getPropertyValue('--siege-gauge-height'))};})()");
  assert.ok(Math.abs(rotatedMeasure.clearance-Math.max(30,rotatedMeasure.native))<=1,
    '90-degree phone rotation never confuses siege gauge WIDTH with its CSS HEIGHT');
  assert.ok(rotatedMeasure.screen>rotatedMeasure.native+35,
    'the rotated test actually exercises nontrivially swapped screen dimensions');
  results.push({kind:'rotated-shell-gauge',rotatedMeasure});
  await ev("document.querySelector('#game-shell').style.transform=''");
  console.log('[ROTATED PHONE CAPTION PASS]',JSON.stringify(rotatedMeasure));
  await writeFile(join(output,'result.json'),JSON.stringify(results,null,2)+'\n');
}catch(error){
  console.error('[MOBILE HUD FAIL]',error.stack);
  await writeFile(join(output,'failure.json'),JSON.stringify({error:String(error),results},null,2));
  await shot('failure').catch(()=>{});
  process.exitCode=1;
}finally{
  cdp?.close();chrome?.child?.kill('SIGTERM');
  await game.stop().catch(()=>{});await sleep(350);
  await rm(profile,{recursive:true,force:true}).catch(()=>{});
}
