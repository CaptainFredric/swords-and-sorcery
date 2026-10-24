import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {measureRamFrames} from './so-fist-performance.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE??'playwright');
const root=new URL('../',import.meta.url).pathname;
const browser=await chromium.launch({channel:'chrome',headless:true});
const results={};
try{
 for(const version of ['baseline','candidate']){
  const context=await browser.newContext({viewport:{width:1280,height:800}}),page=await context.newPage();
  const baselineFiles=version==='baseline'?execFileSync('git',['diff','--name-only','38e39ca','HEAD','--','client','shared'],{cwd:root,encoding:'utf8'}).trim().split('\n'):[];
  for(const file of baselineFiles){
   let body;try{body=execFileSync('git',['show',`38e39ca:${file}`],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']});}catch{continue;}
   await page.route('**/'+file,route=>route.fulfill({body,contentType:'text/javascript'}));
  }
  // Match the real stationary camera in both versions. Only the initial spawn differs from shipping.
  let world=version==='baseline'?execFileSync('git',['show','38e39ca:shared/worlds/bastionBreach.mjs'],{cwd:root,encoding:'utf8'}):await (await import('node:fs/promises')).readFile(root+'shared/worlds/bastionBreach.mjs','utf8');
  world=world.replace("spawn(-4, 0, -33, 0, -2, 'ATTACKERS', 0)","spawn(0, 0, -25.85, 0, -2, 'ATTACKERS', 0)");
  await page.route('**/shared/worlds/bastionBreach.mjs',route=>route.fulfill({body:world,contentType:'text/javascript'}));
  await page.goto('http://127.0.0.1:3251/?debug');await page.waitForFunction(()=>document.querySelector('#loading-veil')?.classList.contains('done'));
  await page.locator('#player-name').fill('Siege performance');await page.locator('#breakthrough-button').click();await page.locator('#breakthrough-team [data-team="ATTACKERS"]').click();await page.locator('#breakthrough-play-bots').click();
  await page.waitForFunction(()=>window.__ssRuntime?.localAuth&&window.__ssRuntime.latestSnapshot?.roomState==='PLAYING');
  await Promise.race([page.mouse.click(600,320),new Promise(r=>setTimeout(r,1000))]);await page.waitForTimeout(2500);
  const metrics=await measureRamFrames(page,8);delete metrics.raw;results[version]=metrics;console.log(version,JSON.stringify(metrics));
  if(version==='candidate'){
   await page.keyboard.press('t');await page.waitForFunction(()=>window.__ssRuntime.localAuth.operatingRamId);await page.keyboard.down('w');await page.mouse.down();await page.mouse.up();
   const active=await measureRamFrames(page,8);await page.keyboard.up('w');delete active.raw;results.active=active;console.log('active',JSON.stringify(active));
  }
  await context.close();
 }
 const dir=root+'output/playwright/siege-objectives';await mkdir(dir,{recursive:true});await writeFile(dir+'/performance.json',JSON.stringify(results));
}finally{await browser.close();}
