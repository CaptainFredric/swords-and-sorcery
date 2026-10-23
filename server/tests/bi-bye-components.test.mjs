import test from 'node:test';
import assert from 'node:assert/strict';
import * as parts from '../../shared/sim/biByeComponents.mjs';
import { createBiByeLlista, damageBiByeLlista, mountBiByeLlista, stepBiByeLlista, toggleBiByeDeploy, fireBiByeLlista, stepBiByeProjectiles, getBiByeSolids } from '../../shared/sim/biByeLlista.mjs';
import { segmentAabbHit } from '../../shared/src/collision.mjs';
import { RoomManager } from '../../shared/sim/RoomManager.mjs';
import { applyRoomCommand, serializeSnapshot } from '../../shared/sim/wire.mjs';
import { stepRoom } from '../../shared/sim/combat.mjs';

function setup() {
 const b = createBiByeLlista({x:0,y:0,z:0,baseYaw:0});
 const p={id:'driver',alive:true,position:{x:0,y:0,z:2.8},input:{yaw:0,pitch:0}};
 const room={biByeLlista:b,players:new Map([[p.id,p]]),events:[],world:{solids:[],floors:[{center:[0,0,0],size:[100,0,100],y:0}]}};
 mountBiByeLlista(b,p); return {b,p,room};
}
const breakPart=(room,b,id,at=1)=>damageBiByeLlista(room,b,1000,'enemy','sword',at,{componentId:id});

