import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomManager} from '../../shared/sim/RoomManager.mjs';
import {applyRoomCommand,serializeSnapshot} from '../../shared/sim/wire.mjs';
import {stepPracticeActors} from '../../shared/sim/practice.mjs';
import {stepRoom,applyDamage} from '../../shared/sim/combat.mjs';
import {SIEGE_OPERATORS} from '../../shared/sim/practiceSiegeOperators.mjs';
import {soFistExit} from '../../shared/sim/soFistication.mjs';

const world={floors:[{id:'ground',center:[0,-.1,0],size:[160,.2,160],y:0}],
  solids:[],ramps:[],spawnPoints:[{x:0,y:0,z:0,yaw:0}],abyssY:-10};
function setup(){
 const room=new RoomManager().createSoloRoom('PRACTICE',0,'castleward');
 room.world=structuredClone(world);room.state='PLAYING';
 const player=room.addPlayer({id:'human',token:'human',name:'Player'},0);
 player.position={x:0,y:0,z:0};player.yaw=player.input.yaw=0;player.spawnProtectionUntil=0;
 return {room,player,command:(action,machine,difficulty='skilled',now=2)=>
   applyRoomCommand(room,player,{type:'practiceSiegeOpponent',action,machine,difficulty},now)};
}
function advance(room,start=2,seconds=6){
 for(let i=1;i<=seconds*30;i++){
  const t=start+i/30;
  stepPracticeActors(room,t,room.world,{random:()=>.5});
  stepRoom(room,1/30,t,room.world);
 }
}
test('Practice hostile opponents validate actor, difficulty, machine occupancy and perform clean removal',()=>{
 const {room,player,command}=setup();
 assert.ok(command('spawn','not-a-machine').rejected);
 assert.ok(command('spawn','bi-bye-llista','unknown').rejected);
 assert.deepEqual(command('spawn','bi-bye-llista'),{});
 const b=room.biByeLlista,actor=[...room.players.values()].find(a=>a.practiceSiegeOperator);
 assert.equal(actor.name,'Ballistefan');assert.equal(b.operatorId,actor.id);
 assert.equal(actor.operatingBallistaId,b.id);
 const reflected=serializeSnapshot(room,2).players.find(p=>p.id===actor.id);
 assert.equal(reflected?.practiceSiegeOperator?.machine,'bi-bye-llista',
   'real snapshots must preserve the hostile operator identity for Practice controls');
 assert.ok(command('spawn','bi-bye-llista').rejected);
 assert.ok(applyRoomCommand(room,{...player},{type:'practiceSiegeOpponent',action:'remove',machine:'all'},2).rejected);
 assert.deepEqual(command('remove','bi-bye-llista'),{});
 assert.equal(room.biByeLlista,null);assert.equal(room.players.has(actor.id),false);
 assert.deepEqual(command('spawn','bi-bye-llista'),{});
 assert.equal([...room.players.values()].filter(a=>a.practiceSiegeOperator).length,1);
});
test('Hostile summon is atomic on blocked terrain and does not duplicate installed machines',()=>{
 const {room,command}=setup();
 room.world.floors=[];
 const before=room.players.size;
 assert.ok(command('spawn','so-fist-ication').rejected);
 assert.equal(room.players.size,before);assert.equal(room.soFistication,null);
 room.world=structuredClone(world);
 assert.deepEqual(command('spawn','so-fist-ication'),{});
 assert.ok(command('spawn','so-fist-ication').rejected);
 assert.equal(room.players.size,before+1);
});
test('Ballistefan takes aim and operates actual projectile mechanisms and the siege Skill',()=>{
 const {room,command}=setup();
 assert.deepEqual(command('spawn','bi-bye-llista','formidable'),{});
 const initialZ=room.biByeLlista.z;
 advance(room,2,10);
 const fired=room.events.filter(e=>e.type==='bibyeBoltSpawned');
 const actions=room.events.map(e=>e.type);
 assert.ok(fired.some(e=>e.shot==='I'||e.kind==='conditioning')||
   room.events.some(e=>e.type==='bibyeMobileFireTriggered'||e.type==='bibyeVolleyInitiated'),
   'Shot I is actually requested through the ballista');
 assert.ok(actions.includes('siegeSkill')||actions.includes('bibyeVolleyInitiated'),
   'real heavy bow Skill or coupled volley is used');
 assert.ok(room.biByeLlista.mode==='DEPLOYED'||room.biByeLlista.z!==initialZ||
    room.events.some(e=>e.type==='bibyeModeChanged'),'operator genuinely repositions or deploys');
 assert.ok(room.events.some(e=>e.type==='damage'&&e.victimId==='human'),
   'Ballistefan must inflict real HP damage using the actual ballista physics');
});
test('Sir Uppercuff drives and releases the actual ram piston and skill',()=>{
 const {room,command}=setup();
 assert.deepEqual(command('spawn','so-fist-ication','formidable'),{});
 const z=room.soFistication.z;
 advance(room,2,12);
 assert.notEqual(room.soFistication.z,z,'ram moves under ordinary driving physics');
 assert.ok(room.events.some(e=>e.type==='soFistStrike'),
   'physical ram stroke comes from the usual machine');
 assert.ok(room.events.some(e=>e.type==='soFistImpact'&&e.piston),
   'Sir Uppercuff must actually land a physical piston collision, not just play an animation');
});
test('Sir Uppercuff primes Beat to the Punch against a visible opponent attack',()=>{
 const {room,player,command}=setup();
 assert.deepEqual(command('spawn','so-fist-ication','formidable'),{});
 const b=room.soFistication;
 player.position={x:b.x-Math.sin(b.heading)*8,y:0,z:b.z-Math.cos(b.heading)*8};
 player.attackActive=true;player.attackStartedAt=2;player.attackHeld=true;
 stepPracticeActors(room,2.1,room.world);
 assert.ok(room.events.some(e=>e.type==='siegeSkill'&&e.machineId===room.soFistication.id),
   'genuine visible attack invites the existing reactive machine Skill');
});
test('Mr. Donte Shoot takes off, maneuvers and fires finite physical repeater bolts',()=>{
 const {room,command}=setup();
 assert.deepEqual(command('spawn','fight-and-flight','formidable'),{});
 const f=room.fightFlight,z=f.z;
 advance(room,2,8);
 assert.ok(f.y>0||room.events.some(e=>e.type==='fightFlightMounted'),'flight actuator used');
 assert.notEqual(f.z,z,'machine actually translates');
 assert.ok(room.events.some(e=>e.type==='fightFlightBoltReleased'),'repeater releases real projectiles');
 assert.ok(f.flightCharge<100,'ascent or hover has a real charge cost');
 assert.ok(f.ammo<=18&&f.ammo>=0);
 assert.ok(room.events.some(e=>e.type==='damage'&&e.victimId==='human'&&
   e.source==='fight-flight-repeater'),
   'Mr. Donte Shoot must hit the actual player with a physical repeater quarrel');
});
test('Wrecked or dismounted surviving pilots leave machine authority and resume foot combat',async()=>{
 const {room,command}=setup();
 assert.deepEqual(command('spawn','fight-and-flight'),{});
 const a=[...room.players.values()].find(p=>p.practiceSiegeOperator);
 const machine=room.fightFlight;
 machine.health=1;
 // Use genuine component damage, which forces pilot dismount.
 const {damageFightFlight}=await import('../../shared/sim/fightFlightComponents.mjs');
 damageFightFlight(room,machine,2,null,'test-impact',3,{componentId:'main'});
 assert.equal(a.operatingFightFlightId,null);
 if(a.alive){
  stepPracticeActors(room,3.1,room.world);
  assert.equal(a.siegeAi.phase,'foot');
 }
});
test('Competence settings change real decision cadence and aiming, not equipment stats',()=>{
 const times=[];
 for(const difficulty of ['learner','skilled','formidable']){
  const {room,command}=setup();
  assert.deepEqual(command('spawn','fight-and-flight',difficulty),{});
  const f=room.fightFlight,a=room.players.get(f.operatorId);
  stepPracticeActors(room,2.1,room.world);
  times.push(a.siegeAi.nextThinkAt);
  assert.equal(f.maxFlightCharge,100);
  assert.ok(f.ammo>=0&&f.ammo<=18,'a skilled pilot uses finite ammunition');
  assert.equal(f.health,250);
 }
 assert.ok(times[0]>times[1]&&times[1]>times[2]);
});

