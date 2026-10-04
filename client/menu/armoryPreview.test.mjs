import test from 'node:test';
import assert from 'node:assert/strict';
import { ARMORY_GESTURES, ARMORY_PREVIEW_SEC, armoryPose, mixArmoryPose } from './armoryPreview.mjs';
test('every card has its own silhouette, and each settles fully into menu idle',()=>{
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
  assert.equal(new Set(signatures).size,7);
  assert.deepEqual(Object.keys(ARMORY_GESTURES),['fireball','frostfire','gale','steel','sunder','vortex','chivalry']);
  assert.ok(armoryPose('steel',.6).fist>.9);
  assert.ok(armoryPose('sunder',.3).sword.target.wrist[1]>1.8);
  assert.ok(armoryPose('frostfire',.62).spell.target.wrist[0]<-.6);
});
test('interrupted gestures blend from the current arm pose without restarting it',()=>{
  const from=armoryPose('gale',.8), to=armoryPose('steel',0);
  assert.deepEqual(mixArmoryPose(from,to,0),{spell:from.spell,sword:from.sword,body:from.body,crouch:from.crouch,fist:from.fist});
  const mid=mixArmoryPose(from,to,.5);
  assert.ok(mid.spell.weight<from.spell.weight);
  assert.equal(mixArmoryPose(from,to,1).spell.weight,0);
});

test('each gesture lands its beat on its cue\'s: the blow as the sword comes down, the crack as the arm snaps out, the fist on the plates', async () => {
  // Sunder's blow at 0.42 s (armory_cues.py): the sword is high just before it and down just after
  assert.ok(armoryPose('sunder',.33).sword.target.wrist[1]>1.9 && armoryPose('sunder',.44).sword.target.wrist[1]<1.0);
  // Frostfire's crack at 0.11 s: the arm moving fastest through it, snapping out
  const reach=(t)=>-armoryPose('frostfire',t).spell.target.wrist[2];
  assert.ok(reach(.13)-reach(.09)>reach(.5)-reach(.46)+.1,'snapping out at the crack, not drifting');
  // Steel's two contacts (0 and 0.088 s): the fist closed on the first, the body set by the second
  assert.ok(armoryPose('steel',.06).fist>.9 && armoryPose('steel',.12).crouch>.12);
  // the Gale's whoosh (from 0.19 s) as the arm sweeps out; the Fireball's bloom as the palm comes up
  assert.ok(armoryPose('gale',.18).spell.target.wrist[0]>-.3 && armoryPose('gale',.36).spell.target.wrist[0]<-.7);
  assert.ok(armoryPose('fireball',.3).spell.target.wrist[1]>1.35);
  // the Vortex's two passes: across one way, then back
  assert.ok(armoryPose('vortex',.27).sword.target.wrist[0]<.15 && armoryPose('vortex',.46).sword.target.wrist[0]>.4);
  // Chivalry: the blade drawn first, then the gauntlet raised to Guard
  assert.equal(armoryPose('chivalry',.28).spell,null);
  assert.ok(armoryPose('chivalry',.42).spell.weight>.99 && armoryPose('chivalry',.42).sword.target.wrist[1]>1.5);
});
