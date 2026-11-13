import test from 'node:test';
import assert from 'node:assert/strict';
import {flightMountReach,ramMountReach,ballistaMountReach} from './siegeMountReach.mjs';

test('Fight-and-Flight reach is the same 3.2m horizontal and 1.8m vertical window on all maps',()=>{
 const flight={x:0,y:0,z:0};
 assert.equal(flightMountReach({position:{x:3.1,y:0,z:0}},flight),true,
   'the mobile button must not disappear at the server-legal 3.1m approach');
 assert.equal(flightMountReach({position:{x:3.21,y:0,z:0}},flight),false);
 assert.equal(flightMountReach({position:{x:2,y:1.79,z:0}},flight),true);
 assert.equal(flightMountReach({position:{x:2,y:12,z:0}},flight),false,
   'a castle bridge 12m overhead does not make the ground cockpit mountable');
 assert.equal(flightMountReach({position:{x:2,y:-9,z:0}},flight),false);
});

test('ram mounts from its real center, entry or saddle, with vertical access required',()=>{
 const ram={x:0,y:0,z:0};
 const entry={x:0,y:0,z:3};
 const seat={x:0,y:1,z:-.4};
 assert.equal(ramMountReach({position:{x:0,y:0,z:3.1}},ram,entry,seat),true);
 assert.equal(ramMountReach({position:{x:3.6,y:1,z:0}},ram,entry,seat),true);
 assert.equal(ramMountReach({position:{x:0,y:12,z:0}},ram,entry,seat),false);
 assert.equal(ramMountReach({position:{x:5,y:1,z:5}},ram,entry,seat),false);
});

test('ballista uses the actual 3.2m interaction radius and matching ground level',()=>{
 const ballista={x:0,y:0,z:0,interactRadius:3.2};
 assert.equal(ballistaMountReach({position:{x:3.1,y:0,z:0}},ballista),true);
 assert.equal(ballistaMountReach({position:{x:3.21,y:0,z:0}},ballista),false);
 assert.equal(ballistaMountReach({position:{x:1,y:12,z:0}},ballista),false);
});
