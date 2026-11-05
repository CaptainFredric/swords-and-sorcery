import test from 'node:test';
import assert from 'node:assert/strict';
import {advancePredictedMovement,PREDICTION_MAX_CATCHUP_SEC} from './predictMovement.mjs';
import {createMovementState,movePlayer} from '../../shared/src/movement.mjs';
import {HIGH_GROUNDS} from '../../shared/worlds/highGrounds.mjs';

const input={forward:1,right:0,yaw:0,jump:false,crouch:false,sprint:false};
test('client 100ms frame advances the same foot physics as three 30Hz server steps',()=>{
  const start=createMovementState({x:0,y:0,z:-90});
  let authority=start;
  for(let i=0;i<3;i++) authority=movePlayer(authority,input,1/30,10+(i+1)/30,HIGH_GROUNDS);
  const predicted=advancePredictedMovement(start,input,.1,10.1,HIGH_GROUNDS);
  for(const axis of ['x','y','z'])assert.ok(Math.abs(predicted.position[axis]-authority.position[axis])<1e-8,axis);
  assert.equal(predicted.grounded,authority.grounded);
});

test('frame catch-up remains bounded through a multi-second GPU stall',()=>{
  const start=createMovementState({x:0,y:0,z:-90});
  const after=advancePredictedMovement(start,input,2,12,HIGH_GROUNDS);
  assert.ok(Math.abs(after.position.z-start.position.z)<=7.5*PREDICTION_MAX_CATCHUP_SEC+.01);
  assert.notEqual(after,start);
});

test('a Jump edge and gravity are integrated once through several prediction substeps',()=>{
  const start=createMovementState({x:0,y:0,z:-90});
  const jumped=advancePredictedMovement(start,{...input,jump:true},.1,1.1,HIGH_GROUNDS);
  assert.equal(jumped.jumpHeld,true);
  assert.equal(jumped.grounded,false);
  assert.ok(jumped.velocity.y>5&&jumped.velocity.y<7.2);
  assert.ok(jumped.position.y>.45,'jump moves continuously during low FPS');
});
