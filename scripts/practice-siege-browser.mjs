// Actual Chrome/DOM/LocalHost Practice acceptance: summons hostile pilots through
// visible controls, then reads only replicated authoritative machine snapshots.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const base=(process.env.SIEGE_BROWSER_URL??'http://127.0.0.1:3001').replace(/\/$/,'');
const profile=await mkdtemp(join(tmpdir(),'ss-siege-chrome-'));
const out='output/playwright/practice-hostile-siege';
await mkdir(out,{recursive:true});
const chrome=spawn(process.env.CHROME_BIN??'chromium',[
 '--headless=new','--no-sandbox','--disable-dev-shm-usage',
 '--enable-unsafe-swiftshader','--remote-allow-origins=*','--window-size=1280,800',
 '--remote-debugging-port=9249','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
const pending=new Map(),exceptions=[];let ws,seq=0,stage='startup';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label,attempts=90){
 stage=label;
 for(let i=0;i<attempts;i++){
  try{const value=await fn();if(value)return value;}catch(e){if(i===attempts-1)throw e;}
  await sleep(140);
 }
 throw Error('Timed out: '+label);
}
async function send(method,params={}){
 const id=++seq;
 const response=new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{pending.delete(id);reject(Error('CDP '+method+' timeout'));},10000);
  pending.set(id,{resolve:v=>{clearTimeout(timeout);resolve(v);},reject:e=>{clearTimeout(timeout);reject(e);}});
 });
 ws.send(JSON.stringify({id,method,params}));return response;
}
async function evalInBrowser(expression){
 const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
 if(r.exceptionDetails)throw Error(r.exceptionDetails.text);
 return r.result?.value;
}
async function snap(){return evalInBrowser(`(() => {
 const s=window.__ssRuntime?.latestSnapshot;
 const ops=s?.players?.filter(p=>p.practiceSiegeOperator).map(p=>({
  id:p.id,name:p.name,machine:p.practiceSiegeOperator.machine,
  difficulty:p.practiceSiegeOperator.difficulty,health:p.health,alive:p.health>0}));
 return {room:s?.roomCode,mode:s?.mode,ops,ballista:s?.bibyeBallista,
  ram:s?.soFistication,flight:s?.fightFlight};
})()`);}
async function shot(name){
 const img=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
 await writeFile(out+'/'+name+'.png',Buffer.from(img.data,'base64'));
}
const record={};
try{
 const target=await until(async()=>{const r=await fetch('http://127.0.0.1:9249/json/list');return (await r.json()).find(x=>x.type==='page');},'Chrome remote debugging',180);
 ws=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 ws.onmessage=e=>{
  const msg=JSON.parse(String(e.data));
  if(msg.method==='Runtime.exceptionThrown')exceptions.push(msg.params?.exceptionDetails?.text??'exception');
  const task=pending.get(msg.id);if(!task)return;pending.delete(msg.id);
  if(msg.error)task.reject(Error(msg.error.message));else task.resolve(msg.result);
 };
 await send('Page.enable');await send('Runtime.enable');
 await send('Page.navigate',{url:base+'/?debug'});
 await until(()=>evalInBrowser("document.querySelector('#loading-veil')?.classList.contains('done')"),'loaded Castleward menu',180);
 await evalInBrowser("document.querySelector('#player-name').value='Siege probe';document.querySelector('#solo-button').click()");
 await until(()=>evalInBrowser("Boolean(document.querySelector('#practice-mode')&&!document.querySelector('#practice-mode').disabled)"),'solo Practice entry');
 await evalInBrowser("document.querySelector('#practice-mode').click()");
 await until(async()=>{const s=await snap();return s?.mode==='PRACTICE'&&s?.room;},'real local Practice session',160);
 const choices=[
  ['bi-bye-llista','Ballistefan','ballista'],
  ['so-fist-ication','Sir Uppercuff','ram'],
  ['fight-and-flight','Mr. Donte Shoot','flight']
 ];
 for(const [machine,name,field] of choices){
  stage='summon '+name;
  await evalInBrowser(`(() => {const s=document.querySelector('#practice-hostile-machine');s.value=${JSON.stringify(machine)};s.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#practice-hostile-difficulty').value='formidable';document.querySelector('#practice-hostile-spawn').click();})()`);
  const first=await until(async()=>{const s=await snap();return s.ops?.find(p=>p.machine===machine)&&s[field]?.operatorId?s:false;},'authoritative mounted '+name,110);
  assert.equal(first.ops.find(x=>x.machine===machine)?.name,name);
  assert.equal(first[field].operatorId,first.ops.find(x=>x.machine===machine).id);
  await shot('summoned-'+machine);
  let evidence;
  if(field==='ballista'){
   evidence=await until(async()=>{const s=await snap(),b=s.ballista;
    return b&&(b.mode==='DEPLOYED'||b.mode==='DEPLOYING'||b.upperFiredAt!=null||b.mainBoltLoaded===false
     ||Math.hypot(b.x-first.ballista.x,b.z-first.ballista.z)>.25)?s:null;
   },'Ballistefan: real deployment, maneuver or bolt release',120);
  }else if(field==='ram'){
   evidence=await until(async()=>{const s=await snap(),b=s.ram;
    return b&&Math.hypot(b.x-first.ram.x,b.z-first.ram.z)>.5?s:null;
   },'Sir Uppercuff: real wheel-driven movement',120);
  }else{
   evidence=await until(async()=>{const s=await snap(),b=s.flight;
    return b&&b.y>1&&b.flightCharge<100&&b.ammo<14?s:null;
   },'Mr. Donte Shoot: actual powered flight and physical repeater firing',160);
  }
  record[machine]={first:{
    id:first[field].id,position:[first[field].x,first[field].y,first[field].z],
    operator:first[field].operatorId},after:{
    position:[evidence[field].x,evidence[field].y,evidence[field].z],
    mode:evidence[field].mode,ammo:evidence[field].ammo,
    charge:evidence[field].flightCharge,skill:evidence[field].skill?.phase}};
  await shot('active-'+machine);
  await evalInBrowser("document.querySelector('#practice-hostile-remove').click()");
  await until(async()=>{const s=await snap();return !s.ops?.some(x=>x.machine===machine)&&!s[field];},'clean removal '+name,110);
 }
 assert.equal(exceptions.length,0,'Uncaught browser errors: '+exceptions.join('; '));
 await writeFile(out+'/acceptance.json',JSON.stringify({record,exceptions},null,2));
 console.log('[SIEGE BROWSER PASS] '+JSON.stringify(record));
}catch(error){
 console.error('[SIEGE BROWSER FAIL]',stage,error.stack??String(error));
 await writeFile(out+'/failure.json',JSON.stringify({stage,error:String(error),exceptions,last:ws?await snap().catch(()=>null):null},null,2));
 if(ws)await shot('failure').catch(()=>{});
 throw error;
}finally{
 ws?.close();chrome.kill('SIGTERM');await sleep(600);
 await rm(profile,{recursive:true,force:true}).catch(()=>{});
}
