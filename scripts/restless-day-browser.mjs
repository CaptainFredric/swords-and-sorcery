// Real Chrome/Three.js/LocalHost acceptance with explicitly STAGED warps.
// Terrain walking and combat engine are live; assisted warps and injected
// structure damage are never represented as player-achieved siege victories.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const base=(process.env.SIEGE_BROWSER_URL??'http://127.0.0.1:3001').replace(/\/$/,'');
const output='output/playwright/restless-day';
await mkdir(output,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'ss-restless-'));
const chrome=spawn(process.env.CHROME_BIN??'chromium',['--headless=new','--no-sandbox',
 '--disable-dev-shm-usage','--enable-unsafe-swiftshader','--remote-allow-origins=*',
 '--window-size=1280,800','--remote-debugging-port=9266','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
const pending=new Map(),errors=[];let ws,seq=0,stage='startup';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,name,attempts=160){stage=name;let last;
 for(let i=0;i<attempts;i++){try{const v=await fn();if(v)return v;}catch(e){last=e;}
 await sleep(120);}throw Error('Chrome timed out: '+name+(last?' '+last.message:''));}
function send(method,params={}){const id=++seq;const p=new Promise((resolve,reject)=>{
 const t=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'));},12000);
 pending.set(id,{resolve:x=>{clearTimeout(t);resolve(x);},reject:e=>{clearTimeout(t);reject(e);}});
});ws.send(JSON.stringify({id,method,params}));return p;}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
 if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);
 return r.result?.value;}
async function shot(file){const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
 await writeFile(output+'/'+file+'.png',Buffer.from(r.data,'base64'));}
