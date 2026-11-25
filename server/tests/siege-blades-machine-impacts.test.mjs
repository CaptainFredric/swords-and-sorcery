import test from 'node:test';
import assert from 'node:assert/strict';
import {applyMachineImpact,SIEGE_IMPACT} from '../../shared/sim/siegeImpact.mjs';
import {createSoFistication,stepSoFistication} from '../../shared/sim/soFistication.mjs';
import {Room} from '../../shared/sim/Room.mjs';
import {createFightFlight} from '../../shared/sim/fightFlight.mjs';
import {createBiByeLlista} from '../../shared/sim/biByeLlista.mjs';

const room=()=>({events:[]});

test('heavy ram piston contact pushes another ram through its longitudinal drivetrain',()=>{
 const r=room(),victim=createSoFistication({id:'target',heading:0});
 assert.equal(victim.recoilVelocity,0);
 assert.equal(applyMachineImpact(r,victim,2,{normal:{x:0,z:1},speed:12}),true);
 assert.ok(victim.recoilVelocity<-3,'head-on impact should force the target backwards');
 assert.ok(Math.abs(victim.recoilVelocity)<=SIEGE_IMPACT.ramTargetMaxRecoil);
 assert.ok(r.events.some(e=>e.type==='siegeImpact'&&e.machineId==='target'));
});

test('heavy piston moves an existing mobile ballista instead of only rocking the chassis',()=>{
 const r=room(),victim=createBiByeLlista({id:'target',baseYaw:0});
 assert.equal(applyMachineImpact(r,victim,2,{normal:{x:0,z:1},speed:12}),true);
 assert.ok(victim.externalVelocity.z>3,'transfer momentum into its real wheeled movement solver');
 assert.ok(victim.externalVelocity.z<=SIEGE_IMPACT.mobileBallistaMaxSpeed);
});

test('heavy piston queues a bounded flight impulse for the swept collision solver',()=>{
 const r=room(),victim=createFightFlight({id:'target'});
 assert.equal(applyMachineImpact(r,victim,2,{normal:{x:1,z:0},speed:12}),true);
 assert.ok(victim.externalSiegeImpulse.x>3);
 assert.equal(victim.externalSiegeImpulse.z,0);
 assert.ok(victim.externalSiegeImpulse.x<=SIEGE_IMPACT.flightTargetMaxImpulse);
});

test('machine impact ignores invalid, zero-energy and destroyed machinery',()=>{
 const r=room(),victim=createSoFistication({id:'destroyed',health:0});
 assert.equal(applyMachineImpact(r,victim,2,{normal:{x:0,z:1},speed:12}),false);
 const healthy=createFightFlight({id:'healthy'});
 assert.equal(applyMachineImpact(r,healthy,2,{normal:{x:0,z:1},speed:0}),false);
 assert.equal(applyMachineImpact(r,healthy,2,{normal:{x:0,z:0},speed:12}),false);
 assert.equal(r.events.length,0);
});


test('ram-on-ram impact actually rolls the target backwards in the world',()=>{
 const r=new Room('RAM-PHYSICS',{mode:'PRACTICE'});
 r.state='PLAYING';
 r.world={floors:[{y:0,center:[0,-.1,0],size:[100,.2,100]}],ramps:[],solids:[],abyssY:-20};
 const target=r.addMachine(createSoFistication({id:'ram-target',x:0,y:0,z:0,heading:Math.PI}));
 const start=target.z;
 assert.equal(applyMachineImpact(r,target,1,{normal:{x:0,z:-1},speed:12}),true);
 for(let i=1;i<=22;i++)stepSoFistication(r,target,1/30,1+i/30);
 assert.ok(target.z<start-.15,`ram must physically move backwards; z=${target.z}, start=${start}`);
 assert.ok(target.wheelRolls.some(roll=>Math.abs(roll)>.1),'its real wheels should roll, not only its visual chassis rock');
});

