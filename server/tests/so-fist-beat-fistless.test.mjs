import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../../shared/sim/Room.mjs';
import {createSoFistication, soFistEntry, mountSoFistication, primeSoFistSkill,
  damageSoFistication, fireSoFistication} from '../../shared/sim/soFistication.mjs';
import {soFistStriker} from '../../shared/sim/soFistGeometry.mjs';

function setup(){
  const room=new Room('FISTLESS_BEAT',{mode:'PRACTICE'});room.state='PLAYING';
  room.world={solids:[],ramps:[],floors:[{id:'floor',center:[0,-.1,0],size:[100,.2,100],y:0}],spawnPoints:[{x:0,y:0,z:0}]};
  const p=room.addPlayer({id:'operator',token:'operator',name:'Operator',siegeLoadout:{soFist:'beatToThePunch'}},0);
  const b=room.soFistication=createSoFistication({x:0,y:0,z:0,heading:0});
  p.position=soFistEntry(b,room.world);p.spawnProtectionUntil=0;
  assert.equal(mountSoFistication(room,b,p,0),true);
  return {room,p,b};
}

test('Beat to the Punch primes using the exposed piston after armored fist has broken',()=>{
  const {room,p,b}=setup();
  b.components.Fist.health=0;
  assert.equal(soFistStriker(b,1).componentId,'Piston');
  assert.equal(primeSoFistSkill(room,b,p,1),null);
  assert.equal(b.skill.phase,'primed');
  assert.equal(b.skill.id,'beatToThePunch');
  assert.ok(b.components.Drive.health>0);
  assert.equal(fireSoFistication(room,b,2),true,'ordinary piston remains usable');
});

test('breaking the fist does not cancel an already primed counterstroke',()=>{
  const {room,p,b}=setup();
  b.components.Fist.health=1;
  assert.equal(primeSoFistSkill(room,b,p,1),null);
  assert.ok(damageSoFistication(room,b,50,'enemy','sword',1.1,{componentId:'Fist'}));
  assert.equal(b.components.Fist.health,0);
  assert.equal(b.skill.phase,'primed','only a broken drive or loss of operator disarms the priming');
  assert.equal(soFistStriker(b,1.2).componentId,'Piston');
});

test('destroying the drive still prevents priming with or without a fist',()=>{
  const {room,p,b}=setup();
  b.components.Fist.health=0;
  b.components.Drive.health=0;
  assert.match(primeSoFistSkill(room,b,p,1),/drive/i);
  assert.notEqual(b.skill.phase,'primed');
});
