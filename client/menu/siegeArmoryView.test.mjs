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
