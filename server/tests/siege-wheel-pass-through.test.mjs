import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../../shared/sim/Room.mjs';
import {createSoFistication,mountSoFistication,stepSoFistication} from '../../shared/sim/soFistication.mjs';
import {createBiByeLlista,mountBiByeLlista,stepBiByeLlista} from '../../shared/sim/biByeLlista.mjs';
import {soFistVolumes} from '../../shared/sim/soFistGeometry.mjs';
import {biByeHitVolumes} from '../../shared/sim/biByeComponents.mjs';
import {stepSiegeWheelContacts,SIEGE_WHEEL_HAZARD} from '../../shared/sim/siegeWheelContacts.mjs';

const dt=1/30,ground={solids:[],ramps:[],
 floors:[{id:'wheel-ground',center:[0,-.1,0],size:[200,.2,200],y:0}],abyssY:-30};
function fixture(kind){
 const room=new Room('WHEEL-CHECK',{mode:'PRACTICE'});room.state='PLAYING';
 room.world=structuredClone(ground);
 const driver=room.addPlayer({id:'driver',token:'driver',name:'Operator'},0);
 const foe=room.addPlayer({id:'foe',token:'foe',name:'Target'},0);
 driver.position={x:0,y:0,z:2.2};foe.position={x:0,y:0,z:-20};
 foe.spawnProtectionUntil=0;driver.spawnProtectionUntil=0;
 foe.health=500;foe.grounded=true;
 const machine=kind==='ram'?createSoFistication({x:0,y:0,z:0,heading:0}):
   createBiByeLlista({x:0,y:0,z:0,heading:0});
 if(kind==='ram'){
  room.soFistication=machine;driver.position.z=3.1;
  assert.equal(mountSoFistication(room,machine,driver,0),true);
 }else{
  room.biByeLlista=machine;driver.position.z=2;
  assert.equal(mountBiByeLlista(machine,driver,0),true);
 }
 room.events.length=0;
 return {room,driver,foe,machine,kind};
}
const volumes=(machine,kind,now=0)=>kind==='ram'?soFistVolumes(machine,now):biByeHitVolumes(machine,now);
function touch(s,at=1,guard=false){
 const {room,machine,foe,kind}=s;
 const previous={...machine};
 const old=volumes(previous,kind,at-dt);
 machine.z-=.24;
 const newVolumes=volumes(machine,kind,at);
 const wheel=newVolumes.find(v=>v.componentId==='Wheel_FL');
 // Actual left wheel center with a 0.25m outward offset (well short
 // of the hull-wide contact zones, never an arbitrary car-sized aura).
 foe.position={x:wheel.center[0]+(wheel.center[0]>0?.25:-.25),y:0,z:wheel.center[2]};
 foe.velocity={x:0,y:0,z:0};foe.impulse={x:0,z:0};
 foe.guarding=guard;
 const dx=wheel.center[0]-foe.position.x,dz=wheel.center[2]-foe.position.z;
 foe.yaw=Math.atan2(-dx,-dz);foe.guardStamina=100;
 const before=foe.health;
 stepSiegeWheelContacts(room,machine,previous,dt,at,kind,newVolumes,old);
 return {damage:before-foe.health,shove:Math.hypot(foe.impulse.x,foe.impulse.z)};
}

test('an actual moving wheel has a distinct, bounded single-target hit and no multiwheel damage stack',()=>{
 for(const kind of ['ram','ballista']){
  const s=fixture(kind),hit=touch(s);
  assert.ok(hit.damage>0,kind+' wheel must deal real damage');
  assert.ok(hit.shove>0,kind+' wheel must push the knight away');
  assert.ok(hit.damage<=SIEGE_WHEEL_HAZARD[kind].maxDamage);
  assert.equal(s.room.events.filter(e=>e.type==='siegeWheelContact').length,1);
  assert.equal(s.room.events.filter(e=>e.type==='damage'&&e.victimId==='foe').length,1);
  const same=touch(s,1.08);
  assert.equal(same.damage,0,'contact cooldown prevents rapid repeated wheel stacking');
 }
});

test('the battering ram wheel is more dangerous than the ballista wheel at the same real velocity',()=>{
 const ram=touch(fixture('ram')),ballista=touch(fixture('ballista'));
 assert.ok(ram.damage>ballista.damage,`ram ${ram.damage} versus ballista ${ballista.damage}`);
 assert.ok(ram.shove>ballista.shove,'ram wheel must launch harder than ballista wheel');
});

test('guarding a wheel reduces injury but spends actual Guard stamina',()=>{
 const s=fixture('ram'),unblocked=touch(s);
 const protectedHit=fixture('ram'),blocked=touch(protectedHit,1,true);
 assert.ok(blocked.damage<unblocked.damage);
 assert.ok(protectedHit.foe.guardStamina<100);
 assert.equal(protectedHit.room.events.filter(e=>e.type==='siegeWheelContact').length,1);
});

test('a stationary wheel is not a damaging aura, and allied targets remain protected',()=>{
 const s=fixture('ram'),wheel=volumes(s.machine,s.kind).find(v=>v.componentId==='Wheel_FL');
 s.foe.position={x:wheel.center[0],y:0,z:wheel.center[2]};
 stepSiegeWheelContacts(s.room,s.machine,{...s.machine},dt,1,'ram',
  volumes(s.machine,s.kind),volumes(s.machine,s.kind));
 assert.equal(s.foe.health,500);
 s.driver.team='royal';s.foe.team='royal';
 touch(s,2);
 assert.equal(s.foe.health,500);
});

test('both mobile machines drive past a body in the carriage path, while real stonework still blocks',()=>{
 for(const kind of ['ram','ballista']){
  const s=fixture(kind),{room,driver,foe,machine}=s;
  foe.position={x:0,y:0,z:-4};foe.health=500;
  driver.input={...driver.input,forward:1,right:0,yaw:0,pitch:0,sprint:false};
  for(let i=1;i<=100;i++){
   const now=i*dt;
   if(kind==='ram')stepSoFistication(room,machine,dt,now,room.world);
   else stepBiByeLlista(room,machine,dt,now,room.world);
  }
  assert.ok(machine.z<-6,`${kind} should pass the Spellblade at z=-4, reached ${machine.z}`);
  assert.ok(!room.events.some(e=>e.type==='siegeImpact'&&e.kind==='carriage-body'),
   'body contacts must not produce a collision-stop response');
  const rock=fixture(kind);
  rock.room.world.solids=[{id:'stone-block',center:[0,1,-4],size:[8,2,.4],material:'stone'}];
  rock.driver.input={...rock.driver.input,forward:1,right:0,yaw:0,pitch:0,sprint:false};
  for(let i=1;i<=120;i++){
   if(kind==='ram')stepSoFistication(rock.room,rock.machine,dt,i*dt,rock.room.world);
   else stepBiByeLlista(rock.room,rock.machine,dt,i*dt,rock.room.world);
  }
  assert.ok(rock.machine.z>-4,`${kind} must still respect solid masonry`);
 }
});
