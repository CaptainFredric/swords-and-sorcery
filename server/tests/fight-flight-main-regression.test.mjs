import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomManager} from '../../shared/sim/RoomManager.mjs';
import {createFightFlight,mountFightFlight,stepFightFlight} from '../../shared/sim/fightFlight.mjs';
import {applyRoomCommand} from '../../shared/sim/wire.mjs';
import {FLIGHT_REPEATER} from '../../shared/src/flightRepeaterAim.mjs';

function setup(){
  const room=new RoomManager().createSoloRoom('PRACTICE',0,'castleward');
  room.state='PLAYING';
  room.world={floors:[{id:'floor',center:[0,-.1,0],size:[100,.2,100],y:0}],ramps:[],solids:[],spawnPoints:[{x:0,y:0,z:0}]};
  const p=room.addPlayer({id:'pilot',token:'pilot',name:'Pilot'},0);
  p.position={x:0,y:0,z:1};p.spawnProtectionUntil=0;
  const m=createFightFlight({id:'regression-flight'});room.fightFlight=m;
  assert.equal(mountFightFlight(room,m,p,0),true);
  return {room,m,p};
}
function tick(room,m,from,frames,patch={}){
  Object.assign(room.players.get('pilot').input,patch);
  for(let i=1;i<=frames;i++)stepFightFlight(room,m,1/30,from+i/30);
}
test('Single authoritative repeater capacity initializes to 18, never an independent hardcoded 14',()=>{
  const m=createFightFlight();
  assert.equal(FLIGHT_REPEATER.capacity,18);
  assert.equal(m.ammo,FLIGHT_REPEATER.capacity);
});
test('Rotor power, braking, lift and RPM are authoritative state with bounded angular braking',()=>{
  const {room,m,p}=setup();
  for(const field of ['rotorPowered','rotorBrakeHeld','rotorLiftAuthority','rotorRPM','rotorTargetRPM','rotorLiftSuppressedUntil'])assert.ok(field in m,field);
  m.rotorPowered=true;m.rotorAngularVelocity=30;
  p.input.crouch=true;tick(room,m,0,1);
  assert.equal(m.rotorBrakeHeld,true);
  assert.ok(m.rotorAngularVelocity<30,'Lower physically reduces rotor angular velocity');
  assert.ok(m.rotorRPM>0&&m.rotorTargetRPM===0,'RPM is physical, not an invented static HUD percentage');
  assert.equal(m.rotorPowered,false);
});
test('Neutral powered hover damps vertical momentum instead of preserving takeoff ascent indefinitely',()=>{
  const {room,m}=setup();
  tick(room,m,0,45,{jump:true});
  assert.equal(m.grounded,false);
  assert.ok(m.rotorPowered&&m.rotorRPM>0);
  tick(room,m,1.5,36,{jump:false,crouch:false});
  assert.ok(m.rotorLiftAuthority>.8,'real rotor provides neutral hover support');
  assert.ok(Math.abs(m.velocity.y)<.4,'neutral hover converges to zero vertical velocity');
});
test('A short Space tap is a hop; a held Space press produces sustained takeoff',()=>{
  const brief=setup();
  tick(brief.room,brief.m,0,1,{jump:true});
  tick(brief.room,brief.m,1/30,2,{jump:false});
  assert.equal(brief.m.rotorPowered,false,'short tap releases rotor power');
  tick(brief.room,brief.m,.1,40,{jump:false});
  assert.equal(brief.m.grounded,true,'hop returns to real floor');
  const held=setup();
  tick(held.room,held.m,0,40,{jump:true});
  assert.ok(held.m.y>1,'holding Space results in real powered ascent');
  assert.ok(held.m.rotorPowered);
});
test('Blocked airborne ejection preserves operator occupancy and rejects a fabricated safe exit',()=>{
  const {room,m,p}=setup();
  m.grounded=false;m.mode='AIRBORNE';m.y=8;m.position={x:0,y:8,z:0};
  p.position={x:0,y:8,z:0};
  room.world.solids=[{id:'solid-cage',center:[0,9,0],size:[16,4,16]}];
  assert.deepEqual(applyRoomCommand(room,p,{type:'flightEject',down:true},10),{});
  const reply=applyRoomCommand(room,p,{type:'flightEject',down:false},10.1);
  assert.ok(reply.rejected,'solid cage is not a safe ejection corridor');
  assert.equal(m.operatorId,p.id);
  assert.equal(p.operatingFightFlightId,m.id);
  assert.equal(p.ejectionFallExempt,false,'failed clearance cannot create an airborne ejection exemption');
});
