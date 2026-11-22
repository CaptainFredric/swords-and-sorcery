import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {RoomManager} from '../../shared/sim/RoomManager.mjs';
import {stepBotControllers} from '../../shared/sim/BotController.mjs';
import {stepPracticeActors} from '../../shared/sim/practice.mjs';
import {stepRoom,tryUltimate,releaseOneHitCharge} from '../../shared/sim/combat.mjs';
import {applyRoomCommand,serializeSnapshot} from '../../shared/sim/wire.mjs';
import {TEAMS} from '../../shared/src/teams.mjs';

const DT=1/30;
function advance(room,start,frames,{bots=false,practice=false}={}){
 const timing={max:0,slow:0,events:{}};
 for(let tick=0;tick<frames;tick++){
  const now=start+tick*DT,begin=performance.now();
  if(bots)stepBotControllers(room,now,room.world,{random:()=>.53});
  if(practice)stepPracticeActors(room,now,room.world);
  stepRoom(room,DT,now,room.world);
  const snapshot=serializeSnapshot(room,now);
  assert.ok(snapshot.players.length>0,'host can publish a fresh authoritative snapshot');
  assert.ok(snapshot.players.every(p=>['x','y','z'].every(axis=>
    Number.isFinite(p.position[axis]))),'active actors have finite authoritative locations');
  const elapsed=performance.now()-begin;
  timing.max=Math.max(timing.max,elapsed);
  if(elapsed>120)timing.slow++;
  for(const event of room.events)timing.events[event.type]=(timing.events[event.type]??0)+1;
  room.events.length=0; // the network normally sends and drains these per tick
 }
 return timing;
}

test('six-actor Breakthrough capture combat continues publishing fresh snapshots',()=>{
 const room=new RoomManager({random:()=>.31}).createSoloRoom('BREAKTHROUGH',0,
  'bastion-breach',{teamSize:3});
 const player=room.addPlayer({id:'observer',token:'observer',name:'Observer',
  team:TEAMS.ATTACKERS},0);
 room.provisionModeActors(0);
 room.startMatch(1);
 const actors=[...room.players.values()];
 assert.ok(actors.length>=6,'test must include the crowded 3v3 combat situation');
 const point=room.objectiveState?.objectives?.[room.objectiveState.index]?.position;
 assert.ok(point,'the actual capture point exists');
 // A repeatable congested clash rather than six actors wandering from spawn.
 actors.forEach((a,i)=>{
  a.position={x:point.x+Math.sin(i*1.21)*2.9,
    y:point.y,z:point.z+Math.cos(i*1.21)*2.9};
  a.spawnProtectionUntil=0;
  a.health=100;
  a.velocity={x:0,y:0,z:0};
 });
 player.input={...player.input,forward:0,right:0,attack:false};
 const total=advance(room,2,360,{bots:true});
 assert.equal(room.mode,'BREAKTHROUGH');
 assert.ok(total.max<2000,'no single authoritative tick should hang for seconds');
});

test('Practice Full Gale+Lightning against mounted Fight-and-Flight keeps sim and snapshots live',()=>{
 const room=new RoomManager({random:()=>.31}).createSoloRoom('PRACTICE',0,'castleward');
 room.state='PLAYING';
 const player=room.addPlayer({id:'human',token:'human',name:'Player'},0);
 player.position={x:0,y:0,z:0};
 player.health=1000;player.maxHealth=1000;player.spawnProtectionUntil=0;
 player.ultimate='one_hit_of_wonders';player.prowess=100;
 assert.deepEqual(applyRoomCommand(room,player,{type:'practiceSiegeOpponent',
  action:'spawn',machine:'fight-and-flight',difficulty:'formidable',
  skill:'narrowToOne'},2),{});
 assert.deepEqual(applyRoomCommand(room,player,{type:'practiceOneHit',
  action:'preset',preset:'full'},2.1),{});
 const m=room.fightFlight;
 player.yaw=Math.atan2(-(m.x-player.position.x),-(m.z-player.position.z));
 player.input.yaw=player.yaw;player.input.pitch=.52;
 assert.equal(tryUltimate(room,player.id,3,{held:true}),true);
 advance(room,3.02,22,{practice:true});
 releaseOneHitCharge(room,player.id,3.76,{yaw:player.yaw,pitch:.52});
 const result=advance(room,3.78,240,{practice:true});
 assert.ok((result.events.oneHitWave??0)>0,
   'stress test must exercise the flying Gale wave, not just charge startup');
 assert.ok(result.max<2000,'Gale/Lightning and rotor collision cannot hang a simulation step');
 assert.ok(room.players.has(player.id),'active Practice session survives ultimate interaction');
});
