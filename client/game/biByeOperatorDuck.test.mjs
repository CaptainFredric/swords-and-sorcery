import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BiByeOperatorPose } from './BiByeOperatorPose.mjs';
import { biByeOperatorDuck } from './biByeOperatorState.mjs';

function fittedBody(){
 const root=new THREE.Group(),bones=new Map();
 let parent=root;
 // Actual parent-child trunk structure in the production seated rig.
 for(const name of ['pelvis','spine','chest','neck','head']){
  const bone=new THREE.Bone();bone.name=name;parent.add(bone);bones.set(name,bone);parent=bone;
 }
 const pose=new BiByeOperatorPose(root,bones);
 const top=()=>{
  root.updateMatrixWorld(true);
  return bones.get('head').getWorldPosition(new THREE.Vector3());
 };
 return {pose,bones,top};
}
test('production-fitted Ballista operator bends head and chest below ordinary seated height during real sweep',()=>{
 const {pose,bones,top}=fittedBody();
 try{
  pose.apply({},1);
  const standing=top();
  const seatY=bones.get('pelvis').position.y;
  const single={sweep:{kind:'single',phase:'single',startedAt:1}};
  pose.apply(single,1.65);
  const ducked=top();
  assert.ok(ducked.y<standing.y-.075,`helm did not visibly duck: ${standing.y} -> ${ducked.y}`);
  assert.equal(bones.get('pelvis').position.y,seatY,'remain seated without dropping the rider through the chassis');
  assert.ok(ducked.z<standing.z,'knight folds forward at the hips/chest rather than shrinking');
  pose.apply({},3);
  assert.ok(top().distanceTo(standing)<1e-5,'posture restores actual fitted production rig without bone drift');
 }finally{pose.dispose();}
});
test('bow-limb operator duck is keyed to every authoritative phase and protected through settle',()=>{
 const single={sweep:{kind:'single',phase:'single',startedAt:10}};
 assert.equal(biByeOperatorDuck(single,10),0);
 assert.ok(biByeOperatorDuck(single,10.13)>0);
 assert.ok(biByeOperatorDuck(single,10.6)>.95);
 assert.ok(biByeOperatorDuck(single,11.65)<.01);
 const skill={sweep:{kind:'skill',phase:'opening',startedAt:20}};
 assert.ok(biByeOperatorDuck(skill,20.13)>0);
 skill.sweep.phase='loop';
 assert.equal(biByeOperatorDuck(skill,23),1);
 skill.sweep.phase='settle';skill.sweep.stopAt=23;
 assert.equal(biByeOperatorDuck(skill,23.75),1,'physical slow settle never exposes operator to swept limbs');
 delete skill.sweep;skill.lastSweepEndAt=23.75;
 assert.ok(biByeOperatorDuck(skill,23.90)>0);
 assert.equal(biByeOperatorDuck(skill,24.2),0);
});
