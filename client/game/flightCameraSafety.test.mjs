import test from 'node:test';
import assert from 'node:assert/strict';
import {stableFlightCockpitEye,finiteFlightLook,FLIGHT_VISOR} from './flightCameraSafety.mjs';

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