const state=`(()=>{const r=window.__ssRuntime,s=r?.latestSnapshot,p=s?.players?.find(a=>a.id===r.playerId);
 return {room:s?.roomState,mode:s?.mode,world:s?.worldId,renderer:r?.world?.constructor?.name,
  players:s?.players?.length,player:p?{position:p.position,team:p.team,alive:p.alive,carrying:p.restlessCarrying}:null,
  phase:s?.modeState?.phase,renowner:s?.modeState?.renowner?.health,
  ladders:s?.modeState?.ladders?.map(x=>({id:x.id,state:x.state,wall:x.wall,health:x.health,replaces:x.replaces})),
  ram:!!s?.soFistication,ballista:!!s?.bibyeBallista,deadline:s?.modeState?.deadline,
  outcome:s?.finishReason,attackerSleeping:s?.players?.filter(p=>p.team==='ATTACKERS'&&p.restlessAsleep).length??0};
})()`;
try{
 const page=await until(async()=>{const r=await fetch('http://127.0.0.1:9266/json/list');return (await r.json()).find(p=>p.type==='page');},'Chrome CDP',180);
 ws=new WebSocket(page.webSocketDebuggerUrl);
 await new Promise((yes,no)=>{ws.onopen=yes;ws.onerror=no;});
 ws.onmessage=e=>{const x=JSON.parse(String(e.data));
 if(x.method==='Runtime.exceptionThrown')errors.push(x.params?.exceptionDetails?.exception?.description??x.params?.exceptionDetails?.text);
 const p=pending.get(x.id);if(!p)return;pending.delete(x.id);if(x.error)p.reject(Error(x.error.message));else p.resolve(x.result);};
 await send('Runtime.enable');await send('Page.enable');await send('Page.navigate',{url:base+'/?debug'});
 await until(()=>evaluate("document.querySelector('#loading-veil')?.classList.contains('done')"),'main menu');
 await evaluate("document.querySelector('#player-name').value='Restless Browser Test';document.querySelector('#breakthrough-button').click()");
 await until(()=>evaluate("!document.querySelector('#breakthrough-menu').classList.contains('hidden')"),'Modes of Mettle menu');
 await evaluate("document.querySelector('[data-mettle-mode=RESTLESS_DAY]').click()");
 assert.equal(await evaluate("document.querySelector('#breakthrough-scenario-subtitle').textContent"),'RESTLESS DAY');
 await shot('01-mode-selection');
 await evaluate("document.querySelector('#breakthrough-play-bots').click()");
 const entered=await until(async()=>{const s=await evaluate(state);
  return s.room==='PLAYING'&&s.renderer==='RestlessDayRenderer'&&s.players===10?s:null;},'real 5v5 Restless Day with Three.js',240);
 assert.equal(entered.mode,'RESTLESS_DAY');
 assert.equal(entered.world,'restless-day');
 assert.equal(entered.ladders.length,2);
 assert.equal(entered.renowner,1650);
 assert.equal(entered.ballista,true);
 assert.equal(entered.ram,true,'native SO-FIST-ICATION did not spawn at the emplacement');
 await shot('02-5v5-real-map');
 const sampleA=await evaluate("(()=>{const r=window.__ssRuntime;return [...r.socket.local.room.players.values()].filter(p=>p.actorKind==='bot').map(p=>({id:p.id,z:p.position.z}));})()");
 await sleep(1750);
 const sampleB=await evaluate("(()=>{const r=window.__ssRuntime;return [...r.socket.local.room.players.values()].filter(p=>p.actorKind==='bot').map(p=>({id:p.id,z:p.position.z}));})()");
 const moved=sampleB.filter(p=>Math.abs(p.z-sampleA.find(a=>a.id===p.id)?.z)>.25);
 assert.ok(moved.length>=1,'at least one live bot should be moving');
 // Stage the local knight beside its real initial ladder. Only positioning is
 // assisted; pickup and placement go through the actual Interact input path.
 await evaluate("(()=>{const r=window.__ssRuntime,a=r.socket.local.room.players.get(r.playerId);a.position={x:-10,y:0,z:-68};a.velocity={x:0,y:0,z:0};a.yaw=Math.PI;r.input.interact();return true;})()");
 await until(async()=>{const s=await evaluate(state);return s.player?.carrying==='ladder-a'?s:null;},'ladder pickup through real Interact');
 await shot('03-ladder-carried');
 await evaluate("(()=>{const r=window.__ssRuntime,a=r.socket.local.room.players.get(r.playerId);a.position={x:-6,y:0,z:-31};a.velocity={x:0,y:0,z:0};a.yaw=Math.PI;r.input.interact();return true;})()");
 await until(async()=>{const s=await evaluate(state);return s.ladders?.[0]?.state==='deployed'?s:null;},'outer ladder deployed');
 await shot('04-ladder-deployed');
 // Movement packets are genuine; this walks up the live 30Hz server ramp.
 await evaluate("(()=>{const r=window.__ssRuntime;window.__restlessDrive=setInterval(()=>r.socket.send({type:'input',forward:1,right:0,jump:false,sprint:false,yaw:Math.PI}),35);return true;})()");
 await sleep(2800);
 await evaluate("clearInterval(window.__restlessDrive);window.__ssRuntime.socket.send({type:'input',forward:0,right:0,yaw:Math.PI});true");
 const climbed=await evaluate(state);
 assert.ok(climbed.player.position.z>-26.2,'a real player did not cross the lower ladder ramp');
 assert.ok(climbed.player.position.y>4.8,'the real player failed to reach battlement height');
 await shot('05-real-outer-climb');
 // Stage a wall-top retrieval and second-wall carry to isolate that lifecycle.
 await evaluate("(()=>{const r=window.__ssRuntime,a=r.socket.local.room.players.get(r.playerId);
  a.position={x:-6,y:6,z:-24};a.velocity={x:0,y:0,z:0};a.yaw=0;
  r.socket.local.room.restlessDay.phase=1;r.input.interact();return true;})()");
 await until(async()=>{const s=await evaluate(state);return s.player?.carrying==='ladder-a'?s:null;},'retrieve ladder from battlement');
 await evaluate("(()=>{const r=window.__ssRuntime,a=r.socket.local.room.players.get(r.playerId);
  a.position={x:-6,y:0,z:14};a.velocity={x:0,y:0,z:0};a.yaw=Math.PI;r.input.interact();return true;})()");
 await until(async()=>{const s=await evaluate(state);return s.ladders?.[0]?.wall===1&&s.ladders?.[0]?.state==='deployed'?s:null;},'second curtain deployed');
 await shot('06-inner-curtain');
 // Structural damage is a staged authority assertion, not a player's sword hit.
 const destroyed=await evaluate(`(async()=>{const r=window.__ssRuntime,room=r.socket.local.room;
  const {damageStructure}=await import('/shared/sim/structures.mjs');
  const ok=damageStructure(room,'rightful-renowner',99999,r.playerId,'sword',r.socket.serverNow(),{raw:true});
  return {ok,state:room.state,team:room.winnerTeam,reason:room.finishReason};
 })()`);
 assert.equal(destroyed.ok,true);assert.equal(destroyed.reason,'renowner-destroyed');
 await shot('07-staged-pre-sundown-surrender');
 await evaluate("(()=>{const r=window.__ssRuntime;const room=r.socket.local.room;room.startMatch(r.socket.serverNow());return true;})()");
 await until(async()=>{const s=await evaluate(state);return s.room==='PLAYING'&&s.renowner===1650?s:null;},'authoritative rematch resets monument');
 // Two broken ladders recover by authoritative timer, not an invented third item.
 const recovery=await evaluate(`(async()=>{const r=window.__ssRuntime,room=r.socket.local.room;
  const {damageRestlessLadder,restlessnessStep,RESTLESS_DAY_RULES}=await import('/shared/sim/restlessDayMode.mjs');
  const now=r.socket.serverNow(),def=[...room.players.values()].find(p=>p.team==='DEFENDERS');
  for(const l of room.restlessDay.ladders)damageRestlessLadder(room,l.id,9999,def.id,now);
  const broken=room.restlessDay.ladders.every(l=>l.state==='broken');
  restlessnessStep(room,1/30,now+RESTLESS_DAY_RULES.replaceSec+.01);
  return {broken,recovered:room.restlessDay.ladders.every(l=>l.state==='available'),
   replacements:room.restlessDay.ladders.map(l=>l.replaces)};
 })()`);
 assert.equal(recovery.broken,true);assert.equal(recovery.recovered,true);
 await shot('08-ladder-recovery');
 // Accelerate ONLY the authoritative deadline to test exact sundown.
 const sundown=await evaluate(`(()=>{const r=window.__ssRuntime,room=r.socket.local.room,now=r.socket.serverNow();
  room.restlessDay.deadline=now;room.tick(now);
  return {state:room.state,team:room.winnerTeam,reason:room.finishReason,
   sleeping:[...room.players.values()].filter(p=>p.team==='ATTACKERS'&&p.restlessAsleep).length};})()`);
 assert.equal(sundown.reason,'sundown');assert.equal(sundown.sleeping,5);
 await shot('09-staged-sundown');
 await writeFile(output+'/result.json',JSON.stringify({entered,climbed,botMoved:moved.length,destroyed,recovery,sundown,errors},null,2));
 if(errors.length)throw Error('Browser exceptions: '+errors.slice(0,4).join(' / '));
 console.log('[RESTLESS DAY BROWSER ACCEPTED]',JSON.stringify({actors:entered.players,botMoved:moved.length,climbed:climbed.player.position,recovery,sundown}));
}catch(e){
 console.error('[RESTLESS DAY BROWSER FAILED]',stage,e.stack??String(e));
 if(ws)await shot('failure').catch(()=>{});
 await writeFile(output+'/failure.json',JSON.stringify({stage,error:String(e),exceptions:errors},null,2));
 throw e;
}finally{ws?.close();chrome.kill('SIGTERM');await sleep(500);await rm(profile,{recursive:true,force:true}).catch(()=>{});}
