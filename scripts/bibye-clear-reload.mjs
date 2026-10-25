// Actual mounted firing and reload, with a read-only hook on each world render.
import assert from 'node:assert/strict';import{mkdtemp,mkdir,writeFile,readFile,rm}from'node:fs/promises';import{tmpdir}from'node:os';import{createRequire}from'node:module';
import{aim,focus,state}from'./bibye-browser-inputs.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE??'playwright'),before=process.env.CLEAR_BEFORE==='1',touch=process.env.CLEAR_TOUCH==='1';
const version=before?'before':touch?'touch':'after',source=before?'/Users/erendiracisneros/swords-and-sorcery-ballista-v32/':new URL('../',import.meta.url).pathname;
const{createGameServer}=await import(source+'server/src/server.mjs'),{ProfileStore}=await import(source+'server/src/ProfileStore.mjs'),{createBiByeLlista}=await import(source+'shared/sim/biByeLlista.mjs'),{createSoFistication}=await import(source+'shared/sim/soFistication.mjs');
const dir=new URL('../output/playwright/bibye-frost/',import.meta.url).pathname;await mkdir(dir,{recursive:true});const folder=await mkdtemp(tmpdir()+'/bibye-clear-'),game=createGameServer({port:0,host:'127.0.0.1',profileStore:new ProfileStore(folder)});await game.start();
const now=performance.now()/1000,room=game.roomManager.createPrivateRoom(now,'castleward');room.addPlayer({id:'operator',token:'clear-operator',name:'Operator'},now);room.startMatch(now);
const p=room.players.get('operator');Object.assign(p,{connected:false,disconnectExpiresAt:now+3600,position:{x:18,y:0,z:9.1},yaw:0,spawnProtectionUntil:0,history:[]});p.input.yaw=0;room.biByeLlista=createBiByeLlista({id:'bibye-clear',x:18,y:0,z:6,baseYaw:0});room.soFistication=createSoFistication({x:18,y:0,z:-4});
const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({viewport:touch?{width:960,height:600}:{width:1280,height:800},isMobile:touch,hasTouch:touch,recordVideo:{dir:dir+'/video',size:touch?{width:960,height:600}:{width:1280,height:800}}}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/WebGLProgram|shader/.test(m.text()))errors.push(m.text());});
try{
 await context.addInitScript(code=>{localStorage.setItem('ss-session-token','clear-operator');localStorage.setItem('ss-room-code',code);},room.code);
 // Baseline receives only the new keyboard access to its already-existing CLEAR
 // presentation action. Its camera, renderer, asset and gameplay remain original.
 if(before&&!touch){const body=await readFile(new URL('../client/game/InputController.mjs',import.meta.url));await page.route('**/client/game/InputController.mjs',r=>r.fulfill({body,contentType:'text/javascript'}));}
 await page.goto(`http://127.0.0.1:${game.address().port}/?debug`,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#loading-veil')?.classList.contains('done'),null,{timeout:60000});await page.waitForFunction(()=>window.__ssRuntime?.localAuth&&window.__ssRuntime.world.biByeLlista.authoredModel);
 const skip=page.locator('[data-tutorial-onboarding-skip]');if(await skip.isVisible())await skip.click();
 const cdp=await context.newCDPSession(page);
 async function shot(name){const s=await cdp.send('Page.captureScreenshot',{format:'png'});await writeFile(dir+version+'-clear-'+name+'.png',Buffer.from(s.data,'base64'));}
 if(touch){await page.locator('#game-canvas canvas').tap({position:{x:500,y:250}});await page.locator('.touch-interact').tap();}else{await focus(page);await page.keyboard.press('t');}
 await page.waitForFunction(()=>window.__ssRuntime.localAuth.operatingBallistaId);
 if(touch)await page.locator('.touch-deploy').tap();else await page.keyboard.press('b');await page.waitForFunction(()=>window.__ssRuntime.latestSnapshot.bibyeBallista.mode==='DEPLOYED');
 if(touch){const v=await page.locator('.touch-siegeView').boundingBox(),x=v.x+v.width/2,y=v.y+v.height/2;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-55,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}else await page.keyboard.press('Shift+z');
 await page.waitForFunction(()=>window.__ssRuntime.siegeView==='clear');await page.waitForTimeout(500);if(!touch)await aim(page,0,-.1);await page.waitForTimeout(300);await shot('idle');
 await page.evaluate(async()=>{
  const r=window.__ssRuntime,T=await import('three'),render=r.renderer.render.bind(r.renderer),ray=new T.Raycaster(),frames=[];window.__clearFrames=frames;window.__clearEvents=[];
  r.socket.on('events',b=>window.__clearEvents.push(...b.events));
  r.renderer.render=(scene,camera)=>{if(camera.layers.mask===1){const b=r.latestSnapshot.bibyeBallista,v=r.world.biByeLlista,bolt=v.nodes.get('Main_Siege_Bolt');ray.setFromCamera(new T.Vector2(0,0),camera);ray.far=3;const obstruction=bolt.visible&&ray.intersectObject(bolt,true).length>0;frames.push({at:performance.now(),state:b.state,action:v.activeActionName,age:v.activeBaseAction?.time,obstruction,boltVisible:bolt.visible,camera:camera.position.toArray(),yaw:r.input.yaw});}return render(scene,camera);};
 });
 if(touch)await page.locator('.touch-attack').tap();else await page.keyboard.press('f');await page.waitForFunction(()=>window.__ssRuntime.latestSnapshot.bibyeBallista.state==='RELOADING');
 await page.waitForFunction(()=>window.__ssRuntime.world.biByeLlista.activeBaseAction.time>=3.1);await shot('reload');await page.waitForFunction(()=>window.__ssRuntime.latestSnapshot.bibyeBallista.state==='LOADED');await shot('loaded');
 const proof=await page.evaluate(()=>{const r=window.__ssRuntime,v=r.world.biByeLlista;return {frames:window.__clearFrames,events:window.__clearEvents,view:r.siegeView,restoredVisible:v.nodes.get('Main_Siege_Bolt').visible};});
 const reload=proof.frames.filter(f=>f.state==='RELOADING');assert.ok(reload.length>50);assert.equal(proof.view,'clear');assert.equal(proof.restoredVisible,true);if(!before)assert.ok(proof.frames.every(f=>!f.boltVisible&&!f.obstruction));
 if(touch){await page.locator('.touch-siegeView').tap();await page.locator('.touch-siegeView').tap();}else{await page.keyboard.press('z');await page.keyboard.press('z');}
 await shot('ordinary');assert.equal(await page.evaluate(()=>window.__ssRuntime.world.biByeLlista.nodes.get('Main_Siege_Bolt').visible),true);assert.deepEqual(errors,[]);
 await writeFile(dir+version+'-clear.json',JSON.stringify({...proof,errors},null,2));console.log(version,JSON.stringify({frames:proof.frames.length,reload:reload.length,obstruction:proof.frames.filter(f=>f.obstruction).length,events:proof.events.filter(e=>e.type==='bibyeBoltImpact'||e.type==='bibyeFrostBlast'||e.type==='soFistDamaged'),errors}));
 const video=page.video();await context.close();await video.saveAs(dir+version+'-clear.webm');
}finally{await context.close();await browser.close();await game.stop();await rm(folder,{recursive:true,force:true});}
