import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BI_BYE_OPERATOR_POSES } from './biByeOperatorPoses.mjs';
import { biByeOperatorDuck } from './biByeOperatorState.mjs';

// Keep the Node suite independent of WebGL / Three.js. This composes the
// actual export-fitted trunk bone positions and quaternion bases. The Chrome
// acceptance separately measures the real world-space skeleton in action.
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const mul=(a,b)=>[
 a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],
 a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
 a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],
 a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2],
];
const rotate=(q,v)=>mul(mul(q,[...v,0]),[-q[0],-q[1],-q[2],q[3]]).slice(0,3);
const xRot=r=>[Math.sin(r/2),0,0,Math.cos(r/2)];
function fittedSeatedTrunk(duck=0){
 const poses=BI_BYE_OPERATOR_POSES.poses.wheel;
 let pos=[0,0,0],q=[0,0,0,1];
 const angles={spine:-.62,chest:-.24,neck:.20,head:-.12},parts={};
 for(const name of ['pelvis','spine','chest','neck','head']){
  const bone=poses[name];
  pos=add(pos,rotate(q,bone.position));
  q=mul(q,mul(bone.quaternion,xRot((angles[name]??0)*duck)));
  parts[name]=[...pos];
 }
 return parts;
}
test('production-fitted Bi-Bye operator actually lowers helm and moves forward while keeping pelvis stationary',()=>{
 const upright=fittedSeatedTrunk(),folded=fittedSeatedTrunk(1),reset=fittedSeatedTrunk(0);
 assert.ok(upright.head[1]-folded.head[1]>.10,
  'actual export-fitted helmet needs over 10cm of downward clearance at full tuck');
 assert.ok(upright.head[2]-folded.head[2]>.29,
  'sword operator folds his torso forward rather than shrinking');
 assert.deepEqual(folded.pelvis,upright.pelvis,'seat and legs are not translated');
 assert.deepEqual(reset,upright,'posture returns to the actual original fitted bone bases');
 const source=readFileSync(new URL('./BiByeOperatorPose.mjs',import.meta.url),'utf8');
 assert.match(source,/biByeOperatorDuck\(b,now\)/);
 assert.match(source,/\['spine',-\.62\],\['chest',-\.24\],\['neck',\.20\],\['head',-\.12\]/);
 assert.match(source,/this\.#arm\('L',grips\.left\)/,
  'real IK should continue pinning both hands to the machine after the torso bends');
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
