import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectionViews, flyStep, inspectionSpawn } from './inspectionCamera.mjs';

test('free flight uses wall delta with bounded speed, full look direction and no terrain attachment',()=>{
 const p={position:{x:0,y:12,z:0},yaw:0,pitch:0};
 const forward=flyStep(p,{forward:1},.05);
 assert(Math.abs(forward.position.z+.4)<1e-9);
 const up=flyStep(p,{jump:true},.05);assert(up.position.y>12);
 const down=flyStep(p,{crouch:true},.05);assert(down.position.y<12);
 const lookingUp=flyStep({...p,pitch:Math.PI/4},{forward:1},.05);assert(lookingUp.position.y>12);
 const fast=flyStep(p,{forward:1,sprint:true},.05);assert(fast.position.z<forward.position.z*2);
 assert.deepEqual(flyStep(p,{forward:1},30),forward,'background stalls cannot teleport the camera');
 const diagonal=flyStep(p,{forward:1,right:1,jump:true},.05);
 assert(Math.abs(Math.hypot(diagonal.position.x,diagonal.position.y-12,diagonal.position.z)-.4)<1e-9);
 assert.deepEqual(p.position,{x:0,y:12,z:0},'source actor never moves');
 assert(Number.isFinite(inspectionSpawn({position:{x:4,y:0,z:2},yaw:1}).position.x));
});

test('two views cover the canvas once, preserve aspect and select just one control pane',()=>{
 for(const [w,h] of [[1440,810],[844,390],[390,844]]){
  for(const focus of ['actor','fly']){
   const v=inspectionViews(w,h,true,focus);
   assert.equal(v.length,2);assert.equal(v.reduce((n,r)=>n+r.width*r.height,0),w*h);
   assert.equal(v.filter(r=>r.controlled).length,1);
   assert.equal(v.find(r=>r.controlled).kind,focus);
   assert(v.every(r=>r.width>0&&r.height>0&&r.x+r.width<=w&&r.y+r.height<=h));
  }
  assert.equal(inspectionViews(w,h,false,'fly')[0].width,w);
 }
});
