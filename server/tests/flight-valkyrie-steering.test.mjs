import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomManager} from '../../shared/sim/RoomManager.mjs';
import {createFightFlight,mountFightFlight,stepFightFlight} from '../../shared/sim/fightFlight.mjs';
import {requestFlightDash,stepFlightRun,VALKYRIE_RUN} from '../../shared/sim/fightFlightRun.mjs';
import {stepTerminalPreparation} from '../../shared/sim/fightFlightTerminal.mjs';
import {applyRoomCommand} from '../../shared/sim/wire.mjs';

const DT=1/30;
function setup({practice=false,y=30}={}){
  const room=new RoomManager().createSoloRoom('PRACTICE',0,'castleward');
  room.state='PLAYING';
  room.world={floors:[{y:0,center:[0,0,0],size:[1000,1,1000]}],ramps:[],solids:[],abyssY:-30};
  const p=room.addPlayer({id:'pilot',token:'pilot',name:'Pilot'},0);
  p.position={x:0,y:0,z:1};
  const m=createFightFlight({id:'steering-flight'});
  room.fightFlight=m;
  assert.equal(mountFightFlight(room,m,p,0),true);
  room.mode=practice?'PRACTICE':'FREE_FOR_ALL';
  p.ultimate='sunder';p.prowess=100;
  m.y=y;m.position.y=y;m.grounded=false;m.mode='AIRBORNE';
  m.rotorPowered=true;m.rotorAngularVelocity=Math.PI*15;
  return {room,m,p,now:0};
}
function frames(s,count){
  for(let i=0;i<count;i++){
    s.now+=DT;
    stepFlightRun(s.room,s.m,DT,s.now);
    stepFightFlight(s.room,s.m,DT,s.now);
  }
}
test('Launch aim is physically committed for .36 seconds; level aim still descends',()=>{
  const s=setup();s.p.input.yaw=0;s.p.input.pitch=0;
  assert.equal(requestFlightDash(s.room,s.m,s.p,true,0),true);
  s.p.input.yaw=Math.PI;s.p.input.pitch=.8;
  frames(s,9);
  assert.ok(Math.abs(s.m.heading)<.01,'immediate turn cannot redirect initial thrust');
  assert.ok(s.m.velocity.z<-5,'propulsion is real forward motion');
  assert.ok(s.m.velocity.y<-1,'neutral aim creates physical downward motion');
  assert.ok(s.m.runLaunchMinVy<-.35&&s.m.runLaunchDrop>.02,'authoritative launch telemetry records downward motion');
  assert.ok(s.m.runLaunchDistance>0,'actual committed 3D displacement is recorded');
  assert.ok(s.m.y<30,'the world position descends, not only the camera');
  assert.ok(s.m.runPitch>.2,'rotor leads the visibly pitched attack');
  assert.equal(s.m.terminalDive,null);
});
test('Throttle gaps cannot consume the directional lock without real physics ticks',()=>{
  const s=setup();s.p.input.yaw=0;s.p.input.pitch=0;
  requestFlightDash(s.room,s.m,s.p,true,0);
  s.p.input.yaw=Math.PI/2;s.p.input.pitch=.7;
  for(let i=1;i<=8;i++){
    // Actual browser wall time may progress >360ms between 30Hz physics steps.
    const now=i*.8;
    stepFlightRun(s.room,s.m,DT,now);stepFightFlight(s.room,s.m,DT,now);
    assert.ok(Math.abs(s.m.heading)<.001,'initial heading remains committed for simulated ticks');
  }
  assert.ok(s.m.runLaunchMinVy<-.35&&s.m.runLaunchDrop>.02,
    'the real machine descends even if wall clock leapt seconds between ticks');
  assert.ok(s.m.runElapsed<VALKYRIE_RUN.commitmentSec);
  for(let i=9;i<=36;i++){const now=i*.8;stepFlightRun(s.room,s.m,DT,now);stepFightFlight(s.room,s.m,DT,now);}
  assert.ok(s.m.heading>.4,'continued hold eventually transitions into turning');
});
test('Early release completes ten-metre physical travel even across wall-clock stalls',()=>{
  const s=setup();requestFlightDash(s.room,s.m,s.p,true,0);
  frames(s,3);requestFlightDash(s.room,s.m,s.p,false,s.now);
  for(let i=1;i<=45&&s.m.offensiveRun;i++){
    const now=10+i*1.8; // wall time jumps, but each real physics step is 1/30s
    stepFlightRun(s.room,s.m,DT,now);stepFightFlight(s.room,s.m,DT,now);
  }
  assert.ok(s.m.runTravel>=10);
  assert.equal(s.m.offensiveRun,false);
});
test('Sustained held Dash turns with rate-limited angular acceleration',()=>{
  const s=setup();requestFlightDash(s.room,s.m,s.p,true,0);
  frames(s,12);
  s.p.input.yaw=Math.PI/2;
  frames(s,5);
  assert.ok(s.m.heading>0&&s.m.heading<.25,'turn starts gradually, without snapping');
  frames(s,35);
  assert.ok(s.m.heading>.8,'pilot can meaningfully turn around an opponent');
  assert.ok(s.m.velocity.x<-5,'thrust curves into the new machine heading');
  assert.ok(Math.abs(s.m.runTurnSpeed)<=VALKYRIE_RUN.turnRate+1e-6);
});
test('Held aiming can turn from a downward attack to real ascent',()=>{
  const s=setup();requestFlightDash(s.room,s.m,s.p,true,0);frames(s,12);
  s.p.input.pitch=.65;frames(s,38);
  assert.ok(s.m.velocity.y>2,'authoritative vertical velocity follows later aim');
  assert.ok(s.m.runFlightPitch>.35,'pitch moves through the new flight vector');
  assert.ok(s.m.runPitch<.05,'rendered chassis follows actual ascending travel');
});
test('Quick release honors minimum powered distance before coasting, without restarting',()=>{
  const s=setup();requestFlightDash(s.room,s.m,s.p,true,0);frames(s,4);
  requestFlightDash(s.room,s.m,s.p,false,s.now);
  assert.equal(s.m.flightDashHeld,false);
  assert.equal(s.m.offensiveRun,true,'short press completes the committed attack');
  for(let i=0;i<45&&s.m.offensiveRun;i++)frames(s,1);
  assert.ok(s.m.runTravel>=VALKYRIE_RUN.minTravel,'actual integrated world displacement >= 10m');
  assert.equal(s.m.offensiveRun,false);
  assert.ok(Math.hypot(s.m.velocity.x,s.m.velocity.z)>1,'momentum coasts after release');
  assert.equal(s.room.events.filter(e=>e.type==='fightFlightOffensiveRun'&&e.action==='started').length,1);
  assert.equal(s.m.terminalDive,null);
});
test('Practice short tap still reaches minimum distance through an almost empty charge cycle',()=>{
  const s=setup({practice:true});s.m.flightCharge=.1;
  requestFlightDash(s.room,s.m,s.p,true,0);frames(s,4);
  requestFlightDash(s.room,s.m,s.p,false,s.now);
  for(let i=0;i<55&&s.m.offensiveRun;i++)frames(s,1);
  assert.ok(s.m.runTravel>=VALKYRIE_RUN.minTravel);
  assert.equal(s.m.offensiveRun,false);
  assert.equal(s.m.terminalDive,null);
});
test('Physical wall and rotor destruction interrupt held propulsion, no automatic restart',()=>{
  const s=setup();s.room.world.solids=[{center:[0,30,-6],size:[8,60,1]}];
  requestFlightDash(s.room,s.m,s.p,true,0);frames(s,50);
  assert.equal(s.m.offensiveRun,false);assert.equal(s.m.flightDashHeld,false);
  const t=setup();requestFlightDash(t.room,t.m,t.p,true,0);frames(t,8);
  t.m.rotorHP=0;frames(t,1);
  assert.equal(t.m.offensiveRun,false);assert.equal(t.m.flightDashHeld,false);
});
test('Practice refill does not restart the initial lock or prevent later steering',()=>{
  const s=setup({practice:true});requestFlightDash(s.room,s.m,s.p,true,0);
  frames(s,140);
  assert.ok(s.room.events.some(e=>e.type==='fightFlightPracticeDash'&&e.action==='refilled'));
  s.p.input.yaw=Math.PI/2;frames(s,42);
  assert.ok(s.m.heading>.8);
  assert.equal(s.room.events.filter(e=>e.type==='fightFlightOffensiveRun'&&e.action==='started').length,1);
});
test('Stale desktop or touch hold expires; neither alone can commit terminal Dive',()=>{
  for(const inputKind of ['desktop','touch']){
    const s=setup();s.p.ultimate='chivalry';s.p.prowess=100;
    s.p.flightInputAt=.01;
    assert.deepEqual(applyRoomCommand(s.room,s.p,{type:'flightDash',down:true},.01),{});
    // Ordinary dash alone never prepares a terminal chord, even on a ready meter.
    stepTerminalPreparation(s.room,s.m,.4);
    assert.equal(s.m.terminalPrep,null);
    stepFlightRun(s.room,s.m,DT,.8);
    assert.equal(s.m.flightDashHeld,false,`${inputKind} stale hold must expire`);
    assert.equal(s.m.terminalDive,null);
  }
});

