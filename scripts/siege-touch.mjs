import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE??'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:960,height:600},isMobile:true,hasTouch:true});
const page=await context.newPage();page.setDefaultTimeout(10000);
const folder=new URL('../output/playwright/siege-objectives',import.meta.url).pathname;await mkdir(folder,{recursive:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
// Initial position fixture only: put the first attacker at the real ram's rear station.
await page.route('**/shared/worlds/bastionBreach.mjs',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace("spawn(-4, 0, -33, 0, -2, 'ATTACKERS', 0)","spawn(0, 0, -25.85, 0, -2, 'ATTACKERS', 0)")});});
try{
 await page.goto(process.env.SIEGE_URL??'http://127.0.0.1:3251/?debug');await page.waitForFunction(()=>document.querySelector('#loading-veil')?.classList.contains('done'));
 await page.locator('#player-name').fill('Touch siege');await page.locator('#breakthrough-button').click();await page.locator('#breakthrough-team [data-team="ATTACKERS"]').click();await page.locator('#breakthrough-rival [data-skill="squire"]').click();await page.locator('#breakthrough-play-bots').click();
 await page.waitForFunction(()=>window.__ssRuntime?.localAuth&&window.__ssRuntime.latestSnapshot?.roomState==='PLAYING');await page.locator('#game-canvas canvas').tap({position:{x:450,y:220}});
 await page.locator('.touch-interact').tap();await page.waitForFunction(()=>window.__ssRuntime.localAuth.operatingRamId);
 const cdp=await context.newCDPSession(page),box=await page.locator('.touch-stick').boundingBox();
 const center={x:box.x+box.width/2,y:box.y+box.height/2,id:1};
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[center]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...center,y:center.y-60}]});
 await page.waitForFunction(()=>window.__ssRuntime.latestSnapshot.soFistication.z>-18.1);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(700);
 await page.locator('.touch-attack').tap();await page.waitForFunction(()=>window.__ssRuntime.latestSnapshot.structures.entities['assault-barricade'].health===360);
 await page.screenshot({path:folder+'/touch-stroke.png'});await page.locator('.touch-siegeView').tap();
 assert.equal(await page.evaluate(()=>window.__ssRuntime.siegeView),'sight');await page.locator('.touch-interact').tap();await page.waitForFunction(()=>!window.__ssRuntime.localAuth.operatingRamId);
 const result=await page.evaluate(()=>({p:window.__ssRuntime.localAuth.position,health:window.__ssRuntime.latestSnapshot.structures.entities['assault-barricade'].health,ram:window.__ssRuntime.latestSnapshot.soFistication.id}));
 assert.equal(await page.locator('.touch-guard').isVisible(),true);assert.deepEqual(errors,[]);
 await writeFile(folder+'/touch-result.json',JSON.stringify({fixture:'initial attacker spawn at rear station only',viewport:[960,600],result,errors}));console.log('Touch mount, joystick drive, real piston, view and leave passed',result);
 await cdp.detach();
}finally{await browser.close();}
