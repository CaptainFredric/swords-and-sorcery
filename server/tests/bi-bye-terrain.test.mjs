import test from 'node:test';
import assert from 'node:assert/strict';
import {createBiByeLlista,stepBiByeLlista,mountBiByeLlista,toggleBiByeDeploy,getBiByeOperatorTransform,getBiByeMuzzlePosition,getBiByeMuzzleDirection} from '../../shared/sim/biByeLlista.mjs';
import {biByeFrames} from '../../shared/sim/biByeComponents.mjs';
import {boxWorld} from '../../shared/src/orientedBox.mjs';
const rad=n=>n*Math.PI/180;
const floor={id:'ground',center:[0,-.1,0],size:[100,.2,100],y:0};
function course(degrees=0){
 const slope=Math.tan(rad(degrees)),entry=3*Math.tan(rad(degrees/2)),height=entry+11*slope;
 return {solids:[],floors:[floor,{id:'plateau',center:[0,height-.1,24],size:[8,.2,20],y:height}],ramps:degrees?[
  {id:'entry',minX:-4,maxX:4,minZ:0,maxZ:3,startY:0,endY:entry,axis:'z'},
  {id:'grade',minX:-4,maxX:4,minZ:3,maxZ:14,startY:entry,endY:height,axis:'z'}]:[]};
}
function setup(world=course(),overrides={}){const b=createBiByeLlista({x:0,z:-4,baseYaw:Math.PI,...overrides}),p={id:'driver',alive:true,position:{x:b.x,y:b.y,z:b.z},input:{forward:1,yaw:Math.PI,pitch:0}};mountBiByeLlista(b,p);p.input.forward=1;return {b,p,room:{world,players:new Map([[p.id,p]]),events:[]},time:0};}
function step(s,n=1){for(let i=0;i<n;i++){s.time+=1/30;stepBiByeLlista(s.room,s.b,1/30,s.time);}}
function reach(s,z,max=700){for(let i=0;i<max&&s.b.z<z;i++)step(s);return s.b;}

