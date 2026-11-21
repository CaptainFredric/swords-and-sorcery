import test from 'node:test';
import assert from 'node:assert/strict';
import {groundFootprintRadius,groundFootprintContains,groundFootprintWarp,
  fieldContact,ONE_HIT_REACH} from './oneHitStatus.mjs';

const close=(a,b,tolerance=1e-9)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
test('Disaster preserves its full circular sides and rear while extending a broad smooth frontal arc',()=>{
 for(const radius of [ONE_HIT_REACH.radius,ONE_HIT_REACH.fire.radius]){
  // yaw 0 faces -Z. Diagonal reaches farther than the original circle,
  // but less than the forward centerline; no cone or sudden cutoff.
  close(groundFootprintRadius(radius,0,0,-1),radius*1.32);
  close(groundFootprintRadius(radius,0,1,0),radius);
  close(groundFootprintRadius(radius,0,0,1),radius);
  close(groundFootprintRadius(radius,0,1,-1),radius*1.16);
  close(groundFootprintRadius(radius,Math.PI/2,-1,0),radius*1.32);
  const origin={x:0,y:0,z:0};
  assert.equal(groundFootprintContains(origin,{x:0,z:-radius*1.25},radius,0),true);
  assert.equal(groundFootprintContains(origin,{x:0,z:radius*1.25},radius,0),false);
  assert.equal(groundFootprintContains(origin,{x:radius*.96,z:0},radius,0),true);
  assert.equal(groundFootprintContains(origin,{x:radius*1.02,z:0},radius,0),false);
  close(groundFootprintRadius(radius,null,0,-1),radius,'aerial waves stay round');
 }
});

test('fields, fire and visible polygon use a single directional rim, not different hitboxes',()=>{
 const radius=3.4,origin={x:1,y:0,z:2},yaw=0;
 const forward={x:1,y:0,z:2-4.1},rear={x:1,y:0,z:2+4.1};
 const field={position:origin,radius,yaw};
 assert.ok(fieldContact(field,forward)>.9,'forward field has genuine status reach');
 assert.equal(fieldContact(field,rear),0);
 const p=groundFootprintWarp(0,-radius,radius,yaw);
 close(p.z,-radius*1.32);
 close(groundFootprintWarp(0,radius,radius,yaw).z,radius);
 close(groundFootprintWarp(radius,0,radius,yaw).x,radius);
 const afterTurn={...field,yaw:Math.PI};
 assert.equal(fieldContact(afterTurn,forward),0,'only a NEW slam changes its locked facing');
});
