import test from 'node:test';
import assert from 'node:assert/strict';
import { disasterBodyTurn, disasterCameraWanted, disasterWindupSec, DISASTER_CAMERA } from './oneHitCamera.mjs';
import { ULTIMATES } from '../../shared/src/ultimates.mjs';

const player = state => ({alive:true,ultimateState:state});
const startup = (commitAt, levels = {}) => ({id:'one_hit_of_wonders',phase:'startup',commitAt,preparedTiers:levels});
const active = (commitAt, form='ground') => ({id:'one_hit_of_wonders',phase:'active',commitAt,until:commitAt+1.65,oneHit:{form}});
test('All-Natural Disaster is named in its canonical user-facing entry without changing the stable ID',()=>{
  assert.equal(ULTIMATES.one_hit_of_wonders.id,'one_hit_of_wonders');
  assert.equal(ULTIMATES.one_hit_of_wonders.label,'All-Natural Disaster');
});
test('ordinary ground slam: third-person during body turn and impact, then first-person again while Ultimate still active',()=>{
  assert.equal(disasterCameraWanted(player(startup(10)),8),false);
  assert.equal(disasterCameraWanted(player(startup(10)),9.3),true);
  assert.equal(disasterCameraWanted(player(startup(10)),10.05),true,'snapshot latency past commit retains cinematic until transition');
  assert.equal(disasterCameraWanted(player(active(10)),10.1),true);
  assert.equal(disasterCameraWanted(player(active(10)),10+DISASTER_CAMERA.groundAfterSec+.01),false);
  assert.equal(disasterCameraWanted(player(active(10)),11.6),false);
});
test('aerial Gale variant stays visible through the delayed travelling wave and then returns',()=>{
  assert.equal(disasterCameraWanted(player(active(10,'aerial')),10.86),true);
  assert.equal(disasterCameraWanted(player(active(10,'aerial')),11.18),true);
  assert.equal(disasterCameraWanted(player(active(10,'aerial')),11.22),false);
});
test('partial lightning gets an abbreviated lead; full lightning retains an aimable chase view through charge and release',()=>{
  const partial=startup(10,{lightning:1});
  assert.equal(disasterWindupSec(partial),.36);
  assert.equal(disasterCameraWanted(player(partial),9.5),false);
  assert.equal(disasterCameraWanted(player(partial),9.75),true);
  const held=startup(3_600_010,{lightning:2});
  held.teleportHoldAt=10;
  assert.equal(disasterCameraWanted(player(held),25),true);
  assert.equal(disasterCameraWanted(player(active(25)),25.01),true,'release triggers cinematic');
});
test('interruption, loss of life, another Ultimate, and match reset never retain the cinematic',()=>{
  assert.equal(disasterCameraWanted(player(null),11),false);
  assert.equal(disasterCameraWanted({alive:false,ultimateState:active(10)},10.2),false);
  assert.equal(disasterCameraWanted(player({...startup(10),phase:'interrupted'}),9.9),false);
  assert.equal(disasterCameraWanted(player({id:'vortex',phase:'active',commitAt:10,until:20}),11),false);
  assert.equal(disasterCameraWanted(player(active(10)),12),false);
});
test('authored full-body turn rotates smoothly, returns to facing before contact, does not affect aim',()=>{
  const state=startup(10);
  const start=10-ULTIMATES.one_hit_of_wonders.startupSec;
  assert.equal(disasterBodyTurn(state,start),0);
  assert.equal(disasterBodyTurn(state,start+0.04),0);
  let last=0;
  for(let i=1;i<=60;i++){
    const time=start+i*(ULTIMATES.one_hit_of_wonders.startupSec-1e-8)/60;
    const turn=disasterBodyTurn(state,time);
    assert.ok(turn>=last-1e-8 && turn<=2*Math.PI+1e-8);
    assert.ok(turn-last<.3,'turn progresses rather than snapping');
    last=turn;
  }
  assert.ok(last>2*Math.PI-.001);
  assert.equal(disasterBodyTurn(active(10),10),0,'the 360 degree turn resolves exactly to real yaw');
  assert.equal(disasterBodyTurn(startup(3_600_010,{lightning:2}),30),0,'no spin during indefinite charge');
});
