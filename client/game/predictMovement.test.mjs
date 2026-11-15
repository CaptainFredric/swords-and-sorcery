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

test('the owner predicts a Gale-assisted Whirl climb by the host\'s own rule: 5 m a revolution, and only while it lasts', async () => {
  const { galeWhirlLiftSpeed, SWORD_TECHNIQUE_CONTRACTS } = await import('../../shared/src/swordTechniqueContracts.mjs');
  const { createMovementState } = await import('../../shared/src/movement.mjs');
  const world = { floors: [{ id: 'f', center: [0, -0.1, 0], size: [40, 0.2, 40], y: 0 }], ramps: [], solids: [] };
  const speed = galeWhirlLiftSpeed({ id: 'whirl_wind', phase: 'active' }, 'gale', true);
  assert.ok(Math.abs(speed - SWORD_TECHNIQUE_CONTRACTS.whirl_wind.galeAscentPerRevolution / SWORD_TECHNIQUE_CONTRACTS.whirl_wind.revolutionSeconds) < 1e-9);
  assert.equal(galeWhirlLiftSpeed({ id: 'whirl_wind', phase: 'recovery' }, 'gale', true), null);
  assert.equal(galeWhirlLiftSpeed({ id: 'whirl_wind', phase: 'active' }, 'fireball', true), null);
  assert.equal(galeWhirlLiftSpeed({ id: 'rigid_riposte', phase: 'active' }, 'gale', true), null);
  const input = { forward: 0, right: 0, jump: true, sprint: false, crouch: false, yaw: 0 };
  let state = createMovementState({ x: 0, y: 0, z: 0 });
  for (let t = 0; t < 0.6 - 1e-9; t += 1 / 30) state = advancePredictedMovement(state, input, 1 / 30, t + 1 / 30, world, { speed, until: 0.6 });
  // (the host's revolution: 5 m up, give or take the take-off step)
  assert.ok(state.position.y > 4.6 && state.position.y < 5.6, `climbed ${state.position.y.toFixed(2)} m in a revolution`);
  // past `until` it is an ordinary fall
  const after = advancePredictedMovement(state, input, 1 / 30, 0.7, world, { speed, until: 0.6 });
  assert.ok(after.velocity.y < speed, 'no lift after the revolution');
});
