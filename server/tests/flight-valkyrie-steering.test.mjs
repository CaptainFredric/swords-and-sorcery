import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomManager} from '../../shared/sim/RoomManager.mjs';
import {createFightFlight,mountFightFlight,stepFightFlight} from '../../shared/sim/fightFlight.mjs';
import {requestFlightDash,stepFlightRun,VALKYRIE_RUN} from '../../shared/sim/fightFlightRun.mjs';
import {stepTerminalPreparation,requestTerminalRitual,advanceTerminalFlight} from '../../shared/sim/fightFlightTerminal.mjs';
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
test('Rotor physically follows the camera after commitment, not a fixed deep nose-down trim',()=>{
  const s=setup({practice:true,y:32});s.p.input.pitch=0;
  requestFlightDash(s.room,s.m,s.p,true,0);frames(s,9);
  assert.ok(s.m.runPitch>1.0,'within the 0.36-second launch, the rotor attacks steeply');
  s.p.input.pitch=0;frames(s,30);
  const neutral=s.m.runPitch;
  assert.ok(neutral>1.47&&neutral<1.58,'sustained neutral attack keeps its rotor in a near-vertical cutting plane');
  s.p.input.pitch=-.55;frames(s,18);
  const downward=s.m.runPitch,downVy=s.m.velocity.y;
  assert.ok(downward>=neutral-.04,'downward aim keeps the rotor at its physical 90-degree limit');
  assert.ok(downVy<-3,'forward thrust follows the descending rotor direction');
  s.p.input.pitch=.55;frames(s,18);
  assert.ok(s.m.runPitch<downward-.45,'looking up physically raises rotor attitude');
  assert.ok(s.m.velocity.y>2,'upward reticle follows authoritative ascent, not cosmetic camera');
});
test('Post-commit Dash can orbit ninety degrees quickly without snapping',()=>{
  const s=setup({practice:true,y:30});requestFlightDash(s.room,s.m,s.p,true,0);
  frames(s,12);s.p.input.yaw=Math.PI/2;
  frames(s,24);
  assert.ok(s.m.heading>1.1,'held camera turn reaches practical flanking angle within .8s');
  assert.ok(s.m.heading<=Math.PI/2+.01,'no angular overshoot');
  assert.ok(Math.abs(s.m.runTurnSpeed)<=VALKYRIE_RUN.turnRate+1e-6);
});
test('Held aiming can turn from a downward attack to real ascent',()=>{
  const s=setup();requestFlightDash(s.room,s.m,s.p,true,0);frames(s,12);
  s.p.input.pitch=.65;frames(s,38);
  assert.ok(s.m.velocity.y>2,'authoritative vertical velocity follows later aim');
  assert.ok(s.m.runFlightPitch>.35,'pitch moves through the new flight vector');
  assert.ok(s.m.runPitch<1.2&&s.m.runPitch>0,'the physically pitched rotor follows ascent without losing its attack-plane posture');
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

test('Ground E Dash reaches 450 RPM and commits attack without separate Jump or clearance wait',()=>{
  const s=setup({practice:true,y:0});
  s.m.grounded=true;s.m.mode='GROUNDED';s.m.rotorPowered=false;
  s.m.rotorAngularVelocity=0;s.m.rotorRPM=0;s.m.y=0;s.m.position.y=0;
  assert.equal(requestFlightDash(s.room,s.m,s.p,true,0),true);
  assert.equal(s.m.runGroundPhase,'SPINUP');
  frames(s,9);
  assert.ok(s.m.grounded,'spinning does not launch until 450 RPM');
  assert.ok(s.m.rotorRPM>0&&s.m.rotorRPM<450,'real rotor accelerates progressively');
  assert.equal(s.m.offensiveRun,false,'no free Dash while rotor warms up');
  for(let i=0;i<34&&!s.m.offensiveRun;i++)frames(s,1);
  assert.ok(s.m.rotorRPM>=VALKYRIE_RUN.spinupRPM-.1,'required full 450 RPM');
  assert.ok(s.m.y>0&&s.m.y<VALKYRIE_RUN.groundLaunchClearance,
    'attack begins directly off the floor without an altitude wait: '+JSON.stringify({
      y:s.m.y,phase:s.m.runGroundPhase,run:s.m.offensiveRun,grounded:s.m.grounded,
      rpm:s.m.rotorRPM,charge:s.m.flightCharge,elapsed:s.m.runElapsed}));
  assert.equal(s.m.grounded,false);
  assert.equal(s.m.offensiveRun,true,'attack becomes active after the lifted machine clears its rotor');
  frames(s,8);
  assert.ok(s.m.runPitch>1.25,'propeller attacks steeply after the physical takeoff');
  assert.ok(s.m.runTravel>0,'ground Dash advances through actual world movement');
  assert.equal(s.m.terminalDive,null,'ordinary Dash must never accidentally terminal-dive');
});
test('Ground Dash release cancels spool, while release after motor takeoff finishes 10m minimum',()=>{
  const init=()=>{const s=setup({practice:true,y:0});Object.assign(s.m,{
    y:0,grounded:true,mode:'GROUNDED',rotorPowered:false,
    rotorAngularVelocity:0,rotorRPM:0});return s;};
  const cancel=init();requestFlightDash(cancel.room,cancel.m,cancel.p,true,0);frames(cancel,3);
  requestFlightDash(cancel.room,cancel.m,cancel.p,false,cancel.now);
  assert.equal(cancel.m.runGroundPhase,null);
  frames(cancel,25);
  assert.equal(cancel.m.grounded,true,'release during spool safely aborts launch');
  assert.equal(cancel.m.offensiveRun,false);
  const s=init();requestFlightDash(s.room,s.m,s.p,true,0);
  for(let i=0;i<42&&!s.m.offensiveRun;i++)frames(s,1);
  assert.equal(s.m.offensiveRun,true,'takeoff has no separate ascent hold: '+JSON.stringify({
    y:s.m.y,grounded:s.m.grounded,rpm:s.m.rotorRPM,
    elapsed:s.m.runElapsed,run:s.m.offensiveRun}));
  requestFlightDash(s.room,s.m,s.p,false,s.now);
  for(let i=0;i<100&&(s.m.runGroundPhase||s.m.offensiveRun||s.m.runTravel===0);i++)frames(s,1);
  assert.ok(s.m.runTravel>=VALKYRIE_RUN.minTravel,
    'release during committed takeoff still produces ten metres of physical attack');
  assert.equal(s.m.flightDashHeld,false);
  assert.equal(s.m.terminalDive,null);
});

test('Airborne Dash drives a falling craft immediately with full Chivalry and no vertical freeze',()=>{
  const s=setup({y:35});s.p.ultimate='chivalry';s.p.prowess=100;
  s.m.rotorPowered=false;s.m.rotorAngularVelocity=0;s.m.rotorRPM=0;
  s.m.velocity={x:2,y:-11,z:-7};
  const before={...s.m.velocity};
  requestFlightDash(s.room,s.m,s.p,true,0);
  stepFlightRun(s.room,s.m,DT,DT);
  assert.equal(s.m.offensiveRun,true,'first physics tick must propel, not wait 0.3s');
  assert.ok(s.p.prowess<100,'Fire Away spends prowess without reserving an unavailable terminal Dive');
  assert.equal(s.m.rotorPowered,true,'Dash winds an idle rotor while moving');
  stepFightFlight(s.room,s.m,DT,DT);
  assert.ok(s.m.y<35,'fall continues rather than halting in midair');
  assert.ok(s.m.velocity.y< -2,'falling velocity must not snap to hover');
  assert.ok(Math.hypot(s.m.velocity.x,s.m.velocity.z)>3,'existing horizontal speed remains physical');
  assert.ok(Math.abs(s.m.velocity.y-before.y)<4,'vertical acceleration transitions smoothly');
});

test('Moving Dash still accepts a deliberate Chivalry terminal chord during the meter reserve',()=>{
  const s=setup({y:25});s.p.ultimate='chivalry';s.p.prowess=100;
  s.m.skill={id:'doNotStopMyAscension',phase:'active',activeUntil:null,readyAt:25};
  requestFlightDash(s.room,s.m,s.p,true,0);
  stepFlightRun(s.room,s.m,DT,DT);stepFightFlight(s.room,s.m,DT,DT);
  assert.equal(s.m.offensiveRun,true);
  assert.equal(s.p.prowess,100);
  s.m.flightUltimateHeld=true;s.m.flightUltimateDownAt=DT;
  stepTerminalPreparation(s.room,s.m,2*DT);
  assert.equal(s.m.terminalPrep?.phase,'holding','Dash+Ultimate still starts terminal preparation');
  assert.equal(s.m.offensiveRun,false,'terminal preparation takes over the propulsion state');
});

test('Ground E Dash retains walking movement during actual rotor spin-up',()=>{
  const s=setup({practice:true,y:0});Object.assign(s.m,{
    y:0,grounded:true,mode:'GROUNDED',rotorPowered:false,rotorAngularVelocity:0,rotorRPM:0
  });
  s.p.input.forward=1;
  requestFlightDash(s.room,s.m,s.p,true,0);
  const z=s.m.z;
  frames(s,5);
  assert.ok(s.m.z<z-.1,'spinning the rotor must not halt ordinary ground motion');
  assert.equal(s.m.offensiveRun,false);
  assert.equal(Boolean(s.p.input.jump||s.p.input.flightRise),false,'no Jump input supplied');
  for(let i=0;i<40&&!s.m.offensiveRun;i++)frames(s,1);
  assert.equal(s.m.offensiveRun,true,'E starts flight without jumping');
  assert.ok(s.m.y>0&&s.m.y<VALKYRIE_RUN.groundLaunchClearance,'attack begins from ground');
});

test('Grounded Dash reuses an already-spinning 450 RPM rotor with no additional wait',()=>{
  const s=setup({practice:true,y:0});Object.assign(s.m,{
    y:0,grounded:true,mode:'GROUNDED',rotorPowered:false,
    rotorAngularVelocity:Math.PI*15,rotorRPM:450
  });
  requestFlightDash(s.room,s.m,s.p,true,0);
  frames(s,2);
  assert.equal(s.m.offensiveRun,true,'physical motor speed allows immediate launch');
  assert.ok(s.m.y>0);
});

test('Walking off a ledge during E spin-up cannot latch Dash in a frozen SPINUP state',()=>{
  const s=setup({practice:true,y:0});Object.assign(s.m,{
    y:0,grounded:true,mode:'GROUNDED',rotorPowered:false,rotorAngularVelocity:0,rotorRPM:0
  });
  requestFlightDash(s.room,s.m,s.p,true,0);frames(s,3);
  assert.equal(s.m.runGroundPhase,'SPINUP');
  // A real cliff makes the machine airborne before the rotor reaches 450.
  s.m.grounded=false;s.m.y=8;s.m.mode='FALLING';s.m.velocity.y=-7;
  frames(s,1);
  assert.equal(s.m.runGroundPhase,null);
  assert.equal(s.m.offensiveRun,true,'airborne Dash engages instead of waiting for grounded RPM');
  assert.ok(s.m.velocity.y<0,'falling momentum continues');
});

test('Crouch during grounded E rotor spin-up does not trap the wind-up',()=>{
  const s=setup({practice:true,y:0});Object.assign(s.m,{
    y:0,grounded:true,mode:'GROUNDED',rotorPowered:false,rotorAngularVelocity:0,rotorRPM:0
  });
  s.p.input.crouch=true;
  requestFlightDash(s.room,s.m,s.p,true,0);
  frames(s,9);
  assert.ok(s.m.rotorRPM>200,'Dash engages rotor despite the lower/crouch input');
  assert.equal(s.m.rotorBrakeHeld,false);
});

test('grounded Valkyrie rune commits with full Ascension/Chivalry and physically launches',()=>{
 const s=setup({y:0});
 Object.assign(s.m,{y:0,grounded:true,mode:'GROUNDED',rotorPowered:false,
  rotorAngularVelocity:0,rotorRPM:0,velocity:{x:0,y:0,z:0}});
 s.p.ultimate='chivalry';s.p.prowess=100;
 s.m.skill={id:'doNotStopMyAscension',phase:'active',activeUntil:null,readyAt:0};
 assert.equal(requestTerminalRitual(s.room,s.m,s.p,0),true);
 assert.equal(s.m.terminalDiveSpent,true);
 assert.equal(s.p.prowess,0,'the full personal Ultimate is spent exactly once');
 assert.equal(s.m.grounded,false,'ground launch is server-authoritative');
 assert.ok(s.m.velocity.y>=4.5,'the rotor actually launches upward');
 assert.equal(s.m.rotorPowered,true,'rotor turns through the terminal launch');
 assert.equal(s.m.mode,'TERMINAL');
 assert.equal(requestTerminalRitual(s.room,s.m,s.p,.01),false,'no second terminal commitment');
 stepFightFlight(s.room,s.m,DT,DT);
 assert.ok(s.m.y>0,'physics, not a teleport, lifts the chassis from the floor');
});

test('grounded Dash + Ultimate still requires its original full one-second hold',()=>{
 const s=setup({y:0});
 Object.assign(s.m,{y:0,grounded:true,mode:'GROUNDED',rotorPowered:false,
  rotorAngularVelocity:0,rotorRPM:0,velocity:{x:0,y:0,z:0}});
 s.p.ultimate='chivalry';s.p.prowess=100;
 s.m.skill={id:'doNotStopMyAscension',phase:'active',activeUntil:null,readyAt:0};
 requestFlightDash(s.room,s.m,s.p,true,0);
 s.m.flightUltimateHeld=true;s.m.flightUltimateDownAt=0;
 stepTerminalPreparation(s.room,s.m,0);
 assert.equal(s.m.terminalPrep?.phase,'holding');
 stepTerminalPreparation(s.room,s.m,.9);
 assert.equal(s.m.terminalDive,null,'the chord cannot shorten the sacrifice');
 stepTerminalPreparation(s.room,s.m,1.01);
 assert.ok(s.m.terminalDive,'the full chord commits while still standing');
 assert.ok(s.m.velocity.y>0);
 assert.equal(s.m.flightDashHeld,false);
 assert.equal(s.m.runGroundPhase,null);
});

function terminalSetup({y=120,pitch=0,yaw=0}={}){
  const s=setup({y});
  s.p.ultimate='chivalry';s.p.prowess=100;
  s.m.skill={id:'doNotStopMyAscension',phase:'active',activeUntil:null};
  s.p.input.pitch=pitch;s.p.input.yaw=yaw;
  assert.equal(requestTerminalRitual(s.room,s.m,s.p,0),true);
  return s;
}
function terminalFrames(s,count){
  for(let i=0;i<count;i++){
    s.now+=DT;
    advanceTerminalFlight(s.room,s.m,DT,s.now);
    stepFightFlight(s.room,s.m,DT,s.now,s.room.world);
  }
}
test('Early committed Valkyrie has ordinary Dash-equivalent turn and climb authority',()=>{
  const s=terminalSetup({pitch:.8,yaw:Math.PI/2});
  assert.equal(s.m.terminalDive.simulatedSec,0);
  terminalFrames(s,18);
  assert.ok(s.m.heading>.6,'full Dash angular acceleration gives responsive early turns');
  assert.ok(s.m.velocity.y>8,'positive reticle pitch produces real ascent, not a tiny trim');
  assert.ok(s.m.y>120,'the chassis actually climbs through the world');
  assert.ok(s.m.runFlightPitch>.75,'replicated pitch remains player controlled');
  assert.ok(s.m.runPitch<.1,'climbing changes the third-person craft attitude');
  assert.ok(s.m.runTurnSpeed<=VALKYRIE_RUN.turnRate+1e-6);
  assert.ok(s.m.rotorAngularVelocity>0,'rotor remains physically powered');
});
test('Late committed Valkyrie deteriorates in BOTH turning and upward thrust',()=>{
  const early=terminalSetup({pitch:VALKYRIE_RUN.pitchLimit,yaw:Math.PI/2});
  terminalFrames(early,10);
  const earlyTurn=early.m.runTurnSpeed,earlyClimb=early.m.velocity.y;
  const late=terminalSetup({y:250,pitch:VALKYRIE_RUN.pitchLimit,yaw:Math.PI/2});
  late.m.terminalDive.simulatedSec=15;
  terminalFrames(late,10);
  assert.ok(earlyTurn>late.m.runTurnSpeed*4,'late yaw is much slower, not locked');
  assert.ok(late.m.runTurnSpeed>0&&late.m.runTurnSpeed<=.18+1e-6);
  assert.ok(earlyClimb>5&&late.m.velocity.y<0,'overheated rotor can no longer sustain a climb');
  assert.ok(late.m.health<250,'dangerous deterioration still burns remaining hull');
  assert.equal(late.m.terminalDive.resolved,false,'no artificial timed explosion');
});
test('Committed Valkyrie ascends on initial ground activation with matching pitch rules',()=>{
  // The terminal commitment is valid from support without a Dash spin-up.
  // Recreate an actual grounded launch instead of claiming this airborne test covers it.
  const ground=setup({y:0});
  ground.m.grounded=true;ground.m.mode='GROUNDED';ground.m.velocity.y=0;
  ground.p.ultimate='chivalry';ground.p.prowess=100;
  ground.m.skill={id:'doNotStopMyAscension',phase:'active',activeUntil:null};
  ground.p.input.pitch=.85;
  assert.equal(requestTerminalRitual(ground.room,ground.m,ground.p,0),true);
  assert.ok(ground.m.velocity.y>=4.5&&ground.m.terminalDive.launchedFromGround);
  terminalFrames(ground,12);
  assert.ok(ground.m.y>0.3,'real vertical displacement comes from velocity');
  assert.ok(ground.m.velocity.y>6,'look pitch still works from the ground');
  assert.equal(ground.m.terminalDive.resolved,false);
});
