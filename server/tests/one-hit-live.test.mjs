import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import { tryUltimate, releaseOneHitCharge, tryCastSpell, stepRoom } from '../../shared/sim/combat.mjs';
import { configurePracticeOneHit } from '../../shared/sim/practice.mjs';
import { applyRoomCommand,serializeSnapshot } from '../../shared/sim/wire.mjs';
import { PROWESS } from '../../shared/src/prowess.mjs';
import { lineOfConductDamage } from '../../shared/src/oneHitOfWondersRules.mjs';

const world={
  floors:[{id:'ground',center:[0,-.1,0],size:[200,.2,200],y:0}],
  ramps:[],solids:[],spawnPoints:[{x:0,y:0,z:0,yaw:-Math.PI/2},{x:3,y:0,z:0,yaw:Math.PI/2}],
  abyssY:-9,
};

function battle(mode='FFA'){
  const room=new Room('WONDR',{mode});
  room.world=world;
  room.addPlayer({id:'a',token:'aa',name:'Swords'},0);
  room.addPlayer({id:'b',token:'bb',name:'Sorcery'},0);
  room.setReady('a',true,0);room.setReady('b',true,0);room.tick(3.1);
  if(mode==='PRACTICE')room.state='PLAYING'; // custom yard fixture without auto-start
  const a=room.players.get('a'),b=room.players.get('b');
  a.ultimate='one_hit_of_wonders';
  a.position={x:0,y:0,z:0};b.position={x:1.8,y:0,z:0};
  a.yaw=-Math.PI/2;a.input.yaw=a.yaw;a.pitch=0;a.input.pitch=0;
  b.yaw=Math.PI/2;b.input.yaw=b.yaw;
  a.spawnProtectionUntil=0;b.spawnProtectionUntil=0;
  room.events.length=0;return {room,a,b};
}
function ticks(room,from,count,dt=1/30){
  for(let i=0;i<count;i++)stepRoom(room,dt,from+i*dt,world);
}
test('zero-infusion Ultimate is a usable real room attack, Shaken and physical rupture',()=>{
  const {room,a,b}=battle();
  a.prowess=PROWESS.full;
  assert.equal(tryUltimate(room,'a',9),true);
  ticks(room,9,35);
  assert.equal(a.prowess,0);
  assert.ok(room.events.some(e=>e.type==='oneHitImpact'), 'authoritative ground impact event');
  assert.ok(room.events.some(e=>e.type==='rupture'), 'real Castleward rupture simulation');
  assert.ok(room.events.some(e=>e.source==='one_hit_of_wonders'&&e.victimId==='b'));
  assert.ok(b.shaken,'physical status without elemental tiers');
  assert.deepEqual(a.oneHitInfusions,{fire:0,frost:0,gale:0,lightning:0});
});
test('full-Lightning Ultimate holds and releases the strike immediately',()=>{
  const {room,a}=battle();
  a.prowess=PROWESS.full;
  a.oneHitInfusions.lightning=2;
  assert.equal(tryUltimate(room,'a',9),true);
  assert.ok(a.ultimateState.commitAt > 1000,'server does not auto-trigger while held');
  assert.equal(releaseOneHitCharge(room,'a',9.25),true);
  assert.equal(a.ultimateState.phase,'active');
  assert.equal(a.prowess,0);
  assert.ok(room.events.some(e=>e.type==='oneHitImpact'&&e.playerId==='a'));
  assert.ok(room.events.some(e=>e.type==='oneHitTeleport'));
  assert.equal(releaseOneHitCharge(room,'a',9.5),false,'one release cannot trigger a second strike');
});
test('Practice settings are server-owned and disallowed in PvP rooms',()=>{
  const normal=battle();
  assert.equal(configurePracticeOneHit(normal.room,'a',{action:'preset',preset:'full'},9),false);
  const {room,a}=battle('PRACTICE');
  assert.deepEqual(applyRoomCommand(room,a,{type:'practiceOneHit',action:'preset',preset:'gale'},9),{});
  assert.equal(a.practiceOneHit.stages.gale,2);
  assert.equal(configurePracticeOneHit(room,'a',{action:'preset',preset:'gale'},9),true);
  assert.equal(a.practiceOneHit.stages.gale,2);
  assert.equal(a.practiceOneHit.stages.fire,0);
  assert.equal(configurePracticeOneHit(room,'a',{action:'level',element:'fire',tier:1},9),true);
  assert.equal(a.practiceOneHit.stages.fire,1);
  assert.equal(configurePracticeOneHit(room,'a',{action:'aerial'},9),true);
  assert.equal(a.grounded,false);
  assert.ok(a.position.y>=5);
  assert.equal(configurePracticeOneHit(room,'a',{action:'natural'},9),true);
  assert.equal(a.practiceOneHit,null);
});
test('Manual Practice tiers apply once when retention is unchecked and keep applying when checked',()=>{
  const {room,a}=battle('PRACTICE');
  assert.equal(configurePracticeOneHit(room,'a',{action:'preset',preset:'full'},9),true);
  assert.equal(configurePracticeOneHit(room,'a',{action:'enabled',enabled:false},9),true);
  assert.equal(a.practiceOneHit.enabled,false);
  assert.equal(configurePracticeOneHit(room,'a',{action:'level',element:'fire',tier:1},9),true);
  assert.equal(a.practiceOneHit.enabled,false,'changing tier cannot silently re-enable persistence');
  assert.equal(configurePracticeOneHit(room,'a',{action:'preset',preset:'full'},9),true);
  assert.equal(a.practiceOneHit.enabled,false,'changing preset cannot silently re-enable persistence');
  assert.equal(tryUltimate(room,'a',9.1),true);
  // ALL FULL includes Full Lightning: the physical attack is held until
  // Ultimate is released, rather than committing on its startup timer.
  assert.equal(releaseOneHitCharge(room,'a',9.2),true);
  ticks(room,9.2,32);
  assert.equal(room.events.find(e=>e.type==='oneHitCommitted')?.tiers.fire,2);
  assert.equal(a.practiceOneHit,null,'one-shot tiers reset only after a real commit');
  assert.equal(configurePracticeOneHit(room,'a',{action:'preset',preset:'gale'},12),true);
  assert.equal(a.practiceOneHit.stages.gale,2);
  assert.equal(a.practiceOneHit.stages.fire,0);
  a.ultimateState=null;a.recoverUntil=-Infinity;
  assert.equal(tryUltimate(room,'a',12.1),true);
  ticks(room,12.1,32);
  assert.equal(a.practiceOneHit.stages.gale,2,'infinite manual preset survives a real commit');
});
test('Human Practice resource stays fully charged in snapshots even after Ultimate commitment',()=>{
  const {room,a}=battle('PRACTICE');
  assert.equal(a.prowess,PROWESS.full,'new Practice actor starts full');
  assert.equal(tryUltimate(room,'a',9),true);
  ticks(room,9,35);
  assert.equal(a.prowess,PROWESS.full);
  assert.equal(serializeSnapshot(room,11,'a').players.find(p=>p.id==='a').prowess,PROWESS.full);
});
test('Line of Conduct hits through actual shared spell casting and grants one stage per spell use',()=>{
  const {room,a,b}=battle();
  a.spell='line_of_conduct';
  assert.equal(tryCastSpell(room,'a',{x:1,y:0,z:0},9),true);
  ticks(room,9,20);
  assert.ok(room.events.some(e=>e.source==='line_of_conduct'&&e.victimId==='b'));
  assert.equal(a.oneHitInfusions.lightning,1);
  assert.equal(b.oneHitInfusions.lightning,1);
  assert.ok(b.health<100);
  const snapshot=serializeSnapshot(room,9.8,'a');
  assert.equal(snapshot.players.find(p=>p.id==='a').oneHitInfusions.lightning,1);
  assert.equal(lineOfConductDamage(0),20);
  assert.equal(lineOfConductDamage(Infinity),12);
});
test('Aerial Ultimate with full Gale starts a modest vortex then launches one traveling wave',()=>{
  const {room,a}=battle();
  a.position.y=18;a.grounded=false;a.velocity.y=0;a.oneHitInfusions.gale=2;
  a.prowess=PROWESS.full;
  assert.equal(tryUltimate(room,'a',9),true);
  ticks(room,9,60);
  const launched=room.events.filter(e=>e.type==='oneHitWave');
  assert.equal(launched.length,1);
  assert.equal(room.events.find(e=>e.type==='oneHitCommitted')?.form,'aerial');
});
