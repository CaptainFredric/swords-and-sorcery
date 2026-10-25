// Real desktop/touch controls and authoritative events. Fixtures provide only
// initial placement and normal saved FOV preferences, never aim or hit results.
import assert from 'node:assert/strict';import{mkdtemp,mkdir,writeFile,rm}from'node:fs/promises';import{tmpdir}from'node:os';import{createRequire}from'node:module';import{aim,focus,walkTo}from'./bibye-browser-inputs.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE??'playwright');
const accuracy=process.env.SIGHT_ACCURACY==='1',upperFirst=process.env.SIGHT_WEAPON==='UPPER';
const before=process.env.SIGHT_BEFORE==='1',touch=process.env.SIGHT_TOUCH==='1',baseFov=Number(process.env.SIGHT_FOV??78),scenario=process.env.SIGHT_CASE??'long';
const label=`${before?'before':'after'}-${touch?'touch':'mouse'}-${scenario}-${baseFov}${accuracy?upperFirst?'-upper-accuracy':'-main-accuracy':''}`,root=new URL('../',import.meta.url).pathname,source=before?(process.env.SIGHT_BASELINE??root+'../swords-and-sorcery-frost-guard/'):root;
const{createGameServer}=await import(source+'server/src/server.mjs'),{ProfileStore}=await import(source+'server/src/ProfileStore.mjs'),{createBiByeLlista}=await import(source+'shared/sim/biByeLlista.mjs');
const dir=root+'output/playwright/bibye-sight/';await mkdir(dir,{recursive:true});const temp=await mkdtemp(tmpdir()+'/bibye-sight-'),game=createGameServer({port:0,host:'127.0.0.1',profileStore:new ProfileStore(temp)});await game.start();
const now=performance.now()/1000,room=game.roomManager.createPrivateRoom(now,'outerworks'),z=scenario==='terrain'?-23:scenario==='wall'?-55:-46,x=scenario==='terrain'?16.5:0,y=scenario==='terrain'?.6:0,targetZ=scenario==='terrain'?-10:(scenario==='close'||scenario==='parry')?-37:scenario==='medium'?-26:-5;
for(const id of ['operator','target'])room.addPlayer({id,token:label+id,name:id==='operator'?'Siege sight':'Distant Spellblade'},now);room.startMatch(now);
for(const id of ['operator','target']){const p=room.players.get(id);Object.assign(p,{connected:false,disconnectExpiresAt:now+3600,position:id==='operator'?{x,y:scenario==='terrain'?.228:0,z:scenario==='wall'?-57.5:z-3.1}:{x:scenario==='destroy'?2.5:x,y:scenario==='terrain'?1.2:0,z:scenario==='destroy'?-46:targetZ},yaw:id==='operator'?Math.PI:0,spawnProtectionUntil:0,history:[]});p.input.yaw=p.yaw;}
room.biByeLlista=createBiByeLlista({id:'sight-test',x,y,z,baseYaw:Math.PI});
if(scenario==='destroy')room.biByeLlista.health=15; // Initial damaged fixture, before either client connects.
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']}),contexts=[],pages=[],errors=[],proof={label,baseFov,before,touch,scenario,stages:[]};
const bounded=(promise,ms=7000)=>Promise.race([promise,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Browser capture/cleanup timed out')),ms);timer.unref();})]);
const read=page=>page.evaluate(()=>{const r=window.__ssRuntime;return{camera:r.camera.position.toArray(),quaternion:r.camera.quaternion.toArray(),fov:r.camera.fov,yaw:r.input.yaw,pitch:r.input.pitch,gain:r.input.aimGain??1,view:r.siegeView,player:r.localAuth,b:r.latestSnapshot.bibyeBallista,events:window.__sightEvents,frames:window.__sightFrames,sightData:window.__sightData,sight:r.hud.siegeSight?{hidden:r.hud.siegeSight.hidden,weapon:r.hud.siegeSight.dataset.weapon,text:r.hud.siegeSight.textContent,primary:r.hud.siegeSight.querySelector('.siege-primary').style.transform,secondaryHidden:r.hud.siegeSight.querySelector('.siege-secondary').hidden}:null};});
async function capture(page,name){const c=await page.context().newCDPSession(page),s=await bounded(c.send('Page.captureScreenshot',{format:'png'}));await c.detach();await writeFile(dir+label+'-'+name+'.png',Buffer.from(s.data,'base64'));}
try{
 for(const role of ['operator','target']){
  const viewport=touch&&role==='operator'?{width:960,height:600}:{width:1280,height:800};
  const context=await browser.newContext({viewport,isMobile:touch&&role==='operator',hasTouch:touch&&role==='operator',recordVideo:role==='operator'?{dir:dir+'raw',size:viewport}:undefined});contexts.push(context);
  await context.addInitScript(({code,token,fov})=>{localStorage.setItem('ss-room-code',code);localStorage.setItem('ss-session-token',token);localStorage.setItem('ss-settings',JSON.stringify({version:1,values:{'display.fov':fov,'audio.master':0}}));},{code:room.code,token:label+role,fov:baseFov});
  const page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:true});
  await page.goto(`http://127.0.0.1:${game.address().port}/?debug`,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#loading-veil')?.classList.contains('done'),null,{timeout:60000});await page.waitForFunction(()=>window.__ssRuntime?.localAuth&&window.__ssRuntime.world.biByeLlista.authoredModel);
  const skip=page.locator('[data-tutorial-onboarding-skip]');if(await skip.isVisible())await skip.click();
  if(touch&&role==='operator')await page.locator('#game-canvas canvas').tap({position:{x:500,y:250}});else await focus(page);
  await page.evaluate(()=>{const r=window.__ssRuntime,render=r.renderer.render.bind(r.renderer);if(r.hud.setBiByeSight){const show=r.hud.setBiByeSight.bind(r.hud);r.hud.setBiByeSight=v=>{if(v)window.__sightData=v;return show(v);};}window.__sightEvents=[];window.__sightFrames=[];r.socket.on('events',b=>window.__sightEvents.push(...b.events));r.renderer.render=(scene,camera)=>{if(camera.layers.mask===1){const v=r.world.biByeLlista,b=r.latestSnapshot.bibyeBallista,bolt=v.nodes.get('Main_Siege_Bolt');if(window.__sightFrames.length>=5000)window.__sightFrames.shift();window.__sightFrames.push({at:performance.now(),fov:camera.fov,position:camera.position.toArray(),yaw:r.input.yaw,pitch:r.input.pitch,view:r.siegeView,state:b.state,visible:bolt.visible,boltPosition:bolt.position.toArray(),action:v.activeActionName,age:v.activeBaseAction?.time});}return render(scene,camera);};});
 }
 const[operator,target]=pages,cdp=await contexts[0].newCDPSession(operator);
 const tap=async(action,key)=>{if(touch)await operator.locator('.touch-'+action).tap();else await operator.keyboard.press(key);};
 if(!touch)await focus(operator);await tap('interact','t');await operator.waitForFunction(()=>window.__ssRuntime.localAuth.operatingBallistaId);await tap('deploy','b');await operator.waitForFunction(()=>window.__ssRuntime.latestSnapshot.bibyeBallista.mode==='DEPLOYED');await operator.waitForTimeout(700);
 if(upperFirst){await tap('siegeWeapon','x');await operator.waitForFunction(()=>window.__ssRuntime.latestSnapshot.bibyeBallista.weaponFocus==='UPPER');}
 proof.stages.push({label:'mounted',...await read(operator)});await capture(operator,'third');
 async function zoom(){if(touch){const v=await operator.locator('.touch-siegeView').boundingBox(),x=v.x+v.width/2,y=v.y+v.height/2;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:9}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-55,id:9}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}else await operator.keyboard.press('Shift+z');}
 await zoom();await operator.waitForFunction(()=>window.__ssRuntime.siegeView==='clear');await operator.waitForTimeout(800);
 if(!touch&&scenario!=='destroy'){for(let i=0;i<3;i++){const s=await read(operator),p=room.players.get('target').position;await aim(operator,Math.atan2(s.camera[0]-p.x,s.camera[2]-p.z),Math.atan2(p.y+1.15-s.camera[1],Math.hypot(p.x-s.camera[0],p.z-s.camera[2])));await operator.waitForTimeout(200);}}
 proof.stages.push({label:'main-clear',...await read(operator)});await capture(operator,'main');
 if(!before)assert.ok(Math.abs(proof.stages.at(-1).fov-(baseFov===78?48:proof.stages.at(-1).fov))<.05);
 // Real angular corrections: both devices share InputController.turn.
 const prior=await read(operator);
 if(touch){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:650,y:230,id:3}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:660,y:230,id:3}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
 else{await operator.mouse.move(600,330);await operator.mouse.move(610,330);}
 const correction=await read(operator);proof.precision={from:prior.yaw,to:correction.yaw,gain:correction.gain};
 if(!touch)await aim(operator,prior.yaw,prior.pitch);
 else{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:650,y:230,id:4}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:640,y:230,id:4}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
 if(scenario==='destroy'){
  const s=await read(target),b=room.biByeLlista;await aim(target,Math.atan2(s.camera[0]-b.x,s.camera[2]-b.z),Math.atan2(b.y+1.75-s.camera[1],Math.hypot(b.x-s.camera[0],b.z-s.camera[2])));
  assert.equal((await read(operator)).view,'clear');await target.keyboard.press('q');
  await operator.waitForFunction(()=>window.__ssRuntime.latestSnapshot.bibyeBallista.mode==='DESTROYED',null,{timeout:10000});await operator.waitForTimeout(750);
  proof.destroyed=await read(operator);assert.equal(proof.destroyed.player.operatingBallistaId,null);assert.equal(proof.destroyed.view,'third');assert.equal(proof.destroyed.gain,1);assert.equal(proof.destroyed.fov,baseFov);assert.equal(proof.destroyed.sight.hidden,true);
  await capture(operator,'destroyed');console.log(label,'real Fireball destroyed initial15HP damaged fixture; camera/reset PASS');
 }else if(accuracy){
  await operator.waitForTimeout(400);proof.aimed=await read(operator);proof.aimPoint={...room.biByeLlista.aimTarget};await tap('attack','f');
  if(scenario==='parry'){await operator.waitForFunction(()=>window.__sightEvents.some(e=>e.type==='bibyeBoltSpawned'));await target.keyboard.down('g');}
  await operator.waitForFunction(kind=>window.__sightEvents.some(e=>e.type==='bibyeBoltImpact'&&e.subKind===kind),upperFirst?'conditioning':'siege',{timeout:20000});
  await capture(operator,'impact');const s=await read(operator),kind=upperFirst?'conditioning':'siege',event=s.events.find(e=>e.type==='bibyeBoltSpawned'&&e.projectile.subKind===kind);
  const p=event.projectile,at=proof.aimPoint,velocity=Object.values(p.velocity),length=Math.hypot(...velocity);const v=Object.values(p.position),q=[at.x,at.y,at.z].map((n,i)=>n-v[i]),t=q.reduce((n,x,i)=>n+x*velocity[i]/length,0);
  proof.accuracy={kind,point:at,rayDistance:Math.hypot(...q.map((n,i)=>n-velocity[i]/length*t)),impact:s.events.find(e=>e.type==='bibyeBoltImpact'&&e.subKind===kind),damage:s.events.filter(e=>e.type==='damage')};
  assert.ok(proof.accuracy.rayDistance<.08,JSON.stringify(proof.accuracy));assert.equal(proof.accuracy.impact.hitKind,'player');if(scenario==='parry'){proof.parry=s.events.find(e=>e.type==='bibyeFrostContact');assert.equal(proof.parry.outcome,'parry');assert.equal(proof.parry.damage,0);}
  const video=operator.video();await contexts[0].close();await video.saveAs(dir+label+'.webm');console.log(label,JSON.stringify(proof.accuracy));
 }else{
 await operator.waitForTimeout(400);await tap('attack','f');await operator.waitForFunction(()=>window.__sightEvents.some(e=>e.type==='bibyeBoltSpawned'&&e.projectile.subKind==='siege'),null,{timeout:20000});await capture(operator,'volley');
 await operator.waitForFunction(()=>window.__ssRuntime.latestSnapshot.bibyeBallista.state==='RELOADING');await operator.waitForFunction(()=>window.__ssRuntime.world.biByeLlista.activeBaseAction.time>3.1);await capture(operator,'reload');await operator.waitForFunction(()=>window.__ssRuntime.latestSnapshot.bibyeBallista.state==='LOADED');
 await tap('siegeWeapon','x');await operator.waitForFunction(()=>window.__ssRuntime.latestSnapshot.bibyeBallista.weaponFocus==='UPPER');await operator.waitForTimeout(600);await capture(operator,'upper');proof.stages.push({label:'upper-clear',...await read(operator)});
 if(scenario==='wall'&&!touch){await aim(operator,0,-.25);await operator.waitForTimeout(500);proof.wallView=await read(operator);await capture(operator,'wall');assert.ok(proof.wallView.camera[2]> -58);}
 await tap('attack','f');await operator.waitForFunction(()=>window.__sightEvents.some(e=>e.type==='bibyeMobileFireTriggered'),null,{timeout:10000});await operator.waitForTimeout(850);await capture(operator,'upper-fire');if(scenario==='wall'){proof.wallImpact=(await read(operator)).events.filter(e=>e.type==='bibyeBoltImpact'&&e.subKind==='conditioning').at(-1);assert.equal(proof.wallImpact.hitKind,'solid');assert.equal(proof.wallImpact.solidId,'wall-south-camp');}
 if(!touch){await aim(operator,Math.PI,.8).catch(()=>{});await operator.waitForTimeout(100);proof.limit=await read(operator);await capture(operator,'limit');if(!before){assert.ok(proof.limit.sightData.limits.includes('up'));assert.match(proof.limit.sight.text,/ELEVATION LIMIT/);}}
 const observer=await read(target);proof.observer={reloadFrames:observer.frames.filter(f=>f.state==='RELOADING').length,lateReload:observer.frames.filter(f=>f.state==='RELOADING'&&f.age>=2.8).length,hiddenLateReload:observer.frames.filter(f=>f.state==='RELOADING'&&f.age>=2.8&&!f.visible).length};assert.ok(proof.observer.lateReload>20);assert.equal(proof.observer.hiddenLateReload,0);
 await tap('siegeView','z');await operator.waitForFunction(()=>window.__ssRuntime.siegeView!=='clear');await operator.waitForTimeout(700);proof.stages.push({label:'clear-exit',...await read(operator)});await capture(operator,'exit');
 if(!before)assert.ok(Math.abs(proof.stages.at(-1).fov-baseFov)<.05);
 await zoom();await operator.waitForTimeout(300);await tap('interact','t');await operator.waitForFunction(()=>!window.__ssRuntime.localAuth.operatingBallistaId);await operator.waitForTimeout(700);proof.stages.push({label:'dismounted',...await read(operator)});await capture(operator,'dismounted');
 assert.ok(Math.abs(proof.stages.at(-1).fov-baseFov)<.5);if(!before){assert.equal(proof.stages.at(-1).gain,1);assert.equal(proof.stages.at(-1).sight.hidden,true);}
 const exitState=await read(operator);if(!touch&&Math.hypot(exitState.player.position.x-exitState.b.x,exitState.player.position.z-exitState.b.z)>3.1)await walkTo(operator,exitState.b.x+2.5,exitState.b.z,{reached:s=>Math.hypot(s.player.position.x-exitState.b.x,s.player.position.z-exitState.b.z)<3.1});
 await tap('interact','t');await operator.waitForFunction(()=>window.__ssRuntime.localAuth.operatingBallistaId);await operator.waitForTimeout(500);proof.remounted=await read(operator);assert.equal(proof.remounted.view,'third');assert.ok(proof.remounted.fov>=baseFov-.05&&proof.remounted.fov<baseFov+.3);assert.equal(proof.remounted.gain,1);
 if(!before){await zoom();await operator.waitForTimeout(350);await tap('pause','Escape');await operator.waitForTimeout(750);proof.cancelled=await read(operator);assert.equal(proof.cancelled.view,'third');assert.equal(proof.cancelled.sight.hidden,true);assert.equal(proof.cancelled.gain,1);assert.ok(Math.abs(proof.cancelled.fov-baseFov)<.05);}
 const final=await read(operator);proof.events=final.events;proof.frames=final.frames;assert.deepEqual(errors,[]);
 const localReload=proof.frames.filter(f=>f.state==='RELOADING'&&f.view==='clear');assert.ok(localReload.length>20);assert.ok(localReload.every(f=>!f.visible));assert.ok(proof.observer.reloadFrames>20);
 const video=operator.video();await contexts[0].close();await video.saveAs(dir+label+'.webm');console.log(label,JSON.stringify({fov:proof.stages[1].fov,precision:proof.precision,observer:proof.observer,spawns:proof.events.filter(e=>e.type==='bibyeBoltSpawned').map(e=>e.projectile.subKind),errors}));
 }
}catch(e){proof.failure=String(e);if(pages[0]){proof.failedState=await read(pages[0]).catch(()=>null);await capture(pages[0],'failed').catch(()=>{});}throw e;}
finally{await writeFile(dir+label+'.json',JSON.stringify({...proof,errors}));for(const c of contexts)await bounded(c.close()).catch(()=>{});await bounded(browser.close()).catch(()=>{});await game.stop();await rm(temp,{recursive:true,force:true});}
