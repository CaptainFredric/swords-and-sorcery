import test from 'node:test';import assert from 'node:assert/strict';
import {ramCameraFollow} from './ramCamera.mjs';
test('a steady carriage follows fine aim and rapid reversal immediately without orbit lag',()=>{
 const anchor=[0,0,0];let state=ramCameraFollow(null,anchor,[0,3,7.5],1/60);
 for(const yaw of [.01,.02,-.02,1,-1,0]){
  const target=[Math.sin(yaw)*7.5,3,Math.cos(yaw)*7.5];state=ramCameraFollow(state.anchor,anchor,target,1/60);assert.deepEqual(state.position,target);
 }
});
test('carriage correction is bounded while view switching keeps its current look offset',()=>{
 const state=ramCameraFollow([0,0,0],[1,0,0],[1,1.75,3],1/60);assert.ok(state.anchor[0]>0&&state.anchor[0]<1);
 assert.deepEqual(state.position.slice(1),[1.75,3]);
 const next=ramCameraFollow(state.anchor,[1,0,0],[8.5,3,0],1/60);assert.equal(next.position[0]-next.anchor[0],7.5);
});