test('Practice hosts three distinct siege operators without duplicating any authoritative machine',()=>{
 const {room,command}=setup();
 for(const machine of ['fight-and-flight','so-fist-ication','bi-bye-llista'])
  assert.deepEqual(command('spawn',machine,'skilled'),{},
    `spawning ${machine} must respect the other two machines' actual collision volumes`);
 const pilots=[...room.players.values()].filter(a=>a.practiceSiegeOperator);
 assert.equal(pilots.length,3);
 assert.equal(new Set(pilots.map(a=>a.id)).size,3);
 for(const machine of Object.keys(SIEGE_OPERATORS)){
  const m=room[SIEGE_OPERATORS[machine].field];
  assert.ok(m?.operatorId&&pilots.some(a=>a.id===m.operatorId));
 }
 assert.deepEqual(command('remove','all'),{});
 assert.equal(room.players.size,1);
 assert.ok(!room.biByeLlista&&!room.soFistication&&!room.fightFlight);
});

test('Surviving grounded rotor-failure pilot exits normally and resumes foot AI',()=>{
 const {room,command}=setup();assert.deepEqual(command('spawn','fight-and-flight'),{});
 const m=room.fightFlight,p=room.players.get(m.operatorId);
 m.rotorHP=0;m.grounded=true;m.mode='GROUNDED';
 stepPracticeActors(room,2.1,room.world);
 assert.equal(p.operatingFightFlightId,null);
 assert.equal(p.siegeAi.phase,'foot');
 assert.ok(p.alive&&room.players.has(p.id));
});
test('Immobilized ram pilot uses a physical safe exit rather than teleporting or dying',()=>{
 const {room,command}=setup();assert.deepEqual(command('spawn','so-fist-ication'),{});
 const m=room.soFistication,p=room.players.get(m.operatorId);
 for(const name of ['Wheel_FL','Wheel_FR'])m.components[name].health=0;
 const before={...p.position},safe=soFistExit(room,m,p);
 stepPracticeActors(room,2.1,room.world);
 if(safe){
  assert.equal(p.operatingRamId,null);
  assert.equal(p.siegeAi.phase,'foot');
 }else{
  // A physically blocked exit must not teleport the rider to the outside.
  assert.equal(p.operatingRamId,m.id);
  assert.deepEqual(p.position,before);
 }
 assert.ok(p.alive&&room.players.has(p.id));
});


test('Hostile flight deployment rejects a low canopy which clears the grounded chassis but prevents actual takeoff',()=>{
 const {room,command}=setup();
 // The roof begins above the standing 2.65m chassis, but before flight can
 // reach even a few metres. Previously a valid construction site trapped Donte.
 const roof={id:'market-canopy',center:[0,3.5,-10],size:[6,1,6]};
 room.world.solids.push(roof);
 assert.deepEqual(command('spawn','fight-and-flight','formidable'),{});
 const m=room.fightFlight;
 const roofNear=Math.abs(m.x-roof.center[0])<roof.size[0]/2+1.35&&
   Math.abs(m.z-roof.center[2])<roof.size[2]/2+1.35;
 assert.equal(roofNear,false,'hostile flight spawns beyond the roof and rotor swept footprint');
 advance(room,2,8);
 assert.ok(Number.isFinite(m.takeoffAt)&&m.takeoffAt>=2,'bot must genuinely attempt powered takeoff');
 assert.ok(room.events.some(e=>e.type==='fightFlightBoltReleased'),'new open site permits physical repeater fire');
});
