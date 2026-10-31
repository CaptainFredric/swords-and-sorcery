import test from 'node:test';
import assert from 'node:assert/strict';
import {FlightDashPresentation,flightDashEnvelope,FLIGHT_DASH_VIEW} from './flightDashPresentation.mjs';
const machine=(p={})=>({id:'flight-1',operatorId:'pilot',health:250,rotorHP:100,offensiveRun:false,...p});
const tick=(v,m,dt=1/60,motion=1)=>v.update(dt,m,{eligible:true,cameraMotion:motion});
test('real offensive run causes one short smooth pullback and FOV widening, never continuous zoom',()=>{
  const v=new FlightDashPresentation(),m=machine({offensiveRun:true});
  let starts=0,peak=0,close=0;
  for(let i=0;i<150;i++){const f=tick(v,m);starts+=Number(f.started);peak=Math.max(peak,f.fov);if(i===149)close=f.fov;}
  assert.equal(starts,1);assert.ok(peak>6.9&&peak<=FLIGHT_DASH_VIEW.fovDegrees);
  assert.equal(close,0,'a held long Dash does not hold a perpetual zoom');
  assert.ok(FLIGHT_DASH_VIEW.duration<1);
});
test('release, collision interruption or terminal dive cancels the pulse quickly',()=>{
 const v=new FlightDashPresentation(),m=machine({offensiveRun:true});
 for(let i=0;i<11;i++)tick(v,m);
 const before=v.strength;assert.ok(before>.6);
 m.offensiveRun=false;
 for(let i=0;i<18;i++)tick(v,m);
 assert.ok(v.strength<before*.12);
 assert.equal(tick(v,m).started,false);
 m.offensiveRun=true;assert.equal(tick(v,m).started,true);
 m.terminalDive={};assert.deepEqual(tick(v,m),{started:false,strength:0,fov:0,pullback:0});
});
test('never triggers for unmounted spectators, dead pilots, destroyed rotors, or a new operator',()=>{
 const v=new FlightDashPresentation(),m=machine({offensiveRun:true});
 assert.equal(v.update(.03,m,{eligible:false}).fov,0);
 assert.equal(tick(v,m).started,true);
 m.operatorId=null;assert.equal(tick(v,m).fov,0);
 m.operatorId='pilot';m.rotorHP=0;assert.equal(tick(v,m).fov,0);
 m.rotorHP=100;m.health=0;assert.equal(tick(v,m).fov,0);
 m.health=250;assert.equal(tick(v,m).started,true);
 m.id='flight-2';assert.equal(tick(v,m).started,true);
});
test('reduced-motion setting can turn zoom entirely off without disabling authoritative Dash or timing',()=>{
 const v=new FlightDashPresentation(),m=machine({offensiveRun:true});
 const s=tick(v,m,.1,0);assert.equal(s.started,true);assert.equal(s.fov,0);assert.equal(s.pullback,0);
 const next=tick(v,m,.1,.5);assert.ok(next.fov>0&&next.fov<=FLIGHT_DASH_VIEW.fovDegrees/2);
});
test('pulse never depends on client-supplied camera time or JS wall clock',()=>{
 assert.equal(flightDashEnvelope(-1),0);assert.equal(flightDashEnvelope(Infinity),0);
 assert.ok(flightDashEnvelope(.12)>=.99);assert.equal(flightDashEnvelope(1),0);
 const a=new FlightDashPresentation(),b=new FlightDashPresentation(),m=machine({offensiveRun:true});
 for(let i=0;i<32;i++)assert.deepEqual(tick(a,m),tick(b,m));
});
