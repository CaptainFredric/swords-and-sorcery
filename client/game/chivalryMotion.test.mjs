import test from 'node:test';
import assert from 'node:assert/strict';
import { ownershipBlendSeconds } from './chivalryMotion.mjs';

test('action entry stays responsive while idle and Guard recover more gently', () => {
  assert.equal(ownershipBlendSeconds('Guard', 'Slash_1'), 0.1);
  assert.equal(ownershipBlendSeconds('Slash_1', 'Slash_2'), 0.06);
  assert.equal(ownershipBlendSeconds('Cast', 'Guard'), 0.16);
  assert.equal(ownershipBlendSeconds('Cast', 'Idle'), 0.24);
  assert.equal(ownershipBlendSeconds('Run', 'Sprint'), 0.16);
});

test('guarded cuts keep the defensive hand free and reduce the sword shoulder excursion', async () => {
  const {guardedSwordPose}=await import('./chivalryMotion.mjs');
  const {comboPose}=await import('./fpSlash.mjs');
  const pose=comboPose(1.8);
  const saved=structuredClone(pose);
  const guarded=guardedSwordPose(pose,1);
  assert.deepEqual(guardedSwordPose(pose,0),pose);
  assert.ok(Math.hypot(...guarded.arm.shoulder)<Math.hypot(...pose.arm.shoulder));
  assert.equal(guarded.offHand.weight,0,'the left fist defends instead of joining the sword grip');
  assert.deepEqual(guarded.arm.blade,pose.arm.blade,'contact direction follows the existing sword path');
  assert.deepEqual(pose,saved);
});

test('transition residual preserves outgoing velocity and settles with zero residual velocity',async()=>{
  const {transitionResidual}=await import('./chivalryMotion.mjs');
  const h=.00001;
  assert.equal(transitionResidual(.7,2,0,.2),.7);
  assert.ok(Math.abs((transitionResidual(.7,2,h,.2)-.7)/h-2)<.002);
  assert.equal(transitionResidual(.7,2,.2,.2),0);
  assert.ok(Math.abs(transitionResidual(.7,2,.2-h,.2)/h)<.002);
  assert.equal(transitionResidual(.7,2,.3,.2),0);
});
