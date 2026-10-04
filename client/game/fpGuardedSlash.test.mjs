import test from 'node:test';
import assert from 'node:assert/strict';
import { guardedBracePose, guardedComboPose, guardedRecoveryPose } from './fpGuardedSlash.mjs';
import { COMBO_CONTACTS, COMBO_CYCLE, comboPose } from './fpSlash.mjs';
import { guardedSwordPose } from './chivalryMotion.mjs';

const distance = (a,b) => Math.hypot(...a.map((v,i)=>v-b[i]));
const angle = (a,b) => 2*Math.acos(Math.min(1,Math.abs(a.reduce((sum,v,i)=>sum+v*b[i],0))));

test('guarded combo remains in forward defensive space with continuous grip orientation',()=>{
  let previous=guardedComboPose(0);
  for(let t=1/240;t<=COMBO_CYCLE;t+=1/240) {
    const pose=guardedComboPose(t);
    assert.ok(pose.arm.blade[2]<-.35,'no backswing behind the hands');
    assert.ok(pose.arm.wrist[2]<-.50 && pose.arm.wrist[2]>-.80,'compact forward reach');
    assert.ok(pose.arm.wrist[1]>-.34,'hand stays on a defending line');
    assert.ok(distance(previous.arm.wrist,pose.arm.wrist)<.02,'wrist moves without snapping');
    assert.ok(angle(previous.raw.turn,pose.raw.turn)<.11,'grip never flips');
    assert.equal(pose.offHand,null,'sorcery hand remains independent');
    previous=pose;
  }
  const start=guardedBracePose(),end=guardedComboPose(COMBO_CYCLE);
  assert.ok(distance(start.arm.wrist,end.arm.wrist)<1e-8);
  assert.ok(angle(start.raw.turn,end.raw.turn)<1e-6);
});

test('release after each guarded strike carries wrist velocity into direct Guard recovery',()=>{
  const h=1e-5;
  for(const from of COMBO_CONTACTS.map(t=>t+.1)) {
    const original=guardedComboPose(from), recovery=guardedRecoveryPose(from,0);
    assert.ok(distance(original.arm.wrist,recovery.arm.wrist)<1e-8);
    const before=guardedComboPose(from-h),after=guardedComboPose(from+h);
    const step=guardedRecoveryPose(from,h);
    const velocity=after.arm.wrist.map((v,i)=>(v-before.arm.wrist[i])/(2*h));
    const resumed=step.arm.wrist.map((v,i)=>(v-recovery.arm.wrist[i])/h);
    assert.ok(distance(velocity,resumed)<.02,'recovery retains outgoing velocity');
    let previous=recovery;
    for(let elapsed=1/240;elapsed<=.31;elapsed+=1/240) {
      const next=guardedRecoveryPose(from,elapsed);
      assert.ok(distance(previous.arm.wrist,next.arm.wrist)<.025);
      assert.ok(angle(previous.raw.turn,next.raw.turn)<.12);
      previous=next;
    }
    assert.ok(distance(previous.arm.wrist,guardedBracePose().arm.wrist)<1e-8);
  }
});

test('entering and lowering Chivalry Guard blend the ordinary path without changing its clock',()=>{
  const ordinary={...comboPose(COMBO_CONTACTS[1]),weight:.6};
  assert.equal(guardedSwordPose(ordinary,0),ordinary);
  const defended=guardedSwordPose(ordinary,1);
  const half=guardedSwordPose(ordinary,.5);
  assert.equal(defended.time,ordinary.time);
  assert.equal(defended.strike,ordinary.strike);
  assert.ok(distance(half.arm.wrist,ordinary.arm.wrist)<distance(defended.arm.wrist,ordinary.arm.wrist));
  assert.equal(half.weight,.8,'ordinary release fades into the persistent defended stance');
});
