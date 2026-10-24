// Caller supplies Playwright's chromium. All gameplay uses ordinary desktop or
// touch input. Gate and damage cases alter only initial world/spawn fixtures.
// Late-load case deliberately submits a stale snapshot to test rejection.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {startPractice,approach,focus,aim,state,waitFor,capture,walkTo} from './bibye-browser-inputs.mjs';

export async function clearanceBrowser(chromium,{url='http://127.0.0.1:3242/?debug',folder='output/playwright/bibye-clearance',only=null}={}){
 await mkdir(folder,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const cases={
  'current':async()=>{

 const ctx=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1,recordVideo:{dir:folder,size:{width:1280,height:800}}}),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await startPractice(page,url);await page.waitForTimeout(1800);await capture(page,'practice-built.png',folder);
 const built=await state(page);assert.ok(built.ballista.id.startsWith('bibye-'));await focus(page);assert.equal(await page.locator('.practice-siege').isVisible(),false);assert.ok((await page.locator('#practice-overlay').boundingBox()).height<70);await capture(page,'practice-playing.png',folder);
 await approach(page);await page.keyboard.press('t');await waitFor(page,s=>s.player.operatingBallistaId,'mount');await page.waitForTimeout(500);await capture(page,'after-mobile.png',folder);
 await aim(page,built.ballista.heading,-.34);await page.keyboard.press('z');await page.waitForTimeout(500);await capture(page,'lower-upper-sight.png',folder);assert.ok((await state(page)).ballista.upperPitch<-.28);
 await page.keyboard.press('f');await waitFor(page,s=>s.ballista.upperReleasedAt!=null,'upper low fire');
 await page.keyboard.press('z');await page.keyboard.press('b');await waitFor(page,s=>s.ballista.mode==='DEPLOYED','deploy');await aim(page,built.ballista.heading,.04);await page.waitForTimeout(500);await capture(page,'after-deployed.png',folder);
 await page.keyboard.press('Escape');await page.locator('.practice-siege summary').evaluate(e=>e.parentElement.open=true);await page.locator('#practice-rebuild-bibye').click();await waitFor(page,s=>s.ballista.id!==built.ballista.id,'atomic rebuild');
 const rebuilt=await capture(page,'practice-rebuilt.png',folder);assert.equal(rebuilt.player.operatingBallistaId,null);assert.equal(await page.evaluate(()=>window.__ssRuntime.siegeCamera),null);assert.equal(rebuilt.cameraView,'third');assert.equal(rebuilt.ballista.health,650);
 await page.locator('#practice-dismantle-bibye').click();await waitFor(page,s=>s.ballista===null,'dismantle');await page.waitForTimeout(500);const removed=await capture(page,'practice-dismantled.png',folder);
 assert.equal(await page.evaluate(()=>window.__ssRuntime.world.biByeLlista.group.visible),false);
 await page.locator('#practice-reset').click();await waitFor(page,s=>s.player.health===100,'reset self');assert.equal((await state(page)).ballista,null);
 await page.locator('#practice-build-bibye').click();await waitFor(page,s=>s.ballista,'rebuild after empty reset');assert.notEqual((await state(page)).ballista.id,rebuilt.ballista.id);
 await writeFile(folder+'/production-flow.json',JSON.stringify({built,rebuilt,removed,errors},null,2));assert.deepEqual(errors,[]);console.log('Production flow passed');await ctx.close();

  },
  'touch':async()=>{

 const ctx=await browser.newContext({viewport:{width:926,height:430},deviceScaleFactor:1,isMobile:true,hasTouch:true,recordVideo:{dir:folder,size:{width:926,height:430}}}),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));const cdp=await ctx.newCDPSession(page);
 const drag=async(x,y,dx,dy,ms=30)=>{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/6,y:y+dy*i/6,id:1}]});await page.waitForTimeout(ms);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});};
 await startPractice(page,url);await page.waitForTimeout(1600);await capture(page,'touch-practice-tools.png',folder);
 const copy=await page.locator('.practice-siege p').evaluateAll(ps=>ps.map(p=>({text:p.textContent,w:p.clientWidth,scroll:p.scrollWidth})));assert.ok(copy.every(p=>p.scroll<=p.w));
 await page.touchscreen.tap(510,170);await waitFor(page,s=>s.enabled,'touch focus');
 const b=(await state(page)).ballista,tx=b.x+Math.sin(b.heading)*2.6,tz=b.z+Math.cos(b.heading)*2.6;
 for(let n=0;n<80;n++){
  const s=await state(page),dx=tx-s.player.position.x,dz=tz-s.player.position.z;if(Math.hypot(s.player.position.x-b.x,s.player.position.z-b.z)<3.15)break;
  const yaw=Math.atan2(-dx,-dz),angle=Math.atan2(Math.sin(yaw-s.yaw),Math.cos(yaw-s.yaw));if(Math.abs(angle)>.02)await drag(520,160,Math.max(-160,Math.min(160,-angle/.0058)),0);
  const stick=await page.locator('.touch-stick').boundingBox();await drag(stick.x+stick.width/2,stick.y+stick.height/2,0,-55,160);
 }
 await page.locator('.touch-interact').tap();await waitFor(page,s=>s.player.operatingBallistaId,'touch mount');await page.waitForTimeout(500);
 const view=page.locator('.touch-siegeView'),rect=await view.boundingBox();
 const zoom=()=>drag(rect.x+rect.width/2,rect.y+rect.height/2,0,-55);
 await zoom();await waitFor(page,s=>s.cameraView==='clear','clear forward view');await page.waitForTimeout(650);const clear=await capture(page,'touch-clear-view.png',folder);
 const geometry=await page.evaluate(()=>{const r=window.__ssRuntime,v=r.world.biByeLlista,m=v.getMuzzleWorldPosition('conditioning'),d=v.getMuzzleWorldDirection('conditioning');return{ahead:r.camera.position.clone().sub(m).dot(d),fov:r.camera.fov,baseFov:r.view.fov};});assert.ok(geometry.ahead>.2);assert.ok(geometry.fov<geometry.baseFov);
 await view.tap();assert.equal((await state(page)).cameraView,'third');await view.tap();assert.equal((await state(page)).cameraView,'sight');await zoom();assert.equal((await state(page)).cameraView,'clear');await view.tap();assert.equal((await state(page)).cameraView,'sight');
 await page.locator('.touch-attack').tap();await waitFor(page,s=>s.ballista.upperReleasedAt!=null,'touch fire');await page.waitForTimeout(300);await capture(page,'touch-sight-fire.png',folder);
 await page.locator('.touch-pause').tap();await page.locator('#practice-dismantle-bibye').tap();await waitFor(page,s=>s.ballista===null,'touch dismantle');assert.equal((await state(page)).player.operatingBallistaId,null);
 assert.deepEqual(errors,[]);await writeFile(folder+'/touch-flow.json',JSON.stringify({clear,geometry,copy,errors},null,2));console.log('Touch flow passed',geometry);await ctx.close();

  },
  'gate':async()=>{

 const context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/shared/sim/Room.mjs',async route=>{const response=await route.fetch();await route.fulfill({response,body:"import {createBiByeLlista} from './biByeLlista.mjs';\n"+(await response.text()).replace('this.biByeLlista = null;','this.biByeLlista = createBiByeLlista({x:13.8,z:-13,baseYaw:Math.PI});')});});
 await page.route('**/shared/worlds/castleward.mjs',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('spawnPoints: [','spawnPoints: [{x:13.8,y:0,z:-15.8,yaw:Math.PI},')});});
 await startPractice(page,url); await focus(page);await page.keyboard.press('t');await waitFor(page,s=>s.player.operatingBallistaId,'mount at gate fixture');
 await page.waitForTimeout(1600);await capture(page,'gate-start.png',folder);
 await page.keyboard.down('w');await page.waitForTimeout(4200);await page.keyboard.up('w');
 const s=await capture(page,'gate-clear.png',folder);
 await writeFile(folder+'/after-gate.json',JSON.stringify({state:s,errors},null,2));
 if(s.ballista.z< -3)throw Error('Gate blocked');await page.keyboard.down('s');await waitFor(page,s=>s.ballista.z< -12,'reverse gate',15000);await page.keyboard.up('s');await capture(page,'gate-reverse.png',folder);console.log(JSON.stringify({gate:s.ballista.position,speed:s.ballista.speed,errors}));
 await context.close();

  },
  'damage':async()=>{

 const ctx=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1}),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/shared/sim/Room.mjs',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:"import{createBiByeLlista}from'./biByeLlista.mjs';\n"+(await r.text()).replace('this.biByeLlista = null;','this.biByeLlista = createBiByeLlista();')});});
 await page.route('**/shared/worlds/castleward.mjs',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:(await r.text()).replace('spawnPoints: [','spawnPoints: [{x:10.2,y:0,z:-11.75,yaw:0},')});});
 await startPractice(page,url,{inspection:true});await page.waitForTimeout(1600);await focus(page);await aim(page,0,-.52);await capture(page,'damage-before.png',folder);
 await page.mouse.down();const struck=await waitFor(page,s=>Object.values(s.ballista.components).some(c=>c.health<c.maxHealth)||s.ballista.health<650,'ordinary sword component damage');await page.mouse.up();await page.waitForTimeout(35);await page.keyboard.press('p');await page.waitForTimeout(50);await capture(page,'damage-pulse.png',folder);
 const materials=await page.evaluate(()=>{const r=window.__ssRuntime,v=r.world.biByeLlista;return[...v.componentMaterials].map(([id,ms])=>({id,emission:Math.max(...ms.map(m=>m.emissiveIntensity-m.userData.baseEmission)),colorChange:ms.some(m=>!m.color.equals(m.userData.baseColor))}));});
 const hit=Object.entries(struck.ballista.components).find(([,c])=>c.health<c.maxHealth)?.[0]??'hull';assert.ok(materials.find(m=>m.id===hit).emission>0);assert.ok(materials.filter(m=>m.id!==hit).every(m=>m.emission===0));
 await page.keyboard.press('p');await page.waitForTimeout(500);const expired=await page.evaluate(()=>[...window.__ssRuntime.world.biByeLlista.componentMaterials].every(([,ms])=>ms.every(m=>m.emissiveIntensity===m.userData.baseEmission)));assert.ok(expired);
 assert.deepEqual(errors,[]);await writeFile(folder+'/damage-flow.json',JSON.stringify({hit,materials,expired,errors},null,2));console.log('Ordinary sword damage pulse passed',hit);await ctx.close();

  },
  'late-load':async()=>{
let release;const gate=new Promise(r=>release=r);
 try{

 const ctx=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1}),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/bi-bye-llista-v4.1.glb*',async route=>{await gate;await route.continue();});
 await page.goto(url);await page.waitForFunction(()=>document.querySelector('#loading-veil')?.classList.contains('done'));const skip=page.locator('[data-tutorial-onboarding-skip]');if(await skip.isVisible())await skip.click();await page.locator('#player-name').fill('Late Load');await page.locator('#solo-button').click();await page.locator('#practice-mode').click();await waitFor(page,s=>s.player,'Practice session');assert.equal((await state(page)).ballista,null);
 await page.locator('.practice-siege summary').click();await page.locator('#practice-build-bibye').click();const old=await waitFor(page,s=>s.ballista,'fallback build');assert.equal(await page.evaluate(()=>window.__ssRuntime.world.biByeLlista.authoredModel),null);
 await page.locator('#practice-dismantle-bibye').click();await waitFor(page,s=>!s.ballista,'remove before asset decode');release();await waitFor(page,s=>s.authored,'late authored model');await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>window.__ssRuntime.world.biByeLlista.group.visible),false);
 await page.locator('#practice-build-bibye').click();const fresh=await waitFor(page,s=>s.ballista,'fresh post decode build');assert.notEqual(fresh.ballista.id,old.ballista.id);
 const rejected=await page.evaluate(previous=>{const r=window.__ssRuntime,keep=r.latestSnapshot;const stale={...keep,bibyeRevision:1,bibyeBallista:previous};r.onSnapshot(stale);return r.latestSnapshot===keep;},old.ballista);assert.ok(rejected);await capture(page,'late-load-replacement.png',folder);
 await writeFile(folder+'/late-load.json',JSON.stringify({old:old.ballista.id,fresh:fresh.ballista.id,rejected,errors},null,2));assert.deepEqual(errors,[]);console.log('Late load and stale snapshot passed');await ctx.close();

 }finally{release();}
  },
  'parry':async()=>{

 const ctx=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1}),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await startPractice(page,url,{inspection:true});await page.waitForTimeout(1500);await page.locator('#practice-dismantle-bibye').click();await waitFor(page,s=>!s.ballista,'remove siege for duel');await page.locator('#practice-melee').click();
 await page.evaluate(()=>{window.__parryEvents=[];window.__ssRuntime.socket.on('events',batch=>window.__parryEvents.push(...batch.events.filter(e=>e.type==='parry')));});await focus(page);
 let success=false;
 for(let n=0;n<100;n++){
  const s=await state(page),bot=s.players.find(p=>p.actorKind==='dummy');if(!bot)continue;const dx=bot.position.x-s.player.position.x,dz=bot.position.z-s.player.position.z;await aim(page,Math.atan2(-dx,-dz),0);
  if(Math.hypot(dx,dz)>2.15){await page.keyboard.down('w');await page.waitForTimeout(80);await page.keyboard.up('w');}else{
   await page.keyboard.down('g');await page.waitForTimeout(100);await page.keyboard.up('g');await page.waitForTimeout(40);
  }
  success=await page.evaluate(()=>window.__parryEvents.some(e=>e.defenderId===window.__ssRuntime.socket.playerId));if(success)break;
 }
 if(!success){await capture(page,'parry-attempt.png',folder);console.log(JSON.stringify({final:await state(page),events:await page.evaluate(()=>window.__parryEvents)},null,2));}assert.ok(success,'ordinary opponent attack was genuinely parried');await page.keyboard.press('p');await capture(page,'parry-no-symbol.png',folder);
 const proof=await page.evaluate(()=>{const r=window.__ssRuntime,el=document.querySelector('.crosshair');return{events:window.__parryEvents,outlinedSymbol:getComputedStyle(el,'::before').opacity,cameraFlashChildren:r.effects.transients.filter(t=>t.mesh?.parent===r.camera).length};});assert.equal(proof.outlinedSymbol,'0');assert.equal(proof.cameraFlashChildren,0);assert.deepEqual(errors,[]);await writeFile(folder+'/parry.json',JSON.stringify({proof,errors},null,2));console.log('Ordinary parry passed without symbol');await ctx.close();

  }
 };
 try{for(const [name,run]of Object.entries(cases)){if(only&&!only.includes(name))continue;await run();console.log('Passed',name);}}finally{await browser.close();}
}
