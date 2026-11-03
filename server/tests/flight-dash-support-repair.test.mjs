import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomManager} from '../../shared/sim/RoomManager.mjs';
import {createFightFlight,mountFightFlight,stepFightFlight} from '../../shared/sim/fightFlight.mjs';
import {requestFlightDash,stepFlightRun} from '../../shared/sim/fightFlightRun.mjs';
import {damageFightFlight} from '../../shared/sim/fightFlightComponents.mjs';
import {CASTLEWARD} from '../../shared/worlds/castleward.mjs';
import {HIGH_GROUNDS} from '../../shared/worlds/highGrounds.mjs';
const dt=1/30;
function setup(world=null){
 const room=new RoomManager().createSoloRoom('PRACTICE',0,'castleward');room.state='PLAYING';
 room.world=world??{floors:[{y:0,center:[0,0,0],size:[2000,.2,2000]}],solids:[],ramps:[],abyssY:-30};
 const p=room.addPlayer({id:'pilot',token:'p',name:'Pilot'},0);p.position={x:0,y:0,z:1};
 const m=createFightFlight();room.fightFlight=m;
 if(world){m.operatorId=p.id;p.operatingFightFlightId=m.id;}else assert.ok(mountFightFlight(room,m,p,0));
 p.ultimate='sunder';p.prowess=100;m.y=30;m.grounded=false;m.rotorPowered=true;m.rotorAngularVelocity=Math.PI*15;
 return {room,p,m};
}
function frames(s,n,start=0){for(let i=1;i<=n;i++){stepFlightRun(s.room,s.m,dt,start+i*dt);stepFightFlight(s.room,s.m,dt,start+i*dt);}}
test('offensive flight steers down then up in 3D at bounded 18 m/s',()=>{
 const s=setup();requestFlightDash(s.room,s.m,s.p,true,0);s.p.input.pitch=-.6;frames(s,45);
 assert.ok(s.m.velocity.y<-7,'downward crosshair produces real downward travel');
 assert.ok(Math.abs(Math.hypot(...Object.values(s.m.velocity))-18)<.6);
 const down=s.m.runPitch;s.p.input.pitch=.6;frames(s,60,1.5);
 assert.ok(s.m.velocity.y>7,'steering back up produces real ascent');
 assert.ok(s.m.runPitch<down-.42,'vertical rotor plane tilts upward with the reticle while the craft climbs');
 assert.ok(Math.abs(Math.hypot(...Object.values(s.m.velocity))-18)<.6);
});
test('Practice holds propulsion across many resource cycles, including nearly empty flight charge',()=>{
 const s=setup();s.m.flightCharge=.1;requestFlightDash(s.room,s.m,s.p,true,0);
 for(let i=1;i<=1200;i++){
  stepFlightRun(s.room,s.m,dt,i*dt);stepFightFlight(s.room,s.m,dt,i*dt);
  assert.equal(s.m.offensiveRun,true,`continuous at frame ${i}`);
  assert.ok(s.m.flightCharge>0);
 }
 assert.equal(s.room.events.filter(e=>e.type==='fightFlightOffensiveRun'&&e.action==='started').length,1);
 requestFlightDash(s.room,s.m,s.p,false,40);frames(s,1,40);assert.equal(s.m.offensiveRun,false);
});
test('competitive empty flight charge stops Dash without restoring resources',()=>{
 const s=setup();s.room.mode='FREE_FOR_ALL';s.m.flightCharge=0;requestFlightDash(s.room,s.m,s.p,true,0);frames(s,1);
 assert.equal(s.m.offensiveRun,false);assert.equal(s.m.flightCharge,0);assert.equal(s.p.prowess,100);
});
for(const [name,world,point,top] of [
 ['Castleward gatehouse roof',CASTLEWARD,{x:-5.7,z:15.8},6.6],
 ['High Grounds canopy',HIGH_GROUNDS,{x:-38,z:-42},12],
 ['Castleward bridge',CASTLEWARD,{x:0,z:-26},0],
 ['Castleward stair ramp',CASTLEWARD,{x:-7,z:19},3.25],
])test(`lands, recovers power and takes off from ${name}`,()=>{
 const s=setup(world);Object.assign(s.m,point,{y:top+.7,velocity:{x:0,y:-2,z:0},rotorPowered:false,rotorAngularVelocity:0,flightCharge:20});
 frames(s,45);assert.equal(s.m.grounded,true);assert.ok(Math.abs(s.m.y-top)<.05,`${s.m.y} versus ${top}`);
 const power=s.m.flightCharge;frames(s,30,1.5);assert.ok(s.m.flightCharge>power);
 s.p.input.flightRise=true;frames(s,30,2.5);assert.equal(s.m.grounded,false);assert.ok(s.m.y>top+.5);
});
test('wall and ceiling contacts cannot become grounded support or freeze all movement',()=>{
 const s=setup();s.room.world.solids=[{center:[0,4,-3],size:[8,8,1]}];
 Object.assign(s.m,{x:0,y:2,z:-1.5,flightCharge:50});s.p.input.forward=1;s.p.input.flightRise=true;
 frames(s,30);assert.equal(s.m.grounded,false);assert.ok(s.m.y>3,'vertical slide along wall');
 const t=setup();t.room.world.solids=[{center:[0,8,0],size:[8,1,8]}];t.m.y=4.8;t.p.input.flightRise=true;frames(t,25);
 assert.ok(t.m.y<=7.5-2.65+.001);assert.equal(t.m.grounded,false);
 t.p.input.flightRise=false;t.p.input.flightLower=true;frames(t,40,25*dt);assert.ok(t.m.y<4,'can descend after ceiling');
});
test('airborne chassis destruction falls onto real support before wreck settles',()=>{
 const s=setup();s.m.y=10;s.m.velocity={x:2,y:-1,z:0};
 damageFightFlight(s.room,s.m,1000,null,'sword',0,{componentId:'main'});
 frames(s,12);assert.ok(s.m.y<9.5,'wreck has gravity');assert.ok(s.m.x>0,'wreck keeps momentum');
 frames(s,70,.4);assert.equal(s.m.grounded,true);assert.ok(Math.abs(s.m.y)<.01);assert.equal(s.m.wreckPhase,'settled');
});
test('edge overlap without foot support falls instead of earning free charge',()=>{
 const s=setup();s.room.world={floors:[],ramps:[],solids:[{center:[0,3,0],size:[3,6,3]}]};
 Object.assign(s.m,{x:1.7,y:6.1,z:0,velocity:{x:0,y:-1,z:0},rotorPowered:false,rotorAngularVelocity:0,flightCharge:25});
 frames(s,30);assert.equal(s.m.grounded,false);assert.ok(s.m.y<5,'does not float on the side of a roof');assert.ok(s.m.flightCharge<=25);
});
test('real wall impact interrupts a held run without rearming against the same wall',()=>{
 const s=setup();s.room.world.solids=[{center:[0,30,-6],size:[10,60,1]}];requestFlightDash(s.room,s.m,s.p,true,0);
 frames(s,80);assert.equal(s.m.offensiveRun,false);assert.equal(s.m.flightDashHeld,false);assert.ok(s.m.z>-5.5-.9);
});
test('damage event attaches contact in the actual pitched machine frame; rejected damage never flashes',()=>{
 const s=setup();s.m.heading=.6;s.m.runPitch=.4;
 damageFightFlight(s.room,s.m,30,null,'sword',1,{componentId:'main',point:{x:1,y:31,z:2}});
 const event=s.room.events.find(e=>e.type==='fightFlightComponentHit');assert.ok(event.damage>0);assert.ok(Object.values(event.pointLocal).every(Number.isFinite));
 const before=s.room.events.length;
 damageFightFlight(s.room,s.m,0,null,'sword',1,{componentId:'main',point:{x:0,y:30,z:0}});
 assert.equal(s.room.events.length,before);
});
test('level Dash startup creates real downward attacking thrust, not upward hover',()=>{
 const s=setup();requestFlightDash(s.room,s.m,s.p,true,0);frames(s,6);
 assert.ok(s.m.velocity.y<-.5,'world-space motion pitches down');
 assert.ok(s.m.runPitch>.15,'the chassis follows the real attacking vector');
});
test('emergency rotor braking interrupts even a Practice training run',()=>{
 const s=setup();requestFlightDash(s.room,s.m,s.p,true,0);frames(s,10);s.m.emergencyBrakeActive=true;frames(s,1);
 assert.equal(s.m.offensiveRun,false);
});
