import test from 'node:test';
import assert from 'node:assert/strict';
import { oneHitWorldContact,planOneHitTeleport,oneHitAimDirection } from './oneHitTrajectory.mjs';

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

test('a downward Gale-Lightning teleport lands ON terrain and chooses the grounded form',()=>{
  const cast={origin:{x:0,y:2.5,z:0},yaw,pitch:-.50,aerial:true,holdSec:1.8};
  const field=planOneHitTeleport({...cast,world});
  assert.ok(field.legal && field.grounded && Math.abs(field.end.y)<1e-6);
  assert.ok(field.end.x>4 && field.end.x<5);
  const unsupported=planOneHitTeleport({...cast,world:{solids:[]}});
  assert.ok(unsupported.legal && unsupported.end.y<0 && unsupported.end.x>field.end.x);
  const ramp={axis:'x',minX:1,maxX:8,minZ:-2,maxZ:2,startY:0,endY:2};
  const rising=planOneHitTeleport({...cast,world:{...world,ramps:[ramp]}});
  assert.ok(rising.legal && rising.end.x<field.end.x);
  assert.ok(rising.grounded && Math.abs(rising.end.y-(rising.end.x-1)*2/7)<.01);
});

test('Full Gale allows vertical repositioning from the GROUND; without Gale pitch remains level',()=>{
  const base={origin,yaw,pitch:Math.PI/3,aerial:false,holdSec:1.3,world};
  const ordinary=planOneHitTeleport(base);
  assert.ok(ordinary.legal&&ordinary.grounded&&Math.abs(ordinary.end.y)<1e-7);
  const gale=planOneHitTeleport({...base,allowVertical:true});
  assert.ok(gale.legal&&!gale.grounded&&gale.end.y>8);
  const returning=planOneHitTeleport({...base,origin:{x:0,y:8,z:0},pitch:-Math.PI/3,allowVertical:true});
  assert.ok(returning.legal&&returning.grounded&&Math.abs(returning.end.y)<1e-6);
});

test('omnidirectional Full Gale+Lightning aims independently at all compass bearings and heights',()=>{
  const axes=[
    {yaw:0,axis:'z',sign:-1},
    {yaw:Math.PI/2,axis:'x',sign:-1},
    {yaw:Math.PI,axis:'z',sign:1},
    {yaw:3*Math.PI/2,axis:'x',sign:1},
  ];
  for(const {yaw,axis,sign} of axes){
    const aim=oneHitAimDirection(yaw,.3,true);
    assert.ok(aim[axis]*sign>.9,'the aim can rotate to '+yaw);
    const plan=planOneHitTeleport({origin,yaw,pitch:.3,allowVertical:true,holdSec:1.1,world});
    assert.equal(plan.legal,true);
    assert.ok((plan.end[axis]-origin[axis])*sign>4);
    assert.ok(plan.end.y>0);
  }
  assert.ok(oneHitAimDirection(0,Math.PI/2,true).y>.999,'directly above');
  assert.ok(oneHitAimDirection(0,-Math.PI/2,true).y<-.999,'directly below');
  assert.equal(oneHitAimDirection(0,Math.PI/2,false).y,0,
    'Lightning without Full Gale remains ground-locked');
  const vertical=planOneHitTeleport({origin,yaw:0,pitch:Math.PI/2,allowVertical:true,
    holdSec:.7,world});
  assert.ok(vertical.legal&&!vertical.grounded&&vertical.end.y>5);
});
