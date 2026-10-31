// Chrome/CDP acceptance on a real locally hosted HTML5 Castleward build.
// Uses visible Armory clicks and real keyboard/mouse gameplay, not fake damage.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
const base=(process.env.SIEGE_BROWSER_URL??'http://127.0.0.1:3001').replace(/\/$/,'');
const port=9251,out='output/playwright/siege-armory-cold';
await mkdir(out,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'ss-cold-chrome-'));
const chrome=spawn(process.env.CHROME_BIN??'chromium',[
 '--headless=new','--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader',
 '--remote-allow-origins=*','--window-size=1280,800','--remote-debugging-port='+port,
 '--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
let ws,seq=0,stage='boot';const pending=new Map(),exceptions=[],record={};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label,tries=100){
 stage=label;let last=null;
 for(let i=0;i<tries;i++){try{const value=await fn();if(value){console.log('[COLD PASS]',label);return value;}}catch(e){last=e;}
  await sleep(100);}
 throw Error('Chrome timeout '+label+'; '+(last?.message??''));
}
function send(method,params={}){
 const id=++seq,p=new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'));},11000);
  pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});
 });ws.send(JSON.stringify({id,method,params}));return p;
}
async function evaluate(expression){
 const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
 if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result?.value;
}
async function screenshot(name){
 const x=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
 await writeFile(out+'/'+name+'.png',Buffer.from(x.data,'base64'));
}
async function key(letter,type){
 return send('Input.dispatchKeyEvent',{type,key:letter.toLowerCase(),code:'Key'+letter.toUpperCase(),
 windowsVirtualKeyCode:letter.toUpperCase().charCodeAt(0)});
}
async function tap(letter){await key(letter,'rawKeyDown');await sleep(90);await key(letter,'keyUp');}
const state="(() => {const r=window.__ssRuntime,s=r?.latestSnapshot;return {room:s?.roomCode,mode:s?.mode,ballista:s?.bibyeBallista?{id:s.bibyeBallista.id,operatorId:s.bibyeBallista.operatorId,skill:s.bibyeBallista.skill,smallBoltReadyAt:s.bibyeBallista.smallBoltReadyAt,mainBoltLoaded:s.bibyeBallista.mainBoltLoaded,position:{x:s.bibyeBallista.x,y:s.bibyeBallista.y,z:s.bibyeBallista.z}}:null,projectiles:s?.bibyeProjectiles?.map(p=>({id:p.id,subKind:p.subKind})),me:r?.localAuth?{id:r.localAuth.id,operating:r.localAuth.operatingBallistaId,position:r.localAuth.position}:null};})()";
try{
 const target=await until(async()=>{const res=await fetch('http://127.0.0.1:'+port+'/json/list');return (await res.json()).find(x=>x.type==='page');},'Chrome debugger',170);
 ws=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 ws.onmessage=e=>{const data=JSON.parse(String(e.data));
  if(data.method==='Runtime.exceptionThrown')exceptions.push(data.params?.exceptionDetails?.text??'unknown');
  const task=pending.get(data.id);if(!task)return;pending.delete(data.id);
  if(data.error)task.reject(Error(data.error.message));else task.resolve(data.result);
 };
 await send('Page.enable');await send('Runtime.enable');await send('Page.navigate',{url:base+'/?debug'});
 await until(()=>evaluate("document.querySelector('#loading-veil')?.classList.contains('done')"),'menu loaded',170);
 await evaluate("document.querySelector('#armory-button').click()");
 await until(()=>evaluate("!document.querySelector('#armory-menu').classList.contains('hidden')"),'actual Armory page');
 await evaluate("document.querySelector('#armory-siege-tab').click()");
 const before=await evaluate("(() => ({selected:document.querySelector('#armory-siege-tab').getAttribute('aria-pressed'),section:!document.querySelector('#armory-siege').classList.contains('hidden'),names:[...document.querySelectorAll('#armory-siege .siege-armory-heading h4')].map(e=>e.textContent),alternatives:[...document.querySelectorAll('#armory-siege [data-siege-machine=biBye]')].length}))()");
 assert.equal(before.selected,'true');assert.equal(before.section,true);assert.equal(before.alternatives,2);
 assert.deepEqual(before.names,['BI-BYE-LLISTA','SO-FIST-ICATION','FIGHT-AND-FLIGHT']);
 await screenshot('01-siege-armory');
 await evaluate("document.querySelector('[data-siege-skill=coldHowTouching]').click()");
 assert.equal(await evaluate("document.querySelector('[data-siege-skill=coldHowTouching]').getAttribute('aria-checked')"),'true');
 await screenshot('02-cold-equipped');
 await evaluate("document.querySelector('#armory-heraldry-tab').click()");
 assert.equal(await evaluate("document.querySelector('#armory-heraldry-tab').getAttribute('aria-pressed')"),'true');
 await evaluate("document.querySelector('#armory-kit-tab').click()");
 assert.equal(await evaluate("document.querySelector('#armory-kit-tab').getAttribute('aria-pressed')"),'true');
 await evaluate("document.querySelector('#armory-back').click()");
 await evaluate("document.querySelector('#player-name').value='Cold browser probe';document.querySelector('#solo-button').click()");
 await until(()=>evaluate("Boolean(document.querySelector('#practice-mode')&&!document.querySelector('#practice-mode').disabled)"),'Practice menu');
 await evaluate("document.querySelector('#practice-mode').click()");
 await until(async()=>{const s=await evaluate(state);return s?.mode==='PRACTICE'&&s?.me?.id?s:false;},'local Practice session',150);
 await evaluate("document.querySelector('#practice-siege-type').value='bi-bye-llista';document.querySelector('#practice-build-bibye').click()");
 await until(async()=>{const s=await evaluate(state);return s?.ballista?s:false;},'real ballista built',80);
 await evaluate("(() => {const r=window.__ssRuntime,p=r.localAuth.position,b=r.latestSnapshot.bibyeBallista;r.input.yaw=Math.atan2(-(b.x-p.x),-(b.z-p.z));})()");
 await send('Input.dispatchMouseEvent',{type:'mousePressed',x:640,y:420,button:'left',clickCount:1});
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:640,y:420,button:'left',clickCount:1});
 await key('W','rawKeyDown');
 await until(async()=>{const s=await evaluate(state);return Math.hypot(s.me.position.x-s.ballista.position.x,s.me.position.z-s.ballista.position.z)<2.6?s:false;},'walk to actual operator station',140);
 await key('W','keyUp');await sleep(120);await tap('T');
 const mounted=await until(async()=>{const s=await evaluate(state);return s?.me?.operating===s?.ballista?.id?s:false;},'physical T mount',70);
 assert.equal(mounted.ballista.skill.id,'coldHowTouching');
 await screenshot('03-mounted');
 await tap('U');
 const active=await until(async()=>{const s=await evaluate(state);return s?.ballista?.skill?.phase==='active'?s:false;},'real U activates Cold Skill',65);
 assert.equal(active.ballista.mainBoltLoaded,true);
 await screenshot('04-cold-active');
 await send('Input.dispatchMouseEvent',{type:'mousePressed',x:640,y:420,button:'left',clickCount:1});
 await sleep(260);
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:640,y:420,button:'left',clickCount:1});
 const shot=await until(async()=>{const s=await evaluate(state);return s?.ballista?.smallBoltReadyAt>active.ballista.smallBoltReadyAt?s:false;},'actual Bolt I string release',90);
 assert.equal(shot.ballista.skill.phase,'active');
 assert.equal(shot.ballista.mainBoltLoaded,true);
 await screenshot('05-frost-bolt-fired');
 record.before=before;record.mounted=mounted;record.active=active;record.shot=shot;
 assert.equal(exceptions.length,0,'Browser JS exceptions: '+exceptions.join('; '));
 await writeFile(out+'/result.json',JSON.stringify({record,exceptions},null,2));
 console.log('[COLD BROWSER ACCEPTED] '+JSON.stringify({skill:shot.ballista.skill,recock:shot.ballista.smallBoltReadyAt}));
}catch(error){
 console.error('[COLD BROWSER FAILED]',stage,error.stack??String(error));
 await writeFile(out+'/failure.json',JSON.stringify({stage,error:String(error),exceptions,state:ws?await evaluate(state).catch(()=>null):null},null,2));
 if(ws)await screenshot('failure').catch(()=>{});
 throw error;
}finally{ws?.close();chrome.kill('SIGTERM');await sleep(800);await rm(profile,{recursive:true,force:true}).catch(()=>{});}
