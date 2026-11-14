import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../../shared/sim/Room.mjs';
import {applyRoomCommand,serializeSnapshot} from '../../shared/sim/wire.mjs';
import {createBiByeLlista,mountBiByeLlista,stepBiByeLlista,fireBiByeLlista} from '../../shared/sim/biByeLlista.mjs';
import {requestBiByeSharpTurn,biByeSweepClearance,finishBiByeSweep,biByeSweepAllowsContact,BI_BYE_SWEEP} from '../../shared/sim/biByeSweep.mjs';
import {requestBiByeIndependent,requestBiByeHeavySkill,requestBiByeVolley} from '../../shared/sim/biByeWeapons.mjs';
import {biByeOperatorDuck} from '../../client/game/biByeOperatorState.mjs';
import {canBiByeCouple} from '../../shared/sim/biByeWeapons.mjs';
import {authoredBiByeSweepVolumes,authoredSweepLimbQuaternion} from '../../shared/sim/biByeSweepGeometry.mjs';
import {biByeHitVolumes} from '../../shared/sim/biByeComponents.mjs';
import {orientedBoxHit,boxWorld} from '../../shared/src/orientedBox.mjs';
import {biByeAnimation} from '../../client/worlds/biByePresentation.mjs';
import {createSoFistication} from '../../shared/sim/soFistication.mjs';
import {createFightFlight} from '../../shared/sim/fightFlight.mjs';

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
test('real Interact boards an unoccupied ballista when no ram exists (undefined passenger is not a passenger)',()=>{
 const room=new Room('NO_RAM',{mode:'PRACTICE'});room.world=ground();room.state='PLAYING';
 const p=room.addPlayer({id:'boarding',token:'board',name:'Boarder',
   siegeLoadout:{biBye:'lookAroundAndFindOut'}},0);
 const ballista=room.biByeLlista=createBiByeLlista({x:0,y:0,z:0,baseYaw:0});
 p.position={x:-2.9,y:0,z:0};p.spawnProtectionUntil=0;
 assert.equal(room.soFistication,null);
 assert.equal(p.hellpingCarriedBy,undefined);
 const result=applyRoomCommand(room,p,{type:'siegeOperate'},1);
 assert.equal(result.rejected,undefined);
 assert.equal(ballista.operatorId,p.id,'real authority must authorize this rider');
 assert.equal(p.operatingBallistaId,ballista.id);
 assert.equal(ballista.skill.id,'lookAroundAndFindOut','selected third Skill survives physical boarding');
});
test('real front boarding is possible without stepping inside authored bow solids',()=>{
 const room=new Room('FRONT',{mode:'PRACTICE'});room.world=ground();room.state='PLAYING';
 const p=room.addPlayer({id:'front',token:'front',name:'Front Pilot'},0);
 const b=room.biByeLlista=createBiByeLlista({x:0,y:0,z:-2,baseYaw:0,interactRadius:3.2});
 assert.equal(b.interactRadius,3.75,'older 3.2m world placement uses reachable radius');
 const snap=serializeSnapshot(room,1,p.id);
 assert.equal(snap.bibyeBallista.interactRadius,b.interactRadius,
   'replicated MOUNT target and the real server gate must expose identical reach');
 // The real dual Chrome server recorded a non-penetrating station here:
 // a player at z=1.585 against the frontal bow, 3.585m away.
 p.position={x:0,y:0,z:1.585};
 assert.equal(applyRoomCommand(room,p,{type:'siegeOperate'},1).rejected,undefined);
 assert.equal(b.operatorId,p.id);
 const far=room.addPlayer({id:'far',token:'far',name:'Far Pilot'},0);
 far.position={x:0,y:0,z:1.76};
 assert.equal(mountBiByeLlista(createBiByeLlista({x:0,y:0,z:-2,baseYaw:0}),far,2),false,
   'mount still rejects beyond 3.75m; no remote-mount shortcut');
});
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
test('authored 22-to-23 transition does not teleport the physical traverse or lower the cradle instantly',()=>{
 const s=setup('lookAroundAndFindOut');
 assert.equal(issue(s,'siegeSkill').rejected,undefined);
 step(s,1,2+2/30);
 const previous=s.b.sweep.angle,lower=s.b.sweep.lower;
 assert.equal(s.b.sweep.phase,'loop');
 step(s,2+2/30,2+3/30);
 assert.ok(s.b.sweep.angle-previous<.22,'the handoff must advance by one physical 30Hz spin step');
 assert.ok(s.b.sweep.angle>previous,'rotation never reverses at handoff');
 assert.ok(s.b.sweep.lower-lower<.12,'the braced stance blends in, not a sudden jump');
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
test('outrigger shoes and beams keep original real hit volumes while only the articulated bow sweeps',()=>{
 const s=setup('lookAroundAndFindOut');
 const take=()=>biByeHitVolumes(s.b).filter(v=>v.componentId.startsWith('Stabilizer_'));
 const before=take(),ids=[...new Set(before.map(v=>v.componentId))];
 assert.deepEqual(ids.sort(),['Stabilizer_FL','Stabilizer_FR','Stabilizer_RL','Stabilizer_RR']);
 for(const id of ids){
  const parts=before.filter(v=>v.componentId===id);
  assert.ok(parts.length>=3,id+' must contain tangible wooden beam, metal brace and planting shoe');
  for(const box of parts){
   const start=boxWorld(box,[0,0,-box.size[2]/2-.35]);
   const end=boxWorld(box,[0,0,box.size[2]/2+.35]);
   assert.ok(orientedBoxHit(start,end,box),id+' is not a purely visual outrigger');
  }
 }
 assert.equal(issue(s,'siegeSkill').rejected,undefined);
 step(s,1,2.35);
 assert.equal(s.b.sweep?.phase,'loop');
 const during=take();
 assert.equal(during.length,before.length);
 for(let i=0;i<before.length;i++){
  assert.equal(during[i].componentId,before[i].componentId);
  assert.ok(Math.hypot(...during[i].center.map((n,k)=>n-before[i].center[k]))<1e-7,
    'the out-riggers are stationary chassis supports, not spinning ghost attack boxes');
 }
 assert.equal(s.b.heading,0);
});
test('heavy Bolt II opportunity cost cannot be bypassed by repeating a loaded spin during reload',()=>{
 const s=setup('lookAroundAndFindOut');
 s.b.mode='DEPLOYED';s.b.weaponFocus='MAIN';s.b.deploymentSupported=true;
 assert.equal(issue(s,'siegeSkill').rejected,undefined);
 step(s,1,4);assert.equal(issue(s,'bibyeFire',4.1).rejected,undefined);
 step(s,4.1,8);
 const heavyFired=s.room.events.filter(e=>e.type==='bibyeFired'&&e.shot==='II_SKILL');
 assert.equal(heavyFired.length,1);
 assert.equal(s.b.mainBoltLoaded,false);
 assert.ok(s.b.reloadEndsAt>8);
 assert.match(issue(s,'siegeSkill',8.1).rejected,/ready|cooling/i);
 assert.equal(s.room.events.filter(e=>e.type==='bibyeFired'&&e.shot==='II_SKILL').length,1);
});
test('deployed loaded Look Around finishes with authoritative Bolt II then Bolt I, paying each ammunition clock',()=>{
 const s=setup('lookAroundAndFindOut');s.b.mode='DEPLOYED';s.b.weaponFocus='MAIN';s.b.deploymentSupported=true;
 assert.equal(issue(s,'siegeSkill').rejected,undefined);
 step(s,1,4);
 assert.equal(s.b.sweep.phase,'loop');
 assert.equal(issue(s,'bibyeFire',4.1).rejected,undefined);
 step(s,4.1,8);
 const order=s.room.events.filter(e=>e.type==='bibyeFired'&&
   ['II_SKILL','I_COMBINED'].includes(e.shot));
 assert.deepEqual(order.map(e=>e.shot),['II_SKILL','I_COMBINED'],
   'the heavy bow genuinely releases first, not an animated free bolt');
 assert.ok(order[0].at<order[1].at);
 assert.equal(order[0].origin,'lookAroundAndFindOut');
 assert.equal(s.b.mainBoltLoaded,false,'heavy ammunition consumed by original heavy launcher');
 assert.ok(s.b.reloadEndsAt>8,'original heavy reload retained');
 assert.ok(s.b.smallBoltReadyAt>order[1].at,'conditioning bolt recocks normally');
 const ended=s.room.events.find(e=>e.type==='siegeSkill'&&e.skill==='lookAroundAndFindOut'&&e.action==='ended');
 assert.ok(ended,'spin resolves before loaded bolts release');
 assert.ok(Math.abs(s.b.skill.readyAt-ended.at-24)<1e-7,
   '24s Skill cooldown starts at settle, not from the later second bolt');
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
test('sustained loop can strike again only after a real new revolution',()=>{
 const s=setup('lookAroundAndFindOut');
 const limb=authoredBiByeSweepVolumes({...s.b,mainYaw:Math.PI,sweep:{lower:1}})[0];
 const victim=s.room.addPlayer({id:'repeat',token:'repeat',name:'repeat'},0);
 victim.position={x:limb.center[0],y:limb.center[1]-.9,z:limb.center[2]};
 victim.spawnProtectionUntil=0;
 assert.equal(issue(s,'siegeSkill').rejected,undefined);
 step(s,1,3.25);
 const hits=s.room.events.filter(e=>e.type==='bibyeSweepImpact'&&e.victimId==='repeat');
 assert.ok(hits.length>=2,'a stationary target may be struck on a later physical turn');
 for(let i=1;i<hits.length;i++)
  assert.ok(hits[i].sweepAngle-hits[i-1].sweepAngle>=Math.PI*2-.035,
   'each repeated blow must follow a complete physical 360-degree arc');
 assert.equal(victim.health,100-hits.length*BI_BYE_SWEEP.damage);
 assert.equal(s.b.skill.readyAt,0,'no cooldown during indefinite motion');
});
test('overlap across the 360-degree seam cannot create an instant second hit',()=>{
 const almost=2*Math.PI-.01,early=2*Math.PI+.01;
 const previous={revolution:0,angle:almost};
 assert.equal(biByeSweepAllowsContact(previous,1,early),false);
 assert.equal(biByeSweepAllowsContact(previous,1,almost+2*Math.PI),true);
 assert.equal(biByeSweepAllowsContact(previous,0,almost+2*Math.PI),false);
 assert.equal(biByeSweepAllowsContact(null,0,0),true);
});
test('main-limb sweep strikes real ram and flight component boxes, never a surrogate radius',()=>{
 for(const kind of ['ram','flight']){
  const s=setup();
  const limb=authoredBiByeSweepVolumes({...s.b,mainYaw:Math.PI,sweep:{lower:1}})[0];
  const pos={x:limb.center[0],y:0,z:limb.center[2],heading:0};
  if(kind==='ram')s.room.soFistication=createSoFistication({id:'impact-ram',...pos});
  else s.room.fightFlight=createFightFlight({id:'impact-flight',...pos});
  assert.equal(issue(s,'bibyeSharpTurn').rejected,undefined);
  step(s,1,2.8);
  const events=s.room.events;
  const hits=events.filter(e=>e.type==='bibyeSweepMachineImpact');
  assert.equal(hits.length,1,kind+' should receive one real hit per committed turn');
  assert.ok(events.some(e=>e.type===(kind==='ram'?'soFistDamaged':'fightFlightComponentHit')),
    kind+' impact must pass through its original component damage system');
 }
});
test('clearance, damage, and loop cadence retain discrete authored timings',()=>{
 assert.equal(BI_BYE_SWEEP.single,1.65);
 assert.equal(BI_BYE_SWEEP.loop,1.2);
 assert.equal(BI_BYE_SWEEP.settleClip,2.2);
 assert.equal(BI_BYE_SWEEP.damage,45);
});

test('a committed Sharp Turn starts one shared four-second recovery, never a repeatable per-click melee loop',()=>{
 const s=setup();
 assert.equal(issue(s,'bibyeSharpTurn',1).rejected,undefined);
 assert.equal(s.b.sweepHeavyReadyAt,5,'cooldown begins at accepted command, not the final damage tick');
 assert.equal(BI_BYE_SWEEP.damage,45);
 finishBiByeSweep(s.room,s.b,1.4,'interrupted');
 assert.match(issue(s,'bibyeSharpTurn',1.5).rejected,/four-second recovery/i,
  'canceling the swing does not refund its commitment');
 assert.equal(issue(s,'bibyeSharpTurn',5).rejected,undefined,'exact recovery boundary reopens');
 assert.equal(s.b.sweepHeavyReadyAt,9);
 assert.equal(s.b.skill.readyAt,0,'ordinary sweep never consumes the separate selectable Skill');
});

test('innate melee locks all Bolt II routes for four seconds but leaves independent Bolt I usable',()=>{
 const s=setup();
 s.b.mode='DEPLOYED';s.b.weaponFocus='MAIN';
 assert.equal(issue(s,'bibyeSharpTurn',1).rejected,undefined);
 step(s,1,2.8);
 assert.equal(s.b.sweep,null);
 assert.equal(requestBiByeVolley(s.room,s.b,2.81),false,'upper-first coupled Bolt II cannot evade melee lockout');
 assert.equal(requestBiByeIndependent(s.room,s.b,2.82),true,'Bolt I remains useful while both heavy options recover');
 step(s,2.8,3.22);
 assert.equal(s.b.mobileShotPendingAt,null);
 assert.ok(s.room.events.some(e=>e.type==='bibyeFired'&&e.shot==='I_MOBILE'),
   'actual upper bolt still fires through its normal weapon pipeline');
 assert.match(issue(s,'bibyeSharpTurn',3.23).rejected,/four-second recovery/);
 assert.equal(requestBiByeVolley(s.room,s.b,5.01),true,'heavy coupled volley becomes available at the same shared clock');
});

test('Bolt II release renews four-second melee recovery on the authoritative release, not on button repeat',()=>{
 const s=setup();
 s.b.mode='DEPLOYED';s.b.weaponFocus='MAIN';s.b.trackingSince=0.5;
 assert.equal(requestBiByeVolley(s.room,s.b,1),true);
 step(s,1,2.1);
 const shot=s.room.events.find(e=>e.type==='bibyeFired'&&e.shot==='II');
 assert.ok(shot,'real coupled Bolt II released');
 assert.ok(Math.abs(s.b.sweepHeavyReadyAt-(shot.at+4))<1e-6,
   'melee and heavy share a gate starting at the heavy string release');
 assert.match(issue(s,'bibyeSharpTurn',shot.at+.2).rejected,/four-second recovery/);
});

test('primed independent heavy Bolt II cannot be committed during the melee cooldown',()=>{
 const s=setup();
 s.b.mode='DEPLOYED';
 assert.equal(issue(s,'bibyeSharpTurn',1).rejected,undefined);
 step(s,1,2.8);
 assert.equal(requestBiByeHeavySkill(s.room,s.b,s.operator,2.85),null,'priming is allowed while waiting');
 assert.match(requestBiByeHeavySkill(s.room,s.b,s.operator,2.9),/four-second recovery/,
   'neither repeated U nor RMB can bypass the shared heavy mechanism');
 assert.equal(requestBiByeHeavySkill(s.room,s.b,s.operator,5.01),null,'Bolt II can commit at recovery boundary');
 step(s,5.01,5.4);
 const shot=s.room.events.find(e=>e.type==='bibyeFired'&&e.shot==='II_SKILL');
 assert.ok(shot,'actual heavy projectile was released');
 assert.ok(Math.abs(s.b.sweepHeavyReadyAt-(shot.at+4))<1e-6);
 assert.match(issue(s,'bibyeSharpTurn',shot.at+.15).rejected,/four-second recovery/);
});

test('every bow sweep automatically ducks the mounted knight and keeps him tucked until real settle',()=>{
 const s=setup('lookAroundAndFindOut');
 assert.equal(biByeOperatorDuck(s.b,1),0);
 assert.equal(issue(s,'bibyeSharpTurn',1).rejected,undefined);
 assert.ok(biByeOperatorDuck(s.b,1.13)>0&&biByeOperatorDuck(s.b,1.13)<1,
   'knight folds into stance before the first sweep contact');
 assert.ok(biByeOperatorDuck(s.b,1.55)>.98,'body is below moving limbs during contacts');
 assert.ok(biByeOperatorDuck(s.b,2.6)<.1,'single attack ends with natural recovery');
 finishBiByeSweep(s.room,s.b,2.65);
 assert.equal(issue(s,'siegeSkill',5.01).rejected,undefined,'independent 24-second Skill is not consumed by melee');
 step(s,5.01,6.3);
 assert.equal(s.b.sweep.phase,'loop');
 assert.equal(biByeOperatorDuck(s.b,6.3),1,'every loop revolution keeps head below the blade sweep');
 assert.equal(issue(s,'siegeSkill',6.35).rejected,undefined);
 assert.equal(s.b.sweep.phase,'settle');
 assert.equal(biByeOperatorDuck(s.b,6.7),1,'do not stand while an arbitrarily stopped traverse is still rotating');
 let finishedAt=null;
 for(let t=6.35+1/30;t<9;t+=1/30){
  stepBiByeLlista(s.room,s.b,1/30,t,s.room.world);
  if(!s.b.sweep){finishedAt=t;break;}
 }
 assert.ok(Number.isFinite(finishedAt));
 assert.equal(biByeOperatorDuck(s.b,finishedAt),1);
 assert.ok(biByeOperatorDuck(s.b,finishedAt+.19)>0);
 assert.equal(biByeOperatorDuck(s.b,finishedAt+.4),0,'knight stands again after physical clearance');
 assert.ok(s.b.skill.readyAt>=finishedAt+24-1e-8,'the sustained Skill retains its separate 24s cooldown');
 const snap=serializeSnapshot(s.room,finishedAt+.2,s.operator.id).bibyeBallista;
 assert.ok(Number.isFinite(snap.lastSweepEndAt)&&Number.isFinite(snap.sweepHeavyReadyAt),
   'remote spectators and the operator see the same duck and ability recovery');
});