test('six wheel support climbs a 22 degree grade with continuous attitude and uphill speed reduction',()=>{
 const s=setup(course(22)),poses=[];for(let i=0;i<500&&s.b.z<7;i++){step(s);poses.push({...s.b});}
 assert.ok(s.b.z>=7,'carriage climbs past the old support height barrier');
 assert.ok(Math.abs((s.b.chassisPitch??0)-rad(22))<.015,'chassis follows real grade');
 assert.ok(Math.abs(s.b.chassisRoll??0)<.005);assert.ok(s.b.speed>1&&s.b.speed<2.2);
 for(let i=1;i<poses.length;i++){assert.ok(Math.abs(poses[i].y-poses[i-1].y)<.07);assert.ok(Math.abs(poses[i].chassisPitch-poses[i-1].chassisPitch)<.08);}
 assert.equal(s.b.wheelOffsets.length,6);assert.ok(s.b.wheelOffsets.every(n=>Math.abs(n)<.13));
});
test('downhill and reversing retrace a supported grade without vertical jumps',()=>{
 const s=setup(course(20));reach(s,7);const top=s.b.y;s.p.input.forward=-1;
 for(let i=0;i<600&&s.b.z> -3;i++)step(s);
 assert.ok(s.b.z< -2.5);assert.ok(top>1);assert.ok(Math.abs(s.b.y)<.02);assert.ok(Math.abs(s.b.chassisPitch)<.01);
 assert.ok(s.b.wheelRolls.every(Number.isFinite));
});
test('cross slope produces roll and all six contacts rather than a level floating chassis',()=>{
 const world={solids:[],floors:[],ramps:[{id:'cross',minX:-20,maxX:20,minZ:-20,maxZ:20,axis:'x',startY:-20*Math.tan(rad(14)),endY:20*Math.tan(rad(14))}]};
 const s=setup(world);step(s,100);assert.ok(s.b.z>2);
 assert.ok(Math.abs(Math.abs(s.b.chassisRoll??0)-rad(14))<.015);assert.ok(Math.abs(s.b.chassisPitch)<.01);
 assert.equal(s.b.wheelOffsets.length,6);assert.ok(Math.abs(s.b.y)<.003,'tire width does not lift the axle on a cross slope');
});
test('wheel radius climbs .15 and .25m solid curbs while a .35m riser remains an obstacle',()=>{
 for(const height of [.15,.25,.35]){
  const world=course();world.solids=[{id:'curb',center:[0,height/2,4],size:[8,height,8]}];
  const s=setup(world);reach(s,6,650);
  if(height<=.25){assert.ok(s.b.z>5.5,`climb ${height}`);assert.ok(Math.abs(s.b.y-height)<.025);}
  else assert.ok(s.b.z<0,'tall curb stops front wheels before entry');
 }
});
test('full walls, steep ramps, narrow rocks and unsupported drops cannot be tunneled through',()=>{
 const wall=course();wall.solids=[{id:'wall',center:[0,2,1],size:[10,4,.08]}];const a=setup(wall);step(a,180);assert.ok(a.b.z<0);
 const steep=setup(course(30));step(steep,500);assert.ok(steep.b.z<5);assert.ok(steep.b.chassisPitch<rad(22.2));
 const drop={solids:[],floors:[{...floor,center:[0,-.1,-12],size:[12,.2,24]}],ramps:[]};const b=setup(drop);step(b,300);assert.ok(b.b.z<0);assert.ok(Math.abs(b.b.y)<.01);
 const rock=course();rock.solids=[{id:'rock',center:[.9,.65,1],size:[.5,1.3,.12]}];const c=setup(rock);step(c,180);assert.ok(c.b.z<1);
});
test('damage speed penalties and immobilization remain authoritative on terrain',()=>{
 const healthy=setup(course(18)),damaged=setup(course(18));damaged.b.components.Wheel_FL.health=0;
 step(healthy,180);step(damaged,180);assert.ok(healthy.b.z>damaged.b.z+.5);
 damaged.b.components.Wheel_RL.health=0;const before=damaged.b.z;step(damaged,90);assert.equal(damaged.b.z,before);assert.equal(damaged.b.speed,0);
});
test('deployment accepts supported mild grades and rejects steep or unsupported pads',()=>{
 const mild=setup(course(6));reach(mild,7);assert.equal(toggleBiByeDeploy(mild.b,mild.time,mild.room.world),true);
 const steep=setup(course(12));reach(steep,7);assert.equal(toggleBiByeDeploy(steep.b,steep.time,steep.room.world),false);assert.match(steep.b.deploymentReason,/steep/i);
 const edge=setup({solids:[],ramps:[],floors:[{...floor,size:[3,.2,100]}]});step(edge);assert.equal(toggleBiByeDeploy(edge.b,edge.time,edge.room.world),false);assert.match(edge.b.deploymentReason,/ground|support/i);
});
test('inclined carriage frame keeps operator in the real seat and independent world aim consistent',()=>{
 const b={...createBiByeLlista({x:3,y:2,z:4,baseYaw:.7}),chassisPitch:rad(18),chassisRoll:rad(9),mode:'DEPLOYED',mainYaw:1,mainPitch:.1,upperYaw:2.5,upperPitch:.12};
 const root=biByeFrames(b).root,seat=getBiByeOperatorTransform(b);
 const expected=boxWorld(root,[0,-.05,-1.88]);
 assert.ok(Math.hypot(...Object.values(seat.position).map((v,i)=>v-expected[i]))<1e-8);
 assert.ok(Math.abs(root.axes[2][1])>.2,'root includes pitch');
 for(const yaw of [-Math.PI,-1,0,1,Math.PI]){
  const p={...b,upperYaw:yaw};const d=getBiByeMuzzleDirection(p,'conditioning');
  assert.ok(Math.abs(d.y-Math.sin(.12))<1e-8);assert.ok(Math.abs(Math.atan2(-d.x,-d.z)-Math.atan2(Math.sin(yaw),Math.cos(yaw)))<1e-8);
  const muzzle=getBiByeMuzzlePosition(p,'conditioning');assert.ok(Object.values(muzzle).every(Number.isFinite));
 }
});

