import * as historyApi from '../../shared/sim/history.mjs';
import {resetPracticePlayer} from '../../shared/sim/practice.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
import{RoomManager}from'../../shared/sim/RoomManager.mjs';
import{createSoFistication,mountSoFistication,stepSoFistication,fireSoFistication,damageSoFistication}from'../../shared/sim/soFistication.mjs';
import{stepRoom,tryDash}from'../../shared/sim/combat.mjs';import{callSteel}from'../../shared/src/steel.mjs';import{armWorldImpact}from'../../shared/sim/worldImpact.mjs';import{soFistVolumes}from'../../shared/sim/soFistGeometry.mjs';
function setup(z=-8){const room=new RoomManager().createSoloRoom('PRACTICE',0,'castleward');room.world={solids:[],ramps:[],floors:[{id:'g',center:[0,-.1,0],size:[200,.2,200],y:0}],abyssY:-20};room.state='PLAYING';const p=room.addPlayer({id:'p',token:'p',name:'Driver'},0),v=room.addPlayer({id:'v',token:'v',name:'Target'},0);p.position={x:0,y:0,z:3.1};v.position={x:0,y:0,z};p.spawnProtectionUntil=v.spawnProtectionUntil=0;v.health=300;const b=room.soFistication=createSoFistication();mountSoFistication(room,b,p);return{room,p,v,b,time:0};}
function run(s,sec,input={},dt=1/60){s.p.input={forward:0,right:0,...input};for(let i=0;i<Math.round(sec/dt);i++){s.time+=dt;stepSoFistication(s.room,s.b,dt,s.time);}return s;}
test('charge sweeps a target and never repeats damage during the same overlapping contact',()=>{
 const s=setup(-20);run(s,3,{sprint:true});const hits=s.room.events.filter(e=>e.type==='damage'&&e.victimId==='v');assert.equal(hits.length,1);assert.ok(hits[0].amount>=65&&hits[0].amount<=90);assert.ok(s.v.impulse.z< -10);run(s,.3,{sprint:true});assert.equal(s.room.events.filter(e=>e.type==='damage').length,1);
 const still=setup(-2.4);run(still,1);assert.equal(still.v.health,300);
});
test('one real piston stroke hits once, delivers78stagger and launches; a charged stroke is one capped result',()=>{
 const s=setup(-3.3);fireSoFistication(s.room,s.b,0);run(s,2.3);const hits=s.room.events.filter(e=>e.type==='damage');assert.equal(hits.length,1);assert.ok(hits[0].amount>=90&&hits[0].amount<=120);assert.equal(s.v.stagger.level,78);assert.ok(s.v.impulse.z< -12);assert.ok(s.v.velocity.y>3);run(s,1);assert.equal(s.room.events.filter(e=>e.type==='damage').length,1);
 const charging=setup(-3.3);charging.b.speed=12;fireSoFistication(charging.room,charging.b,-2.1);run(charging,.05,{sprint:true});assert.ok(charging.room.events.filter(e=>e.type==='damage').every(e=>e.amount<=120));assert.ok(charging.room.events.filter(e=>e.type==='damage').length<=1);
});
test('fist destruction preserves hull and leaves an actual shorter, narrower75to90 piston',()=>{
 const s=setup(-2.2),before=soFistVolumes(s.b).find(v=>v.componentId==='Fist');for(let i=0;i<27;i++)assert.ok(damageSoFistication(s.room,s.b,30,'enemy','sword',i*.1,{componentId:'Fist'}));assert.equal(s.b.health,1400);assert.equal(s.b.components.Fist.health,0);assert.equal(soFistVolumes(s.b).some(v=>v.componentId==='Fist'),false);assert.ok(before.size[0]>soFistVolumes(s.b).find(v=>v.componentId==='Piston').size[0]);fireSoFistication(s.room,s.b,0);run(s,2.3);const hit=s.room.events.find(e=>e.type==='damage');assert.ok(hit&&hit.amount>=75&&hit.amount<=90);
});
test('wall consequences require actual opted in launch and consume one impact, including normal balance break',()=>{
 const s=setup(-4.5);s.room.world.solids=[{id:'stone',center:[0,1,-5],size:[8,2,.1],material:'stone'}];s.b.operatorId=null;s.p.operatingRamId=null;s.room.soFistication=null;s.v.stagger.level=78;s.v.stagger.shakenAt=1;s.v.impulse={x:0,z:-8};armWorldImpact(s.v,'p','so-fist',1);stepRoom(s.room,1/30,1.01,s.room.world);stepRoom(s.room,1/30,1.04,s.room.world);stepRoom(s.room,1/30,1.07,s.room.world);const hits=s.room.events.filter(e=>e.source==='wall-impact');assert.equal(hits.length,1);assert.ok(hits[0].amount>20&&hits[0].amount<=30,JSON.stringify(hits));assert.ok(s.v.staggerUntil>1.07);const hp=s.v.health;for(let i=0;i<20;i++)stepRoom(s.room,1/30,1.1+i/30,s.room.world);assert.equal(s.v.health,hp);
 const ordinary=setup(-4.5);ordinary.room.soFistication=null;ordinary.v.impulse={x:0,z:-8};ordinary.room.world.solids=s.room.world.solids;stepRoom(ordinary.room,1/30,1);assert.equal(ordinary.v.health,300,'existing sources remain optin');
});
test('Steel, guard and recovered balance mitigate their proper channels without cancelling momentum',()=>{
 const s=setup(-3.3);s.v.health=100;s.v.steel=callSteel(0);s.v.stagger.recoverUntil=4;fireSoFistication(s.room,s.b,0);run(s,2.3);assert.ok(s.v.alive&&s.v.health>0);assert.equal(s.v.stagger.level,39);assert.ok(s.v.impulse.z< -12);
 const guard=setup(-3.3);guard.v.guarding=true;guard.v.yaw=Math.PI;guard.v.guardStamina=100;fireSoFistication(guard.room,guard.b,0);run(guard,2.3);assert.ok(guard.v.health>200);assert.ok(guard.v.guardStamina<70);assert.ok(guard.v.impulse.z< -8);
});
test('a stone barrier stops the stroke surface and protects a victim behind it',()=>{
 const s=setup(-4);s.room.world.solids=[{id:'stone-stop',center:[0,1,-2.9],size:[8,2,.1],material:'stone'}];fireSoFistication(s.room,s.b,0);run(s,2.3);
 assert.equal(s.v.health,300);const face=soFistVolumes(s.b,s.time).find(v=>v.componentId==='Fist');assert.ok(face.center[2]-face.size[2]/2>=-2.86,'authored face stays on the near side of stone');
});
test('full stepRoom contact preserves external launch, contact separation and source credit',()=>{
 const s=setup(-20);s.v.history=[];s.p.input={forward:0,right:0,sprint:true,yaw:0,pitch:0};
 for(let i=1;i<=96;i++)stepRoom(s.room,1/30,i/30);const hits=s.room.events.filter(e=>e.type==='damage'&&e.victimId===s.v.id);assert.equal(hits.length,1);assert.equal(hits[0].attackerId,s.p.id);assert.ok(s.v.position.z< -22);assert.ok(s.v.impulse.z< -5);
});
test('a target sprinting across the future nose can escape; a crossing during actual contact is caught',()=>{
 for(const [x,speed,expectHit]of [[-2.2,8,false],[-.6,4,true]]){
  const s=setup(-2.8);s.v.position.x=x;s.v.history=[];const {recordTransform}=historyApi;recordTransform(s.v,0);s.b.speed=12;s.p.input={forward:1,sprint:true,right:0};
  s.v.position.x=x+speed/30;recordTransform(s.v,1/30);stepSoFistication(s.room,s.b,1/30,1/30);
  assert.equal(s.v.health<300,expectHit);
 }
});
test('wall material matches real Castleward masonry and reset self clears pending impact credit',()=>{
 const s=setup(-4.5);s.room.soFistication=null;s.room.world.solids=[{id:'castle-stone',center:[0,1,-5],size:[8,2,.1],material:'limestone'}];s.v.history=[];s.v.impulse={x:0,z:-8};armWorldImpact(s.v,'p','so-fist',1);for(let i=0;i<3;i++)stepRoom(s.room,1/30,1+i/30);assert.ok(s.room.events.some(e=>e.source==='wall-impact'));
 s.room.world.spawnPoints=[{x:4,y:0,z:0}];armWorldImpact(s.p,'v','so-fist',2);resetPracticePlayer(s.room,s.p.id,2);assert.equal(s.p.worldImpact,null);
});
test('ordinary run, actual Sprint and a real lateral Dash can evade an anticipated charge',()=>{
 for(const action of ['run','sprint','dash']){
  const s=setup(-20);s.v.health=100;s.v.history=[];s.p.input={forward:0,right:0,sprint:true,yaw:0,pitch:0};
  for(let i=1;i<=120;i++){
   const now=i/30;if(i===78){if(action==='dash')tryDash(s.room,s.v.id,{x:1,z:0},now);else s.v.input=action==='sprint'?{forward:1,right:0,sprint:true,yaw:-Math.PI/2,pitch:0}:{forward:0,right:1,yaw:0,pitch:0};}
   stepRoom(s.room,1/30,now);
  }
  assert.equal(s.v.health,100,action+' evades the committed forward approach');assert.ok(Math.abs(s.v.position.x)>2);
  if(action==='sprint')assert.ok(s.v.guardStamina<100,'ordinary shared Sprint stamina is used');if(action==='dash')assert.ok(s.v.dashReadyAt>3);
 }
});
test('Guard uses its existing facing cone while a sword parry cannot reverse the piston',()=>{
 const facing=setup(-3.3);facing.v.guarding=true;facing.v.yaw=Math.PI;facing.v.guardStartedAt=2.12;fireSoFistication(facing.room,facing.b,0);run(facing,2.3);assert.ok(facing.v.health>200);assert.ok(facing.v.guardStamina<100);assert.equal(facing.room.events.some(e=>e.type==='parry'),false);
 const back=setup(-3.3);back.v.guarding=true;back.v.yaw=0;fireSoFistication(back.room,back.b,0);run(back,2.3);assert.ok(back.v.health<=210);assert.equal(back.v.guardStamina,100);
});
test('a genuine moving side impact is modest and resting contact against stone never ticks repeated ram damage',()=>{
 const side=setup(-.4);side.v.history=[];side.v.position.x=1.8;historyApi.recordTransform(side.v,0);side.v.position.x=1.3;historyApi.recordTransform(side.v,1/30);side.b.speed=4;side.p.input={forward:1,right:0};stepSoFistication(side.room,side.b,1/30,1/30);const hit=side.room.events.find(e=>e.type==='damage');assert.ok(hit&&hit.amount>0&&hit.amount<=35);
 const pinned=setup(-20);pinned.v.history=[];pinned.room.world.solids=[{id:'end-wall',center:[0,1.4,-21.3],size:[8,2.8,.1],material:'stone'}];pinned.p.input={forward:0,right:0,sprint:true,yaw:0,pitch:0};for(let i=1;i<=180;i++)stepRoom(pinned.room,1/30,i/30);assert.equal(pinned.room.events.filter(e=>e.type==='damage'&&e.source==='knock-on-steel').length,1);assert.ok(pinned.room.events.filter(e=>e.type==='damage'&&e.source==='wall-impact').length<=1);
});
test('an administrative relocation cancels a previously armed wall consequence',()=>{
 const s=setup(-2);s.room.soFistication=null;s.room.world.solids=[{id:'wall',center:[0,1,-5],size:[8,2,.1],material:'stone'}];armWorldImpact(s.v,'p','so-fist',1);s.v.position={x:0,y:0,z:-4.5};s.v.impulse={x:0,z:-8};for(let i=0;i<3;i++)stepRoom(s.room,1/30,1+i/30);assert.equal(s.v.health,300);assert.equal(s.v.worldImpact,null);
});
test('the powered fist and shorter exposed shaft can each strike other siege machinery once per stroke',async()=>{
 const {createBiByeLlista}=await import('../../shared/sim/biByeLlista.mjs');
 for(const armored of [true,false]){
  const s=setup(-20);s.room.biByeLlista=createBiByeLlista({x:0,z:armored?-5.5:-4.5,baseYaw:0});if(!armored)s.b.components.Fist.health=0;fireSoFistication(s.room,s.b,0);run(s,2.6);
  const hits=s.room.events.filter(e=>e.type==='bibyeDamaged'&&e.source==='so-fist');assert.equal(hits.length,1);assert.ok(hits[0].amount>0&&hits[0].amount<=(armored?110:90));
 }
});

