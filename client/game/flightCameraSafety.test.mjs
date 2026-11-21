import test from 'node:test';
import assert from 'node:assert/strict';
import {stableFlightCockpitEye,flightReticleOrigin,finiteFlightLook,FLIGHT_VISOR} from './flightCameraSafety.mjs';
import {flightRepeaterAim,flightMuzzle,flightDirection} from '../../shared/src/flightRepeaterAim.mjs';

const m=(pitch=0,height=0,heading=0)=>({
  id:'flight-1',x:1,y:height,z:2,heading,runPitch:pitch,
});
test('a real 90° Valkyrie rotor cannot move the visor underground',()=>{
  const machine=m(Math.PI/2);
  // The actual authored node after Rx(90°): y=-0.215, forward z=1.555.
  const transformed={x:1,y:-.215,z:2-1.555};
  assert.ok(transformed.y<0,'the real model would place the camera below turf');
  const safe=stableFlightCockpitEye(machine,transformed,0);
  assert.ok(safe.y>=FLIGHT_VISOR.height-.001,'stable head survives the actual pitching mesh');
  assert.ok(safe.y>0,'grounded Dash does not yield a black underground view');
  assert.ok([safe.x,safe.y,safe.z].every(Number.isFinite));
});
test('unpitched cockpit retains its authored camera transform until steep rotor pitch',()=>{
  const machine=m(0,9);
  const eye={x:1.02,y:10.56,z:1.78};
  assert.deepEqual(stableFlightCockpitEye(machine,eye),eye);
  machine.runPitch=.25;
  const slight=stableFlightCockpitEye(machine,eye);
  assert.ok(Math.abs(slight.x-eye.x)<.04,'avoid abrupt camera snap as rotor begins to pitch');
  machine.runPitch=Math.PI/2;
  const vertical=stableFlightCockpitEye(machine,eye);
  assert.ok(vertical.y>10.5);
});
test('100 repeated dash / release cycles never leak pitch, camera position, or fallback state',()=>{
  const machine=m(0,0,.72);
  for(let i=0;i<100;i++){
    const pitch=i%2?Math.PI/2:0;
    machine.runPitch=pitch;
    // With an authored pitched marker, y is below turf at full attack.
    const raw={x:machine.x,y:machine.y+1.555*Math.cos(pitch)-.215*Math.sin(pitch),
      z:machine.z-1.555*Math.sin(pitch)-.215*Math.cos(pitch)};
    const eye=stableFlightCockpitEye(machine,raw,0);
    assert.ok(eye.y>=1.12,'cycle '+i+' lost head clearance');
    assert.ok([eye.x,eye.y,eye.z].every(Number.isFinite));
    assert.ok(Math.hypot(eye.x-machine.x,eye.z-machine.z)<1,'camera must not teleport in front of rotor');
  }
});
test('GLB not loaded, invalid/missing snapshots or nonfinite eye never poison the camera',()=>{
 const cases=[
  {machine:m(Math.PI/2,0),eye:null},
  {machine:m(Math.PI/2,0),eye:{x:NaN,y:-Infinity,z:0}},
  {machine:{x:NaN,y:NaN,z:Infinity,heading:NaN,runPitch:Infinity},eye:null},
 ];
 for(const {machine,eye}of cases){
   const result=stableFlightCockpitEye(machine,eye,0);
   assert.ok([result.x,result.y,result.z].every(Number.isFinite));
 }
 assert.deepEqual(finiteFlightLook(NaN,Infinity,1),{yaw:1,pitch:0});
 assert.deepEqual(finiteFlightLook(-2,12),{yaw:-2,pitch:1.45});
 assert.deepEqual(finiteFlightLook(2,-12),{yaw:2,pitch:-1.45});
});

test('hard reversing cannot pull the authored cockpit eye inside the steel carriage',()=>{
 const machine=m(0,5,.4);
 const stable=stableFlightCockpitEye(machine,null);
 const backwards={x:stable.x+.55,y:stable.y-.24,z:stable.z-.95};
 const eye=stableFlightCockpitEye(machine,backwards,0);
 assert.ok(Math.hypot(eye.x-stable.x,eye.y-stable.y,eye.z-stable.z)<=FLIGHT_VISOR.maxAuthoredEyeTravel+1e-6,
   'carriage-animation displacement is bounded to small cockpit motion');
 assert.ok(eye.y>machine.y+1.1,'the eye never descends into the steel bracing');
 assert.notDeepEqual(eye,stable,'authored tiny motion is retained, not disabled');
 for(const heading of [0,Math.PI/2,Math.PI,-Math.PI/2]){
   machine.heading=heading;
   const moving={x:machine.x-.7,y:machine.y+.7,z:machine.z+.9};
   const point=stableFlightCockpitEye(machine,moving);
   const centered=stableFlightCockpitEye(machine,null);
   assert.ok(Math.hypot(point.x-centered.x,point.y-centered.y,point.z-centered.z)<=.101);
 }
});
test('reticle convergence uses the latest Flight machine eye, not last frame on a reversal',()=>{
 const before=m(0,4,0),after=m(0,4,0);
 const oldEye=stableFlightCockpitEye(before,null);
 after.x+=.8;after.z-=.5;
 const origin=flightReticleOrigin(after,oldEye,{sight:true,thirdBlend:0});
 const current=stableFlightCockpitEye(after,null);
 assert.deepEqual(origin,current,'the server-directed shot follows the current machine');
 assert.notDeepEqual(origin,oldEye);
 assert.equal(flightReticleOrigin(after,oldEye,{sight:false}),oldEye,
   'third-person boom stays at its collision-clipped camera');
 assert.equal(flightReticleOrigin(after,oldEye,{sight:true,thirdBlend:.5}),oldEye,
   'a returning Dash boom retains the actual transitional camera');
});

test('bolts physically converge on current crosshair targets across a moving Flight carriage',()=>{
 const machine=m(0,6,.34);
 for(const [x,z] of [[0,0],[.7,-.35],[-.9,.45]]){
   machine.x=x;machine.z=z;
   const oldEye={x:x-.9,y:7.555,z:z+.8};
   const origin=flightReticleOrigin(machine,oldEye,{sight:true,thirdBlend:0});
   const yaw=machine.heading,pitch=.02;
   const fwd={x:-Math.sin(yaw)*Math.cos(pitch),y:Math.sin(pitch),
     z:-Math.cos(yaw)*Math.cos(pitch)};
   for(const range of [4,12,40]){
     const target={x:origin.x+fwd.x*range,y:origin.y+fwd.y*range,z:origin.z+fwd.z*range};
     const solved=flightRepeaterAim(machine,{yaw,pitch,siegeTarget:target});
     const muzzle=flightMuzzle(machine,solved),dir=flightDirection(machine,solved);
     const delta={x:target.x-muzzle.x,y:target.y-muzzle.y,z:target.z-muzzle.z};
     const forward=delta.x*dir.x+delta.y*dir.y+delta.z*dir.z;
     const miss=Math.hypot(delta.x-forward*dir.x,delta.y-forward*dir.y,delta.z-forward*dir.z);
     assert.ok(miss<.012,'real bolt must cross reticle at '+range+'m, miss '+miss);
   }
 }
});