test('charging ram impacts in room.machines produce genuine multi-meter world displacement across broadside, ballista, and flight targets',async()=>{
 const {stepRoom}=await import('../../shared/sim/combat.mjs');
 const {fireSoFistication,mountSoFistication,soFistEntry}=await import('../../shared/sim/soFistication.mjs');
 const {mountBiByeLlista}=await import('../../shared/sim/biByeLlista.mjs');
 const {mountFightFlight}=await import('../../shared/sim/fightFlight.mjs');
 const world={floors:[{y:0,center:[0,-.1,0],size:[120,.2,120]}],ramps:[],solids:[],spawnPoints:[{x:0,y:0,z:0},{x:0,y:0,z:10}],abyssY:-20};
 const measure=(setupFn)=>{
  const r=new Room('FLEET-IMP',{mode:'SIEGE_BLADES'});
  r.world=world;r.state='PLAYING';r.machines=new Map();
  const pa=r.addPlayer({id:'a',token:'a',name:'A'},0),pb=r.addPlayer({id:'b',token:'b',name:'B'},1);
  r.setReady('a',true,0);r.setReady('b',true,0);r.tick(3.1);
  pa.spawnProtectionUntil=0;pb.spawnProtectionUntil=0;
  const s=createSoFistication({id:'ram-a',x:0,y:0,z:-4.8,heading:Math.PI});
  s.speed=11;s.charging=true;s.pressure=100;s.chargeDirection=1;
  const target=setupFn(r,pa,pb);
  r.machines.set(s.id,s);r.machines.set(target.id,target);
  pa.position=soFistEntry(s,world);
  mountSoFistication(r,s,pa,10);pa.input.forward=1;pa.input.sprint=true;
  const start={x:target.x,y:target.y??0,z:target.z};
  let maxPeakY=start.y;
  for(let i=1;i<=35;i++){
   const t=10+i/30;
   if(i===1)fireSoFistication(r,s,pa,t);
   stepRoom(r,1/30,t,world);
   maxPeakY=Math.max(maxPeakY,target.y??0);
  }
  return {dist:Math.hypot(target.x-start.x,target.z-start.z),peakY:maxPeakY,startY:start.y};
 };
 const broad=measure((r,pa,pb)=>{const t=createSoFistication({id:'ram-b',x:0,y:0,z:0,heading:Math.PI/2});pb.position=soFistEntry(t,world);mountSoFistication(r,t,pb,10);return t;});
 assert.ok(broad.dist>=1.8,`broadside ram shove ${broad.dist.toFixed(2)}m`);
 const mobBl=measure((r,pa,pb)=>{const t=createBiByeLlista({id:'bl-m',x:0,y:0,z:0,heading:0});pb.position={x:t.x,y:t.y,z:t.z};mountBiByeLlista(t,pb,10);return t;});
 assert.ok(mobBl.dist>=2.2,`mobile ballista shove ${mobBl.dist.toFixed(2)}m`);
 const depBl=measure((r,pa,pb)=>{const t=createBiByeLlista({id:'bl-d',x:0,y:0,z:0,heading:0});t.mode='DEPLOYED';t.deployed=true;t.deployProgress=1;pb.position={x:t.x,y:t.y,z:t.z};mountBiByeLlista(t,pb,10);return t;});
 assert.ok(depBl.dist>=2.0,`deployed uprooted ballista shove ${depBl.dist.toFixed(2)}m`);
 const gFlight=measure((r,pa,pb)=>{const t=createFightFlight({id:'ff-g',x:0,y:0,z:0,heading:0});pb.position={x:t.x,y:t.y,z:t.z};mountFightFlight(r,t,pb,10);return t;});
 assert.ok(gFlight.dist>=3.5&&gFlight.peakY>gFlight.startY+.25,`grounded flight punt dist=${gFlight.dist.toFixed(2)}m peakY=${gFlight.peakY.toFixed(2)}m`);
});
