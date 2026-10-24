import test from 'node:test';
import assert from 'node:assert/strict';
import { createBiByeLlista, mountBiByeLlista, dismountBiByeLlista, fireBiByeLlista, stepBiByeLlista, damageBiByeLlista, toggleBiByeDeploy } from '../../shared/sim/biByeLlista.mjs';
import { setBiByeWeaponFocus } from '../../shared/sim/biByeWeapons.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function setup(){
 const b=createBiByeLlista({x:0,z:0,baseYaw:0});
 const p={id:'op',alive:true,position:{x:0,y:0,z:0},input:{yaw:0,pitch:0},team:'A'};
 const room={mode:'PRACTICE',players:new Map([[p.id,p]]),events:[],world:{solids:[]}};
 mountBiByeLlista(b,p); return {b,p,room,step:t=>stepBiByeLlista(room,b,1/30,t,room.world)};
}
function commit(s,t=1){s.b.mode='DEPLOYED';setBiByeWeaponFocus(s.b,'MAIN',t);assert.ok(fireBiByeLlista(s.room,s.b,t));for(let n=t;n<t+2;n+=1/30){s.step(n);if(s.b.coupling==='FIRING')return s.b.firedAt;}throw Error('commit failed');}
const shots=s=>[...(s.room.bibyeProjectiles?.values()??[])];
test('independent upper fires deployed during heavy reload; recock starts at discharge',()=>{
 const s=setup(),t=commit(s);s.step(t+.45);s.step(t+.65);near(s.b.smallBoltReadyAt,t+2.95);near(s.b.reloadEndsAt,t+6.7);
 s.step(t+2.95);setBiByeWeaponFocus(s.b,'UPPER',t+2.95);assert.ok(fireBiByeLlista(s.room,s.b,t+2.95));s.step(t+3.15);
 assert.equal(shots(s).length,3);near(s.b.smallBoltReadyAt,t+5.65);near(s.b.reloadEndsAt,t+6.7);
 s.step(t+5.65);assert.ok(fireBiByeLlista(s.room,s.b,t+5.65));s.step(t+5.85);s.step(t+6.7);
 assert.equal(s.b.mainBoltLoaded,true);assert.equal(shots(s).length,4);near(s.b.smallBoltReadyAt,t+8.35);
 setBiByeWeaponFocus(s.b,'MAIN',t+6.7);assert.equal(fireBiByeLlista(s.room,s.b,t+6.7),false);
});
test('backward upper aligns by shortest arc and latches before commitment; cancel spends nothing',()=>{
 const s=setup();s.b.upperYaw=Math.PI;s.b.upperYawLimit=Math.PI;s.b.mode='DEPLOYED';setBiByeWeaponFocus(s.b,'MAIN',1);
 assert.ok(fireBiByeLlista(s.room,s.b,1));s.step(1);assert.equal(s.b.coupling,'ALIGNING');assert.equal(s.b.firedAt,-Infinity);
 assert.ok(Math.abs(s.b.upperYaw)>3);setBiByeWeaponFocus(s.b,'UPPER',1.1);s.step(1.2);
 assert.equal(s.b.coupling,'INDEPENDENT');assert.equal(shots(s).length,0);assert.equal(s.b.smallBoltReadyAt,0);assert.ok(s.b.mainBoltLoaded);
});
for(const interruption of ['dismount','death','disconnect'])test(`${interruption} after upper release preserves delayed heavy release`,()=>{
 const s=setup(),t=commit(s);s.step(t+.45);
 if(interruption==='dismount')dismountBiByeLlista(s.b,s.p);if(interruption==='death')s.p.alive=false;if(interruption==='disconnect')s.room.players.delete(s.p.id);
 s.step(t+.50);s.step(t+.65);s.step(t+.9);assert.deepEqual(shots(s).map(p=>p.subKind),['conditioning','siege']);near(s.b.reloadEndsAt,t+6.7);
});
test('dismount before upper release cancels with ammunition intact',()=>{
 const s=setup(),t=commit(s);s.step(t+.2);dismountBiByeLlista(s.b,s.p);s.step(t+1);
 assert.equal(shots(s).length,0);assert.equal(s.b.smallBoltReadyAt,0);assert.ok(s.b.mainBoltLoaded);assert.equal(s.b.state,'LOADED');
});
for(const phase of ['alignment','delay'])test(`support failure during ${phase} prevents heavy release`,()=>{
 const s=setup();let t;
 if(phase==='alignment'){s.b.mode='DEPLOYED';s.b.upperYaw=1;setBiByeWeaponFocus(s.b,'MAIN',1);fireBiByeLlista(s.room,s.b,1);t=1;}
 else{t=commit(s);s.step(t+.45);}
 for(const id of ['Stabilizer_FL','Stabilizer_FR'])damageBiByeLlista(s.room,s.b,150,'enemy','sword',t+.5,{componentId:id});
 s.step(t+1);assert.equal(shots(s).some(p=>p.subKind==='siege'),false);assert.ok(s.b.mainBoltLoaded);
 assert.equal(shots(s).length,phase==='delay'?1:0);
});
test('both degraded systems preserve independent upper, clocks survive packing and remount',()=>{
 const s=setup();for(const id of ['Wheel_FL','Wheel_ML','Stabilizer_FL','Stabilizer_FR'])damageBiByeLlista(s.room,s.b,150,'enemy','sword',0,{componentId:id});
 assert.ok(fireBiByeLlista(s.room,s.b,1));s.step(1.2);dismountBiByeLlista(s.b,s.p);mountBiByeLlista(s.b,s.p,1.3);s.step(2);
 near(s.b.smallBoltReadyAt,3.7);assert.equal(fireBiByeLlista(s.room,s.b,3.69),false);assert.ok(fireBiByeLlista(s.room,s.b,3.7));
});
test('full circle controller keeps world aim while steering and wraps without reversal',()=>{
 const s=setup();s.b.upperYawLimit=Math.PI;s.b.upperYaw=Math.PI-.01;s.p.input={forward:1,right:1,yaw:-Math.PI+.01,pitch:0};
 const before=s.b.upperYaw;s.step(1);assert.ok(Math.abs(s.b.upperYaw-before)<.04);near(Math.atan2(Math.sin(s.b.upperYaw),Math.cos(s.b.upperYaw)),-Math.PI+.01);
 near(s.p.yaw,s.b.heading);assert.notEqual(s.p.yaw,s.b.upperYaw);
});

