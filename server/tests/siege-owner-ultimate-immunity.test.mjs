import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomManager} from '../../shared/sim/RoomManager.mjs';
import {createBiByeLlista,biByeCanDamage,damageBiByeLlista} from '../../shared/sim/biByeLlista.mjs';
import {createSoFistication,damageSoFistication} from '../../shared/sim/soFistication.mjs';
import {createFightFlight} from '../../shared/sim/fightFlight.mjs';
import {damageFightFlight} from '../../shared/sim/fightFlightComponents.mjs';

test('a mounted operator cannot damage their own machine with an Ultimate even in Practice or FFA',()=>{
 for(const mode of ['PRACTICE','FFA']){
  const room=new RoomManager().createSoloRoom('PRACTICE',0,'castleward');
  room.mode=mode;room.state='PLAYING';room.events=[];
  const owner=room.addPlayer({id:'owner',token:'own',name:'Owner'},0);
  const enemy=room.addPlayer({id:'enemy',token:'enemy',name:'Enemy'},0);
  owner.team=null;enemy.team=null;
  const flight=createFightFlight({id:'flight'});
  flight.operatorId=owner.id;
  const fh=flight.health;
  assert.equal(damageFightFlight(room,flight,12,owner.id,'one_hit_of_wonders',3,{componentId:'main'}),false);
  assert.equal(flight.health,fh);
  const ballista=createBiByeLlista({id:'ballista'});
  ballista.operatorId=owner.id;
  const bh=ballista.health;
  assert.equal(biByeCanDamage(room,ballista,owner.id),false);
  assert.equal(damageBiByeLlista(room,ballista,12,owner.id,'one_hit_of_wonders',3),false);
  assert.equal(ballista.health,bh);
  const ram=createSoFistication({id:'ram'});
  ram.operatorId=owner.id;
  const rh=ram.health;
  assert.equal(damageSoFistication(room,ram,12,owner.id,'one_hit_of_wonders',3),false);
  assert.equal(ram.health,rh);
  assert.ok(damageFightFlight(room,flight,12,enemy.id,'one_hit_of_wonders',3,{componentId:'main'}));
  assert.ok(damageBiByeLlista(room,ballista,12,enemy.id,'one_hit_of_wonders',3));
  assert.ok(damageSoFistication(room,ram,12,enemy.id,'one_hit_of_wonders',3));
 }
});
