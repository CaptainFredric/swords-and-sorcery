// Real Chrome Practice UI acceptance: canonical siege copy, disclosure,
// action placement and short landscape touch viewport. No simulated DOM.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const base=(process.env.PRACTICE_URL??'http://127.0.0.1:3001').replace(/\/$/,'');
const output='output/playwright/practice-siege-lore';
await mkdir(output,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'castleward-siege-lore-'));
const chrome=spawn(process.env.CHROME_BIN??'chromium',[
 '--headless=new','--no-sandbox','--disable-dev-shm-usage',
 '--enable-unsafe-swiftshader','--remote-allow-origins=*',
 '--window-size=1280,800','--remote-debugging-port=9297',
 '--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
let ws,seq=0,stage='chrome',record={cases:[]};
const pending=new Map(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label,tries=130){
 stage=label;
 for(let i=0;i<tries;i++){try{const x=await fn();if(x)return x;}catch(e){if(i===tries-1)throw e;}await sleep(140);}
 throw Error('Timed out: '+label);
}
async function send(method,params={}){
 const id=++seq;
 const reply=new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{pending.delete(id);reject(Error('CDP '+method+' timed out'));},12000);
 pending.set(id,{resolve:r=>{clearTimeout(timeout);resolve(r);},reject:e=>{clearTimeout(timeout);reject(e);}});});
 ws.send(JSON.stringify({id,method,params}));return reply;
}
async function evaluate(expression){
 const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
 if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);
 return r.result?.value;
}
async function screenshot(name){
 const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
 await writeFile(join(output,name+'.png'),Buffer.from(r.data,'base64'));
}
const read="(() => {const root=document.querySelector('#practice-siege-machinations'),box=document.querySelector('#practice-siege-story-copy'),story=document.querySelector('#practice-siege-story'),actions=document.querySelector('.practice-siege-actions'),button=document.querySelector('#practice-siege-more'),title=document.querySelector('[data-siege-title]');const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom}};return {mode:window.__ssRuntime?.latestSnapshot?.mode,selected:document.querySelector('#practice-siege-type').value,title:title.textContent,motto:document.querySelector('[data-siege-subtitle]').textContent,copy:box.textContent,paragraphs:box.querySelectorAll('p').length,expanded:story.classList.contains('expanded'),aria:button.getAttribute('aria-expanded'),button:button.textContent,mask:getComputedStyle(box).maskImage,scrollHeight:box.scrollHeight,clientHeight:box.clientHeight,root:rect(root),story:rect(story),actions:rect(actions),buttonRect:rect(button),actionCount:[...actions.querySelectorAll('button')].filter(x=>!x.hidden).length,viewport:{width:innerWidth,height:innerHeight}};})()";
try{
 const target=await until(async()=>{const result=await fetch('http://127.0.0.1:9297/json/list');return (await result.json()).find(p=>p.type==='page');},'Chrome debugger',150);
 ws=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 ws.onmessage=e=>{const msg=JSON.parse(String(e.data)),p=pending.get(msg.id);if(!p)return;pending.delete(msg.id);msg.error?p.reject(Error(msg.error.message)):p.resolve(msg.result);};
 await send('Page.enable');await send('Runtime.enable');
 await send('Page.navigate',{url:base+'/?debug'});
 await until(()=>evaluate("document.querySelector('#loading-veil')?.classList.contains('done')"),'live menu loaded');
 await evaluate("document.querySelector('#player-name').value='Practice lore inspection';document.querySelector('#solo-button').click()");
 await until(()=>evaluate("Boolean(document.querySelector('#practice-mode')&&!document.querySelector('#practice-mode').disabled)"),'Practice entry visible');
 await evaluate("document.querySelector('#practice-mode').click();document.querySelector('#solo-launch')?.click()||document.querySelector('#practice-mode').click()");
 await until(()=>evaluate("Boolean(window.__ssRuntime?.localAuth&&window.__ssRuntime?.playing&&window.__ssRuntime?.latestSnapshot?.mode==='PRACTICE')"),'real Practice session',250);
 await evaluate("window.__ssRuntime.onPause()");
 await until(()=>evaluate("!document.querySelector('#pause-menu')?.classList.contains('hidden')"),'Pause menu');
 await evaluate("document.querySelector('#pause-practice').click();document.querySelector('#practice-siege-machinations').open=true");
 await until(()=>evaluate("!document.querySelector('#pause-practice-section').classList.contains('hidden')"),'Practice toolbox in Pause');
 const cases=[
  ['bi-bye-llista','BI-BYE-LLISTA','Castleward\'s engineers'],
  ['so-fist-ication','SO-FIST-ICATION','teach a wall how to receive'],
  ['fight-and-flight','FIGHT-AND-FLIGHT','Why choose to Fight or Flee? When you could be Free?']
 ];
 for(const [machine,name,excerpt] of cases){
  await evaluate("(()=>{const s=document.querySelector('#practice-siege-type');s.value="+JSON.stringify(machine)+";s.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#practice-siege-machinations').scrollIntoView({block:'start'});})()");
  const collapsed=await until(async()=>{const v=await evaluate(read);return v.title===name&&v.selected===machine?v:null;},'collapsed '+machine);
  assert.ok(collapsed.copy.includes(excerpt),machine+' must reveal its actual Armory story');
  assert.ok(collapsed.mask!=='none'&&/gradient/i.test(collapsed.mask),'faded text must have real CSS mask');
  assert.equal(collapsed.expanded,false);assert.equal(collapsed.aria,'false');
  assert.ok(collapsed.clientHeight<collapsed.scrollHeight,'collapsed preview is actually clamped');
  assert.ok(collapsed.actions.y>=collapsed.story.bottom-.5,'build actions below, not inside, scrolling story');
  assert.ok(collapsed.actionCount>=1&&collapsed.buttonRect.h>=28,'all primary actions available');
  await screenshot('desktop-'+machine+'-preview');
  await evaluate("document.querySelector('#practice-siege-more').click()");
  const expanded=await evaluate(read);
  assert.equal(expanded.expanded,true);assert.equal(expanded.aria,'true');
  assert.equal(expanded.button,'SHOW LESS');
  assert.equal(expanded.mask,'none');
  assert.equal(expanded.copy,collapsed.copy,'Show more must reveal ALL original text, not another copy');
  assert.ok(expanded.actions.y>=expanded.story.bottom-.5,'controls remain beyond expanded scroll area');
  await sleep(650);
  const stable=await evaluate(read);
  assert.equal(stable.expanded,true,'30Hz snapshots cannot collapse a currently reading player');
  if(machine==='fight-and-flight'){
   assert.equal(expanded.paragraphs,9);
   assert.ok(expanded.scrollHeight>expanded.clientHeight,'nine paragraphs scroll inside description, not entire tool panel');
   await screenshot('desktop-flight-full-story');
  }
  record.cases.push({machine,collapsed:{height:collapsed.clientHeight,textLength:collapsed.copy.length},
   expanded:{height:expanded.clientHeight,paragraphs:expanded.paragraphs},stayedExpanded:stable.expanded});
  await evaluate("document.querySelector('#practice-siege-more').click()");
  assert.equal((await evaluate(read)).expanded,false);
 }
 await send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});
 await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 await sleep(350);
 await evaluate("(()=>{const s=document.querySelector('#practice-siege-type');s.value='fight-and-flight';s.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#practice-siege-machinations').scrollIntoView({block:'start'});})()");
 const mobile=await evaluate(read);
 assert.equal(mobile.title,'FIGHT-AND-FLIGHT');
 assert.equal(mobile.expanded,false);
 assert.ok(mobile.buttonRect.h>=28&&mobile.actionCount>=1,'landscape touch Show more and Build are both available');
 assert.ok(mobile.root.w>0&&mobile.root.w<=mobile.viewport.width,'Practice card fits mobile landscape viewport');
 await screenshot('mobile-flight-faded-preview');
 await evaluate("document.querySelector('#practice-siege-more').click();document.querySelector('#practice-siege-more').scrollIntoView({block:'nearest'})");
 const mobileFull=await evaluate(read);
 assert.equal(mobileFull.expanded,true);
 assert.ok(mobileFull.clientHeight<=Math.max(145,mobileFull.viewport.height*.5),'full lore must not swallow short-screen drawer');
 assert.ok(mobileFull.actions.y>=mobileFull.story.bottom-.5);
 await screenshot('mobile-flight-expanded');
 record.mobile={collapsed:mobile,expanded:{height:mobileFull.clientHeight,paragraphs:mobileFull.paragraphs}};
 await writeFile(join(output,'result.json'),JSON.stringify(record,null,2));
 console.log('[PRACTICE SIEGE LORE PASS]',JSON.stringify({cases:record.cases,mobile:record.mobile.expanded}));
}catch(error){
 console.error('[PRACTICE SIEGE LORE FAIL]',stage,error.stack??String(error));
 record.failure={stage,error:String(error),dom:ws?await evaluate(read).catch(()=>null):null};
 await writeFile(join(output,'failure.json'),JSON.stringify(record,null,2));
 if(ws)await screenshot('failure').catch(()=>{});
 process.exitCode=1;
}finally{
 try{ws?.close();}catch{}
 chrome.kill();
 await rm(profile,{recursive:true,force:true}).catch(()=>{});
}
