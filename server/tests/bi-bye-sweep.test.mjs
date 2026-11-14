import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../../shared/sim/Room.mjs';
import {applyRoomCommand,serializeSnapshot} from '../../shared/sim/wire.mjs';
import {createBiByeLlista,mountBiByeLlista,stepBiByeLlista,fireBiByeLlista} from '../../shared/sim/biByeLlista.mjs';
import {requestBiByeSharpTurn,biByeSweepClearance,finishBiByeSweep,biByeSweepAllowsContact,BI_BYE_SWEEP} from '../../shared/sim/biByeSweep.mjs';
import {canBiByeCouple} from '../../shared/sim/biByeWeapons.mjs';
import {authoredBiByeSweepVolumes,authoredSweepLimbQuaternion} from '../../shared/sim/biByeSweepGeometry.mjs';
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
test('sweep starts from the actual turret aim and upper assembly rotates with its mount',()=>{
 const s=setup('lookAroundAndFindOut');
 s.b.mainYaw=.48;s.b.mainPitch=.21;s.b.upperYaw=.64;
 const initialOffset=.16;
 assert.equal(issue(s,'siegeSkill').rejected,undefined);
 step(s,1,1+1/30);
 assert.ok(Math.abs(s.b.mainYaw-.48)<.20,'cannot snap turret to chassis heading');
 assert.ok(Math.abs(s.b.mainPitch-.21)<.12,'must lower the cradle from its actual current pitch');
 assert.ok(Math.abs((s.b.upperYaw-s.b.mainYaw)-initialOffset)<1e-7);
 step(s,1+1/30,2.4);
 assert.equal(s.b.sweep.phase,'loop');
 assert.ok(Math.abs((s.b.upperYaw-s.b.mainYaw)-initialOffset)<1e-7,'upper must rotate on shared traverse');
 issue(s,'siegeSkill',2.5);
 let resolved=false;
 for(let at=2.5+1/30;at<=5;at+=1/30){
  const was=Boolean(s.b.sweep);
  stepBiByeLlista(s.room,s.b,1/30,at,s.room.world);
  if(was&&!s.b.sweep){resolved=true;break;}
 }
 assert.equal(resolved,true,'inspect the exact settling frame before mobile aim recovers');
 assert.equal(s.b.sweep,null);
 assert.ok(Math.abs(s.b.mainYaw-.48)<1e-7,'returns to actual starting aim, not fixed chassis yaw');
 assert.ok(Math.abs(s.b.mainPitch-.21)<1e-7,'restores original physical elevation after recovery');
 assert.ok(Math.abs(s.b.upperYaw-.64)<1e-7);
});
test('interruptions restore legal ordinary turret aim and charge the machine Skill only on actual resolution',()=>{
 const s=setup('lookAroundAndFindOut');
 s.b.mainYaw=.32;s.b.mainPitch=.1;s.b.upperYaw=.7;
 assert.equal(issue(s,'siegeSkill').rejected,undefined);
 step(s,1,1.82);
 assert.ok(Math.abs(s.b.mainYaw-.32)>1,'turret really rotates before interruption');
 assert.equal(s.b.skill.readyAt,0);
 finishBiByeSweep(s.room,s.b,1.83,'impact');
 assert.equal(s.b.sweep,null);
 assert.ok(Math.abs(s.b.mainYaw-.32)<1e-9);
 assert.ok(Math.abs(s.b.upperYaw-.7)<1e-9);
 assert.ok(Math.abs(s.b.mainPitch-.1)<1e-9);
 assert.equal(s.b.skill.readyAt,25.83);
 assert.equal(fireBiByeLlista(s.room,s.b,1.84),true,'original bolt input returns immediately after interruption');
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
 assert.equal(Number.isFinite(s.b.shotIIPendingAt)&&s.b.shotIIPendingAt>=4,false,'no heavy release timestamp is queued');
 assert.equal(s.b.heading,0);
 assert.equal(issue(s,'bibyeFire',4.15).rejected,undefined);
 assert.equal(s.b.sweep.phase,'settle');
 assert.equal(s.b.skill.readyAt,0,'cooldown not started by the stop command');
 step(s,4.15,7);
 assert.equal(s.b.sweep,null);
 assert.equal(s.b.skill.phase,'idle');
 const ended=s.room.events.find(e=>e.type==='siegeSkill'&&e.skill==='lookAroundAndFindOut'&&e.action==='ended');
 assert.ok(ended,'the spin must resolve');
 assert.ok(Math.abs(s.b.skill.readyAt-(ended.at+24))<1e-7,'full 24s cooldown begins on resolution');
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
test('actual swept main-limb geometry lands one 45 HP hit, but not at elevated non-contact points',()=>{
 const s=setup();
 const limb=authoredBiByeSweepVolumes({...s.b,mainYaw:Math.PI,sweep:{lower:1}})[0];
 assert.ok(limb,'must have authored-aligned main limb collider');
 const victim=s.room.addPlayer({id:'target',token:'t',name:'target'},0);
 victim.position={x:limb.center[0],y:limb.center[1]-.9,z:limb.center[2]};
 victim.spawnProtectionUntil=0;
 assert.equal(issue(s,'bibyeSharpTurn').rejected,undefined);
 step(s,1,2.8);
 assert.equal(victim.health,55,'one legitimate clean contact in the committed revolution');
 assert.equal(s.room.events.filter(e=>e.type==='bibyeSweepImpact'&&e.victimId==='target').length,1);
 const high=setup(),above=high.room.addPlayer({id:'above',token:'h',name:'above'},0);
 above.position={x:limb.center[0],y:limb.center[1]+3,z:limb.center[2]};
 above.spawnProtectionUntil=0;
 assert.equal(issue(high,'bibyeSharpTurn').rejected,undefined);
 step(high,1,2.8);
 assert.equal(above.health,100,'same horizontal radius is not a radial damage pulse');
});
test('facing Guard mitigates a genuine bow-limb collision and its displacement',()=>{
 const s=setup();
 const limb=authoredBiByeSweepVolumes({...s.b,mainYaw:Math.PI,sweep:{lower:1}})[0];
 const victim=s.room.addPlayer({id:'guard',token:'g',name:'guard'},0);
 victim.position={x:limb.center[0],y:limb.center[1]-.9,z:limb.center[2]};
 victim.spawnProtectionUntil=0;victim.guarding=true;victim.guardStamina=100;
 victim.yaw=Math.atan2(victim.position.x-s.b.x,victim.position.z-s.b.z);
 assert.equal(issue(s,'bibyeSharpTurn').rejected,undefined);
 step(s,1,2.8);
 const hit=s.room.events.find(e=>e.type==='bibyeSweepImpact'&&e.victimId==='guard');
 assert.ok(hit,'geometry must make contact');
 assert.equal(hit.guarded,true,'Guard must be facing the actual contact');
 assert.ok(victim.health>55,'guarded damage must be below the clean 45 HP');
 assert.ok(victim.guardStamina<100,'guard expends stamina to mitigate the blow');
});
test('original Argon mesh volumes and quaternion keyframes are faithfully represented',()=>{
 const b=setup().b;
 const [left,right]=authoredBiByeSweepVolumes({...b,sweep:{lower:1}});
 for(const v of [left,right]){
  assert.ok(Math.abs(v.size[0]-1.99276906)<.00001);
  assert.ok(Math.abs(v.size[1]-.46)<.00001);
  assert.ok(Math.abs(v.size[2]-.63472036)<.00001);
  for(const axis of v.axes)assert.ok(Math.abs(Math.hypot(...axis)-1)<1e-7);
 }
 assert.ok(left.center[0]*right.center[0]<0);
 const q=authoredSweepLimbQuaternion(-1,.45,1);
 assert.ok(Math.abs(q[1]+.14242306)<1e-6);
 assert.ok(Math.abs(q[2]-.12060817)<1e-6);
});
test('overlap across the 360-degree seam cannot create an instant second hit',()=>{
 const almost=2*Math.PI-.01,early=2*Math.PI+.01;
 const previous={revolution:0,angle:almost};
 assert.equal(biByeSweepAllowsContact(previous,1,early),false);
 assert.equal(biByeSweepAllowsContact(previous,1,almost+2*Math.PI),true);
 assert.equal(biByeSweepAllowsContact(previous,0,almost+2*Math.PI),false);
 assert.equal(biByeSweepAllowsContact(null,0,0),true);
});
test('clearance, damage, and loop cadence retain discrete authored timings',()=>{
 assert.equal(BI_BYE_SWEEP.single,1.65);
 assert.equal(BI_BYE_SWEEP.loop,1.2);
 assert.equal(BI_BYE_SWEEP.settleClip,2.2);
 assert.equal(BI_BYE_SWEEP.damage,45);
});