test('mode changes preserve both clocks and cannot pack a tripped delay catch',()=>{
 const s=setup(),t=commit(s);s.step(t+.45);assert.equal(toggleBiByeDeploy(s.b,t+.5),false);s.step(t+.65);s.step(t+.8);
 const upper=s.b.smallBoltReadyAt,heavy=s.b.reloadEndsAt;
 assert.ok(toggleBiByeDeploy(s.b,t+1));s.step(t+2.3);near(s.b.smallBoltReadyAt,upper);near(s.b.reloadEndsAt,heavy);
 assert.ok(toggleBiByeDeploy(s.b,t+3));s.step(t+4.3);near(s.b.smallBoltReadyAt,upper);near(s.b.reloadEndsAt,heavy);
});
test('a fresh full volley cannot consume upper or heavy ammunition twice',()=>{
 const s=setup();let t=commit(s);assert.equal(fireBiByeLlista(s.room,s.b,t+.1),false);
 for(let i=1;i<=230;i++)s.step(t+i/30);
 assert.equal(shots(s).length,2);assert.equal(s.b.mainBoltLoaded,true);
 const requested=t+8;assert.ok(fireBiByeLlista(s.room,s.b,requested));
 for(let i=0;i<=70;i++)s.step(requested+i/30);
 assert.equal(shots(s).length,4);assert.equal(s.room.events.filter(e=>e.type==='bibyeHeavyDelayTripped').length,2);
});
test('whole-circle world direction remains exact under pitched and traversed main cradle',async()=>{
 const {getBiByeMuzzleDirection,getBiByeMuzzlePosition,biByeCoupledAim}=await import('../../shared/sim/biByeLlista.mjs');
 const s=setup();s.b.mode='DEPLOYED';s.b.mainYaw=.6;s.b.mainPitch=.3;
 for(let yaw=-Math.PI;yaw<=Math.PI;yaw+=Math.PI/12)for(const pitch of [-.15,0,.35]){
   s.b.upperYaw=yaw;s.b.upperPitch=pitch;
   const d=getBiByeMuzzleDirection(s.b,'conditioning');
   near(d.x,-Math.sin(yaw)*Math.cos(pitch));near(d.y,Math.sin(pitch));near(d.z,-Math.cos(yaw)*Math.cos(pitch));
 }
 const aim=biByeCoupledAim(s.b),upper=getBiByeMuzzlePosition(s.b,'conditioning',aim),ud=getBiByeMuzzleDirection(s.b,'conditioning',aim);
 const lower=getBiByeMuzzlePosition(s.b,'siege'),ld=getBiByeMuzzleDirection(s.b,'siege');
 const target={x:lower.x+ld.x*35,y:lower.y+ld.y*35,z:lower.z+ld.z*35};
 const distance=Math.hypot(target.x-upper.x,target.y-upper.y,target.z-upper.z);
 assert.ok(Math.hypot(upper.x+ud.x*distance-target.x,upper.y+ud.y*distance-target.y,upper.z+ud.z*distance-target.z)<.001);
 // The faster heavy bolt overtakes at roughly 70 m with these muzzle offsets.
 for(const range of [10,20,35,50])assert.ok(.45+range/48 < .65+(range-.6)/55);
 assert.ok(.45+100/48 > .65+(100-.6)/55);
});
test('focus command is owned, validated, serialized and explicit rebuild restores the whole mechanism',async()=>{
 const {RoomManager}=await import('../../shared/sim/RoomManager.mjs');
 const {applyRoomCommand,serializeSnapshot}=await import('../../shared/sim/wire.mjs');
 const {resetPracticePlayer}=await import('../../shared/sim/practice.mjs');
 const room=new RoomManager().createSoloRoom('PRACTICE',0,'castleward');
 const p=room.addPlayer({id:'p',token:'p',name:'P'},0),other=room.addPlayer({id:'q',token:'q',name:'Q'},0),b=room.biByeLlista=createBiByeLlista();
 p.position={x:b.x,y:b.y,z:b.z};mountBiByeLlista(b,p);b.mode='DEPLOYED';
 assert.ok(applyRoomCommand(room,other,{type:'bibyeWeaponFocus',focus:'MAIN'},1).rejected);
 assert.ok(applyRoomCommand(room,p,{type:'bibyeWeaponFocus',focus:'heavyOnly'},1).rejected);
 assert.deepEqual(applyRoomCommand(room,p,{type:'bibyeWeaponFocus',focus:'MAIN'},1),{});
 fireBiByeLlista(room,b,1);const snapshot=serializeSnapshot(room,1).bibyeBallista;
 assert.equal(snapshot.coupling,'ALIGNING');assert.equal(snapshot.weaponFocus,'MAIN');assert.equal(snapshot.mainYaw,b.mainYaw);
 resetPracticePlayer(room,p.id,2);assert.equal(b.smallBoltReadyAt,0);room.state='PLAYING';
 assert.deepEqual(applyRoomCommand(room,p,{type:'practiceRebuildBiBye'},2),{});
 const fresh=room.biByeLlista;assert.equal(fresh.coupling,'INDEPENDENT');assert.equal(fresh.mainBoltLoaded,true);assert.equal(fresh.smallBoltReadyAt,2);assert.equal(fresh.weaponFocus,'UPPER');
});
test('leaving before an independent string release cancels that windup without a recock',()=>{
 const s=setup();fireBiByeLlista(s.room,s.b,1);dismountBiByeLlista(s.b,s.p);s.step(1.3);
 assert.equal(shots(s).length,0);assert.equal(s.b.smallBoltReadyAt,0);
});
test('a bolt is blocked by its own carriage; only its launching assembly gets rail clearance',async()=>{
 const {stepBiByeProjectiles}=await import('../../shared/sim/biByeLlista.mjs');
 const s=setup();s.room.biByeLlista=s.b;
 s.room.bibyeProjectiles=new Map([['own',{id:'own',ballistaId:s.b.id,subKind:'conditioning',ownerId:s.p.id,bornAt:1,position:{x:0,y:.7,z:3},velocity:{x:0,y:0,z:-48},directDamage:18,blastRadius:2}]]);
 stepBiByeProjectiles(s.room,.1,1.1,s.room.world);assert.equal(s.room.bibyeProjectiles.size,0);assert.ok(s.room.events.some(e=>e.type==='bibyeBoltImpact'&&e.hitKind==='machine'));
});
for(const range of [10,20,35,50])test(`both real projectiles strike an ordinary full health target at ${range} metres`,async()=>{
 const {RoomManager}=await import('../../shared/sim/RoomManager.mjs');
 const {stepBiByeProjectiles}=await import('../../shared/sim/biByeLlista.mjs');
 const room=new RoomManager().createSoloRoom('PRACTICE',0,'castleward');room.world={solids:[],floors:[{center:[0,0,0],size:[300,0,300],y:0}]};
 const p=room.addPlayer({id:'op',token:'op',name:'Operator'},0),b=room.biByeLlista=createBiByeLlista();
 Object.assign(b,{x:0,z:0,heading:0,mainYaw:0,upperYaw:0});p.position={x:0,y:0,z:0};mountBiByeLlista(b,p);
 b.mode='DEPLOYED';b.mainPitch=Math.atan2(1.1-1.835,range-1.52);p.input={yaw:0,pitch:b.mainPitch};setBiByeWeaponFocus(b,'MAIN');
 const target=room.addServerActor({id:'target',name:'Target',actorKind:'dummy'},0);target.position={x:0,y:0,z:-range};target.spawnProtectionUntil=0;
 assert.ok(fireBiByeLlista(room,b,1));
 for(let n=0;n<120;n++){const now=1+n/30;stepBiByeLlista(room,b,1/30,now);stepBiByeProjectiles(room,1/30,now);}
 const impacts=room.events.filter(e=>e.type==='bibyeBoltImpact'&&e.victimId==='target');
 assert.equal(target.alive,false);assert.deepEqual(impacts.map(e=>e.subKind),['conditioning','siege']);assert.ok(impacts[0].at<=impacts[1].at);
});
test('late host ticks preserve exact release spacing and fractional first flight',async()=>{
 const {stepBiByeProjectiles}=await import('../../shared/sim/biByeLlista.mjs');
 const s=setup(),t=commit(s);s.step(t+.47);s.step(t+.70);
 near(s.b.upperReleasedAt,t+.45);near(s.b.mainReleasedAt,t+.65);near(s.b.mainReleasedAt-s.b.upperReleasedAt,.2);
 const shot=shots(s).find(p=>p.subKind==='siege'),before={...shot.position};stepBiByeProjectiles(s.room,.1,t+.70,s.room.world);
 const after=s.room.bibyeProjectiles.get(shot.id).position;near(Math.hypot(after.x-before.x,after.y-before.y,after.z-before.z),55*.05);
});

