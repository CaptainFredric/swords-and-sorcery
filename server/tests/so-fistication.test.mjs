import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomManager} from '../../shared/sim/RoomManager.mjs';
import {createSoFistication,mountSoFistication,stepSoFistication,fireSoFistication} from '../../shared/sim/soFistication.mjs';
import {soFistPose,soFistVolumes} from '../../shared/sim/soFistGeometry.mjs';
const ground={solids:[],ramps:[],floors:[{id:'ground',center:[0,-.1,0],size:[600,.2,600],y:0}],abyssY:-20};
function setup(){const room=new RoomManager().createSoloRoom('PRACTICE',0,'castleward');room.world=structuredClone(ground);room.state='PLAYING';const p=room.addPlayer({id:'p',token:'p',name:'Driver'},0);p.position={x:0,y:0,z:3.1};p.spawnProtectionUntil=0;const b=room.soFistication=createSoFistication({x:0,y:0,z:0,heading:0});assert.ok(mountSoFistication(room,b,p,0));return{room,p,b,time:0};}
function run(s,seconds,input={},dt=1/60){s.p.input={forward:0,right:0,yaw:0,pitch:0,...input};for(let i=0;i<Math.round(seconds/dt);i++){s.time+=dt;stepSoFistication(s.room,s.b,dt,s.time,s.room.world);}return s;}
test('authored four wheel carriage accelerates, reverses and turns without lateral sliding',()=>{
 const s=setup();run(s,3,{forward:1});assert.ok(Math.abs(s.b.speed-4.2)<.02);assert.ok(s.b.z<-9);assert.equal(s.b.wheelRolls.length,4);assert.equal(s.p.guardStamina,100);
 const at=s.b.z;run(s,4,{forward:-1});assert.ok(s.b.speed>=-2.01&&s.b.speed< -1.7);assert.ok(s.b.z>at);
 const turn=setup();run(turn,3,{forward:1,right:1});assert.ok(Math.abs(turn.b.heading)>1);const still=setup();run(still,1,{right:1});assert.equal(still.b.heading,0);assert.equal(still.b.x,0);
});
test('held Knock on Steel sustains beyond1.5s, drains its own pressure, winds down and requires recovery',()=>{
 const s=setup();run(s,4,{sprint:true});assert.ok(s.b.speed>11);assert.ok(s.b.pressure<100&&s.b.pressure>0);assert.equal(s.p.guardStamina,100);
 run(s,6,{sprint:true});assert.ok(s.b.pressure<25);assert.ok(s.b.speed<7);assert.equal(s.b.charging,false);
 run(s,2);assert.ok(s.b.pressure>25);const before=s.b.speed;run(s,.1,{sprint:true});assert.ok(s.b.speed<before+1,'acceleration prevents a renewed instantaneous full speed charge');
});
test('thin stone wall stops a full speed charge and a dead operator cannot keep charging',()=>{
 const s=setup();s.room.world.solids=[{id:'thin-wall',center:[0,1,-22],size:[15,2,.08],material:'stone'}];run(s,5,{sprint:true});assert.ok(s.b.z>-20,'occupied front remains outside the wall');assert.ok(Math.abs(s.b.speed)<.2);
 s.p.alive=false;run(s,.1,{sprint:true});assert.equal(s.b.operatorId,null);assert.equal(s.p.operatingRamId,null);assert.equal(s.b.charging,false);
});
test('actual piston curve has1.4575m stroke and peak velocity before its hard stop',()=>{
 const b=createSoFistication();b.strikeAt=0;const a=soFistPose(b,1.8),peak=soFistPose(b,2.2),end=soFistPose(b,2.26);
 assert.ok(Math.abs(end.offset-a.offset-1.4575)<.0001);assert.ok(peak.velocity>10);assert.ok(end.velocity<=0);assert.equal(end.active,false);assert.equal(soFistVolumes(b,0).filter(v=>v.componentId.startsWith('Wheel')).length,4);
 const s=setup();assert.ok(fireSoFistication(s.room,s.b,0));assert.equal(fireSoFistication(s.room,s.b,.1),false);run(s,4.1,{forward:1});assert.ok(s.b.z< -10,'idle piston never locks carriage movement');
});
test('the grounded operator station has physical clearance during mounting and travel',()=>{
 const s=setup();s.b.operatorId=null;s.p.operatingRamId=null;
 s.room.world.solids=[{id:'rear-stone',center:[0,.9,3.05],size:[.4,1.8,.4],material:'stone'}];
 assert.equal(mountSoFistication(s.room,s.b,s.p,0),false,'an alternate exit does not make an occupied station safe');
 s.room.world.solids=[];assert.ok(mountSoFistication(s.room,s.b,s.p));
 s.room.world.solids=[{id:'reverse-post',center:[0,.9,5.6],size:[.25,1.8,.25],material:'stone'}];run(s,3,{forward:-1});assert.ok(s.p.position.z<5.04,'operator cannot reverse through a post');
});
test('a real operator reel winds the drive down and a tiny pressure reserve cannot instantly recharge',()=>{
 const s=setup();run(s,2,{sprint:true});const before=s.b.speed;s.p.staggerUntil=s.time+.22;run(s,.15,{sprint:true});assert.equal(s.b.charging,false);assert.ok(s.b.speed<before);s.p.staggerUntil=0;s.b.pressure=2;run(s,.1,{sprint:true});assert.equal(s.b.charging,false);
});
test('four wheel terrain support follows a moderate ramp in both directions and rejects a steep face or drop',()=>{
 const ramp={...ground,ramps:[{id:'grade',minX:-10,maxX:10,minZ:-30,maxZ:0,startY:0,endY:8,axis:'z'}]};
 const s=setup();s.b.z=-18;s.b.y=3.2;s.room.world=ramp;run(s,2,{forward:1});assert.ok(s.b.z< -20);assert.ok(s.b.y<3.2);assert.ok(s.b.chassisPitch<-.2);assert.ok(s.b.wheelOffsets.every(v=>Math.abs(v)<.1));const low=s.b.y,down=s.b.z;run(s,6,{forward:-1});assert.ok(s.b.z>down);assert.ok(s.b.y>low);
 const steep=setup();steep.room.world={...ground,ramps:[{id:'steep',minX:-4,maxX:4,minZ:-20,maxZ:0,startY:8,endY:0,axis:'z'}]};run(steep,2,{forward:1});assert.ok(steep.b.z> -1);
 const drop=setup();drop.room.world.floors=[{id:'end',center:[0,-.1,2.5],size:[20,.2,10],y:0}];run(drop,2,{forward:1});assert.ok(drop.b.z> -1.65,'front wheels stay on supported ground');
});
test('four damaged wheels and the accessible drive affect pressure and mobility independently of hull health',()=>{
 const healthy=setup(),hurt=setup();hurt.b.components.Wheel_FL.health=0;run(healthy,3,{forward:1});run(hurt,3,{forward:1});assert.ok(hurt.b.speed<healthy.b.speed*.8);assert.equal(hurt.b.health,1400);
 hurt.b.components.Wheel_RL.health=0;run(hurt,2,{forward:1,sprint:true});assert.equal(hurt.b.speed,0,'both left wheels disable drive');
 const drive=setup();drive.b.components.Drive.health=0;run(drive,3,{forward:1});assert.ok(drive.b.speed<2);assert.equal(drive.b.health,1400);
 const charge=setup();run(charge,8,{sprint:true});assert.ok(charge.b.charging);run(charge,.8,{sprint:true});assert.equal(charge.b.charging,false,'full pressure gives roughly5.5seconds at peak after acceleration');
});
test('front wheels follow the real turn, inner wheel travels less, and crawling preserves useful turning clearance',async()=>{
 const {soFistWheelSteering,soFistTurnRate}=await import('../../shared/sim/soFistGeometry.mjs');const right=soFistWheelSteering({speed:4.2,steer:1});assert.ok(right[0]<0&&right[1]<right[0]);assert.deepEqual(right.slice(2),[0,0]);assert.deepEqual(soFistWheelSteering({speed:-4.2,steer:1}),right);assert.ok(1/Math.abs(soFistTurnRate({speed:1,steer:1}))>=3.25);
 const s=setup();run(s,3,{forward:1,right:1});assert.ok(s.b.heading<-.8);assert.ok(s.b.wheelRolls[1]<s.b.wheelRolls[0]);
});

test('rotated ram movement solids leave the empty diagonal approach accessible', async () => {
 const {soFistSolids}=await import('../../shared/sim/soFistGeometry.mjs');
 const {resolvePlayerWorld}=await import('../../shared/src/collision.mjs');
 const b=createSoFistication({heading:Math.PI/4});
 const at={x:-.7,y:0,z:1.4};
 assert.deepEqual(resolvePlayerWorld(at,.45,soFistSolids(b)),at);
 assert.ok(soFistSolids(b).every(s=>s.axes),'movement keeps component orientation');
});
