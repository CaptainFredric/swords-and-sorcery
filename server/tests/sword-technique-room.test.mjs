import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import { applyRoomCommand, serializeSnapshot } from '../../shared/sim/wire.mjs';
import { stepRoom } from '../../shared/sim/combat.mjs';
import { movePlayer, MOVEMENT } from '../../shared/src/movement.mjs';
import { SWORD_TECHNIQUE_CONTRACTS as TECH } from '../../shared/src/swordTechniqueContracts.mjs';
import { interruptSwordTechnique, stepSwordTechnique } from '../../shared/sim/swordTechnique.mjs';
import { applySavedLoadout } from '../src/savedLoadout.mjs';

function roomWithPlayers(technique='rigid_riposte') {
  const room=new Room('SWD01',{mode:'FFA',worldId:'ruined-keep'});
  const a=room.addPlayer({id:'a',token:'a',name:'A',technique},0);
  const b=room.addPlayer({id:'b',token:'b',name:'B'},0);
  room.startMatch(10);
  room.events=[];
  return {room,a,b};
}
const command=(room,player,type,down,at)=>applyRoomCommand(room,player,{type,down},at);

test('authoritative contracts preserve costs, damage and 5-degree 120Hz angular steps',()=>{
  assert.equal(TECH.rigid_riposte.damage.clean,24);
  assert.equal(TECH.rigid_riposte.damage.grazing,20);
  assert.equal(TECH.rigid_riposte.lungeDistance,5.7);
  assert.equal(TECH.rigid_riposte.activeUntil-TECH.rigid_riposte.activeFrom,.26);
  assert.equal(TECH.rigid_riposte.cooldown,10);
  assert.equal(TECH.whirl_wind.damage.clean,16);
  assert.equal(TECH.whirl_wind.damage.grazing,13);
  assert.equal(TECH.whirl_wind.maxRevolutions,5);
  assert.equal(TECH.whirl_wind.extraRevolutionCost,25);
  assert.equal(TECH.whirl_wind.activeUntil,0.6);
  assert.equal(360/(0.6*120),5);
  assert.equal(360/(0.6*30),20);
  assert.equal(MOVEMENT.dashCooldown,5);
  assert.equal(MOVEMENT.runSpeed,7.5);
  assert.equal(TECH.rigid_riposte.track.length,51);
  assert.equal(TECH.whirl_wind.track.length,37);
});

test('actual Room command, not isolated action mock, begins Riposte and replicates to a second client',()=>{
  const {room,a}=roomWithPlayers();
  assert.equal(command(room,a,'technique',true,12)?.rejected,undefined);
  assert.equal(a.swordTechnique?.id,'rigid_riposte');
  const first=serializeSnapshot(room,12,'a').players.find(p=>p.id==='a');
  const second=serializeSnapshot(room,12,'b').players.find(p=>p.id==='a');
  assert.equal(first?.swordTechnique?.id,'rigid_riposte');
  assert.equal(second?.swordTechnique?.id,'rigid_riposte');
  assert.equal(second?.technique,'rigid_riposte');
  assert.equal(second?.swordTechniqueReadyAt,0);
  command(room,a,'technique',false,12.1);
  assert.equal(a.swordTechniqueHeld,false);
});

test('aerial Riposte consumes native Dash cooldown and starts a cooldown when interrupted',()=>{
  const {room,a}=roomWithPlayers();
  a.grounded=false;
  a.dashReadyAt=12;
  command(room,a,'technique',true,12);
  assert.equal(a.swordTechnique?.id,'rigid_riposte');
  assert.equal(a.dashReadyAt,17);
  assert.equal(interruptSwordTechnique(a,12.2),true);
  assert.equal(a.swordTechnique,null);
  assert.equal(a.swordTechniqueReadyAt,22.2);
  command(room,a,'technique',true,13);
  assert.equal(a.swordTechnique,null);
});

test('aerial Whirl requires Gale; grounded Whirl remains legal without Gale',()=>{
  const {room,a}=roomWithPlayers('whirl_wind');
  a.grounded=false;
  a.spell='fireball';
  command(room,a,'technique',true,12);
  assert.equal(a.swordTechnique,null);
  a.spell='gale';
  command(room,a,'technique',true,12.1);
  assert.equal(a.swordTechnique?.id,'whirl_wind');
  interruptSwordTechnique(a,12.2);
  a.swordTechniqueReadyAt=0;
  a.grounded=true;a.spell='fireball';
  command(room,a,'technique',true,13);
  assert.equal(a.swordTechnique?.id,'whirl_wind');
});

test('Whirl spends one 25-Prowess cost per extra 0.6s revolution, not per tick',()=>{
  const {room,a,b}=roomWithPlayers('whirl_wind');
  a.prowess=100;
  a.grounded=true;
  // The opponent is deliberately away from the sword; only the skill economy is under test.
  b.spawnProtectionUntil=100;
  command(room,a,'technique',true,12);
  const empty={solids:[],floors:[]};
  const pose=at=>({position:{x:0,y:0,z:0},yaw:0,eye:{x:0,y:1.55,z:0}});
  for(let i=1;i<=120;i++){
    const now=12+i/30;
    stepSwordTechnique(a,now,{
      held:true,transformAt:pose,bodiesAt:()=>[],world:empty,
    });
  }
  assert.equal(a.prowess,0,'only the four paid revolutions consume starting Prowess');
  assert.equal(a.swordTechnique,null);
  assert.ok(a.swordTechniqueReadyAt>=25,'10s cooldown begins after recovery, not at activation');
});

