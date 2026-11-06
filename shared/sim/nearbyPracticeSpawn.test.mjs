import test from 'node:test';
import assert from 'node:assert/strict';
import { nearbyPracticeSpawn } from './nearbyPracticeSpawn.mjs';

function room(floors = [{center:[0,-.5,0],size:[30,1,30],y:0}], solids=[]) {
  const human={id:'human',actorKind:'human',alive:true,position:{x:0,y:0,z:0},yaw:0};
  return {world:{floors,solids,ramps:[]},players:new Map([['human',human]]),biByeLlista:null,soFistication:null,fightFlight:null};
}
test('summons three meters in front of the requesting Spellblade when safe',()=>{
  const pos=nearbyPracticeSpawn(room(),'human');
  assert(pos);assert(Math.abs(pos.x)<.01);assert(Math.abs(pos.z+3)<.01);
});
test('rejects occupied and blocked positions and searches alternative candidates',()=>{
  const r=room();
  r.players.set('other',{id:'other',alive:true,position:{x:0,y:0,z:-3}});
  const pos=nearbyPracticeSpawn(r,'human');
  assert(pos);assert(Math.hypot(pos.x,pos.z)>=2);assert(Math.hypot(pos.x,pos.z+3)>1.15);
});
test('never summons over a void or through a solid barrier',()=>{
  const r=room([{center:[0,-.5,0],size:[1.2,1,1.2],y:0}]);
  assert.equal(nearbyPracticeSpawn(r,'human'),null);
  const w=room();w.world.solids=[{center:[0,.9,-3],size:[3,2,3]}];
  const pos=nearbyPracticeSpawn(w,'human');
  assert(pos);assert(Math.hypot(pos.x,pos.z+3)>0.5);
});
test('uses the initiating human even when inspecting a dummy and ignores the dummy being moved',()=>{
  const r=room();r.players.set('dummy',{id:'dummy',actorKind:'dummy',alive:true,position:{x:0,y:0,z:-3},yaw:1});
  const pos=nearbyPracticeSpawn(r,'human','dummy');
  assert.equal(pos.z,-3);
});
