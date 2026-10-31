import test from 'node:test';
import assert from 'node:assert/strict';
import { GameLink } from '../../client/network/GameLink.mjs';
import { RoomManager } from '../../shared/sim/RoomManager.mjs';
import { WORLD_IDS } from '../../shared/worlds/registry.mjs';
import { TEAMS } from '../../shared/src/teams.mjs';
import { applyRoomCommand, serializeSnapshot } from '../../shared/sim/wire.mjs';
import { HIGH_GROUNDS_MACHINES } from '../../shared/sim/highGroundsFoundry.mjs';

// Regression: GameSocket and LocalHost supported this command while GameLink
// omitted its forwarder, so every visible foundry button threw a TypeError.
test('GameLink forwards foundry selection to the *active* local or multiplayer host',()=>{
  const messages=[],makeHost=(label)=>({
    on:()=>()=>{},
    highGroundsBuild:(machine)=>messages.push({label,machine}),
  });
  const local=makeHost('local'),remote=makeHost('remote');
  const link=new GameLink({local,remote});
  assert.equal(typeof link.highGroundsBuild,'function');
  link.hosting='local';
  link.highGroundsBuild('bi-bye-llista');
  link.hosting='remote';
  link.highGroundsBuild('fight-and-flight');
  assert.deepEqual(messages,[{label:'local',machine:'bi-bye-llista'},
    {label:'remote',machine:'fight-and-flight'}]);
});
function setup() {
  const room=new RoomManager().createBreakthroughRoom(0,true,WORLD_IDS.HIGH_GROUNDS);
  const azure=room.addPlayer({id:'azure-builder',token:'a',name:'Builder A'},0);
  const crimson=room.addPlayer({id:'crimson-builder',token:'b',name:'Builder B'},0);
  room.startMatch(0);
  const move=(p)=> {
    const f=room.highGrounds.foundries.find(f=>f.team===p.team);
    p.position={x:f.x,y:f.y,z:f.z};
    return f;
  };
  const foundry=move(azure);
  move(crimson);
  return {room,azure,crimson,foundry,move};
}
for(const type of HIGH_GROUNDS_MACHINES) {
  test(`actual ${type} foundry production creates a networked, usable authoritative machine`,()=>{
    const {room,azure,foundry}=setup();
    const at=1.5,cmd={type:'highGroundsBuild',machine:type};
    const result=applyRoomCommand(room,azure,cmd,at);
    assert.equal(result.rejected,undefined,result.rejected??'');
    const field=type==='bi-bye-llista'?'biByeLlista':type==='so-fist-ication'?'soFistication':'fightFlight';
    const snapKey=type==='bi-bye-llista'?'bibyeBallista':field;
    const machine=room[field],snap=serializeSnapshot(room,at+0.01);
    assert.ok(machine,`missing real ${type} machine`);
    assert.equal(machine.team,azure.team);
    assert.ok(machine.health>0);
    assert.equal(snap[snapKey]?.id,machine.id,'real authoritative snapshot must include the new machine');
    assert.equal(foundry.machineId,machine.id);
    assert.equal(foundry.machine,type);
    assert.equal(foundry.readyAt,at+120,'cooldown starts after successful actual construction');
    assert.equal(snap.highGrounds.foundries.find(f=>f.id===foundry.id).machineId,machine.id);
    assert.ok(room.events.some(e=>e.type==='highGroundsProduced'&&e.machineId===machine.id));
    assert.ok(applyRoomCommand(room,azure,cmd,at+1).rejected,'duplicate machine cannot be built at no cost');
  });
}
test('foundry rejects unauthorized, unreachable and invalid selections without spending production',()=>{
  const {room,azure,crimson,foundry}=setup();
  let result=applyRoomCommand(room,crimson,{type:'highGroundsBuild',machine:'bi-bye-llista'},1);
  assert.equal(result.rejected,undefined,'crimson can use its own foundry');
  const before=foundry.readyAt;
  azure.position={x:0,y:0,z:0};
  result=applyRoomCommand(room,azure,{type:'highGroundsBuild',machine:'fight-and-flight'},2);
  assert.match(result.rejected,/Approach/);
  assert.equal(foundry.readyAt,before);
  azure.position={x:foundry.x,y:foundry.y,z:foundry.z};
  result=applyRoomCommand(room,azure,{type:'highGroundsBuild',machine:'unicorn'},3);
  assert.match(result.rejected,/Unknown/);
  assert.equal(foundry.readyAt,before);
});
test('opposing foundries cannot overwrite the same active singleton machine class',()=>{
  const {room,azure,crimson}=setup();
  const cmd={type:'highGroundsBuild',machine:'fight-and-flight'};
  assert.equal(applyRoomCommand(room,azure,cmd,1).rejected,undefined);
  const existing=room.fightFlight.id;
  const bFoundry=room.highGrounds.foundries.find(f=>f.team===crimson.team);
  const response=applyRoomCommand(room,crimson,cmd,1.1);
  assert.match(response.rejected,/already deployed/);
  assert.equal(room.fightFlight.id,existing);
  assert.equal(bFoundry.readyAt,0,'rejection must not spend the other team cooldown');
});
