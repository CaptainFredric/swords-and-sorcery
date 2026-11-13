import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomManager} from '../../shared/sim/RoomManager.mjs';
import {createFightFlight,mountFightFlight} from '../../shared/sim/fightFlight.mjs';
import {WORLD_IDS,getWorld} from '../../shared/worlds/registry.mjs';
import {applyRoomCommand} from '../../shared/sim/wire.mjs';

function setup(mode='PRACTICE'){
 const room=new RoomManager().createSoloRoom('PRACTICE',0,'castleward');
 room.state='PLAYING';
 room.world={floors:[{y:0,center:[0,0,0],size:[200,.2,200]}],solids:[],ramps:[]};
 // Add a legitimate Practice pilot before testing a hostile room-mode switch.
 // Otherwise the solo room's invitation gate rejects the test fixture itself.
 const p=room.addPlayer({id:'practice-pilot',token:'pilot',name:'Pilot'},0);
 room.mode=mode;
 p.position={x:0,y:0,z:1};
 const m=createFightFlight();room.fightFlight=m;
 assert.equal(mountFightFlight(room,m,p,0),true);
 return {room,p,m,cmd:(message,at=1)=>applyRoomCommand(room,p,message,at)};
}
test('opening Practice controls never dismounts, resets, or teleports a mounted pilot',()=>{
 const {room,p,m,cmd}=setup();
 const seat={...p.position},machine={x:m.x,y:m.y,z:m.z};
 assert.deepEqual(cmd({type:'practiceUiFocus',open:true}),{});
 assert.equal(p.practiceUiFocus,true);
 assert.deepEqual(cmd({type:'flightEject',down:true},1.1),{});
 assert.deepEqual(cmd({type:'flightEject',down:false},1.5),{});
 assert.deepEqual(cmd({type:'siegeOperate'},1.6),{});
 assert.equal(m.operatorId,p.id);
 assert.equal(p.operatingFightFlightId,m.id);
 assert.deepEqual(p.position,seat);
 assert.deepEqual({x:m.x,y:m.y,z:m.z},machine);
 assert.equal(m.ejectHoldStartedAt,null);
 assert.deepEqual(cmd({type:'practiceUiFocus',open:false},2),{});
 assert.equal(p.practiceUiFocus,false);
 assert.deepEqual(cmd({type:'flightEject',down:true},2.1),{});
 assert.equal(m.ejectHoldStartedAt,2.1,'normal operator input resumes upon closing UI');
 cmd({type:'flightEject',down:false,cancel:true},2.2);
});
test('stale Practice drawer focus cannot silently discard a NEW Mount request',()=>{
 const {room,p,m,cmd}=setup();
 // A previously dismissed drawer left a focus packet outstanding.
 m.operatorId=null;p.operatingFightFlightId=null;p.position={x:2.9,y:0,z:0};
 assert.deepEqual(cmd({type:'practiceUiFocus',open:true},1),{});
 assert.equal(p.practiceUiFocus,true);
 const mounted=cmd({type:'siegeOperate'},1.1);
 assert.deepEqual(mounted,{},mounted.rejected);
 assert.equal(m.operatorId,p.id);
 assert.equal(p.operatingFightFlightId,m.id);
 assert.equal(p.practiceUiFocus,false,'successful board clears stale focus');
});

test('Practice Mount on High Grounds distinguishes a nearby cockpit from a deck 12m above it',()=>{
 const room=new RoomManager().createSoloRoom('PRACTICE',0,WORLD_IDS.HIGH_GROUNDS);
 room.world=getWorld(WORLD_IDS.HIGH_GROUNDS);room.state='PLAYING';
 const p=room.addPlayer({id:'height-pilot',token:'height',name:'Pilot'},0);
 const m=createFightFlight({x:0,y:0,z:0});room.fightFlight=m;
 p.position={x:2,y:12,z:0}; // supported elevated crown bridge, not the ground-level road
 const elevated=applyRoomCommand(room,p,{type:'siegeOperate'},1);
 assert.match(elevated.rejected,/same elevation/i);
 assert.equal(m.operatorId,null);
 p.position={x:2.9,y:0,z:0};
 const boarded=applyRoomCommand(room,p,{type:'siegeOperate'},1.5);
 assert.equal(boarded.rejected,undefined,boarded.rejected);
 assert.equal(m.operatorId,p.id);
 assert.equal(p.operatingFightFlightId,m.id);
});

test('Practice focus is neither a PvP dismount bypass nor an unrestricted bot command',()=>{
 const {room,p,cmd}=setup('FREE_FOR_ALL');
 assert.ok(cmd({type:'practiceUiFocus',open:true}).rejected);
 assert.equal(p.practiceUiFocus,undefined);
 room.mode='PRACTICE';p.actorKind='bot';
 assert.ok(cmd({type:'practiceUiFocus',open:true}).rejected);
 assert.equal(p.practiceUiFocus,undefined);
});
