// Actual Chrome input drives the machine. Routes alter only initial spawn or
// damage fixtures; gameplay commands, collision, damage and animation stay real.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {focus,aim,walkTo} from './bibye-browser-inputs.mjs';
const folder=new URL('../output/playwright/so-fist-ication',import.meta.url).pathname;
export const ramState=page=>page.evaluate(()=>{const r=window.__ssRuntime;return{p:r.localAuth,b:r.latestSnapshot?.soFistication,now:r.socket.serverNow(),hud:r.hud.ballistaPanel.textContent,view:r.siegeView,loaded:Boolean(r.world?.soFistication?.model),events:window.__ramEvents??[]};});
export async function ramWait(page,check,label,timeout=12000){const end=Date.now()+timeout;while(Date.now()<end){const s=await ramState(page);if(check(s))return s;await page.waitForTimeout(40);}throw Error(label+': '+JSON.stringify(await ramState(page)));}
export async function ramCapture(page,name){await mkdir(folder,{recursive:true});const cdp=await page.context().newCDPSession(page);const shot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await cdp.detach();await writeFile(`${folder}/${name}.png`,Buffer.from(shot.data,'base64'));const s=await ramState(page);await writeFile(`${folder}/${name}.json`,JSON.stringify(s,null,2));return s;}
export async function startRam(page,url,{spawn='meadow',damage=false,fixture=false,touch=false,encounter=false}={}){
 if(spawn)await page.route('**/shared/worlds/castleward.mjs',async route=>{const response=await route.fetch();const loc=encounter?'{x:17,y:0,z:-14,yaw:0}':damage?'{x:17,y:0,z:-4.1,yaw:Math.PI}':fixture?'{x:17,y:0,z:3.2,yaw:0}':'{x:14,y:0,z:6,yaw:0}';await route.fulfill({response,body:(await response.text()).replace('spawnPoints: [','spawnPoints: ['+loc+',')});});
 if(fixture||damage)await page.route('**/shared/sim/Room.mjs',async route=>{const response=await route.fetch();await route.fulfill({response,body:"import {createSoFistication} from './soFistication.mjs';\n"+(await response.text()).replace('this.soFistication = null;',`this.soFistication = createSoFistication({x:17,y:0,z:${encounter?-17:0},heading:0});${damage?'this.soFistication.components.Fist.health=19;':''}`)});});
 if(encounter)await page.route('**/shared/sim/practice.mjs',async route=>{const response=await route.fetch();await route.fulfill({response,body:"import {callSteel} from '../src/steel.mjs';\n"+(await response.text()).replace('  return dummy;',"  dummy.position={x:17,y:0,z:-20.3};dummy.history=[];dummy.spawnProtectionUntil=0;dummy.steel=callSteel(nowSec);return dummy;")});});
 await page.goto(url);await page.waitForFunction(()=>document.querySelector('#loading-veil')?.classList.contains('done'));
 const skip=page.locator('[data-tutorial-onboarding-skip]');if(await skip.isVisible())await skip.click();
 await page.locator('#player-name').fill('So Fist Gameplay');await page.locator('#solo-button').click();await page.locator('#practice-mode').click();
 await page.waitForFunction(()=>window.__ssRuntime?.localAuth&&window.__ssRuntime.latestSnapshot?.mode==='PRACTICE');
 await page.evaluate(()=>{window.__ramEvents=[];window.__ssRuntime.socket.on('events',batch=>window.__ramEvents.push(...batch.events));});
 if(!fixture&&!damage){await page.locator('.practice-siege summary').click();await page.locator('#practice-siege-type').selectOption('so-fist-ication');await page.locator('#practice-build-bibye').click();}
 await ramWait(page,s=>s.b&&s.loaded,'verified authored ram load');
 if(!touch)await focus(page);else await page.locator('#game-canvas canvas').tap({position:{x:600,y:220}});
}
export async function desktopRam(page,url){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await startRam(page,url);const initial=await ramState(page),b=initial.b;
 await walkTo(page,b.x+Math.sin(b.heading)*2.85,b.z+Math.cos(b.heading)*2.85);await page.keyboard.press('t');await ramWait(page,s=>s.p.operatingRamId,'operate');
 await aim(page,b.heading+Math.PI/2,-.12);await page.waitForTimeout(500);await ramCapture(page,'profile');
 await page.keyboard.down('Shift');await page.waitForTimeout(1300);let s=await ramCapture(page,'charging');assert.ok(s.b.speed>3&&s.b.pressure<100);assert.equal(s.p.guardStamina,100);await page.keyboard.up('Shift');await page.waitForTimeout(1300);assert.equal((await ramState(page)).b.charging,false);
 await page.keyboard.down('s');await page.waitForTimeout(900);await page.keyboard.up('s');await page.waitForTimeout(600);
 await page.mouse.down();await page.mouse.up();await ramWait(page,s=>s.b.strikeAt!=null,'piston winding');const at=(await ramState(page)).b.strikeAt;await ramWait(page,s=>s.now-at>=2.2,'piston physical release');await ramCapture(page,'piston-release');await ramWait(page,s=>s.b.strikeAt==null,'piston cycle complete');
 await page.keyboard.press('z');await page.waitForTimeout(300);assert.equal((await ramState(page)).view,'sight');await ramCapture(page,'operator-sight');await page.keyboard.press('z');
 await page.keyboard.press('Escape');await page.locator('.practice-siege summary').evaluate(e=>e.parentElement.open=true);await page.locator('#practice-rebuild-bibye').click();await ramWait(page,s=>s.b.id!==b.id,'rebuild');assert.equal((await ramState(page)).p.operatingRamId,null);await page.locator('#practice-dismantle-bibye').click();await ramWait(page,s=>s.b==null,'dismantle');assert.equal(await page.evaluate(()=>window.__ssRuntime.world.soFistication.group.visible),false);
 assert.deepEqual(errors,[]);await writeFile(folder+'/desktop-results.json',JSON.stringify({initial,charged:s,errors},null,2));
}
export async function damagedRam(page,url){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await startRam(page,url,{damage:true});await ramCapture(page,'fist-before');
 await page.keyboard.down('f');await ramWait(page,s=>s.b.components.Fist.health===0,'real sword contact breaks armored fist');await page.keyboard.up('f');await page.waitForTimeout(1000);const broken=await ramCapture(page,'fist-broken');assert.equal(broken.b.health,1400);assert.ok(broken.events.some(e=>e.type==='soFistDamaged'&&e.source==='sword'&&e.componentId==='Fist'));
 for(const [x,z]of [[20,-4],[20,3.5],[17,3]])await walkTo(page,x,z);await page.keyboard.press('t');await ramWait(page,s=>s.p.operatingRamId,'operate exposed piston');await aim(page,Math.PI/2,-.12);await page.mouse.click(600,330);await ramWait(page,s=>s.b.strikeAt!=null,'exposed piston windup');const at=(await ramState(page)).b.strikeAt;await ramWait(page,s=>s.now-at>=2.2,'exposed stroke');await ramCapture(page,'exposed-piston');assert.deepEqual(errors,[]);await writeFile(folder+'/damaged-results.json',JSON.stringify({broken,errors},null,2));
}
export async function touchRam(page,url){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await startRam(page,url,{fixture:true,touch:true});await page.locator('.touch-interact').tap();await ramWait(page,s=>s.p.operatingRamId,'touch operate');
 const cdp=await page.context().newCDPSession(page),box=await page.locator('.touch-sprint').boundingBox();assert.ok(box);const p={x:box.x+box.width/2,y:box.y+box.height/2,id:7};
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await page.waitForTimeout(1200);const held=await ramCapture(page,'touch-charge');assert.ok(held.b.charging&&held.b.speed>3);assert.equal(held.p.guardStamina,100);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await ramWait(page,s=>!s.b.charging,'charge releases with touch');await page.locator('.touch-attack').tap();await ramWait(page,s=>s.b.strikeAt!=null,'touch piston');await page.locator('.touch-siegeView').tap();assert.equal((await ramState(page)).view,'sight');await page.locator('.touch-interact').tap();await ramWait(page,s=>!s.p.operatingRamId,'touch leave');assert.equal(await page.locator('.touch-guard').isVisible(),true);assert.deepEqual(errors,[]);await cdp.detach();await writeFile(folder+'/touch-results.json',JSON.stringify({held,errors},null,2));
}

export async function wallEncounterRam(page,url){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await startRam(page,url,{fixture:true,encounter:true});await page.keyboard.press('t');await ramWait(page,s=>s.p.operatingRamId,'wall encounter operator');await aim(page,.65,-.13);await page.keyboard.press('Escape');await page.locator('#practice-passive').click();await focus(page);await page.mouse.click(600,330);
 const outcome=await ramWait(page,s=>s.events.some(e=>e.type==='worldImpact'),'actual secondary world impact');await ramCapture(page,'steel-survivor-wall-impact');
 assert.ok(outcome.events.some(e=>e.type==='staggerBreak'&&e.by===outcome.p.id));const hits=outcome.events.filter(e=>e.type==='damage');assert.ok(hits.some(e=>e.source==='so-fist'));assert.ok(hits.some(e=>e.source==='wall-impact'&&e.attackerId===outcome.p.id));assert.deepEqual(errors,[]);await writeFile(folder+'/wall-encounter.json',JSON.stringify({outcome,errors},null,2));return outcome;
}
