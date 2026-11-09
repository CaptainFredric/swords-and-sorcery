import test from 'node:test';
import assert from 'node:assert/strict';
import { oneHitWorldContact,planOneHitTeleport } from './oneHitTrajectory.mjs';

const origin={x:0,y:0,z:0},yaw=-Math.PI/2,pitch=0;
const world={floors:[{center:[0,-.1,0],size:[200,.2,200],y:0}],solids:[]};
test('teleport preview uses the release path: wall clearance, boundary clipping and invalid support',()=>{
  const opts={origin,yaw,pitch,aerial:false,holdSec:2,world};
  assert.ok(planOneHitTeleport(opts).end.x>20);
  const blocked=planOneHitTeleport({...opts,solids:[{center:[6,1,0],size:[.4,3,6]}]});
  assert.ok(blocked.legal && blocked.end.x>5&&blocked.end.x<5.4);
  const edge=planOneHitTeleport({...opts,edge:{center:origin,radius:6}});
  assert.ok(edge.legal && edge.end.x>5&&edge.end.x<6);
  assert.equal(planOneHitTeleport({...opts,world:{solids:[]}}).legal,false);
  const vertical=planOneHitTeleport({...opts,aerial:true,pitch:Math.PI/4});
  assert.ok(vertical.legal&&vertical.end.y>10);
});

test('rising ramp can terminate an approaching horizontal wave; floor is not a ceiling',()=>{
  const terrain={...world,ramps:[{axis:'x',minX:2,maxX:6,minZ:-2,maxZ:2,startY:0,endY:2}]};
  const result=oneHitWorldContact({x:3,y:1,z:0},{x:5,y:1,z:0},terrain);
  assert.equal(result.kind,'ground');
  assert.equal(result.t,.5);
  assert.equal(oneHitWorldContact({x:0,y:-1,z:0},{x:0,y:1,z:0},terrain),null);
});
