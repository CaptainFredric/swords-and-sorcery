// Real browser inputs against a real authority. Fixtures set only initial room,
// carriage, player placement and a Steel loadout. No hit or outcome injection.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {createRequire} from 'node:module';
import {aim,focus} from './bibye-browser-inputs.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE??'playwright');
const version=process.env.RAM_VERSION??'after',root=new URL('../',import.meta.url).pathname;
const source=version==='before'?(process.env.RAM_BASELINE_REPO??root+'../swords-and-sorcery-frost-guard/'):root;
const {createGameServer}=await import(source+'server/src/server.mjs'),{ProfileStore}=await import(source+'server/src/ProfileStore.mjs'),{createSoFistication}=await import(source+'shared/sim/soFistication.mjs');
const dir=root+'output/playwright/ram-contacts/';await mkdir(dir,{recursive:true});
const store=await mkdtemp(tmpdir()+'/ram-contacts-'),game=createGameServer({port:0,host:'127.0.0.1',profileStore:new ProfileStore(store)});await game.start();
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const results={version,cases:[],errors:[]};
const cases=(process.env.RAM_CASE??(version==='before'?'nudge,touch':'nudge,charge,guard,steel,piston,touch,touch-left,touch-right')).split(',');
const read=page=>page.evaluate(()=>{const r=window.__ssRuntime;return {p:r.localAuth,b:r.latestSnapshot.soFistication,input:r.input.movement(),events:window.__ramContacts??[],camera:r.camera.position.toArray(),yaw:r.input.yaw,enabled:r.input.enabled,touch:r.input.touch?{held:[...r.input.touch.held],stick:r.input.touch.stick,button:r.input.touch.chargeHeld,requested:r.input.touch.stickSprintRequested,ram:r.input.touch.ramMounted}:null};});
async function shot(page,id){const cdp=await page.context().newCDPSession(page),s=await cdp.send('Page.captureScreenshot',{format:'png'});await cdp.detach();await writeFile(dir+version+'-'+id+'.png',Buffer.from(s.data,'base64'));}
try{
for(const id of cases){
 const touch=id.startsWith('touch'),angle=id==='touch-left'?90:id==='touch-right'?-90:0,now=performance.now()/1000,room=game.roomManager.createPrivateRoom(now,'castleward');
 for(const role of ['operator','target'])room.addPlayer({id:role,token:id+'-'+role,name:role},now);room.startMatch(now);
 for(const role of ['operator','target']){
  const p=room.players.get(role);Object.assign(p,{connected:false,disconnectExpiresAt:now+3600,position:role==='operator'?{x:15.3,y:0,z:id==='nudge'?-15.2:4.7}:{x:15.3,y:0,z:touch?-21:id==='nudge'?-21.75:id==='piston'?-1.7:-19},yaw:role==='operator'?0:Math.PI,spawnProtectionUntil:0,history:[]});p.input.yaw=p.yaw;
  if(role==='target'&&id==='steel'){p.spell='steel';p.loadout={...p.loadout,spell:'steel'};}
 }
 room.soFistication=createSoFistication({id:'ram-'+id,x:15.3,z:id==='nudge'?-18.3:1.6});
 const contexts=[],pages=[];
 try{
  for(const role of touch?['operator']:['operator','target']){
   const context=await browser.newContext({viewport:touch?(angle?{width:600,height:960}:{width:960,height:600}):{width:1280,height:800},hasTouch:touch,isMobile:touch,recordVideo:role==='operator'?{dir:dir+'raw',size:touch?(angle?{width:600,height:960}:{width:960,height:600}):{width:1280,height:800}}:undefined});contexts.push(context);
   await context.addInitScript(({token,code,angle})=>{if(angle)localStorage.setItem('ss-settings',JSON.stringify({version:1,values:{'display.orientation':'sideways','display.turnSide':angle>0?'left':'right'}}));localStorage.setItem('ss-session-token',token);localStorage.setItem('ss-room-code',code);},{token:id+'-'+role,code:room.code,angle});
   const page=await context.newPage();pages.push(page);page.on('pageerror',e=>results.errors.push(e.message));const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:true});
   await page.goto(`http://127.0.0.1:${game.address().port}/?debug`,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#loading-veil')?.classList.contains('done'),null,{timeout:60000});await page.waitForFunction(()=>window.__ssRuntime?.localAuth&&window.__ssRuntime.ramRenderer?.model);
   const skip=page.locator('[data-tutorial-onboarding-skip]');if(await skip.isVisible())await skip.click();
   if(touch)await page.locator('#game-canvas canvas').tap({position:{x:500,y:250}});else await focus(page);
   await page.evaluate(()=>{window.__ramContacts=[];window.__ssRuntime.socket.on('events',b=>window.__ramContacts.push(...b.events));});
  }
  const [operator,target]=pages;
  if(touch)await operator.locator('.touch-interact').tap();else{await focus(operator);await operator.keyboard.press('t');}
  await operator.waitForFunction(()=>window.__ssRuntime.localAuth.operatingRamId);await operator.waitForTimeout(250);
  if(!touch)await aim(operator,0,-.12);
  const samples=[{label:'mounted',...await read(operator)}];
  if(touch){
   const cdp=await contexts[0].newCDPSession(operator),box=await operator.locator('.touch-stick').boundingBox(),buttonBox=await operator.locator('.touch-sprint').boundingBox();
   const stick={x:box.x+box.width/2,y:box.y+box.height/2,id:1},button={x:buttonBox.x+buttonBox.width/2,y:buttonBox.y+buttonBox.height/2,id:2};
   const point=d=>({...stick,x:stick.x+(angle===90?d:angle===-90?-d:0),y:stick.y+(angle?0:-d)});
   const dispatch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});
   const sample=async label=>{await operator.waitForTimeout(230);samples.push({label,...await read(operator)});};
   await dispatch('touchStart',[stick]);await dispatch('touchMove',[point(53)]);await sample('stick-alone');
   for(const d of [51,50,49,50,51]){await dispatch('touchMove',[point(d)]);await sample('threshold-'+d);}
   await shot(operator,id+'-stick');
   await dispatch('touchStart',[point(53),button]);await dispatch('touchMove',[point(28),button]);await sample('button-holds');
   await dispatch('touchMove',[point(53),button]);await dispatch('touchEnd',[button]);await sample('stick-holds');
   await dispatch('touchMove',[point(28)]);await sample('both-released');
   await dispatch('touchStart',[point(28),button]);await dispatch('touchEnd',[point(28)]);await sample('button-alone');await shot(operator,id+'-button');
   await dispatch('touchCancel',[]);await sample('cancelled');
   await writeFile(dir+version+'-'+id+'-samples.json',JSON.stringify(samples));
   if(version==='after')for(const s of samples.slice(1))assert.equal(s.b.charging,!['both-released','cancelled'].includes(s.label),s.label);
   await dispatch('touchStart',[stick]);await dispatch('touchMove',[point(53)]);
   await operator.setViewportSize(angle?{width:960,height:600}:{width:600,height:960});await sample('orientation-cancelled');
   assert.equal(samples.at(-1).input.sprint,false);assert.equal(samples.at(-1).input.forward,0);
   await dispatch('touchCancel',[]);
   // Portrait correctly presents a modal that blocks the controls. Choose the
   // same explicit continuation a player must choose before testing dismount.
   const dismiss=operator.locator('#rotate-dismiss');
   if(await dismiss.isVisible())await dismiss.tap();
   await operator.locator('.touch-interact').tap();await operator.waitForFunction(()=>!window.__ssRuntime.localAuth.operatingRamId);samples.push({label:'dismounted',...await read(operator)});assert.equal(samples.at(-1).input.sprint,false);
  }else{
   if(id==='guard'){await focus(target);await target.keyboard.down('g');await target.waitForTimeout(300);}
   await focus(operator);
   const started=Date.now();
   if(id==='nudge'){
    for(let i=0;i<6;i++){
     await operator.keyboard.down('w');await operator.waitForTimeout(620);await operator.keyboard.up('w');await operator.waitForTimeout(360);
     await operator.keyboard.down('s');await operator.waitForTimeout(270);await operator.keyboard.up('s');await operator.waitForTimeout(250);
     samples.push({label:'nudge-'+i,...await read(operator)});
    }
   }else{
    await operator.keyboard.down(id==='piston'?'f':'Shift');
    if(id==='steel'){
     await operator.waitForFunction(()=>window.__ssRuntime.latestSnapshot.soFistication.z< -10,null,{timeout:20000});
     await target.keyboard.press('q');await target.waitForFunction(()=>window.__ssRuntime.localAuth.steel);
    }
    await operator.waitForFunction(()=>window.__ramContacts.some(e=>e.type==='soFistImpact'),null,{timeout:20000});
    await operator.keyboard.up(id==='piston'?'f':'Shift');samples.push({label:'impact',...await read(operator)});
   }
   await shot(operator,id);await shot(target,id+'-target');
   const events=room.events.filter(e=>e.type==='damage'||e.type==='soFistImpact'),targetState=await read(target);
   const damage=samples.at(-1).events.filter(e=>e.type==='damage'&&e.victimId==='target');
   if(version==='after'){if(id==='nudge'){assert.equal(damage.length,0);assert.equal(targetState.p.health,100);assert.equal(targetState.p.deaths,0);assert.ok(targetState.p.position.z>=-21.851)}else assert.ok(damage.length>=1);}
   results.cases.push({id,elapsed:Date.now()-started,damage,target:targetState.p,events,samples});
  }
  if(touch)results.cases.push({id,samples});
  await writeFile(dir+version+'-'+id+'.json',JSON.stringify(results.cases.at(-1)));
  const video=operator.video();await contexts[0].close();await video.saveAs(dir+version+'-'+id+'.webm');
  console.log(version,id,JSON.stringify(touch?samples.map(s=>({label:s.label,charge:s.b.charging,signal:s.input.sprint,pressure:s.b.pressure})):results.cases.at(-1).damage));
 }catch(error){console.log('FAILED',id,JSON.stringify(await read(pages[0])));await shot(pages[0],id+'-failed');throw error;}finally{for(const context of contexts)await context.close().catch(()=>{});}
}
assert.deepEqual(results.errors,[]);
}finally{await writeFile(dir+version+'.json',JSON.stringify(results));await browser.close();await game.stop();await rm(store,{recursive:true,force:true});}
