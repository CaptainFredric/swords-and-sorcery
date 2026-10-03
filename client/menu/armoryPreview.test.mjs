import test from 'node:test';
import assert from 'node:assert/strict';
import { ARMORY_GESTURES, ARMORY_PREVIEW_SEC, armoryPose, mixArmoryPose } from './armoryPreview.mjs';
test('all six silhouettes have distinct arm paths and settle fully into menu idle',()=>{
  const signatures=[];
  for(const id of Object.keys(ARMORY_GESTURES)){
    signatures.push(JSON.stringify([.35,.7,1].map(t=>armoryPose(id,t))));
    const end=armoryPose(id,ARMORY_PREVIEW_SEC);
    assert.equal(end.spell?.weight??0,0);
    assert.equal(end.sword?.weight??0,0);
    assert.equal(end.crouch,0);
    assert.equal(end.body,0);
    assert.equal(end.fist,0);
  }
  assert.equal(new Set(signatures).size,6);
  assert.ok(armoryPose('steel',.6).fist>.9);
  assert.ok(armoryPose('sunder',.6).sword.target.wrist[1]>1.8);
  assert.ok(armoryPose('frostfire',.62).spell.target.wrist[0]<-.6);
});
test('interrupted gestures blend from the current arm pose without restarting it',()=>{
  const from=armoryPose('gale',.8), to=armoryPose('steel',0);
  assert.deepEqual(mixArmoryPose(from,to,0),{spell:from.spell,sword:from.sword,body:from.body,crouch:from.crouch,fist:from.fist});
  const mid=mixArmoryPose(from,to,.5);
  assert.ok(mid.spell.weight<from.spell.weight);
  assert.equal(mixArmoryPose(from,to,1).spell.weight,0);
});
