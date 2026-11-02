import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../../shared/sim/Room.mjs';
import {beginAttack,stepRoom} from '../../shared/sim/combat.mjs';
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
