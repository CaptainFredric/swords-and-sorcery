import test from 'node:test';import assert from 'node:assert/strict';
import{RoomManager}from'../../shared/sim/RoomManager.mjs';import{applyRoomCommand,serializeSnapshot}from'../../shared/sim/wire.mjs';
import{mountSoFistication,fireSoFistication,stepSoFistication}from'../../shared/sim/soFistication.mjs';import{resetPracticePlayer}from'../../shared/sim/practice.mjs';
function setup(){const room=new RoomManager().createSoloRoom('PRACTICE',0,'castleward');room.world={solids:[],ramps:[],floors:[{id:'g',center:[0,-.1,0],size:[60,.2,60],y:0}],spawnPoints:[{x:0,y:0,z:0}]};room.state='PLAYING';const p=room.addPlayer({id:'p',token:'p',name:'Builder'},0);p.position={x:0,y:0,z:0};p.yaw=0;return{room,p,command:(action,machine='so-fist-ication',time=1)=>applyRoomCommand(room,p,{type:'practiceSiege',action,machine,x:999,z:999},time)};}
test('Practice selects machine type and safely keeps one instance of each engine',()=>{
 const s=setup();assert.equal(s.room.soFistication,null);assert.deepEqual(s.command('build'),{});const first=s.room.soFistication;assert.ok(first&&first.id.startsWith('sofist-'));assert.equal(first.health,1400);assert.equal(s.room.biByeLlista,null);assert.ok(s.command('build').rejected);assert.equal(s.room.soFistication,first);
 assert.deepEqual(s.command('build','bi-bye-llista'),{});assert.ok(s.room.biByeLlista);assert.equal(s.room.soFistication,first);assert.ok(serializeSnapshot(s.room,2).soFistication);
});
test('rebuild and removal validate before detaching operator and retire an old committed stroke',()=>{
 const s=setup();s.command('build');const old=s.room.soFistication;s.p.position={x:old.x,y:old.y,z:old.z+3.1};assert.ok(mountSoFistication(s.room,old,s.p));fireSoFistication(s.room,old,1);s.p.health=42;
 assert.deepEqual(s.command('rebuild','so-fist-ication',1.1),{});assert.notEqual(s.room.soFistication.id,old.id);assert.equal(old.operatorId,null);assert.equal(s.p.operatingRamId,null);assert.equal(s.p.health,42);assert.equal(s.room.soFistication.components.Fist.health,500);assert.ok(old.retired);const count=s.room.events.length;stepSoFistication(s.room,old,.2,2.2);assert.equal(s.room.events.length,count);
 s.command('dismantle');assert.equal(s.room.soFistication,null);assert.equal(s.p.health,42);
});
test('unsupported construction and blocked rebuild preserve operated machine; reset self leaves its damage',()=>{
 const s=setup();s.command('build');const old=s.room.soFistication;s.p.position={x:old.x,y:old.y,z:old.z+3.1};assert.ok(mountSoFistication(s.room,old,s.p));old.health=500;old.components.Fist.health=0;
 s.room.world.floors=[];assert.ok(s.command('rebuild').rejected);assert.ok(s.command('dismantle').rejected);assert.equal(s.room.soFistication,old);assert.equal(old.operatorId,s.p.id);
 resetPracticePlayer(s.room,s.p.id,3);assert.equal(s.p.operatingRamId,null);assert.equal(old.operatorId,null);assert.equal(old.health,500);assert.equal(old.components.Fist.health,0);
});
