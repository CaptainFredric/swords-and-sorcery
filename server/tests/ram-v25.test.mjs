import test from 'node:test';import assert from 'node:assert/strict';
import {createSoFistication,soFistTerrainPose,stepSoFistication,mountSoFistication,soFistEntry} from '../../shared/sim/soFistication.mjs';
import {Room} from '../../shared/sim/Room.mjs';
import {SO_FIST_FIT,SO_FIST_WHEELS,SO_FIST_SCALE,soFistFrame} from '../../shared/sim/soFistGeometry.mjs';
import {boxWorld} from '../../shared/src/orientedBox.mjs';
test('v2.5 rear axle and wheelbase match the delivered native geometry',()=>{assert.equal(SO_FIST_WHEELS[2].pivot[2],-.82*2.85);assert.equal(SO_FIST_FIT.wheelbase,1.145*2.85);});
test('asymmetric axle spacing keeps wheel contact centered on a moderate ramp',()=>{
 const b=createSoFistication({z:-15,y:4}),world={solids:[],floors:[],ramps:[{id:'grade',minX:-10,maxX:10,minZ:-30,maxZ:0,startY:0,endY:8,axis:'z'}]};
 const pose=soFistTerrainPose(b,world);assert.ok(pose);assert.ok(pose.wheelOffsets.every(v=>Math.abs(v)<.06));assert.ok(Math.abs(pose.y-4)<.06);

});
test('steering rotates around the rear axle without a sideways axle slide',()=>{
 const room=new Room('V25',{mode:'PRACTICE'});room.state='PLAYING';room.world={solids:[],ramps:[],floors:[{center:[0,-.1,0],size:[100,.2,100],y:0}]};const p=room.addPlayer({id:'op',token:'op',name:'op'},0),b=room.soFistication=createSoFistication();p.position=soFistEntry(b,room.world);mountSoFistication(room,b,p);p.input={forward:1,right:1};b.speed=3;
 const before=boxWorld(soFistFrame(b),[0,0,SO_FIST_WHEELS[2].pivot[2]]);stepSoFistication(room,b,1/30,1);const after=boxWorld(soFistFrame(b),[0,0,SO_FIST_WHEELS[2].pivot[2]]),dx=after[0]-before[0],dz=after[2]-before[2];assert.ok(Math.abs(dx*Math.cos(b.heading)-dz*Math.sin(b.heading))<.001);
});
