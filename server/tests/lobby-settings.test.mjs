import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import { applyRoomCommand, serializeLobby } from '../../shared/sim/wire.mjs';
const add=(room,id)=>room.addPlayer({id,token:id,name:id},0);
function room(privateRoom=true){const r=new Room('SETUP',{isPrivate:privateRoom});add(r,'host');add(r,'guest');return r;}

test('private host can edit compatible arena, mode, score and clock while guests cannot',()=>{
  const r=room();const host=r.players.get('host'),guest=r.players.get('guest');
  assert.ok(applyRoomCommand(r,guest,{type:'configureRoom',settings:{scoreToWin:23}},1).rejected);
  assert.equal(applyRoomCommand(r,host,{type:'configureRoom',settings:{worldId:'ruined-keep',scoreToWin:23,matchSeconds:270}},1).lobby,true);
  assert.equal(r.worldId,'ruined-keep');assert.equal(r.scoreToWin,23);assert.equal(r.policy.matchSeconds,270);
  assert.equal(serializeLobby(r).matchSeconds,270);
  assert.ok(applyRoomCommand(r,guest,{type:'vote',key:'score',value:5},1.1).rejected,'legacy vote command cannot override the private host');
  assert.ok(applyRoomCommand(r,host,{type:'configureRoom',settings:{scoreToWin:0}},1).rejected);
  assert.equal(r.scoreToWin,23);
  assert.equal(applyRoomCommand(r,host,{type:'configureRoom',settings:{mode:'BREAKTHROUGH',worldId:'outerworks',teamSize:2}},1).lobby,true);
  assert.equal(r.mode,'BREAKTHROUGH');assert.equal(r.worldId,'outerworks');assert.equal(r.players.size,4);
});

test('custom public votes use actual typed choices and apply at the next match',()=>{
  const r=room(false);
  assert.equal(r.vote('host','score',23),true);assert.equal(r.vote('guest','time',270),true);
  assert.equal(r.vote('host','score',1.1),false);assert.equal(r.vote('host','time',Infinity),false);
  assert.equal(r.tallyVotes().score.counts[23],1);
  r.startMatch(5);assert.equal(r.scoreToWin,23);assert.equal(r.policy.matchSeconds,270);
});

test('bots keep human seats open and host can swap real team positions',()=>{
  const r=room(),host=r.players.get('host');
  applyRoomCommand(r,host,{type:'configureRoom',settings:{mode:'BREAKTHROUGH',teamSize:2}},1);
  assert.equal(r.mode,'BREAKTHROUGH');
  add(r,'third');add(r,'fourth');assert.equal(r.players.size,4);
  assert.equal([...r.players.values()].filter(p=>p.actorKind==='bot').length,0);
  const opposite=[...r.players.values()].find(p=>p.team!==host.team),before=host.team;
  assert.equal(applyRoomCommand(r,host,{type:'swapPlayers',firstId:host.id,secondId:opposite.id},2).lobby,true);
  assert.notEqual(host.team,before);assert.equal(opposite.team,before);
  const swapped=host.team;
  assert.equal(applyRoomCommand(r,host,{type:'configureRoom',settings:{matchSeconds:420}},2.1).lobby,true);
  assert.equal(host.team,swapped,'editing the clock preserves the host team assignment');
  assert.equal(opposite.team,before);
  assert.ok(applyRoomCommand(r,opposite,{type:'swapPlayers',firstId:host.id,secondId:opposite.id},2).rejected);
  assert.throws(()=>add(r,'fifth'),/full/);
  r.removePlayer('host',3);assert.equal(r.hostId(),'guest');
  assert.equal(applyRoomCommand(r,r.players.get('guest'),{type:'configureRoom',settings:{matchSeconds:420}},4).lobby,true);
});

test('configuration refuses busy rooms and capacity reductions atomically',()=>{
  const r=room();for(let i=0;i<5;i++)add(r,'extra'+i);
  const h=r.players.get('host');
  assert.ok(applyRoomCommand(r,h,{type:'configureRoom',settings:{mode:'BREAKTHROUGH',teamSize:3}},1).rejected);
  assert.equal(r.mode,'FFA');assert.equal(r.players.size,7);
  r.startMatch(2);
  assert.ok(applyRoomCommand(r,h,{type:'configureRoom',settings:{scoreToWin:20}},3).rejected);
  assert.equal(r.scoreToWin,10);
});

test('reconnecting to a waiting team room does not start it without readiness',()=>{
  const r=room(),host=r.players.get('host');
  applyRoomCommand(r,host,{type:'configureRoom',settings:{mode:'BREAKTHROUGH'}},1);
  r.disconnectPlayer('host',2);r.reconnectPlayer('host',3);
  assert.equal(r.state,'WAITING');assert.equal(r.players.get('guest').lobbyReady,false);
});
