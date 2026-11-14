import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../../shared/sim/Room.mjs';
import {applyRoomCommand,serializeSnapshot} from '../../shared/sim/wire.mjs';
import {createBiByeLlista,mountBiByeLlista,stepBiByeLlista,fireBiByeLlista} from '../../shared/sim/biByeLlista.mjs';
import {requestBiByeSharpTurn,biByeSweepClearance,BI_BYE_SWEEP} from '../../shared/sim/biByeSweep.mjs';
import {canBiByeCouple} from '../../shared/sim/biByeWeapons.mjs';
import {biByeAnimation} from '../../client/worlds/biByePresentation.mjs';

const ground=()=>({floors:[{y:0,center:[0,-.1,0],size:[100,.2,100]}],solids:[],ramps:[],abyssY:-20});
function setup(equipped='boltToTheOccasion'){
 const room=new Room('SWEEP',{mode:'PRACTICE'});room.world=ground();room.state='PLAYING';
 const operator=room.addPlayer({id:'op',token:'o',name:'operator',siegeLoadout:{biBye:equipped}},0);
 operator.position={x:0,y:0,z:0};operator.spawnProtectionUntil=0;
 const b=room.biByeLlista=createBiByeLlista({x:0,y:0,z:0,baseYaw:0});
 assert.ok(mountBiByeLlista(b,operator,0));return {room,b,operator};
}
function step(s,from,to,dt=1/30){
 for(let t=from+dt;t<=to+dt/2;t+=dt)stepBiByeLlista(s.room,s.b,dt,t,s.room.world);
}
const issue=(s,type,at=1)=>applyRoomCommand(s.room,s.operator,{type},at);
test('sharp turn is independently operable without selecting the third Skill; actual traverse rotates, chassis does not',()=>{
 const s=setup();assert.equal(issue(s,'bibyeSharpTurn').rejected,undefined);
 assert.equal(s.b.skill.id,'boltToTheOccasion');assert.equal(s.b.skill.readyAt,0);
 const heading=s.b.heading;step(s,1,1.75);
 assert.ok(s.b.sweep);assert.ok(Math.abs(s.b.mainYaw-heading)>1);
 assert.equal(s.b.heading,heading);assert.equal(s.b.speed,0);
 assert.equal(fireBiByeLlista(s.room,s.b,1.76),false);
 step(s,1.75,2.8);assert.equal(s.b.sweep,null);
 assert.equal(s.b.skill.readyAt,0,'innate attack never consumes machine Skill');
});
test('walls prevent a full revolution before startup; unobstructed ground permits it',()=>{
 const s=setup();assert.equal(biByeSweepClearance(s.b,s.room.world),true);
 s.room.world.solids.push({id:'wall',center:[2.4,1.5,0],size:[.4,3,2.5]});
 assert.equal(biByeSweepClearance(s.b,s.room.world),false);
 assert.match(issue(s,'bibyeSharpTurn').rejected,/clearance/);
 assert.equal(s.b.sweep,null);
});
test('look around keeps cooldown unspent while spinning; stops through loaded physical bolt pipeline',()=>{
 const s=setup('lookAroundAndFindOut');assert.equal(s.b.skill.id,'lookAroundAndFindOut');
 assert.equal(issue(s,'siegeSkill').rejected,undefined);
 step(s,1,4);
 assert.equal(s.b.sweep.phase,'loop');
 assert.equal(s.b.skill.phase,'active');
 assert.equal(s.b.skill.readyAt,0);
 assert.equal(s.b.mainBoltLoaded,true);
 assert.equal(issue(s,'bibyeHeavyFire',4.1).rejected!==undefined,true,'Bolt II explicitly locked');
 assert.equal(issue(s,'bibyeCombinedFire',4.1).rejected!==undefined,true,'cannot queue delayed heavy');
 assert.equal(s.b.shotIIPendingAt,Infinity);
 assert.equal(s.b.heading,0);
 assert.equal(issue(s,'bibyeFire',4.15).rejected,undefined);
 assert.equal(s.b.sweep.phase,'settle');
 assert.equal(s.b.skill.readyAt,0,'cooldown not started by the stop command');
 step(s,4.15,7);
 assert.equal(s.b.sweep,null);
 assert.equal(s.b.skill.phase,'idle');
 assert.ok(s.b.skill.readyAt>=31,'full 24 second cooldown starts on resolution');
 step(s,7,7.5);
 assert.deepEqual([...s.room.bibyeProjectiles.values()].map(v=>v.subKind),['conditioning']);
 assert.equal(s.b.mainBoltLoaded,true,'mobile spin must not launch heavy ammunition');
});
test('third equipped Skill retains ordinary deployed BOTH eligibility and does not bypass heavy loading',()=>{
 const s=setup('lookAroundAndFindOut');s.b.mode='DEPLOYED';s.b.weaponFocus='MAIN';
 assert.equal(canBiByeCouple(s.b,1),true);
 const loaded=s.b.mainBoltLoaded;
 assert.equal(issue(s,'siegeSkill').rejected,undefined);
 assert.equal(canBiByeCouple(s.b,1.1),false);
 assert.equal(s.b.mainBoltLoaded,loaded);
 assert.equal(issue(s,'bibyeCombinedFire',1.2).rejected!==undefined,true);
 assert.equal(issue(s,'siegeSkill',1.3).rejected,undefined,'second Skill tap cancels the loop');
 step(s,1.3,4);
 assert.equal(s.b.mainBoltLoaded,true);
 assert.equal(s.room.bibyeProjectiles.size,0);
 assert.equal(canBiByeCouple(s.b,4),true,'ordinary deployed volley returns after resolution');
});
test('snapshot and existing authored clip selection follow immutable machine clock',()=>{
 const s=setup('lookAroundAndFindOut');issue(s,'siegeSkill');
 assert.equal(biByeAnimation(s.b,1.2).name,'22_BiBye_A_Sharp_Turn');
 step(s,1,2.3);
 const sample=serializeSnapshot(s.room,2.3).bibyeBallista;
 assert.equal(sample.sweep.phase,'loop');
 assert.ok(Number.isFinite(sample.sweep.angle));
 assert.equal(sample.sweep.victims,undefined);
 assert.equal(biByeAnimation(sample,2.3).name,'23_BiBye_Look_Around_Spin_Loop');
 issue(s,'siegeSkill',2.35);
 assert.equal(biByeAnimation(s.b,2.4).name,'24_BiBye_Look_Around_Reversed_Fire_Settle');
});
test('clearance, damage, and loop cadence retain discrete authored timings',()=>{
 assert.equal(BI_BYE_SWEEP.single,1.65);
 assert.equal(BI_BYE_SWEEP.loop,1.2);
 assert.equal(BI_BYE_SWEEP.settleClip,2.2);
 assert.equal(BI_BYE_SWEEP.damage,45);
});
