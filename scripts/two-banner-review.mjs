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

  // Show the actual loading overlay markup after the first load, so that
  // both responsive boot layouts can be inspected without racing page startup.
  const boot=await evaluate(`(() => {
    const veil=document.querySelector('#loading-veil');
    veil.style.transition='none';veil.classList.remove('done');
    const crest=veil.querySelector('.crest'), title=veil.querySelector('.loading-title');
    const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};
    return {crest:rect(crest),title:rect(title),source:crest.getAttribute('src')};
  })()`);
  assert.ok(boot.source.endsWith('/grimoirelee.svg'), 'loading crest uses the canonical artwork');
  assert.ok(boot.crest.w>=88 && boot.title.y>=boot.crest.y+boot.crest.h,
    'desktop: enlarged loading crest and title must not overlap');
  evidence['boot-desktop']=boot;
  await capture('00-desktop-loading-crest');
  await send('Emulation.setDeviceMetricsOverride',{width:402,height:870,deviceScaleFactor:1,mobile:true});
  const mobileBoot=await evaluate(`(() => {
    const veil=document.querySelector('#loading-veil'), crest=veil.querySelector('.crest'),title=veil.querySelector('.loading-title');
    const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};
    return {crest:rect(crest),title:rect(title)};
  })()`);
  assert.ok(mobileBoot.crest.x>=0 && mobileBoot.title.y>=mobileBoot.crest.y+mobileBoot.crest.h
    && mobileBoot.title.x>=0 && mobileBoot.title.x+mobileBoot.title.w<=402,
    'mobile: loading emblem/title are visible and non-overlapping');
  evidence['boot-mobile']=mobileBoot;
  await capture('00-mobile-loading-crest');
  await send('Emulation.clearDeviceMetricsOverride');
  await evaluate("document.querySelector('#loading-veil').classList.add('done')");

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

  // Mettle is deliberately two documents: choose the battle at left, alter
  // the real game settings on the smaller banner at right.
  await evaluate("document.querySelector('#solo-back').click();document.querySelector('#breakthrough-button').click()");
  await waitFor(()=>evaluate("!document.querySelector('#breakthrough-menu').classList.contains('hidden')"),'Mettle desktop');
  const mettle=await inspect('#breakthrough-menu','mettle-desktop');
  assert.ok(mettle.leftVisible&&mettle.rightVisible,'both Mettle standards visible at desktop');
  const controlsRight=await evaluate("['breakthrough-size','breakthrough-arena','breakthrough-team','breakthrough-rival'].every(id=>document.getElementById(id).closest('.mettle-companion'))");
  assert.ok(controlsRight,'battle settings actually live in the smaller right standard');
  await capture('04-desktop-mettle');
  await evaluate("document.querySelector('#breakthrough-back').click();document.querySelector('#private-button').click()");
  await waitFor(()=>evaluate("!document.querySelector('#private-menu').classList.contains('hidden')"),'Private desktop');
  const priv=await inspect('#private-menu','private-desktop');
  assert.ok(priv.leftVisible&&priv.rightVisible,'two private standards side by side');
  assert.equal(await evaluate("document.querySelector('#private-mode [aria-pressed=true]')?.dataset.privateMode"),'FFA');
  const defaultRules=await evaluate("document.querySelector('#private-rule-summary').textContent");
  assert.match(defaultRules,/FIRST TO 10.*6 MIN/i,'private defaults to Free-for-All score and time');
  assert.equal(await evaluate("document.querySelector('#create-breakthrough-room')"),null,'old huge siege create action is gone');
  await capture('05-desktop-private');

  // The character-centered Armory stage and sliding equipment inspector.
  await evaluate("document.querySelector('#private-back').click();document.querySelector('#armory-button').click()");
  await waitFor(()=>evaluate("!document.querySelector('#armory-menu').classList.contains('hidden')"),'Armory desktop');
  const armoryGeometry=await evaluate(`(() => {
    const kit=document.querySelector('#armory-kit');
    const plaques=[...document.querySelectorAll('.armory-slot-plaque')];
    const inspector=document.querySelector('#armory-inspector');
    return {
      kitVisible: Boolean(kit && !kit.classList.contains('hidden')),
      plaqueCount: plaques.length,
      inspectorClosed: Boolean(inspector && inspector.classList.contains('closed')),
      goal:(() => {
        const menu=window.__ssMenu;
        if(!menu?.shotTo||!menu?.targetPosition||!menu?.stage)return null;
        const yaw=menu.stage.rotation.y,c=Math.cos(yaw),sin=Math.sin(yaw);
        const local=menu.targetPosition;
        const x=local.x*c+local.z*sin,z=-local.x*sin+local.z*c;
        const {camera,target}=menu.shotTo;
        const fx=target[0]-camera[0],fz=target[2]-camera[2],l=Math.hypot(fx,fz);
        return {stageX:local.x,stageZ:local.z,screenRight:(x*-fz+z*fx)/l};
      })()
    };
  })()`);
  evidence['armory-desktop']=armoryGeometry;
  assert.ok(armoryGeometry.kitVisible, 'Spellblade kit stage is active');
  assert.equal(armoryGeometry.plaqueCount, 4, 'four equipment plaques present (Technique, Sorcery, Masterstroke, Heraldry)');
  assert.ok(armoryGeometry.inspectorClosed, 'inspector starts closed to keep Spellblade centered and unobstructed');
  await capture('06-desktop-armory-combat');

  // Open inspector to verify sliding panel and layout
  await evaluate("document.querySelector('#armory-slot-sorcery').click()");
  await sleep(150);
  const inspectorLayout=await evaluate(`(() => {
    const panel=document.querySelector('#armory-inspector');
    const scroll=panel.querySelector('.inspector-scroll');
    const cards=panel.querySelectorAll('.spell-card');
    const detail=panel.querySelector('#armory-inspector-detail');
    return {
      open: !panel.classList.contains('closed'),
      width: panel.clientWidth,
      cardsCount: cards.length,
      detailVisible: Boolean(detail && !detail.classList.contains('hidden')),
      scrollOverflow: scroll ? scroll.scrollWidth - scroll.clientWidth : 0
    };
  })()`);
  assert.ok(inspectorLayout.open, 'inspector opens on plaque click');
  assert.ok(inspectorLayout.width >= 320, 'inspector panel width is comfortably readable');
  assert.ok(inspectorLayout.scrollOverflow <= 3, 'inspector content has no horizontal bleed');
  assert.ok(inspectorLayout.cardsCount >= 4, 'inspector lists spells');

  for(const [section,label] of [['heraldry','07-desktop-armory-heraldry'],['challenges','08-desktop-armory-challenges']]){
    await evaluate("document.querySelector('#armory-"+section+"-tab').click()");
    await sleep(100);
    const overflow=await evaluate("(() => { const el = document.querySelector('#armory-'+'"+section+"'+' .armory-scroll') || document.querySelector('.heraldry-scroll'); return el ? el.scrollWidth - el.clientWidth : 0; })()");
    assert.ok(overflow<=3,section+' text bleeds past scrolling column');
    await capture(label);
  }
  // Grimoirelee review: rotate the real GLB to expose the actual back cloth.
  // An unlocked personal herald remains selectable as a PREVIEW, even on
  // fresh profiles, without granting the achievement.
  await evaluate("document.querySelector('#armory-heraldry-tab').click()");
  await evaluate("document.querySelector('#armory-emblems [data-emblem=grimoirelee]').click()");
  await sleep(1700);
  assert.equal(await evaluate("document.querySelector('#emblem-name').textContent"),'Grimoirelee');
  await capture('07b-desktop-grimoirelee-back');
  // Both offset rear viewpoints expose the banner plane; the Armory camera is
  // oblique to the front-door camera, so the stock rear turn can read edge-on.
  await evaluate("window.__ssMenu.targetYaw += 1.0");
  await sleep(1100);
  await capture('07b2-desktop-grimoirelee-back-offset-right');
  await evaluate("window.__ssMenu.targetYaw -= 2.0");
  await sleep(1200);
  await capture('07b3-desktop-grimoirelee-back-offset-left');
  await evaluate("document.querySelector('#armory-emblems [data-emblem=seize_thy_slayer]').click()");
  await sleep(1100);
  assert.equal(await evaluate("document.querySelector('#emblem-name').textContent"),'Seize Thy Slayer');
  await capture('07c-desktop-earned-back-preview');
  await evaluate("document.querySelector('#armory-back').click()");
  await sleep(100);
  await evaluate("document.querySelector('#armory-back').click();document.querySelector('#solo-button').click()");
  await waitFor(()=>evaluate("!document.querySelector('#solo-menu').classList.contains('hidden')"),'Solo before mobile');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true,screenWidth:390,screenHeight:844});
  await sleep(500);
  await inspect('#solo-menu','solo-mobile-list');
  await capture('04-mobile-solo-list');
  await evaluate("document.querySelector('#practice-mode').click()");
  assert.equal(await evaluate("document.querySelector('#solo-menu').dataset.panel"),'list',
    'the first tap keeps the activity available for a second tap');
  assert.equal(await evaluate("document.querySelector('#practice-mode').getAttribute('aria-pressed')"),'true');
  await evaluate("document.querySelector('#solo-details').click()");
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

  await evaluate("document.querySelector('#rooms-back').click();document.querySelector('#private-button').click()");
  await waitFor(()=>evaluate("document.querySelector('#private-menu').dataset.panel==='list'"),'Private mobile mode picker');
  let mobilePrivate=await inspect('#private-menu','private-mobile-list');
  assert.ok(mobilePrivate.leftVisible&&!mobilePrivate.rightVisible,'mobile private starts with mode tabs and Create');
  await capture('09-mobile-private-modes');
  await evaluate("document.querySelector('#private-mode [data-private-mode=BREAKTHROUGH]').click()");
  assert.equal(await evaluate("document.querySelector('#private-menu').dataset.panel"),'list',
    'first private-mode tap leaves the selected tab reachable for a second tap');
  await evaluate("document.querySelector('#private-options').click()");
  await waitFor(()=>evaluate("document.querySelector('#private-menu').dataset.panel==='details'"),'Private mobile rules');
  mobilePrivate=await inspect('#private-menu','private-mobile-details');
  assert.ok(!mobilePrivate.leftVisible&&mobilePrivate.rightVisible,'mobile private settings are reachable');
  assert.equal(await evaluate("document.querySelector('#private-settings-form [name=teamSize]').value"),'3');
  await capture('10-mobile-private-rules');
  await evaluate("document.querySelector('#private-list-return').click();document.querySelector('#private-back').click();document.querySelector('#breakthrough-button').click()");
  await waitFor(()=>evaluate("document.querySelector('#breakthrough-menu').dataset.panel==='list'"),'Mettle mobile mode picker');
  const mobileMettle=await inspect('#breakthrough-menu','mettle-mobile-list');
  assert.ok(mobileMettle.leftVisible&&!mobileMettle.rightVisible);
  await capture('11-mobile-mettle-modes');
  await evaluate("document.querySelector('#mettle-modes [data-mettle-mode=HIGH_GROUNDS]').click()");
  assert.equal(await evaluate("document.querySelector('#breakthrough-menu').dataset.panel"),'list',
    'first Mettle tap leaves the tabs reachable for a second tap');
  await evaluate("document.querySelector('#mettle-options').click()");
  await waitFor(()=>evaluate("document.querySelector('#breakthrough-menu').dataset.panel==='details'"),'Mettle mobile orders');
  const mobileOrders=await inspect('#breakthrough-menu','mettle-mobile-details');
  assert.ok(!mobileOrders.leftVisible&&mobileOrders.rightVisible);
  await capture('12-mobile-mettle-orders');

  // End-to-end real private room creation through the UI. Validate server
  // output rather than accepting a merely decorative rules selector.
  await evaluate("document.querySelector('#mettle-list-return').click();document.querySelector('#breakthrough-back').click();document.querySelector('#private-button').click()");
  await evaluate("document.querySelector('#private-mode [data-private-mode=FFA]').click()");
  await evaluate("document.querySelector('#private-options').click()");
  await waitFor(()=>evaluate("document.querySelector('#private-menu').dataset.panel==='details'"),'Private FFA creation options');
  await evaluate(`(() => {
    const f=document.querySelector('#private-settings-form').elements;
    f.scoreToWin.value='17';f.minutes.value='9';
    f.scoreToWin.dispatchEvent(new Event('input',{bubbles:true}));
    f.minutes.dispatchEvent(new Event('input',{bubbles:true}));
  })()`);
  // Exactly the selected mode's second tap now uses CREATE ROOM,
  // preserving the edited settings through the real authoritative host.
  await evaluate("document.querySelector('#private-list-return').click();document.querySelector('#private-mode [data-private-mode=FFA]').click()");
  await waitFor(()=>evaluate("!document.querySelector('#lobby').classList.contains('hidden')"),'real custom private FFA lobby',220);
  const createdLobby=await evaluate(`(() => {
    const fields=document.querySelector('#lobby-settings form.lobby-config')?.elements;
    return {
      mode:document.querySelector('#lobby-mode')?.textContent??'',
      selectedMode:fields?.mode?.value??'',
      score:fields?.scoreToWin?.value??'',
      minutes:fields?.minutes?.value??'',
      code:document.querySelector('#lobby-code')?.textContent??''
    };
  })()`);
  assert.match(createdLobby.mode,/FREE.FOR.ALL/i,'server recognized private Free-for-All');
  assert.equal(createdLobby.selectedMode,'FFA');
  assert.equal(createdLobby.score,'17','server persisted first-to-17');
  assert.equal(createdLobby.minutes,'9','server persisted nine-minute custom room');
  assert.equal(createdLobby.code.trim().length,5);
  evidence['private-host-created']=createdLobby;
  await capture('13-mobile-private-created-lobby');

  // Genuine immediate repeated taps, using the real Solo and Mettle handlers.
  await evaluate("document.querySelector('#lobby-leave').click();document.querySelector('#solo-button').click()");
  await waitFor(()=>evaluate("document.querySelector('#solo-menu').dataset.panel==='list'"),'Solo repeat entry');
  await evaluate("document.querySelector('#practice-mode').click();document.querySelector('#practice-mode').click()");
  await waitFor(()=>evaluate("window.__ssRuntime?.latestSnapshot?.mode==='PRACTICE' && !document.querySelector('#hud').classList.contains('hidden')"),
    'repeat-click launched real Practice',220);
  evidence['solo-repeat-launch']='PRACTICE';
  await capture('14-mobile-solo-repeat-launched');

  await evaluate("document.querySelector('#practice-leave').click();document.querySelector('#breakthrough-button').click()");
  await waitFor(()=>evaluate("document.querySelector('#breakthrough-menu').dataset.panel==='list'"),'Mettle repeat entry');
  await evaluate("document.querySelector('#mettle-modes [data-mettle-mode=BREAKTHROUGH]').click();document.querySelector('#mettle-modes [data-mettle-mode=BREAKTHROUGH]').click()");
  await waitFor(()=>evaluate("window.__ssRuntime?.latestSnapshot?.mode==='BREAKTHROUGH' && !document.querySelector('#hud').classList.contains('hidden')"),
    'repeat-click launched real Mettle battle',220);
  evidence['mettle-repeat-launch']='BREAKTHROUGH';
  await capture('15-mobile-mettle-repeat-launched');

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