test('separate canonical durability pools and fresh per instance components',()=>{
 const {b}=setup(), c=createBiByeLlista();
 assert.equal(b.maxHealth,650);assert.equal(b.health,650);
 assert.equal(Object.keys(b.components).length,10);
 for(const def of parts.BI_BYE_COMPONENTS){assert.equal(b.components[def.id].health,def.kind==='wheel'?120:150);assert.notEqual(b.components[def.id],c.components[def.id]);}
});
test('one wheel impairs, two on same side or three overall immobilize',()=>{
 const {b,room}=setup();breakPart(room,b,'Wheel_FL');
 assert.equal(parts.biByeCondition(b).canDrive,true);assert.ok(parts.biByeCondition(b).driveScale<1);
 breakPart(room,b,'Wheel_FR');assert.equal(parts.biByeCondition(b).canDrive,true);
 breakPart(room,b,'Wheel_ML');assert.equal(parts.biByeCondition(b).canDrive,false);
 const other=setup();breakPart(other.room,other.b,'Wheel_FL');breakPart(other.room,other.b,'Wheel_RL');assert.equal(parts.biByeCondition(other.b).canDrive,false);
 assert.equal(b.health,650);
});
test('immobile carriage can swivel, deploy, fire both bolts and remain stationary',()=>{
 const {b,p,room}=setup();breakPart(room,b,'Wheel_FL');breakPart(room,b,'Wheel_RL');
 p.input={forward:1,right:1,yaw:.4,pitch:.2};stepBiByeLlista(room,b,1/30,2);
 assert.equal(b.x,0);assert.equal(b.z,0);assert.equal(b.heading,0);assert.equal(b.yaw,.4);
 assert.ok(toggleBiByeDeploy(b,2));stepBiByeLlista(room,b,1/30,3.3);assert.ok(fireBiByeLlista(room,b,4));
 stepBiByeLlista(room,b,1/30,4.7);assert.equal(room.bibyeProjectiles.size,2);
});
test('two broken stabilizers forbid deployment but preserve mobile Shot I and driving',()=>{
 const {b,p,room}=setup();breakPart(room,b,'Stabilizer_FL');breakPart(room,b,'Stabilizer_RR');
 assert.equal(toggleBiByeDeploy(b,2),false);p.input={forward:1,yaw:0,pitch:0};stepBiByeLlista(room,b,1/30,2);
 assert.ok(b.z<0);assert.ok(fireBiByeLlista(room,b,2));stepBiByeLlista(room,b,1/30,2.3);
 assert.deepEqual([...room.bibyeProjectiles.values()].map(p=>p.subKind),['conditioning']);
});
test('both disabled systems retain stationary independently aimed Shot I',()=>{
 const {b,p,room}=setup();for(const id of ['Wheel_FL','Wheel_RL','Stabilizer_FL','Stabilizer_RR']) breakPart(room,b,id);
 p.input={forward:1,right:1,yaw:-.35,pitch:.15};stepBiByeLlista(room,b,1/30,2);
 assert.equal(b.speed,0);assert.equal(b.z,0);assert.equal(b.yaw,-.35);
 assert.ok(fireBiByeLlista(room,b,2));stepBiByeLlista(room,b,1/30,2.3);assert.equal(room.bibyeProjectiles.size,1);
});
test('support loss mid deployment retracts from the current fraction without snapping',()=>{
 const {b,room}=setup();toggleBiByeDeploy(b,0);stepBiByeLlista(room,b,1/30,.6);
 const before=parts.biByeDeployProgress(b,.6);breakPart(room,b,'Stabilizer_FL',.6);breakPart(room,b,'Stabilizer_FR',.6);
 assert.equal(b.mode,'RETRACTING');assert.ok(Math.abs(parts.biByeDeployProgress(b,.6)-before)<1e-8);
 stepBiByeLlista(room,b,1/30,2);assert.equal(b.mode,'MOBILE');assert.equal(parts.biByeDeployProgress(b,2),0);
});
test('support loss between committed releases cancels only the unreleased siege bolt',()=>{
 const {b,room}=setup();toggleBiByeDeploy(b,0);stepBiByeLlista(room,b,1/30,1.3);fireBiByeLlista(room,b,2);
 stepBiByeLlista(room,b,1/30,2.46);assert.equal(room.bibyeProjectiles.size,1);
 breakPart(room,b,'Stabilizer_FL',2.5);breakPart(room,b,'Stabilizer_FR',2.5);
 stepBiByeLlista(room,b,1/30,2.8);assert.equal(room.bibyeProjectiles.size,1);
 assert.equal(b.mainBoltLoaded,true);stepBiByeLlista(room,b,1/30,5.5);assert.ok(fireBiByeLlista(room,b,5.5));
});
test('failed components reject further damage and emit failure exactly once',()=>{
 const {b,room}=setup();breakPart(room,b,'Wheel_FL');const count=room.events.length;
 assert.equal(b.components.Wheel_FL.health,0);assert.equal(b.health,650);
 assert.equal(damageBiByeLlista(room,b,50,'enemy','sword',2,{componentId:'Wheel_FL'}),false);
 assert.equal(room.events.length,count);assert.equal(room.events.filter(e=>e.type==='bibyeComponentFailed').length,1);
 assert.equal(damageBiByeLlista(room,b,50,'enemy','sword',2,{componentId:'missing'}),false);
});
test('hull death clears ownership and leaves a solid persistent wreck',()=>{
 const {b,p,room}=setup();damageBiByeLlista(room,b,650,'enemy','sword',1);
 assert.equal(b.mode,'DESTROYED');assert.equal(b.operatorId,null);assert.equal(p.operatingBallistaId,null);
 assert.ok(getBiByeSolids(b).length>0);assert.equal(fireBiByeLlista(room,b,2),false);
});
test('component boxes track carriage heading and return nearest wheel ahead of hull',()=>{
 const {b}=setup();
 for(const h of [0,.7,Math.PI/2,Math.PI]){
  b.heading=h;const wheel=parts.biByeHitVolumes(b,0).find(x=>x.componentId==='Wheel_FL');
  const to=wheel.center;const axis=wheel.axes[0];const from=to.map((n,i)=>n-axis[i]*3);
  const hit=parts.biByeFirstHit(b,from,to,0);
  assert.equal(hit.box.componentId,'Wheel_FL');assert.ok(hit.t>0 && hit.t<1);
 }
});
test('folded and deployed stabilizer damage volumes follow the authored hinge',()=>{
 const {b}=setup();const folded=parts.biByeHitVolumes(b,0).find(x=>x.componentId==='Stabilizer_FL');
 b.mode='DEPLOYED';const planted=parts.biByeHitVolumes(b,0).find(x=>x.componentId==='Stabilizer_FL');
 assert.ok(Math.abs(folded.center[1]-planted.center[1])>.25);assert.ok(Math.abs(planted.center[0]-folded.center[0])>.1);
});
test('blast budget cannot multiply across overlapping parts and cover rejects hidden surfaces',()=>{
 const {b}=setup();const blast={point:{x:3.5,y:.7,z:-1.2},radius:6,damage:60};
 const open=parts.biByeBlastAllocations(b,blast,0,[]);
 assert.ok(open.length>0);assert.ok(open.reduce((n,x)=>n+x.amount,0)<=60);
 const wall={center:[2.6,.9,-1.2],size:[.2,5,8]};
 assert.equal(parts.biByeBlastAllocations(b,blast,0,[wall]).length,0);
});
test('direct component is excluded from splash and failed parts still intercept attacks',()=>{
 const {b,room}=setup();breakPart(room,b,'Wheel_FL');
 const w=parts.biByeHitVolumes(b,1).find(x=>x.componentId==='Wheel_FL');
 const start=w.center.map((n,i)=>n-w.axes[0][i]*2);assert.equal(parts.biByeFirstHit(b,start,w.center,1).box.componentId,'Wheel_FL');
 const a=parts.biByeBlastAllocations(b,{point:{x:0,y:1,z:0},radius:5,damage:30,excludeComponent:'hull'},1,[]);
 assert.ok(a.every(x=>x.componentId!=='hull'&&x.componentId!=='Wheel_FL'));
});
test('team safe machine rejects allied attacks while allowing Practice maintenance attacks',()=>{
 const {b,p,room}=setup();p.team='azure';room.mode='BREAKTHROUGH';
 room.players.set('friend',{id:'friend',alive:true,team:'azure'});
 assert.equal(damageBiByeLlista(room,b,50,'friend','sword',1),false);
 room.mode='PRACTICE';assert.equal(damageBiByeLlista(room,b,50,'friend','sword',1),true);
});

