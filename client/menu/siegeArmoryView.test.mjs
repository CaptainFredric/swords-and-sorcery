import test from 'node:test';
import assert from 'node:assert/strict';
import {siegeArmoryView} from './siegeArmoryView.mjs';

test('Each machine has compact preview and expandable Story of Siege without cutting the authored full Flight description',()=>{
 const machines=siegeArmoryView();
 assert.equal(machines.length,3);
 for(const machine of machines) {
   assert.ok(machine.preview.length>25);
   assert.ok(machine.preview.length<150);
   assert.ok(machine.line.length>=machine.preview.length);
   assert.ok(machine.facts.length>12);
 }
 const flight=machines.find(m=>m.id==='fightFlight');
 assert.match(flight.line,/Why choose to Fight or Flee/);
 assert.match(flight.line,/It is simply doom/);
 assert.match(flight.line,/nigh-unreachable/);
});

test('creator-era siege stories are restored verbatim in Armory and Practice source',()=>{
 const [ballista,ram]=siegeArmoryView();
 assert.equal(ballista.preview,
  'A marvel of combative engineering: compact, brutal, and devoted to destruction, much like the denizens who created it.');
 assert.equal(ballista.line,ballista.preview+'\n\nThe first shot lowers the target\'s defense.');
 assert.equal(ram.preview,
  'This hulking, unsubtle contraption has the strength of a stubborn Spellblade and the durability of many more.');
 assert.equal(ram.line,
  ram.preview+' The sword is mightier than the pen, but siege engineers have devised a more sophisticated form of persuasion: an armored fist, delivered at a speed that cannot be ignored.\n\nWill not leave a scratch.');
});

test('All Siege Skills provide compact distinctive summaries while retaining full mechanical details',()=>{
 const machines=siegeArmoryView();
 const ram=machines.find(m=>m.id==='soFist');
 const byId=Object.fromEntries(ram.skills.map(s=>[s.id,s]));
 assert.equal(byId.longArmToTheJaw.summary,'Launch your fist at distant foes and retrieve it. Deliver one last aimed punch upon destruction.');
 assert.equal(byId.hellpingHand.summary,'Unfold your fist to crush foes, carry allies or vault by pushing off the ground.');
 assert.equal(byId.beatToThePunch.summary,'Overload your engine to charge backwards and punch approaching foes automatically. Damage or instability may trigger the punch prematurely.');
 for(const m of machines){
  for(const s of m.skills){
   assert.ok(s.summary&&s.summary.length>25&&s.summary.length<150,s.id);
   assert.ok(s.line&&s.line.length>=s.summary.length,s.id);
  }
 }
});
