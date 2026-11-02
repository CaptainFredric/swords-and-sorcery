import {test} from 'node:test';
import assert from 'node:assert/strict';
import {flightChannelOwner,FlightAnimationState,ramWreckClip} from './flightAnimationState.mjs';
test('full Dash clips cannot own authoritative or component failure channels',()=>{
 for(const key of ['Main_Apparatus_Chassis.quaternion','Rotor_Hub.quaternion','Crossbow_Yaw_Gimbal.quaternion'])assert.equal(flightChannelOwner(key),'authority');
 assert.equal(flightChannelOwner('Protective_Brace_L.scale'),'braceL');assert.equal(flightChannelOwner('operator_root_anchor.position'),'rider');
 assert.equal(flightChannelOwner('Crossbow_Body.position'),'fire');
 assert.equal(flightChannelOwner('Lower_Knee_Shin_Limb_L.quaternion'),'posture');
});
const live={id:'f',health:250,rotorHP:100,braceLHP:80,braceRHP:80,grounded:true,velocity:{x:0,y:0,z:0}};
test('Dash enters once, sustains across refill, recovers and interrupts on real impact',()=>{
 const s=new FlightAnimationState();s.update(live,1);
 assert.match(s.update({...live,grounded:false,offensiveRun:true},2).posture.clip,/Entry/);
 assert.match(s.update({...live,grounded:false,offensiveRun:true,practiceDashRefilling:true},5).posture.clip,/Sustained/);
 assert.match(s.update({...live,grounded:false},5.1).posture.clip,/Release/);
 s.update({...live,grounded:false,offensiveRun:true},7);
 assert.match(s.update({...live,lastImpactAt:7.1},7.2).posture.clip,/Collision/);
});
test('snapshot timestamps choose airborne fall and impact, terminal never ordinary collapse',()=>{
 const s=new FlightAnimationState(),m={...live,mode:'DESTROYED',health:0,destroyedAt:2,wreckWasAirborne:true,wreckAirborne:true};
 assert.match(s.update(m,2.2).wreck.clip,/Break/);assert.match(s.update(m,4).wreck.clip,/Falling/);
 assert.match(s.update({...m,wreckAirborne:false,wreckImpactAt:4.1},4.3).wreck.clip,/Ground_Impact/);
 assert.match(s.update({...m,terminalDive:{resolved:true}},4.3).wreck.clip,/Terminal_Shatter/);
});
test('gait is selected from measured speed and shares a distance phase',()=>{
 const s=new FlightAnimationState();s.update(live,1);
 assert.match(s.update({...live,velocity:{x:5.5,z:0}},1.1).posture.clip,/5p5/);
 const p=s.phase;assert.match(s.update({...live,velocity:{x:9.3,z:0}},1.2).posture.clip,/9p3/);assert.ok(s.phase>p);
 assert.match(s.update(live,1.3).posture.clip,/Recovery/);
});
test('ram wreck retains detached fist and uses replicated impact direction',()=>{
 assert.match(ramWreckClip({wreckFistMissing:true} ),/PreDestroyed/);
 assert.match(ramWreckClip({wreckSide:-1}),/Port/);
 assert.equal(ramWreckClip({}),'06_Carriage_Full_Breakdown_And_Ruined_Rest');
});
