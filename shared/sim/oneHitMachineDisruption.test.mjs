import test from 'node:test';
import assert from 'node:assert/strict';
import {siegeDisasterImpairment} from './oneHitMachineDisruption.mjs';

test('machines retain mobility but suffer weaker short-lived elemental disruption',()=>{
 const machine={disasterAffliction:{at:9,until:10.3,frost:.2,gale:.25,lightning:.2}};
 const fresh=siegeDisasterImpairment(machine,9);
 assert.ok(fresh.speed>=.65&&fresh.speed<1);
 assert.ok(fresh.steering>=.7&&fresh.steering<1);
 const recovering=siegeDisasterImpairment(machine,9.65);
 assert.ok(recovering.speed>fresh.speed);
 assert.ok(recovering.steering>fresh.steering);
 assert.deepEqual(siegeDisasterImpairment(machine,10.31),{speed:1,steering:1});
});

test('missing or expired machine afflictions do not disrupt movement',()=>{
 assert.deepEqual(siegeDisasterImpairment(null,10),{speed:1,steering:1});
 assert.deepEqual(siegeDisasterImpairment({},10),{speed:1,steering:1});
 assert.deepEqual(siegeDisasterImpairment({disasterAffliction:{at:5,until:8}},9),
  {speed:1,steering:1});
});
