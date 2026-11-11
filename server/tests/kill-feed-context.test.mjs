import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomManager} from '../../shared/sim/RoomManager.mjs';
import {createFightFlight} from '../../shared/sim/fightFlight.mjs';
import {applyDamage,killPlayer} from '../../shared/sim/combat.mjs';

function setup(){
 const room=new RoomManager().createSoloRoom('PRACTICE',0,'castleward');
 room.state='PLAYING';room.world={floors:[],solids:[],ramps:[]};
 const attacker=room.addPlayer({id:'A',name:'Aden',token:'a'},0);
 const victim=room.addPlayer({id:'B',name:'Enemy',token:'b'},0);
 for(const p of [attacker,victim]){p.alive=true;p.spawnProtectionUntil=0;}
 attacker.prowess=100;
 return {room,attacker,victim};
}
test('the server, not snapshot guesses, marks a genuine Chivalry finishing blow',()=>{
 const s=setup();s.attacker.ultimate='chivalry';
 s.attacker.ultimateState={id:'chivalry',phase:'active',until:20};
 assert.equal(killPlayer(s.room,s.victim.id,s.attacker.id,'sword',2),true);
 const death=s.room.events.find(e=>e.type==='death'&&e.victimId===s.victim.id);
 assert.equal(death.killContext,'chivalry');
});
test('Sunder and ordinary steel Dash retain distinct finishing causes',()=>{
 const s=setup();s.attacker.ultimate='sunder';
 s.attacker.ultimateState={id:'sunder',phase:'active',until:20};
 killPlayer(s.room,s.victim.id,s.attacker.id,'sword',2);
 assert.equal(s.room.events.find(e=>e.type==='death')?.killContext,'sunder');
 const r=setup();
 killPlayer(r.room,r.victim.id,r.attacker.id,'ram',2);
 const death=r.room.events.find(e=>e.type==='death');
 assert.equal(death.source,'ram');
 assert.equal(death.killContext,undefined,'ordinary dash does not masquerade as Chivalry');
});
test('the actual active Fight-and-Flight rotor Dash is tagged, but passive blade contact is not',()=>{
 for(const running of [true,false]){
  const s=setup(),m=createFightFlight({id:'f'});
  m.operatorId=s.attacker.id;m.offensiveRun=running;
  s.room.fightFlight=m;s.attacker.operatingFightFlightId=m.id;
  killPlayer(s.room,s.victim.id,s.attacker.id,'fight-flight-rotor',3);
  const death=s.room.events.find(e=>e.type==='death');
  assert.equal(death.killContext,running?'rotorDash':undefined);
 }
});
test('Coreflagration finish distinguishes first and second blasts through damage, not UI guesswork',()=>{
 for(const phase of ['coreflagration-first','coreflagration-final']){
  const s=setup();s.victim.health=5;
  assert.equal(applyDamage(s.room,s.attacker.id,s.victim.id,15,'coreflagration',2,null,
    {killVariant:phase}),true);
  const death=s.room.events.find(e=>e.type==='death');
  assert.equal(death.source,'coreflagration');
  assert.equal(death.killContext,phase);
 }
});
