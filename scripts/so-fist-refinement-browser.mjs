// Input-driven Chrome checks. Fixture routes change only initial placement or
// select the previous source revision for a matched baseline. Results are never injected.
import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';import {execFileSync} from 'node:child_process';
import {aim,walkTo} from './bibye-browser-inputs.mjs';import {measureRamFrames} from './so-fist-performance.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE??'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
const root=new URL('../',import.meta.url).pathname,dir=root+'output/playwright/so-fist-refinement';await mkdir(dir,{recursive:true});
const url=process.env.RAM_URL??'http://127.0.0.1:3254/?debug',mode=process.env.RAM_CHECK??'handling';
const state=page=>page.evaluate(()=>{const r=window.__ssRuntime;return {p:r.localAuth,b:r.latestSnapshot.soFistication,now:r.socket.serverNow(),camera:r.camera.position.toArray(),yaw:r.input.yaw,pitch:r.input.pitch,view:r.siegeView,events:window.__ramEvents??[]};});
async function snap(page,name){const cdp=await page.context().newCDPSession(page);const s=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await cdp.detach();await writeFile(`${dir}/${name}.png`,Buffer.from(s.data,'base64'));}
async function start(page,{fixture=false,touch=false}={}){
 await page.route('**/shared/worlds/castleward.mjs',async route=>{const response=await route.fetch(),point=fixture==='station'?'{x:18,y:0,z:5.1,yaw:0}':fixture?'{x:14,y:0,z:-3.6,yaw:Math.PI}':'{x:14,y:0,z:6,yaw:0}';await route.fulfill({response,body:(await response.text()).replace('spawnPoints: [','spawnPoints: ['+point+',')});});
 if(fixture)await page.route('**/shared/sim/Room.mjs',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replaceAll('this.soFistication = null;',`this.soFistication = this.mode==='PRACTICE'?createSoFistication({x:${fixture==='station'?18:14},y:0,z:${fixture==='station'?2:0}}):null;`)});});
 await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#loading-veil')?.classList.contains('done'));if(process.env.RAM_LOW){await page.locator('#settings-button').click();await page.locator('[data-section="display"]').click();await page.locator('[role="radio"][data-id="display.quality"][data-value="low"]').click();await page.locator('[data-settings-done]').click();}
 await page.locator('#player-name').fill('Ram refinement');await page.locator('#solo-button').click();await page.locator('#practice-mode').click();await page.waitForFunction(()=>window.__ssRuntime?.localAuth);
 await page.evaluate(()=>{window.__ramEvents=[];window.__ssRuntime.socket.on('events',batch=>window.__ramEvents.push(...batch.events));});
 if(!fixture){await page.locator('.practice-siege summary').click();await page.locator('#practice-siege-type').selectOption('so-fist-ication');await page.locator('#practice-build-bibye').click();}
 await page.waitForFunction(()=>window.__ssRuntime?.ramRenderer?.model&&window.__ssRuntime.latestSnapshot.soFistication);
 if(touch)await page.locator('#game-canvas canvas').tap({position:{x:500,y:250}});else await Promise.race([page.mouse.click(600,320),new Promise(r=>setTimeout(r,1000))]);
}
const errors=[];function monitor(page){page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/WebGLProgram|shader|SoFistication/.test(m.text()))errors.push(m.text());});}
try{
 if(mode==='handling'){
  const results={};for(const version of ['before','after']){
   const context=await browser.newContext({viewport:{width:1280,height:800},recordVideo:{dir:dir+'/video',size:{width:1280,height:800}}}),page=await context.newPage();monitor(page);
   if(version==='before'){
    const files=execFileSync('git',['diff','--name-only','6249095','--','client','shared'],{cwd:root,encoding:'utf8'}).trim().split('\n');
    for(const file of files){let body;try{body=execFileSync('git',['show',`6249095:${file}`],{cwd:root,stdio:['ignore','pipe','ignore']});}catch{continue;}await page.route('**/'+file+'*',route=>route.fulfill({body,contentType:file.endsWith('.glb')?'model/gltf-binary':'text/javascript'}));}
   }
   await start(page);let s=await state(page);await walkTo(page,s.b.x,s.b.z+3.1);await page.keyboard.press('t');await page.waitForFunction(()=>window.__ssRuntime.localAuth.operatingRamId);await aim(page,1.25,-.12);await page.waitForTimeout(500);await snap(page,version+'-model');
   const metrics=await measureRamFrames(page,6);delete metrics.raw;results[version]={stationary:metrics,steps:[]};const activePerf=measureRamFrames(page,10);
   for(const [label,keys,ms]of [['accelerate',['w'],1000],['brake',[],1000],['reverse',['s'],2200],['brake-reverse',[],700],['turn',['w','d'],1100],['stop',[],900],['charge',['Shift'],1500],['release',[],1200]]){
    for(const key of keys)await page.keyboard.down(key);await page.waitForTimeout(ms);for(const key of keys)await page.keyboard.up(key);s=await state(page);results[version].steps.push({label,speed:s.b.speed,position:[s.b.x,s.b.y,s.b.z],heading:s.b.heading,pressure:s.b.pressure});
   }
   const active=await activePerf;delete active.raw;results[version].active=active;await snap(page,version+'-handling');await page.keyboard.press('z');await page.waitForTimeout(250);await snap(page,version+'-sight');await page.keyboard.press('t');await page.waitForFunction(()=>!window.__ssRuntime.localAuth.operatingRamId);const video=page.video();await context.close();await video.saveAs(`${dir}/${version}-handling.webm`);
  }
  assert.ok(results.after.steps[0].speed>results.before.steps[0].speed+.7);assert.equal(results.after.steps[1].speed,0);await writeFile(dir+'/handling.json',JSON.stringify({results,errors},null,2));console.log('Handling',JSON.stringify(results));
 }
 if(mode==='damage'){
  const context=await browser.newContext({viewport:{width:1280,height:800},recordVideo:{dir:dir+'/video',size:{width:1280,height:800}}}),page=await context.newPage();monitor(page);await start(page,{fixture:true});
  await aim(page,Math.PI,-.12);await page.keyboard.down('f');await page.waitForFunction(()=>window.__ramEvents.some(e=>e.type==='soFistDamaged'&&e.componentId==='Fist'));await page.keyboard.up('f');await page.waitForTimeout(85);await snap(page,'fist-flash');
  const initial=await state(page);assert.ok(initial.b.components.Fist.health<500);assert.ok(initial.events.some(e=>e.componentId==='Fist'&&e.amount>0&&e.pointLocal));
  for(const [x,z]of [[14,-5.2],[18,-5.2],[18,0],[16.1,0]])await walkTo(page,x,z);
  await aim(page,Math.PI/2,-.12);const count=(await state(page)).events.length;await page.keyboard.down('f');await page.waitForFunction(n=>window.__ramEvents.slice(n).some(e=>e.type==='soFistDamaged'&&e.componentId!=='Fist'),count);await page.keyboard.up('f');await page.waitForTimeout(85);await snap(page,'chassis-flash');
  const end=await state(page);await writeFile(dir+'/damage.json',JSON.stringify({initial,end,errors},null,2));const video=page.video();await context.close();await video.saveAs(dir+'/localized-hits.webm');console.log('Damage events',end.events.filter(e=>e.type==='soFistDamaged'));
 }
 if(mode==='space'){
  const context=await browser.newContext({viewport:{width:1280,height:800}}),page=await context.newPage();monitor(page);await start(page);
  let s=await state(page);const origin={x:s.b.x,z:s.b.z};await walkTo(page,s.b.x,s.b.z+3.1);await page.keyboard.press('t');await page.waitForFunction(()=>window.__ssRuntime.localAuth.operatingRamId);
  await page.evaluate(async()=>{
   const THREE=await import('three'),{soFistSolids}=await import('/shared/sim/soFistGeometry.mjs'),r=window.__ssRuntime;
   const geometry=new THREE.EdgesGeometry(new THREE.BoxGeometry(1,1,1)),objects=[];window.__ramOverlay=true;
   const update=()=>{if(!window.__ramOverlay){for(const o of objects){r.scene.remove(o);o.material.dispose();}geometry.dispose();return;}
    const boxes=soFistSolids(r.ramRenderer.presentationData);for(let i=0;i<Math.max(boxes.length,objects.length);i++){
     const b=boxes[i];if(!objects[i]){objects[i]=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0xf2cc75,depthTest:false,transparent:true,opacity:.7}));objects[i].renderOrder=100;r.scene.add(objects[i]);}
     const o=objects[i];o.visible=!!b;if(!b)continue;o.position.fromArray(b.center);o.scale.fromArray(b.size);o.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(...b.axes.map(a=>new THREE.Vector3(...a))));o.material.color.set(b.componentId==='Fist'?0x99e7ff:b.componentId.startsWith('Wheel')?0x9cbfae:0xf2cc75);
    }requestAnimationFrame(update);
   };update();
  });
  for(const [name,yaw]of [['profile',Math.PI/2],['front',Math.PI],['rear',0]]){await aim(page,yaw,-.12);await page.waitForTimeout(200);await snap(page,'collision-'+name);}
  await page.keyboard.down('w');await page.keyboard.down('d');await page.waitForTimeout(650);await page.keyboard.up('d');await page.keyboard.up('w');await page.waitForTimeout(800);await aim(page,1.5,-.12);await snap(page,'collision-turned');
  await page.mouse.down();await page.mouse.up();await page.waitForTimeout(2230);await snap(page,'collision-stroke');await page.waitForTimeout(2000);await page.keyboard.press('t');await page.waitForFunction(()=>!window.__ssRuntime.localAuth.operatingRamId);await page.evaluate(()=>window.__ramOverlay=false);
  // Walk around the live hull with normal player movement, then build the other
  // machine alongside it through its own ordinary Practice construction UI.
  const b=(await state(page)).b;await walkTo(page,b.x+4,b.z+4);await walkTo(page,b.x+4,b.z-4);await walkTo(page,b.x-4,b.z-4);await walkTo(page,b.x-4,b.z+4);await snap(page,'walk-around-ram');
  await walkTo(page,8,7);await walkTo(page,4,7);await aim(page,0,0);await page.keyboard.press('Escape');await page.locator('#practice-siege-type').selectOption('bi-bye-llista');await page.locator('#practice-build-bibye').click();await page.waitForFunction(()=>window.__ssRuntime.latestSnapshot.bibyeBallista&&window.__ssRuntime.world.biByeLlista.authoredModel);
  await Promise.race([page.mouse.click(600,320),new Promise(r=>setTimeout(r,1000))]);await walkTo(page,8,10.3);await aim(page,0,-.13);// Staged inspection camera only; both machine poses remain authoritative.
  const scale=await page.evaluate(()=>{const r=window.__ssRuntime,b=r.latestSnapshot.soFistication,v=r.latestSnapshot.bibyeBallista,center=[(b.x+v.x)/2,1.2,(b.z+v.z)/2],camera=r.camera.clone(),visible=r.weapon.group.visible;camera.position.set(center[0],4,center[2]-11);camera.lookAt(...center);camera.updateMatrixWorld();r.weapon.group.visible=false;r.renderer.render(r.scene,camera);const png=r.renderer.domElement.toDataURL('image/png');r.weapon.group.visible=visible;return png;});await writeFile(dir+'/physical-scale-comparison.png',Buffer.from(scale.split(',')[1],'base64'));await writeFile(dir+'/space.json',JSON.stringify({origin,final:await state(page),errors},null,2));await context.close();console.log('Live collision overlay, turn, stroke, walk around, and two machine comparison passed');
 }
 if(mode==='touch'){
  const context=await browser.newContext({viewport:{width:960,height:600},isMobile:true,hasTouch:true,recordVideo:{dir:dir+'/video',size:{width:960,height:600}}}),page=await context.newPage();monitor(page);await start(page,{touch:true,fixture:'station'});
  await page.locator('.touch-interact').tap();await page.waitForFunction(()=>window.__ssRuntime.localAuth.operatingRamId);const cdp=await context.newCDPSession(page);const from=await state(page),samples=[];
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:670,y:260,id:4}]});
  for(const x of [672,674,676,678,676,674,672,670,730,790,730,670]){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:260,id:4}]});await page.waitForTimeout(80);samples.push(await state(page));}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await snap(page,'touch-fine-aim');assert.ok(Math.abs(samples.at(-1).yaw-from.yaw)<.01);
  // Concurrent movement/look with separate real touch pointers.
  const box=await page.locator('.touch-stick').boundingBox(),stick={x:box.x+box.width/2,y:box.y+box.height/2,id:1},look={x:670,y:250,id:2};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[stick,look]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...stick,y:stick.y-40},{...look,x:680}]});await page.waitForTimeout(1000);const driven=await state(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.ok(driven.b.speed>3);
  await page.locator('.touch-siegeView').tap();await snap(page,'touch-operator-sight');const rotationYaw=(await state(page)).yaw;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:670,y:250,id:8}]});await page.setViewportSize({width:600,height:960});await page.waitForTimeout(300);await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:200,y:400,id:8}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.ok(Math.abs((await state(page)).yaw-rotationYaw)<.01,'rotation cancels the old look gesture');await page.setViewportSize({width:1024,height:650});await page.waitForTimeout(300);await page.locator('.touch-siegeView').tap();await page.locator('.touch-interact').tap();await page.waitForFunction(()=>!window.__ssRuntime.localAuth.operatingRamId);
  await writeFile(dir+'/touch.json',JSON.stringify({from,samples,driven,errors},null,2));const video=page.video();await context.close();await video.saveAs(dir+'/touch-precision.webm');console.log('Touch precision, reversal, concurrent movement, resize, views and exit passed');
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
