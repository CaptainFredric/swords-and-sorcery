import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../../shared/sim/Room.mjs';
import {PILOT_GUARD,beginAttack,pilotGuardTakes,setGuard,stepRoom} from '../../shared/sim/combat.mjs';
import {createFightFlight} from '../../shared/sim/fightFlight.mjs';
import {SWORD_STRIKE_TIMES} from '../../shared/src/combat.mjs';

// A grounded Fight-and-Flight pilot's Guard meets blades that strike the apparatus within the pilot's reach, from
// where they face (combat.mjs PILOT_GUARD); everything else stays the machine's, as before.
const world={floors:[{id:'floor',center:[0,-.1,0],size:[60,.2,60],y:0}],ramps:[],solids:[],
  spawnPoints:[{x:0,y:0,z:0,yaw:-Math.PI/2},{x:2,y:0,z:0,yaw:Math.PI/2}],abyssY:-10};
function setup(){
 const room=new Room('FLIGHT-PILOT-GUARD');room.world=world;
 room.addPlayer({id:'pilot',token:'pilot',name:'Pilot'},0);
 room.addPlayer({id:'attacker',token:'attacker',name:'Attacker'},0);
 room.setReady('pilot',true,0);room.setReady('attacker',true,0);room.tick(3.1);
 const pilot=room.players.get('pilot'),attacker=room.players.get('attacker');
 pilot.position={x:0,y:0,z:0};pilot.yaw=pilot.input.yaw=-Math.PI/2;
 attacker.position={x:2,y:0,z:0};attacker.yaw=attacker.input.yaw=Math.PI/2;
 pilot.spawnProtectionUntil=0;attacker.spawnProtectionUntil=0;
 const m=createFightFlight({id:'guard-machine',x:0,y:0,z:0,heading:-Math.PI/2});
 m.operatorId=pilot.id;pilot.operatingFightFlightId=m.id;room.fightFlight=m;m.grounded=true;room.events.length=0;
 return {room,pilot,attacker,m};
}
const swing=(room,attacker)=>{assert.equal(beginAttack(room,attacker.id,10),true);stepRoom(room,.01,10.4,world);};
const componentHits=(room)=>room.events.filter(e=>e.type==='fightFlightComponentHit');

test('a guarding grounded pilot blocks the blade that would have struck the brace beside them',()=>{
 const {room,pilot,attacker,m}=setup();
 assert.equal(setGuard(room,pilot.id,true,9),true);
 const stamina=pilot.guardStamina;
 swing(room,attacker);
 assert.ok(room.events.some(e=>e.type==='block'&&e.defenderId===pilot.id),'the pilot\'s guard meets the blow');
 assert.equal(componentHits(room).length,0,'the brace is not struck through a guard that met the blade');
 assert.equal(m.braceLHP,80);
 assert.equal(pilot.health,100);
 assert.ok(pilot.guardStamina<stamina,'the guard pays its ordinary cost');
});

test('a freshly raised pilot guard parries, and the attacker reels as from any parry',()=>{
 const {room,pilot,attacker}=setup();
 // (raised a moment before the first strike's contact)
 assert.equal(setGuard(room,pilot.id,true,10+SWORD_STRIKE_TIMES[0]-.03),true);
 assert.equal(beginAttack(room,attacker.id,10),true);stepRoom(room,.01,10.4,world);
 const parry=room.events.find(e=>e.type==='parry'&&e.defenderId===pilot.id);
 assert.ok(parry,'a guard raised just before contact parries');
 assert.ok(attacker.staggerUntil>10.4);
 assert.equal(componentHits(room).length,0);
});

test('a spent pilot guard breaks as any guard does, and still spares the machine that blow',()=>{
 const {room,pilot,attacker,m}=setup();
 assert.equal(setGuard(room,pilot.id,true,9),true);
 pilot.guardStamina=1;
 swing(room,attacker);
 assert.ok(room.events.some(e=>e.type==='guardBreak'&&e.defenderId===pilot.id));
 assert.equal(pilot.guarding,false);
 assert.equal(m.braceLHP,80);
});

test('without a guard the brace takes the blow, as before',()=>{
 const {room,pilot,attacker,m}=setup();
 swing(room,attacker);
 const hits=componentHits(room);
 assert.equal(hits.length,1);
 assert.equal(hits[0].component,'braceL');
 assert.ok(m.braceLHP<80);
 assert.equal(pilot.health,100);
});

test('a blow from behind the pilot\'s guard stays the machine\'s',()=>{
 const {room,pilot,attacker}=setup();
 assert.equal(setGuard(room,pilot.id,true,9),true);
 // the pilot turned away: the attacker is outside their guard cone
 pilot.yaw=pilot.input.yaw=Math.PI/2;
 swing(room,attacker);
 assert.equal(room.events.filter(e=>['block','parry','guardBreak'].includes(e.type)).length,0);
 assert.ok(componentHits(room).length>=1||room.events.some(e=>e.type==='swordHit'&&e.targetId===pilot.id));
});

test('airborne, the machine takes the blow (the airborne pilot cannot guard)',()=>{
 const {room,pilot,attacker,m}=setup();
 assert.equal(setGuard(room,pilot.id,true,9),true);
 m.grounded=false;
 const met={kind:'solid',solid:{id:'fight-flight-braceL',componentId:'braceL'},point:{x:.3,y:1.2,z:-.5}};
 assert.equal(pilotGuardTakes(room,attacker,met,10),null);
});

test('the rotor, and any part out of the pilot\'s reach, are never the pilot\'s guard to take',()=>{
 const {room,pilot,attacker}=setup();
 assert.equal(setGuard(room,pilot.id,true,9),true);
 const near={x:.35,y:1.2,z:0};
 assert.equal(pilotGuardTakes(room,attacker,{solid:{id:'fight-flight-braceL',componentId:'braceL'},point:near},10),pilot);
 assert.equal(pilotGuardTakes(room,attacker,{solid:{id:'fight-flight-rotor',componentId:'rotor'},point:near},10),null);
 const far={x:PILOT_GUARD.reach+.3,y:1.2,z:0};
 assert.equal(pilotGuardTakes(room,attacker,{solid:{id:'fight-flight-main',componentId:'main'},point:far},10),null);
 // and an ally's blade is no blow to guard against
 assert.equal(pilotGuardTakes(room,pilot,{solid:{id:'fight-flight-braceL',componentId:'braceL'},point:near},10),null);
});
