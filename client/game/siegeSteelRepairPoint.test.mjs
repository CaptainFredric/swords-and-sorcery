import test from 'node:test';
import assert from 'node:assert/strict';
import {siegeSteelRepairPoint} from './siegeSteelRepairPoint.mjs';

test('a real Bi-Bye hull repair without a renderer locator has visible VFX location',()=>{
 const b={id:'ballista',x:3,y:1,z:-2,health:500};
 assert.deepEqual(siegeSteelRepairPoint({type:'siegeSteelRepair',componentId:'hull',amount:11},b,null),
   {x:3,y:1.9,z:-2});
});
test('component repair favors actual part locator and never resurrects a destroyed machine',()=>{
 const b={x:0,y:0,z:0,health:300};
 const component={x:2,y:1,z:4};
 assert.deepEqual(siegeSteelRepairPoint({componentId:'Wheel_FL',amount:3},b,component),component);
 assert.deepEqual(siegeSteelRepairPoint({point:{x:1,y:2,z:3},componentId:'hull'},b),{x:1,y:2,z:3});
 assert.equal(siegeSteelRepairPoint({componentId:'hull'}, {...b,health:0}),null);
 assert.equal(siegeSteelRepairPoint({componentId:'hull'}, null),null);
});