test('a release completes the free revolution without charging Prowess',()=>{
  const {room,a}=roomWithPlayers('whirl_wind');
  a.prowess=100;
  command(room,a,'technique',true,12);
  command(room,a,'technique',false,12.1);
  const pose=at=>({position:{x:0,y:0,z:0},yaw:0,eye:{x:0,y:1.55,z:0}});
  const empty={solids:[],floors:[]};
  for(let i=1;i<=35;i++)stepSwordTechnique(a,12+i/30,{
    held:Boolean(a.swordTechniqueHeld),transformAt:pose,bodiesAt:()=>[],world:empty,
  });
  assert.equal(a.prowess,100);
  assert.equal(a.swordTechnique,null);
  assert.ok(a.swordTechniqueReadyAt>=22.8);
});

test('native movement applies committed Riposte displacement through its normal trajectory',()=>{
  const {a}=roomWithPlayers();
  a.position={x:0,y:5,z:0};a.grounded=false;
  a.velocity={x:0,y:0,z:0};a.impulse={x:0,z:0};
  a.swordTechnique={contract:TECH.rigid_riposte,phase:'active',lungeYaw:0,initialStartedAt:0};
  let state=a;
  for(let i=1;i<=18;i++){
    state=movePlayer(state,{forward:0,right:0,jump:false,crouch:false,yaw:0},1/30,i/30,{solids:[],floors:[]});
  }
  assert.ok(Math.abs(state.position.z+5.7)<.06,
    'a committed 5.7 m thrust resolves over 0.22–0.48s through native movePlayer');
});

test('saved loadout survives to the next authoritative match but is not hot-swapped midfight',()=>{
  const {room,a}=roomWithPlayers();
  const session={spell:'fireball',ultimate:'sunder',preparedSpells:[],siegeLoadout:null,technique:'rigid_riposte'};
  applySavedLoadout(session,room,a,{technique:'whirl_wind'});
  assert.equal(a.startingTechnique,'whirl_wind');
  assert.equal(a.technique,'rigid_riposte');
  room.startMatch(13);
  assert.equal(a.technique,'whirl_wind');
  assert.equal(a.swordTechnique,null);
});

test('disconnect cancels a held Whirl and retains its 10s cooldown',()=>{
  const {room,a}=roomWithPlayers('whirl_wind');
  a.prowess=100;
  command(room,a,'technique',true,12);
  assert.ok(a.swordTechnique);
  room.disconnectPlayer('a',12.12);
  assert.equal(a.swordTechnique,null);
  assert.equal(a.swordTechniqueHeld,false);
  assert.ok(a.swordTechniqueReadyAt>=22.12);
});

test('interrupted action replicates its recovery for its exact window, then expires',()=>{
  const {room,a}=roomWithPlayers();
  command(room,a,'technique',true,12);
  interruptSwordTechnique(a,12.1,'parried');
  const shown=serializeSnapshot(room,12.2,'b').players.find(p=>p.id==='a');
  assert.equal(shown.swordTechnique?.phase,'interrupted');
  assert.equal(shown.swordTechnique?.reason,'parried');
  assert.equal(serializeSnapshot(room,12.79,'b').players.find(p=>p.id==='a').swordTechnique?.id,'rigid_riposte');
  assert.equal(serializeSnapshot(room,12.81,'b').players.find(p=>p.id==='a').swordTechnique,null);
});

test('native lunge does not cross a wall or snap down from elevated terrain',()=>{
  const {a}=roomWithPlayers();
  a.position={x:0,y:5,z:0};
  a.grounded=true;
  a.velocity={x:0,y:0,z:0};a.impulse={x:0,z:0};
  a.swordTechnique={contract:TECH.rigid_riposte,phase:'active',lungeYaw:0,initialStartedAt:0};
  const world={floors:[{id:'terrace',center:[0,0,0],size:[30,1,30],y:5}],
    solids:[{id:'terrace-wall',center:[0,6,-3],size:[4,3,.4]}]};
  let state=a;
  for(let i=1;i<=18;i++)
    state=movePlayer(state,{forward:0,right:0,jump:false,crouch:false,yaw:0},
      1/30,i/30,world);
  assert.ok(state.position.z>-2.6,'collision prevents passage through the terrace wall');
  assert.ok(Math.abs(state.position.y-5)<.01,'feet remain on the elevated platform');
});

test('authored first- and third-person clip selection follows authoritative action phases',async()=>{
  const {swordTechniqueAnimationPlan}=await import('../../client/game/spellbladeAnimationPlan.mjs');
  const a={id:'rigid_riposte',startedAt:10,initialStartedAt:10,phase:'brace',aerial:false};
  assert.equal(swordTechniqueAnimationPlan(a,10.05,false).clip,'Technique_RigidRiposte_Enter');
  assert.equal(swordTechniqueAnimationPlan(a,10.05,true).clip,'FP_Technique_RigidRiposte_Enter');
  assert.equal(swordTechniqueAnimationPlan({...a,phase:'active'},10.3,false).clip,
    'Technique_RigidRiposte_Thrust');
  assert.equal(swordTechniqueAnimationPlan({id:'whirl_wind',startedAt:10,initialStartedAt:10,
    phase:'active',revolutions:2,galeLift:true},10.2,true).clip,'FP_Technique_Whirl_GaleLift');
});