test('deployed main tracks both bows before firing and commits without a new turning sequence',()=>{
 const s=setup();toggleBiByeDeploy(s.b,0);s.step(.6);s.step(1.3);
 s.p.input={yaw:.35,pitch:.15};s.step(1.4);
 assert.ok(Math.abs(s.b.mainYaw-.35)<1e-8);
 const before=s.b.upperYaw;
 assert.ok(fireBiByeLlista(s.room,s.b,1.4));
 assert.equal(s.b.coupling,'FIRING');near(s.b.upperYaw,before);near(s.b.shotIPendingAt,1.85);
 s.step(1.85);s.step(2.05);assert.equal(shots(s).length,2);
});
test('aiming back from a mechanical limit responds to a small input immediately',async()=>{
 const {biByeConstrainAim}=await import('../../shared/sim/biByeComponents.mjs');
 const b={...setup().b,chassisPitch:.2,chassisRoll:.1,mode:'DEPLOYED'};
 const limit=biByeConstrainAim(b,{yaw:0,pitch:1.4},true);
 const back=biByeConstrainAim(b,{yaw:limit.yaw,pitch:limit.pitch-.003},true);
 assert.ok(back.pitch<limit.pitch-.002);
});

test('one upper fire press during uncoupling queues one shot and cancels safely on leaving',()=>{
 for(const leave of [false,true]){
  const s=setup();toggleBiByeDeploy(s.b,0);s.step(.6);s.step(1.3);setBiByeWeaponFocus(s.b,'UPPER',1.4);
  assert.equal(s.b.coupling,'RELEASING');assert.ok(fireBiByeLlista(s.room,s.b,1.4));
  assert.equal(shots(s).length,0);
  if(leave)dismountBiByeLlista(s.b,s.p);
  s.step(2.05);s.step(2.3);
  assert.equal(shots(s).length,leave?0:1);assert.ok(s.b.mainBoltLoaded);
 }
});
