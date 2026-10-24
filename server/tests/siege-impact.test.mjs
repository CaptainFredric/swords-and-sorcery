import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomManager} from '../../shared/sim/RoomManager.mjs';
import {stepBiByeProjectiles} from '../../shared/sim/biByeLlista.mjs';
import {beginAttack,stepRoom,tryDash} from '../../shared/sim/combat.mjs';
import {callSteel} from '../../shared/src/steel.mjs';
import {freshStagger} from '../../shared/src/stagger.mjs';

const world={solids:[],ramps:[],floors:[{id:'ground',center:[0,-.1,0],size:[60,.2,60],y:0}],abyssY:-20};
function hit({steel=false,level=0,protectedUntil=0,kind='siege'}={}){
 const room=new RoomManager().createSoloRoom('PRACTICE',0,'castleward');room.world=world;room.state='PLAYING';
 const owner=room.addPlayer({id:'owner',token:'o',name:'Operator'},0),victim=room.addPlayer({id:'victim',token:'v',name:'Victim'},0);
 Object.assign(owner,{position:{x:10,y:0,z:10},spawnProtectionUntil:0});
 Object.assign(victim,{position:{x:0,y:0,z:0},yaw:Math.PI,spawnProtectionUntil:protectedUntil,stagger:{...freshStagger(),level},input:{forward:1,right:0,yaw:Math.PI,pitch:0}});
 if(steel)victim.steel=callSteel(.5);
 Object.assign(victim,{pendingSpell:{spell:'fireball'},castEndsAt:1.3,gauntlet:{},dashUntil:3,dashDir:{x:0,z:1},sprinting:true,sprintBlend:1});
 room.bibyeProjectiles=new Map([['bolt',{id:'bolt',ballistaId:'fixture',ownerId:owner.id,subKind:kind,bornAt:1-1/30,position:{x:0,y:.9,z:1},velocity:{x:0,y:0,z:-55},radius:.05,directDamage:kind==='siege'?85:18,staggerGain:45,shove:8.5,blastRadius:2,pierceMaxTargets:2,pierceCount:0,piercedVictimIds:[],shockwaveSpawned:true}]]);
 stepBiByeProjectiles(room,1/30,1,world);return{room,owner,victim};
}
test('direct heavy bolt survivor reels for .22s and takes exactly the existing damage and stagger',()=>{
 const {room,victim}=hit();assert.equal(victim.health,15);assert.equal(victim.stagger.level,45);assert.equal(victim.staggerUntil,1.22);
 assert.equal(victim.pendingSpell,null);assert.equal(victim.gauntlet,null);assert.equal(victim.dashUntil,1);assert.equal(victim.sprintBlend,0);
 assert.equal(room.events.filter(e=>e.type==='actionInterrupted'&&e.playerId===victim.id).length,1);
 assert.equal(beginAttack(room,victim.id,1.1),false);assert.equal(tryDash(room,victim.id,{x:1,z:0},1.1),false);
 assert.ok(victim.impulse.z<-8);stepRoom(room,1/30,1+1/30,world);assert.ok(victim.position.z<-.2,'external shove carries the reeling victim');
 assert.equal(beginAttack(room,victim.id,1.23),true);
});
test('Steel preserves its existing mitigation while the short reel does not extend a full balance break',()=>{
 const steel=hit({steel:true});assert.equal(steel.victim.health,45);assert.equal(steel.victim.stagger.level,45);assert.equal(steel.victim.staggerUntil,1.22);
 const broken=hit({level:65});assert.equal(broken.victim.staggerUntil,2);assert.equal(broken.victim.stagger.level,30);assert.equal(broken.room.events.filter(e=>e.type==='staggerBreak').length,1);
});
test('conditioning and protected contacts do not acquire a hard reel',()=>{
 const frost=hit({kind:'conditioning'});assert.equal(frost.room.events.some(e=>e.type==='actionInterrupted'),false);
 const immune=hit({protectedUntil:2});assert.equal(immune.victim.health,100);assert.equal(immune.room.events.some(e=>e.type==='actionInterrupted'),false);assert.equal(immune.victim.stagger.level,0);
});
test('both ballista bolts stop on actual ram components before a victim behind them',async()=>{
 const {createSoFistication}=await import('../../shared/sim/soFistication.mjs');
 for(const subKind of ['conditioning','siege']){
  const {room,victim}=hit({protectedUntil:2});room.events=[];room.bibyeProjectiles.clear();room.soFistication=createSoFistication();victim.position={x:0,y:0,z:0};victim.health=100;victim.spawnProtectionUntil=0;victim.history=[];
  room.bibyeProjectiles.set('ram-bolt',{id:'ram-bolt',ballistaId:'other-machine',ownerId:'owner',subKind,bornAt:2-1/30,position:{x:0,y:1,z:-4},velocity:{x:0,y:0,z:55},directDamage:subKind==='siege'?85:18,blastRadius:2,pierceMaxTargets:2,pierceCount:0,piercedVictimIds:[],shockwaveSpawned:true});
  for(let i=0;i<3;i++)stepBiByeProjectiles(room,1/30,2+i/30,world);assert.equal(victim.health,100);assert.ok(room.soFistication.components.Fist.health<500);assert.equal(room.soFistication.health,1400);assert.equal(room.bibyeProjectiles.size,0);
 }
});
