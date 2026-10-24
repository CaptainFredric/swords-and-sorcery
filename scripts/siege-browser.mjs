import assert from 'node:assert/strict';
// Actual browser inputs only. No simulation or render state is injected.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { focus, aim, walkTo } from './bibye-browser-inputs.mjs';
const req=createRequire('/Users/erendiracisneros/.npm/_npx/31e32ef8478fbf80/node_modules/playwright/package.json');
const {chromium}=req('playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1280,height:800}});
const page=await context.newPage();page.setDefaultTimeout(8000);
const folder=new URL('../output/playwright/siege-objectives',import.meta.url).pathname;await mkdir(folder,{recursive:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const state=()=>page.evaluate(()=>{const r=window.__ssRuntime;return{p:r?.localAuth,b:r?.latestSnapshot?.soFistication,structures:r?.latestSnapshot?.structures,objective:r?.latestSnapshot?.objective,now:r?.socket.serverNow(),events:window.__siegeEvents??[],pointer:!!document.pointerLockElement,enabled:r?.input.enabled};});
const capture=async name=>{const cdp=await context.newCDPSession(page);const shot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await cdp.detach();await writeFile(folder+'/'+name+'.png',Buffer.from(shot.data,'base64'));const s=await state();await writeFile(folder+'/'+name+'.json',JSON.stringify(s));console.log(name,JSON.stringify({position:s.p?.position,health:s.p?.health,b:s.b&&{x:s.b.x,z:s.b.z,op:s.b.operatorId,health:s.b.health},structures:s.structures,objective:s.objective?.index}));return s;};
try {
 await page.goto(process.env.SIEGE_URL??'http://127.0.0.1:3251/?debug');await page.waitForFunction(()=>document.querySelector('#loading-veil')?.classList.contains('done'));
 await page.locator('#player-name').fill('Breach test');await page.locator('#breakthrough-button').click();await page.locator('#breakthrough-team [data-team="ATTACKERS"]').click();if(process.env.SIEGE_SIZE)await page.locator(`#breakthrough-size [data-size="${process.env.SIEGE_SIZE}"]`).click();if(process.env.SIEGE_SKILL)await page.locator(`#breakthrough-rival [data-skill="${process.env.SIEGE_SKILL}"]`).click();await page.locator('#breakthrough-play-bots').click();
 await page.waitForFunction(()=>window.__ssRuntime?.localAuth&&window.__ssRuntime.latestSnapshot?.roomState==='PLAYING');await Promise.race([page.mouse.click(600,320),new Promise(r=>setTimeout(r,1000))]);console.log('focus',JSON.stringify({enabled:(await state()).enabled,pointer:(await state()).pointer}));
 await page.evaluate(()=>{window.__siegeEvents=[];window.__ssRuntime.socket.on('events',b=>window.__siegeEvents.push(...b.events));});await capture('start');
 console.log('walk west of camp cover');await walkTo(page,-4.1,-25.9);await capture('rear-west');console.log('walk to station');await walkTo(page,0,-25.9);await page.keyboard.press('t');await page.waitForTimeout(200);let s=await capture('mounted');
 if(!s.p.operatingRamId)throw Error('Mount failed');
 await aim(page,Math.PI,-.1);await page.keyboard.down('w');
 const moveStarted=Date.now();
 while((s=await state()).b.z < -18.12){await page.waitForTimeout(80);if(!s.p.operatingRamId||Date.now()-moveStarted>12000)throw Error('Operator lost or blocked');}
 await page.keyboard.up('w');await page.waitForTimeout(700);await capture('approach');
 for(let i=1;i<=3;i++){
  await page.mouse.down();await page.mouse.up();await page.waitForTimeout(2300);s=await capture('stroke-'+i);assert.equal(s.structures.entities['assault-barricade'].health,Math.max(0,600-i*240));if(i<3)await page.waitForTimeout(1750);
 }
 await page.keyboard.down('w');await page.waitForTimeout(2900);await page.keyboard.up('w');await page.waitForTimeout(200);s=await capture('through-breach');assert.ok(s.b.z>-13,`ram crossed the opening: ${s.b.z}`);assert.equal(s.objective.index,0,'capture gate remains phase bound');
 await page.keyboard.press('t');await page.keyboard.down('d');await page.keyboard.down('Shift');await page.waitForTimeout(500);await page.keyboard.up('d');await page.keyboard.up('Shift');await page.keyboard.press('e');await page.mouse.down({button:'right'});await page.waitForTimeout(900);s=await capture('contesting-objective');await page.mouse.up({button:'right'});assert.ok(s.p.position.z>-8&&Math.abs(s.p.position.x)<6);assert.ok(s.objective.attackersCount>0);

 await writeFile(folder+'/errors.json',JSON.stringify(errors));console.log('COMPLETE',JSON.stringify(errors));
} catch(e){await capture('failure').catch(()=>{});console.error(e);process.exitCode=1;}finally{await browser.close();}
