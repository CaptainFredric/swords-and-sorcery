import test from 'node:test';
import assert from 'node:assert/strict';
import {HIGH_GROUNDS} from '../../shared/worlds/highGrounds.mjs';
import {Room} from '../../shared/sim/Room.mjs';
import {surfaceHeightAt} from '../../shared/src/collision.mjs';
import {createSoFistication,mountSoFistication,soFistEntry,
 soFistTerrainPose,stepSoFistication,primeSoFistSkill,RAM_TERRAIN}
 from '../../shared/sim/soFistication.mjs';
import {createBiByeLlista,mountBiByeLlista,stepBiByeLlista}
 from '../../shared/sim/biByeLlista.mjs';
import {biByeTerrainContext,biByeTerrainPose,BI_BYE_TERRAIN}
 from '../../shared/sim/biByeTerrain.mjs';
import {findHellpingLedge,LEDGE_PULL} from '../../shared/sim/soFistLedge.mjs';

const highGrounds={solids:[],floors:HIGH_GROUNDS.floors,ramps:HIGH_GROUNDS.ramps};
function ram(world,{x=0,y=0,z=0,heading=0,skill='hellpingHand'}={}){
 const room=new Room('RAM_RAMP_TEST',{mode:'PRACTICE'});room.state='PLAYING';
 room.world=world;const p=room.addPlayer({id:'driver',token:'driver',name:'Driver',
   siegeLoadout:{soFist:skill}},0);
 const b=room.soFistication=createSoFistication({x,y,z,heading});
 p.position=soFistEntry(b,world);p.spawnProtectionUntil=0;
 assert.equal(mountSoFistication(room,b,p,0),true);
 p.input={forward:0,right:0,sprint:false};
 return {room,p,b,time:0};
}
function ballista(world,{x=0,y=0,z=-5,heading=Math.PI}={}){
 const b=createBiByeLlista({x,y,z,baseYaw:heading});
 const p={id:'driver',alive:true,position:{x,y,z},
  input:{forward:1,right:0,yaw:heading,pitch:0}};
 assert.equal(mountBiByeLlista(b,p),true);
 p.input.forward=1;
 return {room:{world,players:new Map([[p.id,p]]),events:[]},p,b,time:0};
}
function drive(s,kind,steps){
 for(let i=0;i<steps;i++){
  s.time+=1/30;
  if(kind==='ram')stepSoFistication(s.room,s.b,1/30,s.time);
  else stepBiByeLlista(s.room,s.b,1/30,s.time);
 }
}
test('real High Grounds western ascent supports the ram at multiple elevations',()=>{
 const s=ram(highGrounds,{x:-38,z:-105,heading:Math.PI,skill:'beatToThePunch'});
 s.p.input.forward=1;
 drive(s,'ram',240);
 assert.ok(s.b.z>-90, 'ram should enter the actual western ramp');
 assert.ok(s.b.y>1.3,'ram chassis rises with the actual wheel contacts');
 assert.ok(Math.abs(s.b.chassisPitch)<=RAM_TERRAIN.maxGrade+.001);
 assert.ok(s.b.wheelOffsets.every(Number.isFinite));
});
test('real High Grounds ascent supports six ballista wheels, not just infantry',()=>{
 const s=ballista(highGrounds,{x:-38,z:-105,heading:Math.PI});
 drive(s,'ballista',330);
 assert.ok(s.b.z>-91,'ballista should climb rather than stall on the ramp lip');
 assert.ok(s.b.y>.9,'ballista wheels follow the inclined surface');
 assert.ok(Math.abs(s.b.chassisPitch)<=BI_BYE_TERRAIN.mobileGrade+.003);
});
test('26.6 degree canopy-to-crown cross ramp is inside the mobile siege grade envelope',()=>{
 const ramp=HIGH_GROUNDS.ramps.find(r=>r.id==='west-to-crown');
 const angle=Math.atan(Math.abs(ramp.endY-ramp.startY)/(ramp.maxX-ramp.minX));
 assert.ok(angle>22*Math.PI/180&&angle<RAM_TERRAIN.maxGrade);
 assert.ok(angle<BI_BYE_TERRAIN.mobileGrade);
 const sample={...createSoFistication({x:-22,z:-7.5,y:6,heading:Math.PI/2})};
 assert.ok(soFistTerrainPose(sample,highGrounds),'ram accepts middle of real ramp');
 const bow=createBiByeLlista({x:-22,z:-7.5,y:6,baseYaw:Math.PI/2});
 assert.ok(biByeTerrainPose(bow,biByeTerrainContext(highGrounds,bow)),
   'ballista accepts middle of real ramp');
});
test('ram refuses unsupported air and truly steep ramps despite increased approach grades',()=>{
 const cliff={solids:[],floors:[{center:[0,-.1,2],size:[12,.2,8],y:0}],ramps:[]};
 const b=createSoFistication({x:0,y:0,z:-6,heading:Math.PI});
 assert.equal(soFistTerrainPose(b,cliff),null);
 const steep={solids:[],floors:[],ramps:[{axis:'z',minX:-6,maxX:6,
   minZ:-10,maxZ:10,startY:0,endY:14}]};
 assert.equal(soFistTerrainPose(createSoFistication({x:0,y:7,z:0,heading:Math.PI}),steep),null);
});
function ledgeWorld(){
 return {solids:[],ramps:[],floors:[
  {id:'approach',center:[0,-.1,1],size:[16,.2,8],y:0},
  {id:'destination',center:[0,1.15,-10],size:[16,.2,10.4],y:1.25},
 ]};
}
test('a genuine nearby ledge produces a pre-edge U prompt and a single press pulls the ram up',()=>{
 const s=ram(ledgeWorld(),{z:-1});
 drive(s,'ram',1);
 assert.ok(s.b.hellpingLedge?.anchor,'server detects a reachable physical ledge');
 assert.ok(s.b.hellpingLedge?.landing.y>1,'landing is on elevated floor');
 assert.equal(primeSoFistSkill(s.room,s.b,s.p,s.time+.01),null);
 assert.equal(s.b.hellping.phase,'ledgePull','one press catches ledge even from closed fist');
 assert.ok(s.b.hellping.anchor.y>1);
 drive(s,'ram',Math.ceil(LEDGE_PULL.duration*30)+2);
 assert.equal(s.b.hellping?.phase,'release');
 assert.ok(s.b.z< -7,'ram hauled its full carriage to far platform');
 assert.ok(Math.abs(s.b.y-1.25)<.1,'supported landing, not a midair teleport');
 assert.ok(s.b.skill.readyAt>s.time+22);
 assert.ok(s.room.events.some(e=>e.action==='ledgeCaught'));
 assert.ok(s.room.events.some(e=>e.action==='ledgePulled'));
});
test('ordinary ramps and missing far ledges never steal HELLping Skill',()=>{
 const slope={solids:[],floors:[{center:[0,-.1,3],size:[12,.2,14],y:0}],
  ramps:[{axis:'z',minX:-6,maxX:6,minZ:-5,maxZ:-1,startY:1.5,endY:0}]};
 const s=ram(slope,{z:0});
 assert.equal(findHellpingLedge(s.room,s.b,0),null);
 assert.equal(primeSoFistSkill(s.room,s.b,s.p,0),null);
 assert.equal(s.b.hellping.phase,'open');
 const noLanding=ledgeWorld();noLanding.floors.pop();
 const t=ram(noLanding,{z:-1});
 assert.equal(findHellpingLedge(t.room,t.b,0),null);
});
test('a solid wall in the hand pull path prevents a misleading ledge prompt',()=>{
 const world=ledgeWorld();world.solids.push({id:'solid-wall',center:[0,1,-5],size:[8,2,.5]});
 const s=ram(world,{z:-1});
 assert.equal(findHellpingLedge(s.room,s.b,0),null);
});