test('Dash captures camera heading and honors an initially upward aim',()=>{
  const s=setup();s.p.input.yaw=Math.PI/2;s.p.input.pitch=.65;
  requestFlightDash(s.room,s.m,s.p,true,0);
  assert.equal(s.m.runCommitHeading,Math.PI/2);
  frames(s,9);
  assert.ok(s.m.velocity.x < -5,'launch thrust follows the selected camera direction');
  assert.ok(s.m.velocity.y > 1,'upward launch is physically upward');
  assert.ok(s.m.heading>0&&s.m.heading<Math.PI/2,'chassis aligns without an instant rotation');
});
test('Low pass genuinely pitches the blade into standing infantry height',()=>{
  const s=setup({practice:true,y:1.2});s.p.input.pitch=-.5;
  requestFlightDash(s.room,s.m,s.p,true,0);frames(s,25);
  assert.ok(s.m.runPitch>.65,'actual root pitches substantially at floor clearance');
  assert.ok(s.m.y>=1.05,'ground safety remains intact');
});

test('low flight attack banks farther nose-down while keeping its real rotor above support',()=>{
 const s=setup({practice:true,y:.7});s.p.input.pitch=-1.2;
 requestFlightDash(s.room,s.m,s.p,true,0);frames(s,32);
 assert.ok(s.m.runPitch>=1.1,'low attack pitches past the former 57 degree trim');
 const low=s.m.y+2.185*Math.cos(s.m.runPitch)-1.295*Math.sin(s.m.runPitch);
 assert.ok(low>=.10,'actual hub and swept blade keep ground clearance');
});
