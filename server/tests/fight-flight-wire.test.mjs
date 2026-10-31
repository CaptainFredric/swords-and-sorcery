import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomManager} from '../../shared/sim/RoomManager.mjs';
import {applyRoomCommand,serializeSnapshot} from '../../shared/sim/wire.mjs';
import {stepRoom} from '../../shared/sim/combat.mjs';
import {resetPracticePlayer} from '../../shared/sim/practice.mjs';

function setup(){
 const room=new RoomManager().createSoloRoom('PRACTICE',0,'castleward');
 room.world={solids:[],ramps:[],floors:[{id:'ground',center:[0,-.1,0],size:[100,.2,100],y:0}],spawnPoints:[{x:0,y:0,z:0,yaw:0}],abyssY:-30};
 room.state='PLAYING';
 const p=room.addPlayer({id:'pilot',token:'pilot',name:'Pilot'},0);
 p.position={x:0,y:0,z:0};p.yaw=0;
 return {room,p,do:(type,rest={},t=1)=>applyRoomCommand(room,p,{type,...rest},t)};
}
test('Practice -> operate -> network snapshot -> authoritative real flying movement -> landing -> dismount',()=>{
 const s=setup();
 assert.deepEqual(s.do('practiceSiege',{action:'build',machine:'fight-and-flight'}),{});
 const m=s.room.fightFlight;assert.ok(m);
 assert.equal(serializeSnapshot(s.room,1).fightFlight.lifecycleId,m.id);
 s.p.position={x:m.x,y:m.y,z:m.z+1};
 assert.deepEqual(s.do('siegeOperate'),{});
 assert.equal(s.p.operatingFightFlightId,m.id);
 assert.deepEqual(s.do('input',{forward:1,jump:true,yaw:0,pitch:0}),{});
 for(let i=0;i<70;i++)stepRoom(s.room,1/30,(i+1)/30,s.room.world);
 const snap=serializeSnapshot(s.room,3);
 assert.ok(snap.fightFlight.y>0);
 assert.equal(snap.players.find(p=>p.id==='pilot').operatingFightFlightId,m.id);
 assert.ok(m.flightCharge<100);
 assert.equal(m.operatorId,s.p.id,'pilot remains until an explicit eject command');
 assert.deepEqual(s.do('input',{jump:false,crouch:true,yaw:0,forward:0}),{});
 for(let i=70;i<220;i++)stepRoom(s.room,1/30,(i+1)/30,s.room.world);
 assert.ok(m.grounded,'descent must re-establish ground contact');
 assert.deepEqual(s.do('siegeOperate'),{});
 assert.equal(s.p.operatingFightFlightId,null);
 assert.equal(m.operatorId,null);
});
test('Practice reset detaches pilot but preserves rotor, reserve, charge and machine lifecycle',()=>{
 const s=setup();s.do('practiceSiege',{action:'build',machine:'fight-and-flight'});
 const m=s.room.fightFlight;s.p.position={x:m.x,y:m.y,z:m.z+1};s.do('siegeOperate');
 m.health=112;m.flightCharge=31;m.rotorHP=60;m.ammoDebt=9;m.ammo=2;
 const serial=m.lifecycleId;
 assert.equal(resetPracticePlayer(s.room,s.p.id,2),true);
 assert.equal(m.operatorId,null);
 assert.equal(s.p.operatingFightFlightId,null);
 assert.equal(m.lifecycleId,serial);
 assert.equal(m.health,112);assert.equal(m.flightCharge,31);
 assert.equal(m.rotorHP,60);assert.equal(m.ammoDebt,9);assert.equal(m.ammo,2);
});
test('Foreign pilot and network commands cannot multiply machine authority or personal ultimates',()=>{
 const s=setup();s.do('practiceSiege',{action:'build',machine:'fight-and-flight'});
 const m=s.room.fightFlight;s.p.position={x:m.x,y:m.y,z:m.z+1};s.do('siegeOperate');
 const other=s.room.addPlayer({id:'guest',token:'guest',name:'Guest'},0);
 other.position={x:m.x,y:m.y,z:m.z+1};
 assert.ok(applyRoomCommand(s.room,other,{type:'siegeOperate'},2).rejected);
 assert.equal(m.operatorId,s.p.id);
 assert.deepEqual(applyRoomCommand(s.room,s.p,{type:'ultimate'},2),{});
 assert.equal(s.p.ultimateState,null);
 assert.equal(applyRoomCommand(s.room,other,{type:'practiceSiege',action:'dismantle',machine:'fight-and-flight'},2).rejected!==undefined,true);
});
