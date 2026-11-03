import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../../shared/sim/Room.mjs';
import * as combat from '../../shared/sim/combat.mjs';
import {ULTIMATES} from '../../shared/src/ultimates.mjs';
import {frostParryContact} from '../../shared/sim/biByeFrostGuard.mjs';
import {stepFightFlightProjectiles} from '../../shared/sim/fightFlightWeapons.mjs';
import {createFightFlight} from '../../shared/sim/fightFlight.mjs';
import {stepFightFlightRotor} from '../../shared/sim/fightFlightRotor.mjs';
const world={floors:[{center:[0,-.1,0],size:[60,.2,60],y:0}],ramps:[],solids:[],abyssY:-9,
 spawnPoints:[{x:0,y:0,z:0,yaw:-Math.PI/2},{x:1.8,y:0,z:0,yaw:Math.PI/2}]};
function duel(){
 const room=new Room('AUTO');room.world=world;
 const a=room.addPlayer({id:'a',name:'A',token:'a',ultimate:'chivalry'},0);
 const b=room.addPlayer({id:'b',name:'B',token:'b'},0);room.startMatch(3);
 a.spawnProtectionUntil=b.spawnProtectionUntil=0;a.prowess=100;
 assert.ok(combat.tryUltimate(room,a.id,10));combat.stepRoom(room,.01,10.65,world);
 combat.setGuard(room,a.id,false,10.7);room.events.length=0;
 return {room,a,b};
}
function hit({room,a,b},options={}){
 if(options.rear){a.yaw=Math.PI/2;a.input.yaw=a.yaw;}
 if(options.broken)a.guardBrokenUntil=15;
 if(options.empty){a.guardStamina=0;a.lastGuardDrainAt=10.8;}
 if(options.expired)a.ultimateState.until=10.8;
 combat.beginAttack(room,b.id,10.8);
 for(let t=10.81;t<=11.25;t+=.01)combat.stepRoom(room,.01,t,world);
 return room.events.find(e=>e.type==='parry'&&e.defenderId===a.id);
}
test('Spells and Chivalry has ten active seconds after its ordinary startup',()=>{
 const {a}=duel();assert.equal(ULTIMATES.chivalry.activeSec,10);assert.equal(a.ultimateState.until,20.65);
});
test('committed Chivalry automatically parries a real frontal sword without a fresh Guard press',()=>{
 const s=duel();assert.equal(s.a.guarding,false);
 const event=hit(s);assert.ok(event);assert.equal(event.automatic,true);assert.equal(s.a.health,100);
});
test('rear hits, depleted Guard, a broken Guard and expiry defeat automatic Chivalry parry',()=>{
 for(const options of [{rear:true},{empty:true},{broken:true},{expired:true}]){
  const s=duel();assert.equal(hit(s,options),undefined,JSON.stringify(options));
  assert.ok(s.a.health<100,'ordinary damage remains effective: '+JSON.stringify(options));
 }
});
test('Chivalry deflects a real incoming Core without granting immunity to its later area blast',()=>{
 const {room,a,b}=duel();
 a.position={x:0,y:0,z:0};a.yaw=0;a.input.yaw=0;b.position={x:0,y:0,z:-8};
 const q={id:'automatic-core',ownerId:b.id,spell:'coreflagration',
  position:{x:0,y:1,z:-.8},velocity:{x:0,y:0,z:20},bornAt:11};
 room.projectiles.set(q.id,q);combat.stepRoom(room,.03,11,world);
 assert.equal(a.health,100);assert.equal(q.corePhase,'knocked');
 assert.ok(room.events.some(e=>e.type==='coreflagrationParried'&&e.automatic));
 q.position={x:0,y:1,z:0};q.velocity={x:0,y:0,z:0};q.corePhase='armed';q.detonateAt=11.5;
 combat.stepRoom(room,.03,11.5,world);
 assert.equal(a.health,80,'the ordinary area explosion is still dangerous');
});
test('actual repeater bolts meet Chivalry in front while rear bolts still hit',()=>{
 for(const rear of [false,true]){
  const {room,a,b}=duel();a.position={x:0,y:0,z:0};a.yaw=0;b.position={x:8,y:0,z:0};
  const q={id:'automatic-quarrel',machineId:'flight',ownerId:b.id,bornAt:10.9,dist:0,radius:.065,
   position:{x:0,y:1.1,z:rear?.8:-.8},velocity:{x:0,y:0,z:rear?-64:64}};
  room.fightFlightProjectiles=new Map([[q.id,q]]);
  stepFightFlightProjectiles(room,1/30,11,world);
  const e=room.events.find(e=>e.type==='fightFlightBoltImpact');assert.ok(e);
  assert.equal(e.hitKind,rear?'player':'parry');assert.equal(a.health,rear?96:100);
 }
});
test('an actual rotor crossing can be automatically parried without pressing Guard',()=>{
 const {room,a,b}=duel();a.position={x:1,y:1,z:0};a.yaw=Math.PI/2;b.position={x:-8,y:0,z:0};
 const m=createFightFlight({id:'automatic-rotor',x:0,y:0,z:0});m.operatorId=b.id;room.fightFlight=m;
 m.rotorAngleBefore=-Math.PI/2;m.lastRotorDelta=Math.PI;m.rotorAngle=Math.PI/2;
 m.rotorPositionBefore={x:0,y:0,z:0};m.rotorAngularVelocity=Math.PI*15;
 stepFightFlightRotor(room,m,1/30,11);
 assert.equal(a.health,100);assert.ok(room.events.some(e=>e.type==='fightFlightRotorParried'&&e.defenderId===a.id));
});
test('automatic Chivalry projectile parry still requires the real frontal Guard volume',()=>{
 const {a}=duel();a.position={x:0,y:0,z:0};a.yaw=0;
 const q={velocity:{x:0,y:0,z:64},radius:.065};
 assert.ok(frostParryContact(a,q,{x:0,y:1.1,z:-2},{x:0,y:1.1,z:0},12,100));
 assert.equal(frostParryContact(a,q,{x:0,y:.1,z:-2},{x:0,y:.1,z:0},12,100),null);
 assert.equal(frostParryContact(a,{...q,velocity:{x:0,y:0,z:-64}},{x:0,y:1.1,z:2},{x:0,y:1.1,z:0},12,100),null);
});
