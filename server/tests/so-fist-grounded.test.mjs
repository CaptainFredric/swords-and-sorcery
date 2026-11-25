import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../../shared/sim/Room.mjs';
import {createSoFistication,soFistEntry,mountSoFistication,primeSoFistSkill,stepSoFistication,soFistTerrainPose,soFistClear}
 from '../../shared/sim/soFistication.mjs';

// A SO-FIST-ICATION is a wheeled ground machine: whatever stops a HELLping hand-hop, it comes down onto its wheels.
function game(solids=[]){
 const room=new Room('GROUNDED_TEST',{mode:'PRACTICE'});room.state='PLAYING';
 room.world={solids,ramps:[],floors:[{id:'floor',center:[0,-.1,0],size:[150,.2,150],y:0}],spawnPoints:[{x:0,y:0,z:0}],abyssY:-35};
 const op=room.addPlayer({id:'operator',token:'operator',name:'Operator',siegeLoadout:{soFist:'hellpingHand'}},0);
 const b=room.soFistication=createSoFistication({x:0,y:0,z:0,heading:0});
 op.position=soFistEntry(b,room.world);op.spawnProtectionUntil=0;
 assert.equal(mountSoFistication(room,b,op,0),true);
 return {room,op,b};
}
const tick=(s,from,to)=>{for(let t=from+1/30;t<=to+1e-8;t+=1/30)stepSoFistication(s.room,s.b,1/30,t,s.room.world);};
const onWheels=(b,world)=>{const pose=soFistTerrainPose(b,world);return Boolean(pose)&&Math.abs(pose.y-b.y)<.02;};

test('a hop stopped in the air by an overhead beam comes down onto its wheels, not left hanging',()=>{
 // a beam just above the parked ram's nose: clear at rest, in the way once the hop lifts it
 const beam={id:'beam',center:[0,2.3,-1.4],size:[5,.3,1.2]};
 const s=game([beam]);
 assert.ok(soFistClear(s.b,s.room.world),'parked clear of the beam');
 assert.equal(primeSoFistSkill(s.room,s.b,s.op,0),null);
 s.op.input={forward:1,right:0,sprint:false};
 assert.equal(primeSoFistSkill(s.room,s.b,s.op,.2),null);
 assert.equal(s.b.hellping.phase,'vault');
 let peak=0;for(let t=.2+1/30;t<=1.4;t+=1/30){stepSoFistication(s.room,s.b,1/30,t,s.room.world);peak=Math.max(peak,s.b.y);}
 assert.equal(s.b.hellping?.phase,'release','the beam stopped the hop');
 assert.ok(peak<.92,'stopped before the top of its arc');
 assert.ok(onWheels(s.b,s.room.world),`on its wheels after the stopped hop (y ${s.b.y.toFixed(3)})`);
 assert.ok(soFistClear(s.b,s.room.world),'and clear of the beam');
 // and it drives on from there
 const z=s.b.z;s.op.input={forward:-1,right:0,sprint:false};tick(s,1.4,3.4);
 assert.ok(Math.abs(s.b.z-z)>.5,'drives away under its own power');
 assert.ok(onWheels(s.b,s.room.world));
});

test('a hop never passes through another machine: a ram parked on the landing stops it, still grounded',()=>{
 const s=game();
 const parked=createSoFistication({x:0,y:0,z:-7.2,heading:0});parked.id='parked-ram';
 s.room.machines=new Map([[s.b.id,s.b],[parked.id,parked]]);
 assert.equal(primeSoFistSkill(s.room,s.b,s.op,0),null);
 s.op.input={forward:1,right:0,sprint:false};
 assert.equal(primeSoFistSkill(s.room,s.b,s.op,.2),null);
 tick(s,.2,1.4);
 assert.equal(s.b.hellping?.phase,'release');
 assert.ok(onWheels(s.b,s.room.world),`grounded (y ${s.b.y.toFixed(3)})`);
 assert.ok(s.b.z>parked.z+4,'stopped short of the parked ram, not inside it');
});
