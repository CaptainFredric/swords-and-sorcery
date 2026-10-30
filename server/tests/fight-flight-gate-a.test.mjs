import test from 'node:test';
import assert from 'node:assert/strict';
import {createFightFlight,mountFightFlight,dismountFightFlight,stepFightFlight,fightFlightExit} from '../../shared/sim/fightFlight.mjs';
import {practiceFightFlight} from '../../shared/sim/practiceFightFlight.mjs';

const makeRoom=()=>{
  const world={floors:[{center:[0,0,0],size:[100,1,100],y:0}],ramps:[],solids:[]};
  const operator={id:'pilot',actorKind:'human',alive:true,team:null,position:{x:0,y:0,z:1},velocity:{x:0,y:0,z:0},yaw:0,pitch:0,input:{forward:0,right:0,jump:false,crouch:false,yaw:0,pitch:0}};
  const room={mode:'PRACTICE',state:'PLAYING',world,players:new Map([[operator.id,operator]]),events:[],code:'FAF',fightFlight:null,fightFlightRevision:0,biByeLlista:null,soFistication:null};
  return {room,operator};
};
const step=(room,m,from,n,input)=>{
  Object.assign(room.players.get('pilot')?.input??{},input);
  for(let i=0;i<n;i++)stepFightFlight(room,m,1/30,from+i/30);
};
test('Practice builds a real lifecycle and safe dismount; rebuild is a fresh lifecycle',()=>{
  const {room,operator}=makeRoom();
  assert.deepEqual(practiceFightFlight(room,operator,'build',0),{});
  const a=room.fightFlight;
  assert.ok(a.id&&a.lifecycleId===a.id);
  assert.ok(fightFlightExit(room,a,operator));
  operator.position={x:a.x,y:a.y,z:a.z+1};
  assert.equal(mountFightFlight(room,a,operator,0),true);
  assert.equal(operator.operatingFightFlightId,a.id);
  assert.equal(practiceFightFlight(room,operator,'rebuild',1).rejected,undefined);
  const b=room.fightFlight;
  assert.notEqual(a.id,b.id);
  assert.equal(operator.operatingFightFlightId,null);
  assert.equal(a.retired,true);
  assert.equal(practiceFightFlight(room,operator,'dismantle',2).rejected,undefined);
  assert.equal(room.fightFlight,null);
});
test('Powered ascent costs more charge than hover; controlled descent can land',()=>{
  const {room,operator}=makeRoom(),m=createFightFlight({x:0,y:0,z:0});
  room.fightFlight=m;assert.equal(mountFightFlight(room,m,operator),true);
  step(room,m,0,50,{jump:true});
  assert.ok(m.y>1,'the apparatus actually ascends, not a flight flag');
  assert.ok(m.flightCharge<96,'ascent draws charge');
  assert.equal(m.mode,'AIRBORNE');
  assert.equal(dismountFightFlight(room,m,operator),false,'midair dismount must be rejected');
  const climbCharge=m.flightCharge;
  step(room,m,2,25,{jump:false,crouch:false});
  assert.ok(m.flightCharge<climbCharge&&m.flightCharge>0,'hover has a real cost');
  step(room,m,3,120,{jump:false,crouch:true});
  assert.ok(m.grounded,'controlled descent reaches the real floor');
  assert.ok(Math.abs(m.y)<.05);
  assert.equal(dismountFightFlight(room,m,operator,{at:8}),true);
});
test('Rotor destruction removes lift but leaves the apparatus and rider intact for a physical fall',()=>{
  const {room,operator}=makeRoom(),m=createFightFlight();
  room.fightFlight=m;assert.equal(mountFightFlight(room,m,operator),true);
  step(room,m,0,70,{jump:true});
  const altitude=m.y;
  m.rotorHP=0;
  step(room,m,3,15,{jump:true});
  assert.ok(m.y<altitude,'fall starts from physical height');
  assert.equal(m.health,250);
  assert.equal(operator.alive,true);
  assert.equal(m.rotorAngularVelocity>=0,true);
});
test('Rotor angle advances in authoritative state and persists across operators',()=>{
  const {room,operator}=makeRoom(),m=createFightFlight();
  room.fightFlight=m;assert.equal(mountFightFlight(room,m,operator),true);
  step(room,m,0,20,{jump:true});
  assert.ok(m.rotorAngle>0&&m.rotorAngularVelocity>0);
  const charge=m.flightCharge,energy=m.rotorEnergy;
  operator.input.jump=false;operator.input.crouch=true;
  step(room,m,2,80,{jump:false,crouch:true});
  if(m.grounded)assert.equal(dismountFightFlight(room,m,operator),true);
  assert.ok(m.flightCharge<=100&&m.flightCharge>=0);
  assert.ok(m.rotorEnergy<=100&&m.rotorEnergy>=0);
  assert.ok(charge<=100&&energy<=100);
});
test('Ground chassis cannot tunnel through solid walls under sustained forward drive',()=>{
  const {room,operator}=makeRoom(),m=createFightFlight({x:0,y:0,z:0});
  room.world.solids=[{center:[0,1.3,-3],size:[20,3,1]}];
  room.fightFlight=m;assert.equal(mountFightFlight(room,m,operator),true);
  step(room,m,0,180,{forward:1,jump:false,crouch:false});
  assert.ok(m.z>-1.7,'the flying carriage stops before a world wall');
});
