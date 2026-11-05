import test from 'node:test';
import assert from 'node:assert/strict';
import { movementIntentDuringRenderStall, RENDER_INPUT_STALL_MS } from './renderStallSafety.mjs';

const input=Object.freeze({
  forward:1,right:-1,jump:true,sprint:true,crouch:true,
  flightRise:true,flightLower:true,ramRaise:true,ramPitchUp:true,ramPitchDown:true,
  yaw:1.2,pitch:-.2,attack:true,guard:true,flight:true,
});

test('normal rendering retains every intended control and its identity',()=>{
  assert.equal(movementIntentDuringRenderStall(input,1000,950),input);
  assert.equal(movementIntentDuringRenderStall(input,1000,1000-RENDER_INPUT_STALL_MS),input);
});

test('frozen WebGL cannot keep pushing a player or mounted machine over a ledge',()=>{
  const neutral=movementIntentDuringRenderStall(input,2000,1500);
  for(const key of ['forward','right','jump','sprint','crouch','flightRise',
    'flightLower','ramRaise','ramPitchUp','ramPitchDown'])assert.equal(neutral[key],0,key);
  assert.equal(neutral.yaw,input.yaw);
  assert.equal(neutral.pitch,input.pitch);
  assert.equal(neutral.attack,true,'combat actions remain owned by their existing protocol');
  assert.equal(neutral.guard,true);
  assert.equal(neutral.flight,true);
  assert.equal(input.forward,1,'held player keys are never cleared or corrupted');
});

test('movement resumes on next healthy render without requiring key release',()=>{
  const stopped=movementIntentDuringRenderStall(input,800,400);
  assert.equal(stopped.forward,0);
  const resumed=movementIntentDuringRenderStall(input,833,824);
  assert.equal(resumed.forward,1);
  assert.equal(resumed.jump,true);
});

test('unknown frame age does not destroy the initial input packet',()=>{
  assert.equal(movementIntentDuringRenderStall(input,0,NaN),input);
});