test('gentle chassis contacts displace through world collision without damage or armed wall consequences',()=>{
 for(const speed of [.05,1,2.1,3]){
  const s=setup(-3.2);s.b.speed=speed;
  run(s,.08,{forward:1});
  assert.equal(s.v.health,300,`speed ${speed}`);
  assert.equal(s.v.worldImpact,undefined);
 }
});

test('ordinary impact damage rises with energy and a glancing approach uses normal closing speed',()=>{
 const damage=[];
 for(const speed of [4.8,8,12]){
  const s=setup(-3.2);s.b.speed=speed;run(s,.04,{forward:1,sprint:speed>5});
  damage.push(300-s.v.health);
 }
 assert.ok(damage[0]>0&&damage[0]<=10,JSON.stringify(damage));
 assert.ok(damage[1]>damage[0]*3&&damage[2]>=65,JSON.stringify(damage));
});

test('knockback separation and tiny reversals cannot rearm a spent chassis episode',()=>{
 const s=setup(-3.2);s.b.speed=12;run(s,.04,{sprint:true});
 assert.equal(s.room.events.filter(e=>e.type==='damage').length,1);
 // A launched victim clears the old overlap envelope. The carriage has made
 // no new approach: repeated contacts at the same location remain one episode.
 for(let i=0;i<4;i++){
  s.v.position={x:0,y:0,z:s.b.z-7};run(s,.3);
  s.v.position={x:0,y:0,z:s.b.z-3.2};s.b.speed=4.8;run(s,.05,{forward:1});
 }
 assert.equal(s.room.events.filter(e=>e.type==='damage').length,1);
 // Genuine withdrawal, clearance and a fresh powered run rearm without a timer.
 s.v.position={x:0,y:0,z:s.b.z-3.2};run(s,2,{forward:-1});
 const before=s.v.health;run(s,3,{sprint:true});assert.ok(s.v.health<before);
});

