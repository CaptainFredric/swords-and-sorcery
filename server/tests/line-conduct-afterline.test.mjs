import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../../shared/sim/Room.mjs';
import {tryCastSpell,stepRoom} from '../../shared/sim/combat.mjs';
import {lineOfConductReach,lineOfConductAffliction,ONE_HIT_RULES}
 from '../../shared/src/oneHitOfWondersRules.mjs';
import {oneHitBacklashRemaining} from '../../shared/src/oneHitInfusions.mjs';
const DT=1/30;
const world={floors:[{id:'ground',center:[0,-.1,0],size:[1200,.2,1200],y:0}],
 ramps:[],solids:[],abyssY:-30,spawnPoints:[{x:0,y:0,z:0,yaw:-Math.PI/2}]};
function match(){
 const room=new Room('CONDUCT_AFTERLINE_TEST',{mode:'FFA'});
 room.world=world;
 for(const id of ['a','near','far','late'])room.addPlayer({id,token:id,name:id},0);
 for(const id of ['a','near','far','late'])room.setReady(id,true,0);
 room.tick(3.1);room.state='PLAYING';
 const [a,near,far,late]=['a','near','far','late'].map(id=>room.players.get(id));
 a.spell='line_of_conduct';a.position={x:0,y:0,z:0};
 a.yaw=-Math.PI/2;a.input.yaw=a.yaw;
 near.position={x:8,y:0,z:0};far.position={x:330,y:0,z:0};
 late.position={x:18,y:0,z:4};
 for(const p of [a,near,far,late]){p.spawnProtectionUntil=0;p.grounded=true;}
 room.events.length=0;
 return {room,a,near,far,late};
}
function step(room,from,to){
 for(let at=from;at<to-1e-8;at+=DT)stepRoom(room,DT,at,world);
}
test('the actual line of conduct reaches players beyond 240m, deals HP exactly once and applies shorter far Conduct',()=>{
 const {room,near,far}=match();
 assert.ok(lineOfConductReach({x:0,y:1,z:0},{x:1,y:0,z:0},world,[far.position])>330);
 assert.equal(tryCastSpell(room,'a',{x:1,y:0,z:0},9),true);
 step(room,9,9.8);
 const strikes=room.events.filter(e=>e.type==='lineConductDischarge');
 assert.equal(strikes.length,1);
 assert.ok(strikes[0].end.x>330,'no hard 240m cutoff');
 assert.ok(near.health<100&&far.health<100,'both positions are actually struck by the 3D ray');
 assert.ok(near.health<far.health,'close beam deals more HP than the long-distance floor');
 assert.ok(near.electricalBacklash&&far.electricalBacklash);
 assert.ok(near.electricalBacklash.initial>far.electricalBacklash.initial);
 assert.ok(near.electricalBacklash.seconds>far.electricalBacklash.seconds);
 assert.ok(near.electricalBacklash.seconds<=3.01);
 const direct=room.events.filter(e=>e.type==='damage'&&e.source==='line_of_conduct');
 assert.equal(direct.length,2,'one direct HP hit per player, no afterline ticks');
});
test('the one-second afterline can apply Conduct through Guard exactly once, but NEVER a second HP hit',()=>{
 const {room,late}=match();
 late.guarding=true;
 assert.equal(tryCastSpell(room,'a',{x:1,y:0,z:0},9),true);
 step(room,9,9.65);
 assert.equal(late.electricalBacklash,null);
 const health=late.health;
 late.position={x:18,y:0,z:0};
 step(room,9.65,9.82);
 assert.equal(late.health,health,'the leftover tripwire has zero HP damage');
 assert.ok(late.electricalBacklash,'crossing the existing 3D beam electrifies the player');
 const original=late.electricalBacklash;
 late.position.z=4;step(room,9.82,9.92);
 late.position.z=0;step(room,9.92,10.04);
 assert.deepEqual(late.electricalBacklash,original,
   'reentering the same afterline does not refresh Conduct');
 assert.equal(room.events.filter(e=>e.type==='damage'&&e.victimId===late.id&&
   e.source==='line_of_conduct').length,0);
 assert.equal(room.events.filter(e=>e.type==='oneHitConduct'&&e.playerId===late.id).length,1);
 assert.ok(oneHitBacklashRemaining(original,original.at+.1)>0);
});
test('Line of Conduct is a real thin spatial ray; distant off-axis players and solids are not ignored',()=>{
 const {room,far}=match();far.position.z=2;
 assert.equal(tryCastSpell(room,'a',{x:1,y:0,z:0},9),true);
 step(room,9,9.8);
 assert.equal(far.health,100);
 assert.equal(far.electricalBacklash,null);
 const blocked=match();blocked.room.world={...world,solids:[{
   id:'wall',center:[40,1,0],size:[1,3,18]}]};
 blocked.far.position.z=0;
 assert.equal(tryCastSpell(blocked.room,'a',{x:1,y:0,z:0},9),true);
 for(let at=9;at<9.8;at+=DT)
  stepRoom(blocked.room,DT,at,blocked.room.world);
 assert.equal(blocked.far.health,100,'solid wall occludes the infinite-range ray');
});
test('shorter range-scaled Conduct actually expires at its own duration, not the generic four seconds',()=>{
 const near=lineOfConductAffliction(1,9,'a');
 const far=lineOfConductAffliction(1000,9,'a');
 assert.ok(near.seconds>far.seconds);
 assert.ok(near.initial>far.initial);
 assert.equal(oneHitBacklashRemaining(far,9+far.seconds+.001),0);
 assert.ok(oneHitBacklashRemaining(near,9+1)>0);
 assert.equal(ONE_HIT_RULES.lineOfConduct.afterlineSeconds,1);
});