test('ordinary sword sweeps damage one real wheel without draining hull or neighboring wheels',()=>{
 const room=new RoomManager().createSoloRoom('PRACTICE',0,'castleward');const b=room.biByeLlista;
 const p=room.addPlayer({id:'blade',token:'blade',name:'Blade'},0);room.armAutoStart(0);
 p.position={x:b.x+1.2,y:0,z:b.z+2.85};p.yaw=0;p.pitch=-.52;p.input={yaw:0,pitch:-.52};p.spawnProtectionUntil=0;
 applyRoomCommand(room,p,{type:'attack',down:true},1);
 for(let i=0;i<18;i++)stepRoom(room,1/30,1+i/30);
 const hit=Object.entries(b.components).filter(([,c])=>c.health<c.maxHealth);
 assert.equal(hit.length,1);assert.equal(hit[0][0],'Wheel_FL');assert.equal(b.health,650);
});

test('ordinary projectile stops at the first localized part and respects intervening world cover',()=>{
 for(const covered of [false,true]){
  const room=new RoomManager().createSoloRoom('PRACTICE',0,'castleward');const b=room.biByeLlista;
  const p=room.addPlayer({id:'cast',token:'cast',name:'Cast'},0);room.armAutoStart(0);
  room.world={floors:[],solids:covered?[{center:[b.x+1.2,.6,b.z+2.2],size:[3,3,.2]}]:[]};
  p.position={x:b.x+1.2,y:0,z:b.z+4};p.spawnProtectionUntil=0;
  room.projectiles.set('test',{id:'test',ownerId:p.id,spell:'fireball',bornAt:1,position:{x:b.x+1.2,y:.55,z:b.z+3},velocity:{x:0,y:0,z:-20}});
  for(let i=0;i<5;i++)stepRoom(room,1/30,1+i/30);
  assert.equal(room.projectiles.size,0);
  assert.equal(b.components.Wheel_FL.health,covered?120:102);assert.equal(b.health,650);
 }
});

