import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../../shared/sim/Room.mjs';
import {beginAttack,stepRoom,tryCastSpell} from '../../shared/sim/combat.mjs';
import {createFightFlight} from '../../shared/sim/fightFlight.mjs';

const world={floors:[{id:'floor',center:[0,-.1,0],size:[60,.2,60],y:0}],ramps:[],solids:[],
  spawnPoints:[{x:0,y:0,z:0,yaw:-Math.PI/2},{x:2,y:0,z:0,yaw:Math.PI/2}],abyssY:-10};
function setup(){
 const room=new Room('FLIGHT-COVER');room.world=world;
 room.addPlayer({id:'pilot',token:'pilot',name:'Pilot'},0);
 room.addPlayer({id:'attacker',token:'attacker',name:'Attacker'},0);
 room.setReady('pilot',true,0);room.setReady('attacker',true,0);room.tick(3.1);
 const pilot=room.players.get('pilot'),attacker=room.players.get('attacker');
 pilot.position={x:0,y:0,z:0};pilot.yaw=pilot.input.yaw=-Math.PI/2;
 attacker.position={x:2,y:0,z:0};attacker.yaw=attacker.input.y=Math.PI/2;
 pilot.spawnProtectionUntil=0;attacker.spawnProtectionUntil=0;
 const m=createFightFlight({id:'cover-machine',x:0,y:0,z:0,heading:-Math.PI/2});
 m.operatorId=pilot.id;pilot.operatingFightFlightId=m.id;room.fightFlight=m;room.events.length=0;
 return {room,pilot,attacker,m};
}
test('Incoming front sword can reach the exposed pilot instead of stopping at a fictitious chassis box',()=>{
 const {room,pilot,attacker,m}=setup();
 // The central forehand first contacts the real left strut. Approach the
 // exposed frontal corridor obliquely instead: the sword must meet the rider.
 attacker.position.z=.8;
 attacker.yaw=attacker.input.yaw=Math.atan2(2,-.8);
 assert.equal(beginAttack(room,attacker.id,10),true);
 stepRoom(room,.01,10.4,world);
 assert.ok(room.events.some(e=>e.type==='swordHit'&&e.targetId===pilot.id), 'real sword reaches pilot through open frontal gap');
 assert.ok(pilot.health<100);
 assert.equal(m.health,250,'do not double-apply exposed pilot damage to hull');
 assert.equal(room.events.filter(e=>e.type==='fightFlightComponentHit').length,0,'open corridor must not hit phantom armor');
});
test('A mounted pilot can still swing outward: own machine does not interrupt their attack',()=>{
 const {room,pilot,attacker}=setup();
 assert.equal(beginAttack(room,pilot.id,10),true);
 stepRoom(room,.01,10.4,world);
 assert.ok(room.events.some(e=>e.type==='swordHit'&&e.targetId===attacker.id));
 assert.ok(attacker.health<100);
});

test('a sword genuinely strikes the surviving left strut before reaching the rider',()=>{
 const {room,pilot,attacker,m}=setup();
 beginAttack(room,attacker.id,10);stepRoom(room,.01,10.4,world);
 const hits=room.events.filter(e=>e.type==='fightFlightComponentHit');
 assert.equal(hits.length,1);
 assert.equal(hits[0].component,'braceL');
 assert.ok(m.braceLHP<80);
 assert.equal(m.health,250);
 assert.equal(pilot.health,100,'a physically intercepted sword must not also hit the rider');
});
test('destroying the left strut removes its real sweep interception',()=>{
 const {room,pilot,attacker,m}=setup();
 m.braceLHP=0;
 beginAttack(room,attacker.id,10);stepRoom(room,.01,10.4,world);
 assert.equal(room.events.filter(e=>e.type==='fightFlightComponentHit'&&e.component==='braceL').length,0);
 assert.ok(room.events.some(e=>e.type==='swordHit'&&e.targetId===pilot.id),
   'the same centered sword now reaches rider after left strut breaks');
});

