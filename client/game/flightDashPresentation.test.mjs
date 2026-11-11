import test from 'node:test';
import assert from 'node:assert/strict';
import {FlightDashPresentation,flightDashEnvelope,flightDashChasePose,FLIGHT_DASH_VIEW} from './flightDashPresentation.mjs';
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
test('release or collision interruption cancels the ordinary Dash pulse quickly',()=>{
 const v=new FlightDashPresentation(),m=machine({offensiveRun:true});
 for(let i=0;i<11;i++)tick(v,m);
 const before=v.strength;assert.ok(before>.6);
 m.offensiveRun=false;
 for(let i=0;i<18;i++)tick(v,m);
 assert.ok(v.strength<before*.12);
 assert.equal(tick(v,m).started,false);
 m.offensiveRun=true;assert.equal(tick(v,m).started,true);
 m.terminalDive={resolved:false};const terminal=tick(v,m);
 assert.ok(terminal.thirdBlend>0,'terminal dive retains the physical third-person boom');
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
 const s=tick(v,m,.1,0);assert.equal(s.started,true);assert.equal(s.fov,0);assert.ok(s.thirdBlend>0,'mode transition remains available with reduced camera motion');
 const next=tick(v,m,.1,.5);assert.ok(next.fov>0&&next.fov<=FLIGHT_DASH_VIEW.fovDegrees/2);
});
test('pulse never depends on client-supplied camera time or JS wall clock',()=>{
 assert.equal(flightDashEnvelope(-1),0);assert.equal(flightDashEnvelope(Infinity),0);
 assert.ok(flightDashEnvelope(.12)>=.99);assert.equal(flightDashEnvelope(1),0);
 const a=new FlightDashPresentation(),b=new FlightDashPresentation(),m=machine({offensiveRun:true});
 for(let i=0;i<32;i++)assert.deepEqual(tick(a,m),tick(b,m));
});
test('held run keeps the third person boom after the transient FOV accent ends',()=>{
 const v=new FlightDashPresentation(),m=machine({offensiveRun:true});
 let f;for(let i=0;i<150;i++)f=tick(v,m);
 assert.ok(f.thirdBlend>.99);assert.ok(f.pullback>1);assert.equal(f.fov,0);
 m.offensiveRun=false;for(let i=0;i<40;i++)f=tick(v,m);
 assert.ok(f.thirdBlend<.01);assert.ok(f.pullback<.02);
});

test('an active Valkyrie keeps a pursuit camera even when rotor condition decays',()=>{
 const v=new FlightDashPresentation(),m=machine({
  terminalDive:{resolved:false},offensiveRun:false,health:250,rotorHP:100,
 });
 let frame;
 for(let i=0;i<150;i++)frame=tick(v,m);
 assert.ok(frame.thirdBlend>.99,'terminal commitment never abandons the chase camera');
 assert.ok(frame.pullback>FLIGHT_DASH_VIEW.thirdPersonPullback,
   'the terminal chase pulls behind the actual chassis');
 assert.ok(frame.fov>=2,'the terminal chase keeps modest danger emphasis');
 m.rotorHP=0;m.health=0;
 assert.ok(tick(v,m).thirdBlend>.99,'damage cannot force a surprise cockpit return');
 m.terminalDive.resolved=true;
 for(let i=0;i<40;i++)frame=tick(v,m);
 assert.ok(frame.thirdBlend<.01,'terminal resolution returns to the saved view');
});

test('terminal and ordinary Dash share free reticle-following third-person pitch and yaw',()=>{
 const m={x:10,y:20,z:-4,heading:0};
 const upward=flightDashChasePose(m,{yaw:1.1,pitch:.7},7);
 const downward=flightDashChasePose(m,{yaw:1.1,pitch:-.7},7);
 assert.equal(upward.yaw,1.1);
 assert.equal(upward.pitch,.7);
 assert.ok(upward.position.y<m.y,'looking up places the camera below the craft to look upward');
 assert.ok(downward.position.y>m.y,'looking down places the camera above the craft');
 assert.equal(upward.position.x,downward.position.x);
 assert.equal(upward.position.z,downward.position.z);
 const left=flightDashChasePose(m,{yaw:-.8,pitch:.7},7);
 assert.ok(left.position.x<m.x&&upward.position.x>m.x,
   'camera can look both directions even before a heavy craft completes its turn');
 // The real camera uses this identical pose in BOTH modes, independent of
 // terminalDive or m.heading; it must never substitute lookAt(machine).
 m.terminalDive={resolved:false};
 assert.deepEqual(flightDashChasePose(m,{yaw:1.1,pitch:.7},7),upward);
 m.terminalDive=null;m.offensiveRun=true;
 assert.deepEqual(flightDashChasePose(m,{yaw:1.1,pitch:.7},7),upward);
});