test('component snapshots are copies and a Practice reset restores all subsystems',async()=>{
 const {resetPracticePlayer}=await import('../../shared/sim/practice.mjs');
 const room=new RoomManager().createSoloRoom('PRACTICE',0,'castleward');const b=room.biByeLlista;
 const p=room.addPlayer({id:'p',token:'p',name:'P'},0);room.armAutoStart(0);
 breakPart(room,b,'Wheel_FL');const snapshot=serializeSnapshot(room,2);
 assert.equal(snapshot.bibyeBallista.components.Wheel_FL.health,0);
 resetPracticePlayer(room,p.id,3);assert.equal(b.components.Wheel_FL.health,120);assert.equal(snapshot.bibyeBallista.components.Wheel_FL.health,0);
});

test('support failure before Shot I still releases only the committed upper bolt',()=>{
 const {b,room}=setup();toggleBiByeDeploy(b,0);stepBiByeLlista(room,b,1/30,1.3);fireBiByeLlista(room,b,2);
 breakPart(room,b,'Stabilizer_FL',2.2);breakPart(room,b,'Stabilizer_FR',2.2);
 stepBiByeLlista(room,b,1/30,2.7);
 assert.deepEqual([...room.bibyeProjectiles.values()].map(p=>p.subKind),['conditioning']);
});

test('an upper bolt released during support retraction follows its articulated muzzle',()=>{
 const {b,p,room}=setup();p.input={yaw:.5,pitch:.25};
 toggleBiByeDeploy(b,0);stepBiByeLlista(room,b,1/30,1.3);fireBiByeLlista(room,b,2);
 breakPart(room,b,'Stabilizer_FL',2.2);breakPart(room,b,'Stabilizer_FR',2.2);
 stepBiByeLlista(room,b,1/30,2.5);
 const projectile=[...room.bibyeProjectiles.values()][0];
 const expected=parts.biByeFrames({...b,...b.committedAim}).upper.axes[2];
 const speed=Math.hypot(...Object.values(projectile.velocity));
 const actual=Object.values(projectile.velocity).map(v=>v/speed);
 assert.ok(Math.hypot(...actual.map((v,i)=>v-expected[i]))<1e-9);
});

test('a failed wheel keeps its last rotation while the other wheels track signed travel',()=>{
 const {b,p,room}=setup();p.input={forward:1,yaw:0,pitch:0};stepBiByeLlista(room,b,1/30,1);
 const before=[...b.wheelRolls];breakPart(room,b,'Wheel_FL',1.1);stepBiByeLlista(room,b,1/30,1.2);
 assert.equal(b.wheelRolls[0],before[0]);assert.ok(b.wheelRolls[1]>before[1]);
});

test('siege projectiles meet localized components before a victim behind the carriage',()=>{
 const {b,p,room}=setup();p.position={x:1.075,y:0,z:-4};p.health=100;
 room.bibyeProjectiles=new Map([['enemy-bolt',{id:'enemy-bolt',ballistaId:'other',ownerId:'enemy',subKind:'siege',bornAt:1,
  position:{x:1.075,y:.55,z:4},velocity:{x:0,y:0,z:-60},radius:.1,directDamage:85,pierceMaxTargets:2,piercedVictimIds:[],pierceCount:0}]]);
 stepBiByeProjectiles(room,.1,1.1);
 assert.equal(room.bibyeProjectiles.size,0);assert.equal(p.health,100);
 assert.ok(Object.values(b.components).some(c=>c.health<c.maxHealth));assert.equal(b.health,650);
});
