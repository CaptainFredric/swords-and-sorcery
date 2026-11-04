import test from 'node:test';
import assert from 'node:assert/strict';
import {FLIGHT_REPEATER,flightRepeaterAim,flightRepeaterPitchLimits,flightMuzzle,flightDirection} from './flightRepeaterAim.mjs';

const D=Math.PI/180;
const m=(runPitch=0)=>({x:0,y:35,z:0,heading:0,runPitch,offensiveRun:runPitch!==0});
function rayMiss(origin,unit,target){
  const d={x:target.x-origin.x,y:target.y-origin.y,z:target.z-origin.z};
  const along=d.x*unit.x+d.y*unit.y+d.z*unit.z;
  return Math.hypot(d.x-along*unit.x,d.y-along*unit.y,d.z-along*unit.z);
}
test('Level-flight bolter retains its authentic 65-degree stops',()=>{
  const machine=m(0),limits=flightRepeaterPitchLimits(machine);
  assert.equal(limits.maxPitch,FLIGHT_REPEATER.maxPitch);
  assert.equal(limits.minPitch,FLIGHT_REPEATER.minPitch);
  assert.equal(flightRepeaterAim(machine,{yaw:0,pitch:90*D}).pitch,limits.maxPitch);
});
test('Actual Dash pitch counter-rotates the bolter to keep bolts on the reticle',()=>{
  const machine=m(90*D);
  const limits=flightRepeaterPitchLimits(machine);
  assert.ok(limits.maxPitch>150*D,'deep rotor dive needs >90 degrees of true bolter articulation');
  for(const look of [-55*D,-25*D,0,30*D,55*D]){
    const aim=flightRepeaterAim(machine,{yaw:0,pitch:look});
    const v=flightDirection(machine,aim);
    const realPitch=Math.atan2(v.y,Math.hypot(v.x,v.z));
    assert.ok(Math.abs(realPitch-look)<1e-8,
      'muzzle trajectory must match camera pitch '+look/D+'deg; got '+realPitch/D+'deg');
    assert.ok(Math.abs(Math.hypot(v.x,v.y,v.z)-1)<1e-10);
  }
});
test('A physical dash muzzle converges on a distant crosshair ray, without a homing bolt',()=>{
  const machine=m(89*D),look=20*D;
  const target={x:0,y:machine.y+1.55+Math.sin(look)*40,z:-Math.cos(look)*40};
  const aim=flightRepeaterAim(machine,{siegeTarget:target});
  const muzzle=flightMuzzle(machine,aim),unit=flightDirection(machine,aim);
  assert.ok(!aim.limited,'a forward, visible reticle point should remain physically reachable');
  assert.ok(rayMiss(muzzle,unit,target)<.01,'actual muzzle trajectory should hit within 1cm');
});
test('Negative chassis pitch counter-stabilizes downward look during ascent',()=>{
  const machine=m(-35*D),look=-45*D;
  const aim=flightRepeaterAim(machine,{yaw:0,pitch:look});
  const u=flightDirection(machine,aim);
  assert.ok(Math.abs(Math.atan2(u.y,Math.hypot(u.x,u.z))-look)<1e-8);
  assert.ok(flightRepeaterPitchLimits(machine).minPitch<FLIGHT_REPEATER.minPitch);
});
