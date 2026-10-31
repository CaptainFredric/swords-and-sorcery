// CDP smoke/visual acceptance for the *real* HTML5 LocalHost battle.
// Uses the menu, actual room creation and Three.js renderer, not fabricated states.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const base=(process.env.SIEGE_BROWSER_URL??'http://127.0.0.1:3001').replace(/\\/$/,'');
const output='output/playwright/high-grounds';
await mkdir(output,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'ss-high-grounds-'));
const port=9261;
const chrome=spawn(process.env.CHROME_BIN??'chromium',['--headless=new','--no-sandbox',
  '--disable-dev-shm-usage','--enable-unsafe-swiftshader','--remote-allow-origins=*',
  '--window-size=1280,800','--remote-debugging-port='+port,
  '--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
const pending=new Map(),exceptions=[];let ws,seq=0,stage='startup';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label,attempts=150){stage=label;let error;
  for(let i=0;i<attempts;i++){try{const v=await fn();if(v)return v;}catch(e){error=e;}
    await sleep(120);}
  throw Error('Timed out '+label+(error?' '+error.message:''));
}
function send(method,params={}){
  const id=++seq;
  const p=new Promise((resolve,reject)=>{
    const t=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'));},10000);
    pending.set(id,{resolve:v=>{clearTimeout(t);resolve(v);},reject:e=>{clearTimeout(t);reject(e);}});
  });
  ws.send(JSON.stringify({id,method,params}));return p;
}
async function evalBrowser(expression){const r=await send('Runtime.evaluate',
  {expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error(r.exceptionDetails.text);
  return r.result?.value;
}
async function screenshot(file){const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(output+'/'+file+'.png',Buffer.from(r.data,'base64'));}
const snapshot=`(() => {
  const r=window.__ssRuntime, s=r?.latestSnapshot;
  return {world:s?.worldId,mode:s?.mode,state:s?.roomState,sites:s?.highGrounds?.sites,
    foundries:s?.highGrounds?.foundries,scores:s?.highGrounds?.scores,
    renderer:r?.world?.constructor?.name, activeWorld:r?.activeWorld?.id,
    player:s?.players?.find(p=>p.id===r?.playerId), visible:!!r?.world?.group?.visible,
    hud:document.querySelector('#high-grounds-status')?.className,
    title:document.querySelector('#high-grounds-score')?.textContent};
})()`;
try{
  const page=await until(async()=>{const res=await fetch('http://127.0.0.1:'+port+'/json/list');
    return (await res.json()).find(x=>x.type==='page');},'Chrome CDP',180);
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  ws.onmessage=e=>{
    const d=JSON.parse(String(e.data));
    if(d.method==='Runtime.exceptionThrown') exceptions.push(d.params?.exceptionDetails?.text??'exception');
    const p=pending.get(d.id);if(!p)return;pending.delete(d.id);
    if(d.error)p.reject(Error(d.error.message));else p.resolve(d.result);
  };
  await send('Page.enable');await send('Runtime.enable');
  await send('Page.navigate',{url:base+'/?debug'});
  await until(()=>evalBrowser("document.querySelector('#loading-veil')?.classList.contains('done')"),'main menu');
  await evalBrowser("document.querySelector('#player-name').value='High Grounds Probe';document.querySelector('#breakthrough-button').click()");
  await until(()=>evalBrowser("!document.querySelector('#breakthrough-menu').classList.contains('hidden')"),'team battle menu');
  await evalBrowser("document.querySelector('[data-arena=high-grounds]').click()");
  assert.equal(await evalBrowser("document.querySelector('#breakthrough-scenario-subtitle').textContent"),'THE HIGH GROUNDS');
  await screenshot('01-map-choice');
  await evalBrowser("document.querySelector('#breakthrough-play-bots').click()");
  const state=await until(async()=>{const s=await evalBrowser(snapshot);
    return s?.world==='high-grounds'&&s?.state==='PLAYING'&&s?.renderer==='HighGroundsRenderer'?s:null;},
    'real local bot battle and Three.js map',190);
  assert.equal(state.mode,'HIGH_GROUNDS');
  assert.equal(state.activeWorld,'high-grounds');
  assert.equal(state.sites.length,5);
  assert.equal(state.foundries.length,2);
  assert.equal(state.player?.alive,true);
  await until(()=>evalBrowser("!document.querySelector('#high-grounds-status').classList.contains('hidden')"),'live capture HUD',70);
  await screenshot('02-real-high-grounds');
  if(exceptions.length)throw Error('Browser exceptions: '+exceptions.join(' / '));
  await writeFile(output+'/result.json',JSON.stringify({state,exceptions},null,2));
  console.log('[HIGH GROUNDS BROWSER ACCEPTED]',JSON.stringify({mode:state.mode,renderer:state.renderer,sites:state.sites.length}));
}catch(e){
  console.error('[HIGH GROUNDS BROWSER FAILED]',stage,e.stack??String(e));
  if(ws)await screenshot('failure').catch(()=>{});
  await writeFile(output+'/failure.json',JSON.stringify({stage,error:String(e),exceptions},null,2));
  throw e;
}finally{ws?.close();chrome.kill('SIGTERM');await sleep(600);await rm(profile,{recursive:true,force:true}).catch(()=>{});}