test('reticle target calibration accounts for the actual rotating muzzles at several ranges',async()=>{
 const {biByeConstrainAim}=await import('../../shared/sim/biByeComponents.mjs');
 const {biByeTargetAim,biByeCoupledAim}=await import('../../shared/sim/biByeLlista.mjs');
 for(const incline of [0,rad(6),rad(18)])for(const yaw of [0,.4,Math.PI])for(const distance of [10,20,35,50]){
  const b={...createBiByeLlista({x:0,y:0,z:0,baseYaw:0}),mode:'DEPLOYED',chassisPitch:incline,chassisRoll:rad(4),weaponFocus:'UPPER'};
  const reference=biByeConstrainAim(b,{yaw,pitch:incline*Math.cos(yaw)+.1},true),source=getBiByeMuzzlePosition(b,'conditioning',reference),axis=getBiByeMuzzleDirection(b,'conditioning',reference);
  const target={x:source.x+axis.x*distance,y:source.y+axis.y*distance,z:source.z+axis.z*distance};
  const aim=biByeTargetAim(b,'conditioning',{yaw,pitch:.1},target),p=getBiByeMuzzlePosition(b,'conditioning',aim),d=getBiByeMuzzleDirection(b,'conditioning',aim);
  const t=(target.x-p.x)*d.x+(target.y-p.y)*d.y+(target.z-p.z)*d.z;
  const miss=Math.hypot(p.x+d.x*t-target.x,p.y+d.y*t-target.y,p.z+d.z*t-target.z);
  // Mechanical stops take priority over a reticle beyond the elevation envelope.
  assert.ok(miss<.012,`${incline}/${yaw}/${distance} missed by ${miss}`);
 }
 const b={...createBiByeLlista({x:0,z:0,baseYaw:0}),mode:'DEPLOYED',mainPitch:.1};
 for(const distance of [10,20,50]){
  const p=getBiByeMuzzlePosition(b,'siege'),d=getBiByeMuzzleDirection(b,'siege');
  b.aimTarget={x:p.x+d.x*distance,y:p.y+d.y*distance,z:p.z+d.z*distance};
  const aim=biByeCoupledAim(b),upper=getBiByeMuzzlePosition(b,'conditioning',aim),axis=getBiByeMuzzleDirection(b,'conditioning',aim);
  const t=(b.aimTarget.x-upper.x)*axis.x+(b.aimTarget.y-upper.y)*axis.y+(b.aimTarget.z-upper.z)*axis.z;
  assert.ok(Math.hypot(upper.x+axis.x*t-b.aimTarget.x,upper.y+axis.y*t-b.aimTarget.y,upper.z+axis.z*t-b.aimTarget.z)<.005);
 }
});
test('repeat runs are deterministic through contacts, steering, reverse and damage',()=>{
 const run=()=>{const s=setup(course(18));for(let i=0;i<320;i++){s.p.input.right=i>90&&i<110?.1:0;s.p.input.forward=i>230?-1:1;if(i===140)s.b.components.Wheel_FL.health=0;step(s);}return s.b;};
 assert.deepEqual(run(),run());
});

test('loss of planting ground retracts the supports and prevents a heavy release',()=>{
 const s=setup(course(0));assert.ok(toggleBiByeDeploy(s.b,0,s.room.world));step(s,45);assert.equal(s.b.mode,'DEPLOYED');
 s.room.world.floors=[];step(s);assert.equal(s.b.mode,'RETRACTING');assert.equal(s.b.deploymentSupported,false);assert.match(s.b.deploymentReason,/support|ground/i);
});
