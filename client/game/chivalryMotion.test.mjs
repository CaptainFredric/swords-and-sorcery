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

test('first person guarded strikes use distinct forward defensive paths and leave the spell hand free', async () => {
  const {guardedSwordPose}=await import('./chivalryMotion.mjs');
  const {comboPose,COMBO_CONTACTS}=await import('./fpSlash.mjs');
  const pose=comboPose(COMBO_CONTACTS[0]);
  const saved=structuredClone(pose);
  assert.deepEqual(guardedSwordPose(pose,0),pose);
  const contacts=COMBO_CONTACTS.map(t=>guardedSwordPose(comboPose(t),1));
  assert.ok(contacts[0].arm.blade[0]<-.25,'forehand occupies the diagonal defensive line');
  assert.ok(contacts[1].arm.blade[0]>.2,'returning beat uses the other line');
  assert.ok(Math.abs(contacts[2].arm.blade[0])<.18,'third strike drives along the center');
  for (const guarded of contacts) {
    assert.ok(guarded.arm.wrist[2]<-.70,'wrist drives forward rather than sweeping down to a hip');
    assert.ok(guarded.arm.blade[2]<-.45,'blade stays ahead of the guarding hands');
    assert.ok((guarded.offHand?.weight??0)===0,'the free gauntlet can guard or cast');
    assert.ok(Math.max(...guarded.counter.map(Math.abs))<.12,'free gauntlet retains cover');
  }
  assert.deepEqual(pose,saved);
});

test('Chivalry first person brace remains angled when no sword chain is active',async()=>{
  const {guardedSwordPose}=await import('./chivalryMotion.mjs');
  assert.equal(guardedSwordPose(null,0),null);
  const brace=guardedSwordPose(null,1);
  assert.ok(brace,'Guard has its own persistent first person pose');
  assert.ok(brace.arm.blade[0]<-.25 && brace.arm.blade[1]>.3 && brace.arm.blade[2]<-.45);
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
