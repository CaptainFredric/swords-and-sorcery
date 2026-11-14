// Chrome/CDP acceptance on a real locally hosted HTML5 Castleward build.
// Uses visible Armory clicks and real keyboard/mouse gameplay, not fake damage.
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
// Fail BEFORE launching Chrome if the authentic exported v26 asset or its
// Blender source is missing, incomplete, or replaced by an unrelated file.
for(const [asset,expected] of [
 [new URL('../client/assets/props/bibye-ballista/Bi_Bye_llista_GameReady_PBR.glb',import.meta.url),
   '9d1a8e7920b445c29546336d1bf00190b6837549941bd84c75858f64662619e6'],
 [new URL('../assets/source/bibye-ballista/Bi_Bye_llista_blend_archive.zip',import.meta.url),
   'cdb304075c515d0313fdcd65673e8927d07232894c97fe2a11e8666501957d60']
]){
 if(!existsSync(asset))throw Error('Original Argon v26 handoff absent: stage '+asset.pathname);
 const actual=createHash('sha256').update(readFileSync(asset)).digest('hex');
 assert.equal(actual,expected,'The uploaded original Argon file must remain unmodified: '+asset.pathname);
}
import {BI_BYE_LLISTA_CONFIG} from '../shared/sim/biByeLlista.mjs';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
const base=(process.env.SIEGE_BROWSER_URL??'http://127.0.0.1:3001').replace(/\/$/,'');
const port=9263,out='output/playwright/bi-bye-sharp-turn';
await mkdir(out,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'ss-bibye-sweep-chrome-'));
const chrome=spawn(process.env.CHROME_BIN??'chromium',[
 '--headless=new','--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader',
 '--remote-allow-origins=*','--window-size=1280,800','--remote-debugging-port='+port,
 '--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
let ws,seq=0,stage='boot';const pending=new Map(),exceptions=[],record={};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label,tries=100){
 stage=label;let last=null;
 for(let i=0;i<tries;i++){try{const value=await fn();if(value){console.log('[BI-BYE PASS]',label);return value;}}catch(e){last=e;}
  await sleep(100);}
 throw Error('Chrome timeout '+label+'; '+(last?.message??''));
}
function send(method,params={}){
 const id=++seq,p=new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'));},25000);
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
// Run against one locally hosted Castleward (the original v26 GLB MUST be staged).
// SIEGE_BROWSER_URL=http://127.0.0.1:3001 CHROME_BIN=chromium node scripts/bi-bye-sweep-browser.mjs
// Real Chrome/CDP, physical K/U/left-click, server snapshots and actual mesh inventory.
const state="(() => {const r=window.__ssRuntime,s=r?.latestSnapshot,b=s?.bibyeBallista;return {mode:s?.mode,at:s?.serverTime,ballista:b?{id:b.id,x:b.x,y:b.y,z:b.z,operatorId:b.operatorId,mode:b.mode,heading:b.heading,mainYaw:b.mainYaw,mainPitch:b.mainPitch,skill:b.skill,sweep:b.sweep,mainBoltLoaded:b.mainBoltLoaded,smallBoltReadyAt:b.smallBoltReadyAt,weaponFocus:b.weaponFocus}:null,projectiles:(s?.bibyeProjectiles??[]).map(p=>({id:p.id,subKind:p.subKind})),me:r?.localAuth?{id:r.localAuth.id,operating:r.localAuth.operatingBallistaId,position:r.localAuth.position}:null};})()";
const observe=()=>evaluate(state);
let proof={};
try{
 const target=await until(async()=>{const r=await fetch('http://127.0.0.1:'+port+'/json/list');return (await r.json()).find(x=>x.type==='page');},'Chrome debugger',150);
 ws=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 ws.onmessage=e=>{const data=JSON.parse(String(e.data));
  if(data.method==='Runtime.exceptionThrown')exceptions.push(data.params?.exceptionDetails?.text??'unknown');
  const task=pending.get(data.id);if(!task)return;pending.delete(data.id);
  if(data.error)task.reject(Error(data.error.message));else task.resolve(data.result);
 };
 await send('Page.enable');await send('Runtime.enable');await send('Page.navigate',{url:base+'/?debug'});
 await until(()=>evaluate("document.querySelector('#loading-veil')?.classList.contains('done')"),'menu loaded',180);
 await evaluate("document.querySelector('#armory-button').click()");
 await until(()=>evaluate("!document.querySelector('#armory-menu').classList.contains('hidden')"),'Armory loaded');
 await evaluate("document.querySelector('#armory-siege-tab').click()");
 await evaluate("document.querySelector('[data-siege-tab=biBye]').click()");
 const available=await evaluate("(() => ({options:[...document.querySelectorAll('[data-siege-skill]')].map(e=>e.dataset.siegeSkill),attack:document.querySelector('#armory-siege')?.textContent?.includes('A SHARP TURN')}))()");
 assert.ok(available.options.includes('lookAroundAndFindOut'),'third Skill must be selectable');
 assert.ok(available.attack,'third innate attack must appear in Armory');
 await evaluate("document.querySelector('[data-siege-skill=lookAroundAndFindOut]').click()");
 assert.equal(await evaluate("document.querySelector('[data-siege-skill=lookAroundAndFindOut]').getAttribute('aria-checked')"),'true');
 await screenshot('01-third-skill-equipped');
 await evaluate("document.querySelector('#armory-back').click()");
 // Inspection Practice uses Castleward's *existing, authorized* collision-safe
 // actor placement tools to defeat headless Chrome's slow software-rendered
 // walking. Mount, attack, Skill, and projectile fire are still real inputs.
 const kit=await evaluate("window.__ssLink?.local?.siegeLoadout?.biBye");
 assert.equal(kit,'lookAroundAndFindOut','actual personal equipment must match the Armory before entering');
 await evaluate("window.__ssLink.startInspectionPractice('Argon v26 sweep inspection','castleward')");
 await until(async()=>{const s=await observe();return s?.mode==='PRACTICE'&&s?.me?.id?s:false;},'isolated real-authority Inspection Practice host',180);
 assert.equal(await evaluate("window.__ssLink.local.player.siegeLoadout.biBye"),'lookAroundAndFindOut',
   'Practice player carries the selected third Skill; the idle machine remains default until mounted');
 // The city's initial foundry location is beside a stone parapet. A full
 // 360-degree *physical bow* must reject that obstruction. Stage the operator
 // in Castleward's broad east meadow BEFORE building; use the real Practice
 // foundry to choose a supported emplacement, rather than bypassing collision
 // checks or relocating an already-mounted machine.
 const openGround=await evaluate("window.__ssLink.stageInspectionActor({actorId:window.__ssRuntime.localAuth.id,position:{x:16,y:0,z:8,yaw:0}})");
 assert.equal(openGround?.success,true,'open-ground player setup must use authorized inspection placement');
 await evaluate("document.querySelector('#practice-siege-type').value='bi-bye-llista';document.querySelector('#practice-build-bibye').click()");
 await until(async()=>{const s=await observe();return s?.ballista?s:false;},'real ballista built',100);
 const realClearance=await evaluate("(async()=>{const mod=await import('/shared/sim/biByeSweep.mjs');const room=window.__ssLink.local.room,b=room.biByeLlista;return {clear:mod.biByeSweepClearance(b,room.world),x:b.x,y:b.y,z:b.z,heading:b.heading,world:room.worldId};})()");
 console.log('[BI-BYE ACTUAL CLEARANCE]',JSON.stringify(realClearance));
 assert.equal(realClearance.clear,true,'real Practice foundry must place the bow where its full authored revolution physically clears world geometry');
 // The original 26-clip donor must load, not the production v4.3 fallback.
 const inventory=await until(()=>evaluate("(() => {const b=window.__ssRuntime?.world?.biByeLlista;return b?.actions?.has('22_BiBye_A_Sharp_Turn')&&b.actions.has('23_BiBye_Look_Around_Spin_Loop')&&b.actions.has('24_BiBye_Look_Around_Reversed_Fire_Settle')&&b.actions.has('26_BiBye_Melee_Lowered_Stance')&&b.nodes.has('frame_sweep_volume_L')&&b.nodes.has('frame_sweep_volume_R')?{clips:b.actions.size,locators:true}:null;})()"),'original Argon v26 model and contact locators',100);
 proof.inventory=inventory;
 // Focus the game before key events. Walking and mounting use actual controls.
 const inputElement=await evaluate("(() => {const el=window.__ssRuntime.input.element,r=el.getBoundingClientRect();return {x:Math.round(r.left+r.width*.5),y:Math.round(r.top+r.height*.5)};})()");
 await send('Page.bringToFront');
 await send('Input.dispatchMouseEvent',{type:'mousePressed',x:inputElement.x,y:inputElement.y,button:'left',clickCount:1});
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:inputElement.x,y:inputElement.y,button:'left',clickCount:1});
 await evaluate("window.__ssRuntime?.requestPointerLock()");
 await until(()=>evaluate("Boolean(window.__ssRuntime?.input?.enabled)"),'focused gameplay input',80);
 // The sandbox tool resolves this position against terrain, player and
 // machine solids; it does not grant a PvP mount bypass or fake an operator.
 const staged=await evaluate("(() => {const r=window.__ssRuntime,link=window.__ssLink;return link.stageInspectionActor({actorId:r.localAuth.id,position:'near_ballista'});})()");
 assert.equal(staged?.success,true,'valid, collision-resolved inspection placement beside the actual siege engine: '+JSON.stringify(staged));
 const position=await until(async()=>{
  const s=await observe(),p=s?.me?.position,b=s?.ballista;
  return p&&b&&Math.hypot(p.x-b.x,p.z-b.z)<BI_BYE_LLISTA_CONFIG.emplacement.interactRadius-.05?s:false;
 },'authorized near-ballista inspection placement',90);
 proof.staged={position:position.me.position,selectedKit:kit};
 await evaluate("(() => {const r=window.__ssRuntime,p=r.localAuth.position,b=r.latestSnapshot.bibyeBallista;r.input.yaw=Math.atan2(-(b.x-p.x),-(b.z-p.z));})()");

 // Diagnose the *actual* physical boarding path before attributing a
 // failed mount to collision, local-input routing, or the inspection sandbox.
 // No force-mounts and no direct simulation mutations here.
 const mountFacts="(() => {const r=window.__ssRuntime,l=window.__ssLink,local=l.local,p=local.room?.players.get(r.localAuth?.id),b=local.room?.biByeLlista;return {state:{mode:l.latestSnapshot?.mode,roomState:l.latestSnapshot?.roomState,hosting:l.hosting,playingLocally:l.playingLocally},input:{enabled:r.input.enabled,suspended:r.input.suspended,locked:!!document.pointerLockElement,focus:document.activeElement?.outerHTML?.slice(0,190),interactBinding:r.input.bindings.interact,interactAction:r.input.actionOf.get('KeyT'),interactAllowed:r.input.allowAction?.('interact',false),blocked:[...r.input.blockedKeys],held:[...r.input.keys]},inspection:{frozen:local.inspectionFrozen,mode:local.inspectionFreezeMode,actorId:local.inspectionActorId,controlId:local.inspectionControlId,free:r.inspectionFree},player:p?{id:p.id,alive:p.alive,position:p.position,attackActive:p.attackActive,pendingSpell:!!p.pendingSpell,gauntlet:!!p.gauntlet,ultimateState:!!p.ultimateState,practiceUiFocus:p.practiceUiFocus,operatingBallistaId:p.operatingBallistaId,team:p.team}:null,ballista:b?{id:b.id,x:b.x,y:b.y,z:b.z,team:b.team,operatorId:b.operatorId,interactRadius:b.interactRadius,mode:b.mode,health:b.health,planarDistance:p?Math.hypot(p.position.x-b.x,p.position.z-b.z):null}:null,errors:window.__bibyeMountErrors??[]};})()";
 await evaluate("window.__bibyeMountErrors=[];window.__ssLink.local.on('error',e=>window.__bibyeMountErrors.push(e.message??String(e)))");
 await evaluate("(() => {window.__bibyeWire=[];const record=(step,values)=>window.__bibyeWire.push({step,values,time:performance.now()});document.addEventListener('keydown',e=>{if(e.code==='KeyT')record('nativeKeyDown',{repeat:e.repeat,key:e.key,target:e.target?.tagName});},true);for(const [obj,name]of [[window.__ssRuntime.input,'interact'],[window.__ssRuntime.socket,'send'],[window.__ssLink.local,'send'],[window.__ssLink.local,'siegeOperate']]){const fn=obj?.[name];if(typeof fn!=='function')continue;obj[name]=function(...args){record(name,args);return fn.apply(this,args)};} })()");

 proof.beforeMount=await evaluate(mountFacts);
 console.log('[BI-BYE MOUNT PRE]',JSON.stringify(proof.beforeMount));
 await key('T','rawKeyDown');
 proof.downMount=await evaluate(mountFacts);
 await key('T','keyUp');
 await sleep(240);
 proof.afterMount=await evaluate(mountFacts);
 proof.commandWire=await evaluate("window.__bibyeWire");
 console.log('[BI-BYE MOUNT POST]',JSON.stringify({down:proof.downMount,after:proof.afterMount,wire:proof.commandWire}));
 await writeFile(out+'/mount-diagnostic.json',JSON.stringify({before:proof.beforeMount,down:proof.downMount,after:proof.afterMount,wire:proof.commandWire},null,2));
 if(proof.afterMount.errors?.length)throw Error('Server rejected real T mount: '+proof.afterMount.errors.join('; '));
 if(proof.downMount.input?.interactAction!=='interact'||!proof.commandWire.some(x=>x.step==='nativeKeyDown'&&x.values?.repeat===false)||!proof.commandWire.some(x=>x.step==='interact'))throw Error('Physical T was not processed as an interaction: '+JSON.stringify(proof.commandWire));
 if(!proof.afterMount.ballista.operatorId)throw Error('Physical T did not mount. Routed command trace: '+JSON.stringify(proof.commandWire));
 const mounted=await until(async()=>{const s=await observe();return s?.me?.operating===s?.ballista?.id?s:false;},'actual mounted operator',15);
 assert.equal(mounted.ballista.skill.id,'lookAroundAndFindOut');
 await screenshot('02-mounted-original-v26');
 // Capture genuine authoritative events *as delivered*, not only transient
 // animation snapshots: a 1.65s single turn can begin and end between two
 // software-WebGL frames in CI, so polling 'sweep!==null' can falsely time out.
 await evaluate("(() => {window.__bibyeActions=[];window.__ssLink.local.on('events',data=>{for(const e of data?.events??[])if(/^bibye|^siegeSkill/.test(e.type))window.__bibyeActions.push(e);});})()");
 const initialHeading=mounted.ballista.heading;
 const kPre=await evaluate("({enabled:window.__ssRuntime.input.enabled,mounted:window.__ssRuntime.input.mountedBallista,key:window.__ssRuntime.input.actionOf.get('KeyK'),allowed:window.__ssRuntime.input.allowAction?.('siegeSweep',false),errors:window.__bibyeMountErrors})");
 console.log('[BI-BYE K INPUT]',JSON.stringify(kPre));
 assert.equal(kPre.key,'siegeSweep','K binding has to exist on the mounted controller');
 await tap('K');
 const firstEvents=await evaluate("({events:window.__bibyeActions,errors:window.__bibyeMountErrors})");
 console.log('[BI-BYE K POST]',JSON.stringify(firstEvents));
 if(firstEvents.errors?.length)throw Error('Server rejected K: '+JSON.stringify(firstEvents.errors));
 const eventStart=await until(()=>evaluate("window.__bibyeActions?.find(e=>e.type==='bibyeSweep'&&e.kind==='single'&&e.action==='started')"),'authoritative K Sharp Turn started event',60);
 const single=(await observe());
 assert.equal(eventStart.kind,'single');
 assert.equal(single.ballista.skill.readyAt,0);
 await screenshot('03-sharp-turn-bow-moving');
 await until(()=>evaluate("window.__bibyeActions?.find(e=>e.type==='bibyeSweep'&&e.action==='ended')"),'authoritative single revolution completed',80);
 await tap('U');
 const spinning=await until(async()=>{const s=await observe();return s?.ballista?.sweep?.phase==='loop'?s:false;},'U: sustained Look Around spin',80);
 assert.equal(spinning.ballista.heading,initialHeading,'wheels do not turn the carriage');
 assert.equal(spinning.ballista.skill.readyAt,0,'cooldown cannot expire during an indefinite loop');
 await screenshot('04-continuous-braced-spin');
 // True left-click: Fire becomes a stop request, not a free projectile.
 await send('Input.dispatchMouseEvent',{type:'mousePressed',x:inputElement.x,y:inputElement.y,button:'left',clickCount:1});
 await sleep(130);
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:inputElement.x,y:inputElement.y,button:'left',clickCount:1});
 const settling=await until(async()=>{const s=await observe();return s?.ballista?.sweep?.phase==='settle'?s:false;},'Fire: physical stop/settle',40);
 assert.equal(settling.ballista.skill.readyAt,0);
 await screenshot('05-authored-settle');
 const resolved=await until(async()=>{const s=await observe();return s?.ballista?.skill?.phase==='idle'&&!s?.ballista?.sweep&&s.ballista.skill.readyAt>s.at?s:false;},'machine-owned Skill cooldown begins on resolution',100);
 const shot=await until(async()=>{const s=await observe();return s?.ballista?.smallBoltReadyAt>mounted.ballista.smallBoltReadyAt?s:false;},'physical Bolt I release advances its real recock clock',90);
 assert.equal(shot.ballista.mainBoltLoaded,true,'mobile spin must never discharge Bolt II');
 await screenshot('06-loaded-bolt-I-release');
 assert.deepEqual(exceptions,[],'no Chrome runtime exceptions');
 proof={...proof,mounted,single,spinning,settling,resolved,shot,exceptions};
 await writeFile(out+'/result.json',JSON.stringify(proof,null,2));
 console.log('[BI-BYE SWEEP BROWSER ACCEPTED]',JSON.stringify({clips:inventory.clips,settledCooldown:resolved.ballista.skill.readyAt-resolved.at,projectiles:shot.projectiles}));
}catch(error){
 console.error('[BI-BYE SWEEP BROWSER FAILED]',stage,error.stack??String(error));
 await writeFile(out+'/failure.json',JSON.stringify({stage,error:String(error),exceptions,state:ws?await observe().catch(()=>null):null,
  actions:ws?await evaluate("window.__bibyeActions??[]").catch(()=>[]):[],rejections:ws?await evaluate("window.__bibyeMountErrors??[]").catch(()=>[]):[]},null,2));
 if(ws)await screenshot('failure').catch(()=>{});
 throw error;
}finally{ws?.close();chrome.kill('SIGTERM');await sleep(700);await rm(profile,{recursive:true,force:true}).catch(()=>{});}