test('slow input pulses press a real stationary victim forward without damage, launch or wall credit',()=>{
 const s=setup(-3.3),start=s.v.position.z;s.v.history=[];
 for(let i=1;i<=120;i++){
  s.p.input={forward:i%20<7?1:0,right:0,yaw:0,pitch:0};
  stepRoom(s.room,1/30,i/30);
 }
 assert.ok(s.v.position.z<start-.2,JSON.stringify(s.v.position));
 assert.equal(s.room.events.filter(e=>e.type==='damage').length,0);
 assert.equal(s.v.health,300);assert.equal(s.v.worldImpact,undefined);
});

test('relative closing velocity distinguishes escaping, head-on and glancing moving targets',()=>{
 const damage=[];
 for(const vz of [-7,0,7]){
  const s=setup(-3.2);s.v.history=[];historyApi.recordTransform(s.v,0);
  s.v.position.z+=vz/30;historyApi.recordTransform(s.v,1/30);
  s.b.speed=8;s.p.input={forward:1,sprint:true,right:0};stepSoFistication(s.room,s.b,1/30,1/30);
  damage.push(300-s.v.health);
 }
 assert.equal(damage[0],0);assert.ok(damage[1]>20);assert.ok(damage[2]>damage[1]);
 // A fast tangent across the outer flank has almost no normal closing energy.
 const glance=setup(-.4);glance.v.position.x=1.9;glance.v.history=[];historyApi.recordTransform(glance.v,0);
 glance.v.position.x-=.02;glance.v.position.z-=.25;historyApi.recordTransform(glance.v,1/30);
 glance.b.speed=8;glance.p.input={forward:1,sprint:true,right:0};stepSoFistication(glance.room,glance.b,1/30,1/30);
 assert.equal(glance.v.health,300);
});

test('a cleared lateral return rearms a body impact and body episodes stay out of snapshots',async()=>{
 const s=setup(-3.2);s.b.speed=12;run(s,.04,{sprint:true});assert.ok(s.b.bodyEpisodes.v);
 // An actual side route clears the carriage from the victim, independently of
 // elapsed time. The next encounter may use either face of the machinery.
 s.b.x+=4;run(s,.02,{forward:1});assert.equal(s.b.bodyEpisodes.v,undefined);
 const {serializeSnapshot}=await import('../../shared/sim/wire.mjs');
 const snapshot=serializeSnapshot(s.room,s.time);assert.equal(snapshot.soFistication.bodyEpisodes,undefined);
});

test('gentle pressure against masonry stops the carriage instead of squeezing a victim through the wall',()=>{
 const s=setup(-3.4);s.v.history=[];s.room.world.solids=[{id:'pin-wall',center:[0,1,-4],size:[8,2,.2],material:'stone'}];
 for(let i=1;i<=150;i++){
  s.p.input={forward:i%30<16?1:0,right:0,yaw:0,pitch:0};stepRoom(s.room,1/30,i/30);
 }
 assert.ok(s.v.position.z>=-3.451,JSON.stringify(s.v.position));assert.equal(s.v.health,300);
});
