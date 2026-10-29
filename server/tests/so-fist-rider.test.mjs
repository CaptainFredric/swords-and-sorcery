import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../../shared/sim/Room.mjs';
import {createSoFistication,mountSoFistication,dismountSoFistication,soFistOperator,soFistEntry,stepSoFistication,fireSoFistication,SO_FIST} from '../../shared/sim/soFistication.mjs';
import {SO_FIST_SCALE,SO_FIST_STATION,SO_FIST_TIMING,soFistPose,soFistFrame} from '../../shared/sim/soFistGeometry.mjs';
import {boxWorld} from '../../shared/src/orientedBox.mjs';
const ground={floors:[{id:'floor',center:[0,-.1,0],size:[100,.2,100],y:0}],ramps:[],solids:[],abyssY:-20};
function setup(){const room=new Room('RIDER',{mode:'PRACTICE'});room.world=structuredClone(ground);room.state='PLAYING';const p=room.addPlayer({id:'p',token:'p',name:'Rider'},0);p.spawnProtectionUntil=0;const b=room.soFistication=createSoFistication();p.position=soFistEntry(b,room.world);return{room,p,b};}
test('ground boarding and elevated onboard authority use distinct actual station transforms',()=>{
 const {room,p,b}=setup();assert.equal(p.position.y,0);assert.ok(mountSoFistication(room,b,p));assert.ok(Math.abs(p.position.y-.226*SO_FIST_SCALE)<1e-7);
 Object.assign(b,{x:3,y:1,z:2,heading:.7,chassisPitch:.12,chassisRoll:-.08});
 const expected=boxWorld(soFistFrame(b),SO_FIST_STATION.rider);assert.deepEqual(Object.values(soFistOperator(b)),expected);
 assert.deepEqual([SO_FIST.hull,SO_FIST.fist,SO_FIST.speed,SO_FIST.reverse,SO_FIST.peak,SO_FIST.cycle],[1400,500,4.8,2.5,12,4]);
});
test('rider headroom blocks boarding and travel while exits remain actual safe ground',()=>{
 const {room,p,b}=setup();room.world.solids=[{center:[0,2.1,2.5],size:[1,.1,1]}];assert.equal(mountSoFistication(room,b,p),false);
 room.world.solids=[];assert.ok(mountSoFistication(room,b,p));assert.ok(dismountSoFistication(room,b,p));assert.equal(p.position.y,0);assert.equal(p.operatingRamId,null);
});
test('fast execution still respects collision arrest and the four second firing interval',()=>{
 const {room,p,b}=setup();mountSoFistication(room,b,p);fireSoFistication(room,b,0);
 assert.equal(SO_FIST_TIMING.release,.68);assert.equal(SO_FIST_TIMING.peak,.88);
 assert.ok(soFistPose(b,.79).active);assert.ok(soFistPose(b,.79).velocity>7);
 assert.ok(Math.abs(soFistPose(b,.88).offset-.445*SO_FIST_SCALE)<1e-6);
 assert.equal(fireSoFistication(room,b,3.99),false);assert.equal(fireSoFistication(room,b,4),true);
 b.strikeAt=0;b.strokeLimit=.2;b.strokeBlockedAt=.8;b.strokePreviousOffset=.1;b.strokeStepDt=1/30;
 assert.equal(soFistPose(b,.85).offset,.2);assert.ok(soFistPose(b,.85).clipAge<.88);
});
test('a disconnected driver releases even when every exit is obstructed',()=>{
 const {room,p,b}=setup();mountSoFistication(room,b,p);p.connected=false;room.world.solids=[{center:[0,1,0],size:[40,4,40]}];
 stepSoFistication(room,b,1/30,1,room.world);assert.equal(b.operatorId,null);assert.equal(p.operatingRamId,null);assert.equal(b.charging,false);
});