test('open-corridor sword damages the personally steeled rider, not machine ward reserve',()=>{
 const {room,pilot,attacker,m}=setup();
 pilot.spell='steel';assert.equal(tryCastSpell(room,pilot.id,{x:0,y:0,z:-1},9),true);
 attacker.position.z=.8;attacker.yaw=attacker.input.yaw=Math.atan2(2,-.8);
 beginAttack(room,attacker.id,10);stepRoom(room,.01,10.4,world);
 const body=room.events.find(e=>e.type==='swordHit'&&e.targetId===pilot.id);
 assert.ok(body,'an unarmored frontal lane really hits the human rider');
 assert.ok(pilot.health<100);
 assert.equal(m.health,250);
 assert.equal(m.siegeSteel.bonusPrevented,0,'pilot damage is protected only by personal Steel');
});
test('sword contacting real brace routes mitigation to machine Steel, not rider Steel',()=>{
 const {room,pilot,attacker,m}=setup();
 pilot.spell='steel';assert.equal(tryCastSpell(room,pilot.id,{x:0,y:0,z:-1},9),true);
 beginAttack(room,attacker.id,10);stepRoom(room,.01,10.4,world);
 const hit=room.events.find(e=>e.type==='fightFlightComponentHit'&&e.component==='braceL');
 assert.ok(hit,'actual left brace absorbs this swing');
 assert.equal(pilot.health,100);
 assert.equal(hit.source,'sword');
 assert.equal(hit.damage,19,'machine-linked Steel reduces ordinary sword toward legitimate glance');
 assert.ok(m.siegeSteel.bonusPrevented>0);
 assert.ok(m.siegeSteel.blockedDamage>0);
 assert.equal(room.events.filter(e=>e.type==='swordHit'&&e.targetId===pilot.id).length,0);
});

test('mounted Fight-and-Flight pilot in room.machines swings through own braces/rotor without self-clang across flight states',()=>{
 // 1. Grounded pilot swinging laterally directly across their own left brace
 const g=setup();
 g.room.fightFlight=null;
 g.room.machines=new Map([[g.m.id,g.m]]);
 g.attacker.position={x:0,y:0,z:-1.65};
 g.pilot.yaw=g.pilot.input.yaw=0;
 g.attacker.yaw=g.attacker.input.yaw=Math.PI;
 assert.equal(beginAttack(g.room,g.pilot.id,10),true);
 stepRoom(g.room,.01,10.4,world);
 assert.equal(g.room.events.filter(e=>e.type==='fightFlightComponentHit').length,0,'must not strike own Fight-and-Flight hardware');
 assert.equal(g.room.events.filter(e=>e.type==='wallClang'&&e.playerId===g.pilot.id).length,0,'must not clang own machine');
 assert.ok(g.room.events.some(e=>e.type==='swordHit'&&e.playerId===g.pilot.id&&e.targetId===g.attacker.id),'hits enemy standing beside cockpit');

 // 2. Airborne hovering pilot swinging laterally past right brace
 const a=setup();
 a.room.fightFlight=null;
 a.room.machines=new Map([[a.m.id,a.m]]);
 a.m.grounded=false;a.m.mode='AIRBORNE';a.m.y=3;a.m.position={x:0,y:3,z:0};
 a.pilot.position={x:0,y:3,z:0};a.pilot.velocity={x:0,y:0,z:0};
 a.attacker.position={x:1.65,y:3,z:0};
 a.pilot.yaw=a.pilot.input.yaw=-Math.PI/2;
 assert.equal(beginAttack(a.room,a.pilot.id,11),true);
 stepRoom(a.room,.01,11.4,world);
 assert.equal(a.room.events.filter(e=>e.type==='fightFlightComponentHit').length,0,'airborne swing ignores own machine');
 assert.ok(a.room.events.some(e=>e.type==='swordHit'&&e.playerId===a.pilot.id&&e.targetId===a.attacker.id));

 // 3. Enemy Fight-and-Flight remains hittable while occupied machine stays excluded
 const eTest=setup();
 eTest.room.fightFlight=null;
 eTest.room.machines=new Map([[eTest.m.id,eTest.m]]);
 const enemyFlight=createFightFlight({id:'enemy-flight',x:0,y:0,z:1.8,heading:Math.PI/2});
 eTest.room.machines.set(enemyFlight.id,enemyFlight);
 eTest.pilot.yaw=eTest.pilot.input.yaw=Math.PI;
 assert.equal(beginAttack(eTest.room,eTest.pilot.id,12),true);
 stepRoom(eTest.room,.01,12.4,world);
 assert.ok(eTest.room.events.some(event=>event.type==='fightFlightComponentHit'&&event.machineId===enemyFlight.id),'enemy Fight-and-Flight remains hittable');
 assert.equal(eTest.room.events.some(event=>event.type==='fightFlightComponentHit'&&event.machineId===eTest.m.id),false,'own machine stays excluded');
});
