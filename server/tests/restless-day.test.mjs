import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../../shared/sim/Room.mjs';
import {GAME_MODES, getModePolicy, publicRoomMode} from '../../shared/src/modes.mjs';
import {WORLD_IDS, getWorld} from '../../shared/worlds/registry.mjs';
import {TEAMS} from '../../shared/src/teams.mjs';
import {applyRoomCommand,serializeSnapshot} from '../../shared/sim/wire.mjs';
import {damageStructure} from '../../shared/sim/structures.mjs';
import {damageRestlessLadder,withRestlessLadders,restlessnessStep,RESTLESS_DAY_RULES} from '../../shared/sim/restlessDayMode.mjs';
import {movePlayer,createMovementState} from '../../shared/src/movement.mjs';
import {surfaceHeightAt} from '../../shared/src/collision.mjs';

function match(start=10){
 const room=new Room('RSTL5',{isPrivate:true,mode:GAME_MODES.RESTLESS_DAY,worldId:WORLD_IDS.RESTLESS_DAY});
 const attacker=room.addPlayer({id:'human-a',token:'tok-a',name:'Attacker',team:TEAMS.ATTACKERS},start-1);
 room.provisionModeActors(start-1);
 room.startMatch(start);
 const defender=[...room.players.values()].find(p=>p.team===TEAMS.DEFENDERS);
 return {room,attacker,defender};
}
test('Restless Day has a dedicated collision-matched two-curtain map and 5v5 capacity',()=>{
 const world=getWorld(WORLD_IDS.RESTLESS_DAY);
 assert.equal(world.walls.length,2);
 assert.equal(world.structures.find(x=>x.id==='rightful-renowner').solidIds[0],'renowner-body');
 assert.ok(world.solids.some(x=>x.id==='outer-curtain-west'));
 assert.ok(world.solids.some(x=>x.id==='inner-curtain-east'));
 assert.ok(world.floors.some(x=>x.id==='outer-rampart'&&x.y===6));
 assert.ok(world.floors.some(x=>x.id==='inner-rampart'&&x.y===7));
 assert.equal(publicRoomMode(GAME_MODES.RESTLESS_DAY),null);
 assert.equal(getModePolicy(GAME_MODES.RESTLESS_DAY).teamSize,5);
 const {room}=match();
 assert.equal(room.players.size,10);
 assert.equal([...room.players.values()].filter(p=>p.team===TEAMS.ATTACKERS).length,5);
 assert.equal([...room.players.values()].filter(p=>p.team===TEAMS.DEFENDERS).length,5);
 assert.equal(room.objectiveState,undefined);
 assert.equal(room.policy.scored,false);
 assert.equal(room.policy.teamSize,5);
});
test('The ladder carries a real walkable slope into both rampart floors',()=>{
 const {room,attacker}=match();
 for(const [wall,zStart,zEnd,height] of [[0,-31,-24,6],[1,14,22,7]]){
  room.restlessDay.phase=wall;
  const l=room.restlessDay.ladders[wall];
  attacker.position={x:l.position.x,y:0,z:zStart};
  const pickup=applyRoomCommand(room,attacker,{type:'siegeOperate'},20+wall*5);
  // First iteration obtains a staging ladder; second may be moved to approach.
  if(pickup.rejected){
    l.state='available';l.position={...attacker.position};
    assert.equal(applyRoomCommand(room,attacker,{type:'siegeOperate'},20+wall*5).rejected,undefined);
  }
  assert.equal(attacker.restlessCarrying,l.id);
  assert.equal(attacker.speedScale,RESTLESS_DAY_RULES.carrySpeed);
  assert.equal(applyRoomCommand(room,attacker,{type:'dash'},21+wall*5).rejected,'Set down the heavy siege ladder first.');
  assert.equal(applyRoomCommand(room,attacker,{type:'siegeOperate'},21+wall*5).rejected,undefined);
  assert.equal(l.state,'deployed');
  let world=withRestlessLadders(room.world,room.restlessDay);
  assert.equal(surfaceHeightAt(l.position.x,zStart,.05,world),0);
  assert.equal(surfaceHeightAt(l.position.x,zEnd,8,world),height);
  let actor={...createMovementState({x:l.position.x,y:0,z:zStart}),speedScale:1,grounded:true};
  const input={forward:1,right:0,yaw:Math.PI,sprint:false,jump:false,crouch:false};
  for(let t=0;t<100;t++)actor=movePlayer(actor,input,1/30,22+t/30,world);
  assert.ok(actor.position.z>zEnd-.5,`walk climbed ${wall} to ${actor.position.z}`);
  assert.ok(actor.position.y>=height-.6,`walk reached wall ${wall} height ${actor.position.y}`);
  // Retrieve on the same side before testing the next wall.
  attacker.position={x:l.position.x,y:0,z:zStart};
  assert.equal(applyRoomCommand(room,attacker,{type:'siegeOperate'},23+wall*5).rejected,undefined);
  assert.equal(l.state,'carrying');
  attacker.restlessCarrying=null;attacker.speedScale=1;l.state='available';l.holderId=null;
 }
});
test('Two broken ladders are never permanent match softlocks',()=>{
 const {room,defender}=match();
 for(const ladder of room.restlessDay.ladders){
  assert.equal(damageRestlessLadder(room,ladder.id,9999,defender.id,25),true);
  assert.equal(ladder.state,'broken');
 }
 restlessnessStep(room,1/30,25+RESTLESS_DAY_RULES.replaceSec+.05);
 assert.ok(room.restlessDay.ladders.every(l=>l.state==='available'));
 assert.ok(room.restlessDay.ladders.every(l=>l.health===RESTLESS_DAY_RULES.ladderHP));
 assert.ok(room.restlessDay.ladders.every(l=>l.replaces===1));
});
test('Destroying the Renowner before sundown ends in immediate defending surrender',()=>{
 const {room,attacker}=match();
 const deadline=room.restlessDay.deadline;
 assert.equal(room.state,'PLAYING');
 assert.equal(damageStructure(room,'rightful-renowner',2000,attacker.id,'sword',deadline-1,{raw:true}),true);
 assert.equal(room.state,'FINISHED');
 assert.equal(room.winnerTeam,TEAMS.ATTACKERS);
 assert.equal(room.finishReason,'renowner-destroyed');
 assert.ok(room.events.some(e=>e.type==='renownerDestroyed'));
});
test('Daylight has no fatigue; exact sundown defeats attackers without overtime',()=>{
 const {room,attacker}=match();
 const deadline=room.restlessDay.deadline;
 const stamina=attacker.guardStamina;
 room.tick(deadline-1e-3);
 assert.equal(room.state,'PLAYING');
 assert.equal(attacker.guardStamina,stamina);
 assert.equal(attacker.restlessAsleep,undefined);
 room.tick(deadline);
 assert.equal(room.state,'FINISHED');
 assert.equal(room.winnerTeam,TEAMS.DEFENDERS);
 assert.equal(room.finishReason,'sundown');
 assert.equal(attacker.restlessAsleep,true);
 assert.equal(room.overtime,false);
 assert.equal(damageStructure(room,'rightful-renowner',2000,attacker.id,'sword',deadline,{raw:true}),false);
});
test('Rematch resets ladders, statue, sun and serialized mode state',()=>{
 const {room,attacker}=match();
 const oldDeadline=room.restlessDay.deadline;
 let snap=serializeSnapshot(room,15,attacker.id);
 assert.equal(snap.modeState.renowner.health,1650);
 assert.equal(snap.modeState.ladders.length,2);
 assert.ok(snap.modeState.daylightRemaining>0);
 assert.equal(snap.teamSize,5);
 room.finish(TEAMS.DEFENDERS,25,'sundown');
 room.startMatch(45);
 assert.equal(room.restlessDay.deadline,45+room.policy.matchSeconds);
 assert.notEqual(room.restlessDay.deadline,oldDeadline);
 assert.ok(room.restlessDay.ladders.every(x=>x.state==='available'));
 assert.equal(room.structures.entities['rightful-renowner'].health,1650);
 snap=serializeSnapshot(room,45,attacker.id);
 assert.equal(snap.modeState.daylightRemaining,room.policy.matchSeconds);
});
