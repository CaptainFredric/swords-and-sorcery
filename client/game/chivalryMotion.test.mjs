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

test('first person guarded strikes keep the ordinary cut at each contact and leave the spell hand free', async () => {
  const {guardedSwordPose}=await import('./chivalryMotion.mjs');
  const {comboPose,COMBO_CONTACTS}=await import('./fpSlash.mjs');
  const pose=comboPose(COMBO_CONTACTS[0]);
  const saved=structuredClone(pose);
  assert.deepEqual(guardedSwordPose(pose,0),pose);
  for (const contact of COMBO_CONTACTS) {
    const plain=comboPose(contact), guarded=guardedSwordPose(comboPose(contact),1);
    const along=plain.arm.blade.reduce((sum,v,i)=>sum+v*guarded.arm.blade[i],0);
    assert.ok(along>Math.cos(15*Math.PI/180),'the blade lies across the aim as the ordinary cut does');
    assert.ok((guarded.offHand?.weight??0)===0,'the free gauntlet can guard or cast');
    assert.ok(Math.max(...guarded.counter.map(Math.abs))<1e-9,'free gauntlet retains cover');
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
