import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../../shared/sim/Room.mjs';
import {tryUltimate,stepRoom} from '../../shared/sim/combat.mjs';
import {serializeSnapshot} from '../../shared/sim/wire.mjs';
import {fieldContact} from '../../shared/src/oneHitStatus.mjs';

const DT=1/30;
const world={
 floors:[{id:'wide',center:[0,-.1,0],size:[200,.2,200],y:0}],
 ramps:[],solids:[],spawnPoints:[{x:0,y:0,z:0},{x:12,y:0,z:0}],abyssY:-30,
};
function fixture(tiers={}){
 const room=new Room('FWD-SLAM',{mode:'FFA'});room.world=world;
 for(const id of ['caster','front','rear','side'])room.addPlayer({id,token:id,name:id},0);
 for(const id of ['caster','front','rear','side'])room.setReady(id,true,0);
 room.tick(3.1);room.state='PLAYING';
 const caster=room.players.get('caster');
 caster.ultimate='one_hit_of_wonders';
 caster.position={x:0,y:0,z:0};caster.yaw=0;caster.input={...caster.input,yaw:0,pitch:0};
 caster.grounded=true;caster.prowess=100;caster.spawnProtectionUntil=0;
 Object.assign(caster.oneHitInfusions,tiers);
 for(const id of ['front','rear','side']){
  const p=room.players.get(id);p.position={x:22,y:0,z:0};
  p.spawnProtectionUntil=0;p.health=500;p.grounded=true;
 }
 room.events.length=0;
 return {room,caster};
}
function enemy(room,id,x,z){
 const p=room.players.get(id);
 p.position={x,y:0,z};p.velocity={x:0,y:0,z:0};p.impulse={x:0,z:0};
 p.spawnProtectionUntil=0;return p;
}
function run(room,start,duration){
 const count=Math.ceil(duration/DT);
 for(let i=0;i<count;i++)stepRoom(room,DT,start+i*DT,world);
 return start+count*DT;
}
function slam(room,at=9){
 assert.equal(tryUltimate(room,'caster',at),true);
 const commit=room.players.get('caster').ultimateState.commitAt;
 let t=at;
 while(t<commit+DT){stepRoom(room,DT,t,world);t+=DT;}
 return t;
}
const direct=(room,id)=>room.events.filter(e=>
 e.type==='damage'&&e.source==='one_hit_of_wonders'&&e.victimId===id);

test('uninfused Disaster at yaw-zero hits a forward target outside old circle, not an equally distant rear target',()=>{
 const {room,caster}=fixture();
 enemy(room,'front',0,-4.15);enemy(room,'rear',0,4.15);
 enemy(room,'side',4.15,0);
 const at=slam(room),impact=room.events.find(e=>e.type==='oneHitImpact'&&e.form==='ground');
 assert.equal(impact.yaw,0);
 assert.equal(impact.radius,3.4,'do not globally inflate the old circular radius');
 assert.ok(impact.struck.includes('front'),'forward extension genuinely deals the 46 HP direct hit');
 assert.ok(!impact.struck.includes('rear')&&!impact.struck.includes('side'));
 assert.equal(direct(room,'front').length,1);
 assert.equal(direct(room,'rear').length,0);
 assert.equal(direct(room,'side').length,0);
 assert.equal(room.oneHitFields[0].yaw,0);
 caster.yaw=Math.PI;caster.input.yaw=Math.PI;
 const snapshot=serializeSnapshot(room,at,'caster');
 assert.equal(snapshot.oneHitFields[0].yaw,0,
  'ground hazard and all clients keep the real landing facing after a later turn');
 assert.ok(fieldContact(snapshot.oneHitFields[0],{x:0,y:0,z:-4.15})>0);
 assert.equal(fieldContact(snapshot.oneHitFields[0],{x:0,y:0,z:4.15}),0);
});

test('Half Frost can catch a new forward target in its late 0.3s window and not one behind',()=>{
 const {room}=fixture({frost:1});
 enemy(room,'front',0,-18);enemy(room,'rear',0,18);
 const after=slam(room);
 enemy(room,'front',0,-4.1);enemy(room,'rear',0,4.1);
 run(room,after,.12);
 assert.equal(direct(room,'front').length,1);
 assert.equal(direct(room,'rear').length,0);
 assert.ok(room.events.some(e=>e.type==='oneHitLateContact'&&e.targets.includes('front')));
});

test('Full Fire extended forward ground burns and fields use impact-facing geometry after caster turns',()=>{
 const {room,caster}=fixture({fire:2});
 enemy(room,'front',0,-5.8);enemy(room,'rear',0,5.8);
 enemy(room,'side',5.8,0);
 const after=slam(room);
 const impact=room.events.find(e=>e.type==='oneHitImpact'&&e.form==='ground');
 assert.equal(impact.radius,4.6);
 assert.ok(impact.struck.includes('front'),'Fire expands the forward decisive blast');
 assert.ok(!impact.struck.includes('rear')&&!impact.struck.includes('side'));
 const zone=room.oneHitBurnZones[0],field=room.oneHitFields[0];
 assert.equal(zone.yaw,0);assert.equal(field.yaw,0);
 assert.equal(zone.radius,4.6);assert.equal(field.radius,4.6);
 enemy(room,'front',0,-5.8);enemy(room,'rear',0,5.8);
 enemy(room,'side',5.8,0);
 caster.yaw=Math.PI;caster.input.yaw=Math.PI;
 run(room,after,.8);
 const licks=room.events.filter(e=>e.type==='damage'&&e.source==='one_hit_ground_fire');
 assert.ok(licks.some(e=>e.victimId==='front'),'Full Fire deals ongoing HP damage in frontal extension');
 assert.ok(!licks.some(e=>e.victimId==='rear'||e.victimId==='side'));
 const snap=serializeSnapshot(room,after+.8,'caster');
 assert.equal(snap.oneHitBurnZones[0].yaw,0);
 assert.equal(snap.oneHitFields[0].yaw,0);
});
