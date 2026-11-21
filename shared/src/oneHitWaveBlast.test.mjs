import test from 'node:test';
import assert from 'node:assert/strict';
import {ONE_HIT_REACH,ONE_HIT_FIELD,fieldContact,fieldSeconds,airFieldSeconds,
  groundFootprintRadius,directionalBlastRadius,terminalBlastContains} from './oneHitStatus.mjs';

const close=(actual,expected,tol=1e-9)=>
  assert.ok(Math.abs(actual-expected)<tol,`${actual} != ${expected}`);

test('terminal Gale pressure fans forward in the wave heading, keeping side and rear reach',()=>{
 for(const radius of [2.2,3.4]){
  const origin={x:0,y:0,z:0},east={x:1,y:0,z:0};
  close(directionalBlastRadius(radius,east,1,0,0),radius*(1+ONE_HIT_REACH.frontExtension));
  close(directionalBlastRadius(radius,east,0,0,-1),radius);
  close(directionalBlastRadius(radius,east,-1,0,0),radius);
  close(directionalBlastRadius(radius,east,1,0,-1),radius*1.16);
  assert.ok(terminalBlastContains(origin,{x:radius*1.22,y:0,z:0},radius,null,east,true));
  assert.ok(!terminalBlastContains(origin,{x:-radius*1.22,y:0,z:0},radius,null,east,true));
  assert.ok(!terminalBlastContains(origin,{x:0,y:0,z:radius*1.22},radius,null,east,true));
  // Ground endpoint has the same fan, but remains 3D for elevation.
  close(groundFootprintRadius(radius,-Math.PI/2,1,0),radius*1.32);
  assert.ok(terminalBlastContains(origin,{x:radius*1.22,y:0,z:0},radius,
    -Math.PI/2,east,false));
 }
});

test('vertical Gale flight aims its 3D midair blast upward, never toward an arbitrary compass heading',()=>{
 const r=2.2,up={x:0,y:1,z:0},origin={x:0,y:10,z:0};
 close(directionalBlastRadius(r,up,0,1,0),r*1.32);
 close(directionalBlastRadius(r,up,1,0,0),r);
 close(directionalBlastRadius(r,up,0,-1,0),r);
 assert.ok(terminalBlastContains(origin,{x:0,y:12.7,z:0},r,null,up,true));
 assert.ok(!terminalBlastContains(origin,{x:0,y:7.3,z:0},r,null,up,true));
});

test('airborne fields use chest-height 3D contact and expire much sooner than grounded fields',()=>{
 const position={x:0,y:8,z:0},direction={x:0,y:0,z:-1},radius=2.2;
 const field={position,radius,air:true,direction};
 assert.ok(fieldContact(field,{x:0,y:8,z:-2.45})>.4);
 assert.equal(fieldContact(field,{x:0,y:8,z:2.45}),0);
 assert.equal(fieldContact(field,{x:0,y:11,z:0}),0);
 assert.ok(airFieldSeconds({})>=1&&airFieldSeconds({})<2);
 assert.ok(airFieldSeconds({fire:2,frost:2,gale:2,lightning:2,steel:2})<2);
 assert.ok(airFieldSeconds({fire:2})<fieldSeconds({fire:2}));
 assert.equal(ONE_HIT_FIELD.vertical,1.25,'existing grounded vertical cutoff unchanged');
});
