// Two real network clients; only initial room, machine and player placement are
// fixtures. All aim, Guard, firing, Steel and view changes use browser input.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {createRequire} from 'node:module';
import {aim,state,focus} from './bibye-browser-inputs.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE??'playwright');
const version=process.env.FROST_VERSION??'after';
const source=version==='before'?(process.env.FROST_BASELINE_REPO??new URL('../../swords-and-sorcery-ballista-v32/',import.meta.url).pathname).replace(/\/?$/,'/'):new URL('../',import.meta.url).pathname;
const {createGameServer}=await import(source+'server/src/server.mjs'),{ProfileStore}=await import(source+'server/src/ProfileStore.mjs'),{createBiByeLlista}=await import(source+'shared/sim/biByeLlista.mjs');
const dir=new URL('../output/playwright/bibye-frost/',import.meta.url).pathname;await mkdir(dir,{recursive:true});
const store=await mkdtemp(tmpdir()+'/bibye-frost-'),game=createGameServer({port:0,host:'127.0.0.1',profileStore:new ProfileStore(store)});await game.start();
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const scenarios=[{id:'unguarded',hp:82},{id:'front-block',guard:true,hp:95},{id:'side',guard:true,yaw:Math.PI/2,hp:82},{id:'rear',guard:true,yaw:0,hp:82},{id:'parry',guard:true,timed:180,hp:100},{id:'late-parry',guard:true,timed:400,hp:95},{id:'splash',guard:true,splash:true,yaw:Math.atan2(-1.6,.6)},{id:'steel',steel:true,hp:88}];
const results={version,cases:[],errors:[]};
async function capture(page,name){
 const data=await page.evaluate(()=>window.__frostCapture?.png);
 if(data)await writeFile(dir+version+'-'+name+'.png',Buffer.from(data.split(',')[1],'base64'));
 else{const cdp=await page.context().newCDPSession(page);const shot=await cdp.send('Page.captureScreenshot',{format:'png'});await writeFile(dir+version+'-'+name+'.png',Buffer.from(shot.data,'base64'));await cdp.detach();}
}
try{
for(const cfg of scenarios.filter(c=>!process.env.FROST_CASE||process.env.FROST_CASE.split(',').includes(c.id))){
 const now=performance.now()/1000,room=game.roomManager.createPrivateRoom(now,'castleward');
 for(const id of ['operator','target'])room.addPlayer({id,token:cfg.id+'-'+id,name:id},now);room.startMatch(now);
 for(const id of ['operator','target']){const p=room.players.get(id);Object.assign(p,{connected:false,disconnectExpiresAt:now+3600,position:id==='operator'?{x:18,y:0,z:5.1}:{x:18,y:0,z:-6},yaw:id==='operator'?0:cfg.yaw??Math.PI,spawnProtectionUntil:0,history:[]});p.input.yaw=p.yaw;if(id==='target'&&cfg.steel){p.spell='steel';p.loadout={...p.loadout,spell:'steel'};}}
 room.biByeLlista=createBiByeLlista({id:'bibye-'+cfg.id,x:18,y:0,z:2,baseYaw:0});
 const contexts=[],pages=[],sessions=[];
 try{
  for(const role of ['operator','target']){
   const context=await browser.newContext({viewport:{width:1280,height:800},recordVideo:{dir:dir+'/video',size:{width:1280,height:800}}});contexts.push(context);
   await context.addInitScript(({role,token,code})=>{localStorage.setItem('ss-session-token',token);localStorage.setItem('ss-room-code',code);},{role,token:cfg.id+'-'+role,code:room.code});
   const page=await context.newPage();pages.push(page);page.on('pageerror',e=>results.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/WebGLProgram|shader/.test(m.text()))results.errors.push(m.text());});
   const cdp=await context.newCDPSession(page);sessions.push(cdp);await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:true});
   await page.goto(`http://127.0.0.1:${game.address().port}/?debug`,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#loading-veil')?.classList.contains('done'),null,{timeout:60000});await page.waitForFunction(()=>window.__ssRuntime?.localAuth&&window.__ssRuntime.world.biByeLlista.authoredModel);
   const skip=page.locator('[data-tutorial-onboarding-skip]');if(await skip.isVisible())await skip.click();await focus(page);
   await page.evaluate(()=>{window.__frostEvents=[];window.__frostMarkers=[];const hud=window.__ssRuntime.hud,hit=hud.hit.bind(hud);hud.hit=(kind,...options)=>{const result=hit(kind,...options);window.__frostMarkers.push({kind,at:performance.now(),playerId:window.__ssRuntime.socket.playerId,classes:hud.crosshair.className,opacity:getComputedStyle(hud.crosshair,'::before').opacity});return result;};window.__ssRuntime.socket.on('events',batch=>{window.__frostEvents.push(...batch.events);if(!window.__frostCapture&&batch.events.some(e=>e.type==='bibyeFrostBlast'))requestAnimationFrame(()=>{const r=window.__ssRuntime;window.__frostCapture={png:r.renderer.domElement.toDataURL('image/png'),marker:r.hud.hitKind,at:r.socket.serverNow(),atMs:performance.now()};});});});
  }
  const [operator,target]=pages;
  await focus(operator);await operator.keyboard.press('t');await operator.waitForFunction(()=>window.__ssRuntime.localAuth.operatingBallistaId);await operator.keyboard.press('z');await operator.waitForTimeout(400);
  // Calibrate current camera against the target's real torso or nearby ground.
  for(let i=0;i<3;i++){const s=await state(operator),p=s.players.find(p=>p.id==='target').position,x=p.x+(cfg.splash?1.6:0),y=p.y+(cfg.splash?0:.95),z=p.z-(cfg.splash?.6:0);await aim(operator,Math.atan2(s.camera[0]-x,s.camera[2]-z),Math.atan2(y-s.camera[1],Math.hypot(x-s.camera[0],z-s.camera[2])));await operator.waitForTimeout(200);}
  if(cfg.steel){await focus(target);await target.keyboard.press('q');await target.waitForFunction(()=>window.__ssRuntime.localAuth.steel);}
  if(cfg.guard&&cfg.timed!==180){await focus(target);await target.keyboard.down('g');await target.waitForTimeout(cfg.timed??350);}
  await focus(operator);
  const before={operator:await state(operator),target:await state(target)};
  if(cfg.timed===180){
   await operator.keyboard.press('f');
   // Observe live flight only to time a normal Guard key press. Renderer
   // snapshots may already be a tick old, so this fixture reads authority.
   const until=Date.now()+3000;let ready=false;
   while(Date.now()<until){
    const bolt=[...(room.bibyeProjectiles?.values()??[])].find(p=>p.subKind==='conditioning');
    if(bolt){const v=room.players.get('target'),seconds=(Math.hypot(bolt.position.x-v.position.x,bolt.position.z-v.position.z)-.45-bolt.radius)/48;if(seconds>=0&&seconds<.14){ready=true;break;}}
    await new Promise(resolve=>setTimeout(resolve,5));
   }
   assert.ok(ready,'observed actual approaching bolt');
   await target.keyboard.down('g');
  }else await operator.keyboard.press('f');
  await operator.waitForFunction(()=>window.__frostEvents.some(e=>e.type==='bibyeBoltImpact'&&e.subKind==='conditioning'));
  const ui=sessions[0];const shot=await ui.send('Page.captureScreenshot',{format:'png'});await writeFile(dir+version+'-'+cfg.id+'-ui.png',Buffer.from(shot.data,'base64'));
  const after={operator:await state(operator),target:await state(target),events:await operator.evaluate(()=>window.__frostEvents),marker:await operator.evaluate(()=>window.__frostCapture?.marker??window.__ssRuntime.hud.hitKind),markerCalls:await operator.evaluate(()=>window.__frostMarkers),captureMoment:await operator.evaluate(()=>{const c=window.__frostCapture;return c?{...c,png:undefined}:null;})};
  await capture(operator,cfg.id+'-impact');await capture(target,cfg.id+'-defender');
  console.log(cfg.id,JSON.stringify({health:after.target.player.health,guard:after.target.player.guardStamina,chill:after.target.player.chill,events:after.events.filter(e=>e.type.startsWith('bibyeFrost')||e.type==='bibyeBoltImpact'),enabled:[after.operator.enabled,after.target.enabled]}));
  if(version==='after'){const expected=cfg.id==='parry'?'parry':cfg.guard&&!['side','rear'].includes(cfg.id)?'block':'hit';assert.ok(after.markerCalls.some(m=>m.kind===expected));if(expected==='parry')assert.ok(after.markerCalls.some(m=>m.opacity==='1'));}
  if(cfg.splash&&version==='after'){const e=after.events.find(e=>e.type==='bibyeFrostContact');assert.equal(e.direct,false);assert.equal(e.outcome,'block');assert.ok(e.staminaDrain>0);}
  if(cfg.hp!=null)assert.equal(after.target.player.health,version==='before'&&cfg.guard?100:cfg.hp);
  await writeFile(dir+version+'-'+cfg.id+'.json',JSON.stringify({id:cfg.id,before,after},null,2));
  const video=operator.video();await contexts[0].close();await video.saveAs(dir+version+'-'+cfg.id+'.webm');await contexts[1].close();results.cases.push({id:cfg.id,before,after});
 }finally{for(const c of contexts)await c.close().catch(()=>{});}
}
assert.deepEqual(results.errors,[]);
}finally{await writeFile(dir+version+'-results.json',JSON.stringify(results,null,2));await browser.close();await game.stop();await rm(store,{recursive:true,force:true});}
