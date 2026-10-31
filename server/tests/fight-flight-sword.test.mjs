import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../../shared/sim/Room.mjs';
import {applyRoomCommand} from '../../shared/sim/wire.mjs';
import {beginAttack,endAttack,stepRoom,setGuard} from '../../shared/sim/combat.mjs';
import {createFightFlight} from '../../shared/sim/fightFlight.mjs';
import {requestFightFlightFire} from '../../shared/sim/fightFlightWeapons.mjs';
const world={floors:[{id:'floor',center:[0,-.1,0],size:[60,.2,60],y:0}],ramps:[],solids:[],
  spawnPoints:[{x:0,y:0,z:0,yaw:-Math.PI/2},{x:2,y:0,z:0,yaw:Math.PI/2}],abyssY:-10};
function setup(){
 const room=new Room('F-SWORD');room.world=world;
 room.addPlayer({id:'pilot',token:'pilot',name:'Pilot',ultimate:'chivalry'},0);
 room.addPlayer({id:'enemy',token:'enemy',name:'Enemy'},0);
 room.setReady('pilot',true,0);room.setReady('enemy',true,0);room.tick(3.1);
 const a=room.players.get('pilot'),b=room.players.get('enemy');
 a.position={x:0,y:0,z:0};a.yaw=a.input.yaw=-Math.PI/2;
 b.position={x:2,y:0,z:0};b.yaw=b.input.y=Math.PI/2;
 a.spawnProtectionUntil=b.spawnProtectionUntil=0;
 const m=createFightFlight({id:'mounted-test',x:0,y:0,z:0,heading:-Math.PI/2});
 m.operatorId=a.id;a.operatingFightFlightId=m.id;room.fightFlight=m;room.events.length=0;
 return {room,a,b,m};
}
test('Mounted right-hand sword uses actual swept contact, not a proximity-damage shortcut',()=>{
 const {room,a,b,m}=setup();
 assert.equal(beginAttack(room,a.id,10),true);
 stepRoom(room,.01,10.4,world);
 assert.ok(room.events.some(e=>e.type==='swordHit'&&e.playerId===a.id&&e.targetId===b.id),'mounted swing reaches real sword swept volume');
 assert.ok(b.health<100,'actual target HP is reduced through ordinary sword rules');
 assert.equal(m.operatorId,a.id);
});
test('Ordinary flight sword and repeater cannot attack simultaneously, but release resumes after melee',()=>{
 const {room,a,m}=setup();
 assert.equal(beginAttack(room,a.id,10),true);
 assert.equal(requestFightFlightFire(room,m,a,true,10.01),true);
 assert.equal(m.ammo,14,'no shot during ongoing sword animation');
 stepRoom(room,.01,10.4,world);
 assert.equal(room.events.filter(e=>e.type==='fightFlightBoltReleased').length,0);
 endAttack(room,a.id,10.5);
 for(let t=10.51;t<=12;t+=.05)stepRoom(room,.05,t,world);
 assert.ok(room.events.some(e=>e.type==='fightFlightBoltReleased'),'repeater resumes when melee has actually ended');
});
test('Only an active, not merely ready, Spells and Chivalry allows mounted sword and repeater hit events',()=>{
 const {room,a,m}=setup();
 a.prowess=100;a.ultimateState={id:'chivalry',phase:'active',until:20};
 assert.equal(beginAttack(room,a.id,10),true);
 assert.equal(requestFightFlightFire(room,m,a,true,10.01),true);
 assert.ok(room.events.some(e=>e.type==='fightFlightBoltReleased'));
 stepRoom(room,.01,10.4,world);
 assert.ok(room.events.some(e=>e.type==='swordHit'));
 const other=setup();other.a.prowess=100;
 assert.equal(beginAttack(other.room,other.a.id,10),true);
 assert.equal(requestFightFlightFire(other.room,other.m,other.a,true,10.01),true);
 assert.equal(other.room.events.some(e=>e.type==='fightFlightBoltReleased'),false,'ready meter is not active Chivalry');
});
test('Grounded Guard remains real and suppresses ordinary firing; airborne Guard is unavailable',()=>{
 const {room,a,m}=setup();
 assert.deepEqual(applyRoomCommand(room,a,{type:'guard',down:true},10),{});
 assert.equal(a.guarding,true,JSON.stringify({state:room.state,guardStamina:a.guardStamina,staggerUntil:a.staggerUntil,guardBrokenUntil:a.guardBrokenUntil,ultimateState:a.ultimateState,grounded:m.grounded,operatorId:m.operatorId,guardHeld:a.guardHeld,guardButton:a.guardButton,events:room.events.slice(-3)}));
 assert.equal(requestFightFlightFire(room,m,a,true,10.01),true);
 assert.equal(m.ammo,14);
 m.grounded=false;m.mode='AIRBORNE';m.y=3;
 assert.deepEqual(applyRoomCommand(room,a,{type:'guard',down:true},10.1),{});
 stepRoom(room,.01,10.11,world);
 assert.equal(a.guarding,false);
 assert.equal(a.guardHeld,false);
});
