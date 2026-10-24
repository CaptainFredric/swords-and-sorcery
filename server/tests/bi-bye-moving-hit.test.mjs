import test from 'node:test';import assert from 'node:assert/strict';
import {RoomManager} from '../../shared/sim/RoomManager.mjs';
import {spawnPracticeDummy} from '../../shared/sim/practice.mjs';
import {stepBiByeProjectiles} from '../../shared/sim/biByeLlista.mjs';
import {recordTransform} from '../../shared/sim/history.mjs';
function setup(){const room=new RoomManager().createSoloRoom('PRACTICE',0,'castleward'),owner=room.addPlayer({id:'owner',token:'o',name:'Owner'},0),target=spawnPracticeDummy(room,'PASSIVE',0);room.biByeLlista=null;room.world={solids:[],floors:[],ramps:[]};owner.position={x:10,y:0,z:10};target.spawnProtectionUntil=0;return {room,target};}
function bolt(room,y=.9){room.bibyeProjectiles=new Map([['bolt',{id:'bolt',ballistaId:'fixture',subKind:'conditioning',ownerId:'owner',bornAt:1-1/30,position:{x:0,y,z:.8},velocity:{x:0,y:0,z:-48},radius:.05,directDamage:18,blastRadius:2}]]);}
test('a conditioning bolt catches a target crossing its swept path between host ticks',()=>{
 const {room,target}=setup();target.history=[];target.position={x:-.52,y:0,z:0};recordTransform(target,1-1/30);target.position={x:.52,y:0,z:0};recordTransform(target,1);bolt(room);stepBiByeProjectiles(room,1/30,1);
 assert.ok(room.events.some(e=>e.type==='bibyeBoltImpact'&&e.victimId===target.id));assert.ok(target.health<100);
});
test('crouching under a bolt uses the ordinary shorter body rather than a standing cylinder',()=>{
 const {room,target}=setup();target.position={x:0,y:0,z:0};target.history=[];target.crouched=true;bolt(room,1.6);stepBiByeProjectiles(room,1/30,1);assert.equal(room.bibyeProjectiles.size,1);assert.equal(target.health,100);
});
test('a stationary near miss still passes and a wall wins before a crossing target',()=>{
 const {room,target}=setup();target.history=[];target.position={x:.7,y:0,z:0};bolt(room);stepBiByeProjectiles(room,1/30,1);assert.equal(room.bibyeProjectiles.size,1);
 target.position={x:0,y:0,z:0};room.world.solids=[{id:'wall',center:[0,1,.5],size:[2,2,.05]}];bolt(room);stepBiByeProjectiles(room,1/30,1);assert.equal(target.health,100);assert.ok(room.events.some(e=>e.type==='bibyeBoltImpact'&&e.hitKind==='solid'));
});

test('resetting across the flight path does not count as continuous target movement',()=>{
 const {room,target}=setup();target.history=[];target.position={x:-3,y:0,z:0};recordTransform(target,1-1/30);target.position={x:3,y:0,z:0};recordTransform(target,1);bolt(room);stepBiByeProjectiles(room,1/30,1);
 assert.equal(target.health,100);assert.equal(room.bibyeProjectiles.size,1);
});
