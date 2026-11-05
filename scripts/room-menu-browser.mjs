// Browser acceptance of the real Open Rooms and Solo two-banner menus.
// Runs against a started game server and captures desktop/mobile viewports.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CdpClient } from './browser-cdp.mjs';

const base=(process.env.SIEGE_BROWSER_URL??'http://127.0.0.1:3001').replace(/\/$/,'');
const out='output/playwright/room-menus';
const profile=await mkdtemp(join(tmpdir(),'castleward-room-menus-'));
await mkdir(out,{recursive:true});
const port=9317;
const clients=[];
let chrome,cdp;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label,tries=130){
  let last;
  for(let i=0;i<tries;i++){
    try{const value=await fn();if(value)return value;}catch(e){last=e;}
    await sleep(140);
  }
  throw Error('Timed out: '+label+(last?' — '+last.message:''));
}
function mailbox(ws){
  const messages=[];
  ws.addEventListener('message',event=>messages.push(JSON.parse(String(event.data))));
  return async type=>until(()=>{const i=messages.findIndex(x=>x.type===type);return i<0?null:messages.splice(i,1)[0];},'websocket '+type,75);
}
async function createRealRoom(name,settings){
  const ws=new WebSocket(base.replace(/^http/,'ws').replace(/^ws(s?):/,'ws$1:').replace(/^ws(s?):\/\//,'ws$1://').replace(/:\d+$/,':3001').replace(/\/$/,'')+'/ws');
  clients.push(ws);
  const next=mailbox(ws);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  ws.send(JSON.stringify({type:'createPublicRoom',name,settings}));
  const joined=await next('joined');
  assert.equal(joined.mode,settings.mode);
  return joined.roomCode;
}
async function evaluate(expression){
  const r=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);
  return r.result?.value;
}
async function shot(name){
  const r=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(join(out,name+'.png'),Buffer.from(r.data,'base64'));
}
const click=selector=>evaluate("document.querySelector("+JSON.stringify(selector)+")?.click(),true");
const check=expression=>evaluate('Boolean('+expression+')');
const metrics=()=>evaluate(`(() => {
  const shell=document.querySelector('#game-shell');
  const menu=document.querySelector('#rooms-menu:not(.hidden),#solo-menu:not(.hidden)');
  const banners=[...menu.querySelectorAll('.banner-panel')].filter(x=>getComputedStyle(x).display!=='none');
  return {viewport:[innerWidth,innerHeight],shell:[shell.clientWidth,shell.clientHeight],
    banners:banners.map(x=>{const r=x.getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,bottom:r.bottom,width:r.width,scrollable:x.scrollHeight>x.clientHeight};})};
})()`);
try{
  const codes=[];
  codes.push(await createRealRoom('Open FFA',{mode:'FFA',worldId:'castleward',scoreToWin:12,matchSeconds:360}));
  codes.push(await createRealRoom('Open Siege',{mode:'BREAKTHROUGH',worldId:'outerworks',teamSize:2,botSkill:'champion',matchSeconds:420}));
  codes.push(await createRealRoom('Open Heights',{mode:'HIGH_GROUNDS',worldId:'high-grounds',teamSize:3,matchSeconds:720}));
  chrome=spawn(process.env.CHROME_BIN??'chromium',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--remote-allow-origins=*','--remote-debugging-port='+port,'--window-size=1450,900','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
  const page=await until(async()=>{const r=await fetch('http://127.0.0.1:'+port+'/json/list');return (await r.json()).find(x=>x.type==='page');},'Chrome DevTools endpoint',180);
  cdp=new CdpClient(page.webSocketDebuggerUrl);
  await cdp.connect();await cdp.send('Page.enable');await cdp.send('Runtime.enable');
  await cdp.send('Page.navigate',{url:base+'/?debug'});
  await until(()=>check("document.querySelector('#loading-veil')?.classList.contains('done')"),'Castleward main menu',200);
  await click('#quick-play');
  await until(()=>check("document.querySelectorAll('#room-list .room-row').length===3"),'three real public rooms');
  await shot('01-desktop-open-rooms');
  await click('#room-filters [data-mode="BREAKTHROUGH"]');
  assert.equal(await evaluate("document.querySelectorAll('#room-list .room-row').length"),1);
  await click('#room-list .room-row');
  assert.ok(await check("document.querySelector('#room-selected-info').textContent.includes('OUTERWORKS') || document.querySelector('#room-selected-info').textContent.includes('Outerworks')"));
  await shot('02-desktop-selected-breakthrough');
  await click('#raise-room');
  assert.ok(await check("!document.querySelector('#room-create-form').hidden"));
  await shot('03-desktop-create-room');
  await click('#rooms-back');await click('#solo-button');await click('#bot-duel');
  assert.ok(await check("document.querySelector('#solo-rival-wrap') && !document.querySelector('#solo-rival-wrap').hidden"));
  await shot('04-desktop-solo');
  const desktop=await metrics();
  assert.equal(desktop.banners.length,2);
  assert.ok(desktop.banners[0].right<desktop.banners[1].x,'desktop banners do not overlap');

  await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:780,deviceScaleFactor:1,mobile:true});
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  await click('#solo-list-return');
  await shot('05-mobile-solo-activities');
  await click('#practice-mode');
  assert.ok(await check("document.querySelector('#solo-menu').dataset.panel==='details'"));
  await shot('06-mobile-solo-activity-detail');
  await click('#solo-list-return');await click('#solo-back');await click('#quick-play');
  await until(()=>check("document.querySelectorAll('#room-list .room-row').length===3"),'mobile rooms');
  await shot('07-mobile-room-list');
  await click('#room-list .room-row');
  assert.ok(await check("document.querySelector('#rooms-menu').dataset.panel==='details'"));
  await shot('08-mobile-room-details');
  await click('#rooms-list-return');
  assert.ok(await check("document.querySelector('#rooms-menu').dataset.panel==='list'"));
  await click('#room-filters [data-mode="HIGH_GROUNDS"]');
  await click('#room-list .room-row');
  await click('#raise-room');
  assert.ok(await check("!document.querySelector('#room-create-form').hidden"));
  await shot('09-mobile-create-room');
  const mobile=await metrics();
  assert.equal(mobile.banners.length,1,'narrow viewport shows exactly one banner');
  for(const b of mobile.banners) assert.ok(b.x>=0 && b.right<=mobile.viewport[0]+2,'visible banner fits mobile viewport');
  await writeFile(join(out,'measurements.json'),JSON.stringify({codes,desktop,mobile},null,2));
  console.log('PASS: real public-room listings, mode filtering, selected room, create form, two desktop banners and mobile panel navigation');
}catch(error){console.error('BROWSER MENU ACCEPTANCE FAILED:',error);process.exitCode=1;
}finally{
  cdp?.close();
  for(const ws of clients)try{ws.close();}catch{}
  chrome?.kill('SIGTERM');
  // Chromium can still flush its profile after SIGTERM; tolerate this cleanup race.
  await rm(profile,{recursive:true,force:true,maxRetries:12,retryDelay:250}).catch(error => {
    console.warn('Temporary Chrome profile cleanup warning:',error.message);
  });
}
