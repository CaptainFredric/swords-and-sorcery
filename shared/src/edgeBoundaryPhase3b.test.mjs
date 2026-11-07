import test from 'node:test';
import assert from 'node:assert/strict';
import { edgeInside, edgeLimitPoint, edgeClipTeleport, edgeFootprintInside,
  edgeMachineProgressAllowed, edgePresentedRadius, edgeRadiusAt } from './edgeBoundary.mjs';

const center={x:0,z:0};
test('outward motion is denied while inward and tangential motion survive',()=>{
  const at=edgeLimitPoint({x:20,y:4,z:3},center,8,.45);
  assert.ok(edgeInside(at,center,8,.45));
  assert.ok(at.z>0.5,'the lateral component survives radial clipping');
  assert.deepEqual(edgeLimitPoint({x:5,y:0,z:0},center,8,.45),{x:5,y:0,z:0});
});
test('an entire fast dash sweep lies within the convex resolve disk',()=>{
  const start={x:0,z:0},dest=edgeLimitPoint({x:500,y:0,z:500},center,8,.45);
  for(let i=0;i<=100;i++){
    const t=i/100;
    assert.ok(edgeInside({x:start.x+(dest.x-start.x)*t,z:start.z+(dest.z-start.z)*t},center,8,.45));
  }
});
test('Full-Lightning teleport clips along its ray, not a sideways redirected endpoint',()=>{
  const from={x:0,y:0,z:0},toward={x:14,y:0,z:5};
  const target=edgeClipTeleport(from,toward,{center,radius:8},.45);
  assert.ok(target);
  assert.ok(edgeInside(target,center,8,.45));
  assert.ok(Math.abs(target.z/target.x-5/14)<1e-8);
  assert.equal(edgeClipTeleport(from,{x:0,y:0,z:0},{center:{x:30,z:30},radius:8},.45),null);
});
test('whole vehicle footprint, not chassis center, decides legality',()=>{
  const box=x=>[{center:[x,1,0],size:[5,2,4]}];
  assert.ok(edgeInside({x:5,z:0},center,8));
  assert.equal(edgeFootprintInside(box(5),center,8),false);
  assert.equal(edgeFootprintInside(box(0),center,8),true);
  const edge={center,radius:8};
  assert.equal(edgeMachineProgressAllowed(box(5),box(4.9),edge),true,
    'an already-outside carriage may move inward');
  assert.equal(edgeMachineProgressAllowed(box(5),box(5.1),edge),false,
    'an already-outside carriage cannot advance farther outward');
});
test('presented client ring and movement radius share the authoritative clock',()=>{
  const stages=[{second:0,radius:18},{second:75,radius:15},{second:150,radius:11}];
  const state={startedAt:100,stages,radius:17};
  assert.equal(edgePresentedRadius(state,100,100),18);
  assert.ok(Math.abs(edgePresentedRadius(state,120,119.94)-edgeRadiusAt(20,stages))<1e-6);
  assert.ok(edgePresentedRadius(state,500,105)>=11,'prediction cannot advance a stalled snapshot by minutes');
});
