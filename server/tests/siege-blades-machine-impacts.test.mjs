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
