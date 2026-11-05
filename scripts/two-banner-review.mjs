// Actual Chrome screenshots and layout assertions for Castleward's two medieval hanging banners.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const url=(process.env.PUBLIC_URL??'http://127.0.0.1:3001').replace(/\/$/,'');
const output='output/playwright/two-banners';
await mkdir(output,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'castleward-two-banners-'));
const port=9271;
const chrome=spawn(process.env.CHROME_BIN??'chromium',[
  '--headless=new','--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader',
  '--remote-allow-origins=*','--window-size=1440,900','--remote-debugging-port='+port,
  '--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
let ws,seq=0,stage='setup';const pending=new Map(),errors=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(fn,label,tries=120){stage=label;let last;
  for(let i=0;i<tries;i++){try{const value=await fn();if(value)return value;}catch(e){last=e;}
    await sleep(150);
  }throw Error('Timed out: '+label+(last?' ('+last.message+')':''));
}
async function send(method,params={}){
  const id=++seq;
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'));},14000);
    pending.set(id,{resolve:x=>{clearTimeout(timer);resolve(x);},
      reject:e=>{clearTimeout(timer);reject(e);}});
    ws.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression){const response=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(response.exceptionDetails)throw Error(response.exceptionDetails.exception?.description??response.exceptionDetails.text);
  return response.result?.value;
}
async function capture(label){const data=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(output+'/'+label+'.png',Buffer.from(data.data,'base64'));
}
const evidence={};
async function inspect(section,expected){
 const value=await evaluate(`(() => {
    const root=document.querySelector('${section}'),panel=root?.querySelector('.companion-banner');
    const left=root?.querySelector('.side-screen-inner'),right=panel;
    const box=el=>{const r=el?.getBoundingClientRect();return r?{x:r.x,y:r.y,w:r.width,h:r.height}:null};
    const isVisible=el=>Boolean(el&&getComputedStyle(el).display!=='none'&&el.getBoundingClientRect().width>0);
    const viewport={width:innerWidth,height:innerHeight};
    return {viewport,left:box(left),right:box(right),leftVisible:isVisible(left),
      rightVisible:isVisible(right),panel:root?.dataset?.panel,bodyScroll:document.body.scrollWidth};
  })()`);
 evidence[expected]=value;
 assert.ok(value.leftVisible||value.rightVisible,expected+': both banners hidden');
 const visible=[value.leftVisible?value.left:null,value.rightVisible?value.right:null].filter(Boolean);
 for(const box of visible) {
   assert.ok(box.x>=-4 && box.x+box.w<=value.viewport.width+6,expected+': horizontal overflow '+JSON.stringify(box));
   assert.ok(box.w>=250,expected+': shrunken banner '+box.w);
 }
 return value;
}
try{
  const page=await waitFor(async()=>{const res=await fetch('http://127.0.0.1:'+port+'/json/list');
    return (await res.json()).find(p=>p.type==='page');},'Chrome debugging target',160);
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  ws.onmessage=event=>{const packet=JSON.parse(String(event.data));
    if(packet.method==='Runtime.exceptionThrown')errors.push(packet.params?.exceptionDetails?.text??'unknown');
    const task=pending.get(packet.id);if(!task)return;
    pending.delete(packet.id);
    if(packet.error)task.reject(Error(packet.error.message));else task.resolve(packet.result);
  };
  await send('Page.enable');await send('Runtime.enable');
  await send('Page.navigate',{url:url+'/?debug'});
  await waitFor(()=>evaluate("document.querySelector('#loading-veil')?.classList.contains('done')"),'main menu',180);

  // A real public room, created through the authoritative protocol, populates the room browser.
  const host=new WebSocket(url.replace(/^http/,'ws')+'/ws');
  await new Promise((resolve,reject)=>{host.onopen=resolve;host.onerror=reject;});
  const created=new Promise((resolve,reject)=>{
    host.onmessage=e=>{const m=JSON.parse(String(e.data));
      if(m.type==='joined')resolve(m);
      else if(m.type==='error')reject(Error(m.message));};
  });
  host.send(JSON.stringify({type:'createPublicRoom',name:'Public Banner Probe',
    settings:{mode:'BREAKTHROUGH',worldId:'outerworks',teamSize:2,matchSeconds:420}}));
  const hosted=await created;
  assert.equal(hosted.mode,'BREAKTHROUGH');

  await evaluate("document.querySelector('#player-name').value='Banner Observer';document.querySelector('#quick-play').click()");
  await waitFor(()=>evaluate("!document.querySelector('#rooms-menu').classList.contains('hidden')"),'Open Rooms desktop');
  await waitFor(()=>evaluate("document.querySelectorAll('#room-list .room-row').length>0"),'real public room listed',150);
  await inspect('#rooms-menu','rooms-desktop');
  await capture('01-desktop-open-rooms');
  await evaluate("document.querySelector('#raise-room').click()");
  assert.equal(await evaluate("document.querySelector('#room-create-form').hidden"),false);
  await capture('02-desktop-room-create');
  await evaluate("document.querySelector('#rooms-back').click();document.querySelector('#solo-button').click()");
  await waitFor(()=>evaluate("!document.querySelector('#solo-menu').classList.contains('hidden')"),'Solo desktop');
  await inspect('#solo-menu','solo-desktop');
  await capture('03-desktop-solo');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true,screenWidth:390,screenHeight:844});
  await sleep(500);
  await inspect('#solo-menu','solo-mobile-list');
  await capture('04-mobile-solo-list');
  await evaluate("document.querySelector('#bot-duel').click()");
  await waitFor(()=>evaluate("document.querySelector('#solo-menu').dataset.panel==='details'"),'Solo mobile details');
  await inspect('#solo-menu','solo-mobile-details');
  await capture('05-mobile-solo-details');
  await evaluate("document.querySelector('#solo-back').click();document.querySelector('#quick-play').click()");
  await waitFor(()=>evaluate("document.querySelector('#rooms-menu').dataset.panel==='list'"),'Open Rooms mobile list');
  await inspect('#rooms-menu','rooms-mobile-list');
  await capture('06-mobile-open-rooms');
  await evaluate("document.querySelector('#room-list .room-row').click()");
  await waitFor(()=>evaluate("document.querySelector('#rooms-menu').dataset.panel==='details'"),'Open Rooms mobile details');
  await inspect('#rooms-menu','rooms-mobile-details');
  await capture('07-mobile-room-details');
  await evaluate("document.querySelector('#raise-room').click()");
  await capture('08-mobile-room-create');
  assert.ok(errors.length===0,'Uncaught browser exceptions: '+errors.join(' | '));
  await writeFile(output+'/report.json',JSON.stringify({hostedRoom:hosted.roomCode,evidence,errors},null,2));
  console.log('[TWO BANNER REVIEW PASSED]',Object.keys(evidence));
  host.close();
}catch(error){
  console.error('[TWO BANNER REVIEW FAILED]',stage,error.stack??String(error));
  if(ws)await capture('failure').catch(()=>{});
  await writeFile(output+'/failure.json',JSON.stringify({stage,error:String(error),errors},null,2));
  throw error;
}finally{
  ws?.close();chrome.kill('SIGTERM');await sleep(350);
  await rm(profile,{recursive:true,force:true}).catch(()=>{});
}
