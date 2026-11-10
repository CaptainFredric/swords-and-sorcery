import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../../shared/sim/Room.mjs';
import {createSoFistication,soFistEntry,mountSoFistication,dismountSoFistication,
  stepSoFistication,fireSoFistication,primeSoFistSkill,
  damageSoFistication,soFistReverseChargeAvailable} from '../../shared/sim/soFistication.mjs';
import {soFistVolumes,soFistStriker,soFistFrame,SO_FIST_SCALE} from '../../shared/sim/soFistGeometry.mjs';
import {SO_FIST_LIFT,soFistAllowedPitch,soFistUpperPoint,soFistPitchCylinderPose} from '../../shared/sim/soFistElevation.mjs';
import {requestLongArmToJaw,RAM_FIST} from '../../shared/sim/soFistDetachedFist.mjs';
import {createBiByeLlista} from '../../shared/sim/biByeLlista.mjs';
import {createFightFlight} from '../../shared/sim/fightFlight.mjs';
import {endSiegeSkill} from '../../shared/sim/siegeSkills.mjs';
import {serializeSnapshot,applyRoomCommand} from '../../shared/sim/wire.mjs';

function setup(skill='beatToThePunch'){
 const room=new Room('LIFT',{mode:'PRACTICE'});room.state='PLAYING';
 room.world={solids:[],ramps:[],
   floors:[{id:'floor',center:[0,-.1,0],size:[180,.2,180],y:0}],
   abyssY:-20,spawnPoints:[{x:0,y:0,z:0}]};
 const p=room.addPlayer({id:'operator',token:'operator',name:'Operator',
   siegeLoadout:{soFist:skill}},0);
 const b=room.soFistication=createSoFistication({x:0,y:0,z:0,heading:0});
 p.position=soFistEntry(b,room.world);p.spawnProtectionUntil=0;
 assert.equal(mountSoFistication(room,b,p,0),true);
 assert.equal(b.skill.id,skill);
 return {room,p,b};
}
function step(s,seconds,input={},from=0){
 const dt=1/30;
 s.p.input={forward:0,right:0,yaw:0,pitch:0,ramRaise:false,crouch:false,sprint:false,...input};
 for(let i=1;i<=Math.round(seconds/dt);i++)
   stepSoFistication(s.room,s.b,dt,from+i*dt,s.room.world);
}
test('SO-FIST-ICATION lift and pitch move the REAL piston hitbox, not its wheels or rear rider station',()=>{
 const s=setup(),rest=soFistStriker(s.b,0);
 const wheel=soFistVolumes(s.b,0).find(v=>v.componentId==='Wheel_FL').center.slice();
 const seat=soFistEntry(s.b,s.room.world);
 step(s,2,{ramRaise:true,ramPitchUp:true,pitch:-.8});
 assert.ok(s.b.ramLiftY>=SO_FIST_LIFT.nominalRise);
 assert.ok(s.b.ramLiftY<=SO_FIST_LIFT.maxRise);
 assert.ok(s.b.ramElevPitch>35*Math.PI/180);
 const raised=soFistStriker(s.b,2),w2=soFistVolumes(s.b,2).find(v=>v.componentId==='Wheel_FL');
 assert.ok(raised.center[1]>rest.center[1]+2,
   'upper ram is lifted and pitched in the authoritative geometry');
 assert.deepEqual(w2.center,wheel,'wheelbox stays on grounded undercarriage');
 assert.deepEqual(soFistEntry(s.b,s.room.world),seat,'rear mount remains at wheelframe height');
 assert.ok(raised.axes[2][1]>.5,'forward striking axis points upward');
});
test('Elevating makes a charge inefficient and the regular piston still fires while raised',()=>{
 const s=setup();step(s,2,{ramRaise:true,ramPitchUp:true});
 assert.equal(s.b.charging,false);
 assert.equal(fireSoFistication(s.room,s.b,2.2),true);
 assert.ok(soFistStriker(s.b,2.85).axes[2][1]>0);
 s.b.components.Fist.health=0;
 assert.equal(fireSoFistication(s.room,s.b,6.3),true);
 assert.equal(soFistStriker(s.b,6.9).componentId,'Piston',
   'destroying the glove does not destroy the striker');
});
test('ram hydraulic controls do not follow camera pitch and preserve their held mechanical angle',()=>{
 const s=setup();
 step(s,1,{pitch:1.1});
 assert.equal(s.b.ramElevPitch,0,'looking toward a bridge must not elevate the weapon');
 step(s,2,{ramRaise:true},1);
 assert.ok(s.b.ramLiftY>=SO_FIST_LIFT.nominalRise);
 assert.equal(s.b.ramElevPitch,0,'lifting the assembly does not automatically tilt the front');
 step(s,1,{ramPitchUp:true,pitch:-.9},3);
 const elevated=s.b.ramElevPitch;
 assert.ok(elevated>35*Math.PI/180,'explicit pitch-up drives the rear trunnion');
 step(s,.5,{pitch:1.3},4);
 assert.ok(Math.abs(s.b.ramElevPitch-elevated)<1e-6,
   'releasing controls holds front angle despite operator looking around');
 step(s,1,{ramPitchDown:true},4.5);
 assert.ok(s.b.ramElevPitch<.05,'pitch-down retracts the same physical joint');
});
test('lowering a fully tilted ram retracts its pitch as necessary instead of forcing through its frame',()=>{
 const s=setup();
 step(s,2,{ramRaise:true,ramPitchUp:true});
 assert.ok(s.b.ramElevPitch>SO_FIST_LIFT.lowPitch);
 step(s,.2,{crouch:true},2);
 assert.ok(s.b.ramLiftY>=0);
 assert.ok(s.b.ramElevPitch<=SO_FIST_LIFT.maxPitch);
 step(s,2,{crouch:true},2.2);
 assert.ok(s.b.ramLiftY<.03,'lowering eventually returns the saddle to its rest');
 assert.ok(s.b.ramElevPitch<=SO_FIST_LIFT.lowPitch+.001,
   'saddle cannot enter the low position with a forbidden high pitch');
});
test('Long Arm launches once, then exposes the weaker piston without restoring glove HP',()=>{
 const s=setup('longArmToTheJaw');
 s.b.components.Fist.health=213;
 assert.equal(primeSoFistSkill(s.room,s.b,s.p,1),null);
 assert.equal(s.b.fistMounted,false);
 assert.equal(s.b.detachedFist.state,'flying');
 assert.equal(s.b.detachedFist.healthAtLaunch,213);
 assert.equal(soFistStriker(s.b,1).componentId,'Piston');
 assert.ok(!soFistVolumes(s.b,1).some(v=>v.componentId==='Fist'));
 assert.match(primeSoFistSkill(s.room,s.b,s.p,1.1),/still airborne/i);
 assert.equal(fireSoFistication(s.room,s.b,1.2),true,
   'the exposed piston remains an effective ordinary attack');
 assert.equal(s.b.components.Fist.health,213);
});
test('Physical fist flies, lands, and starts cooldown only on nearby intentional pickup',()=>{
 const s=setup('longArmToTheJaw');
 assert.equal(primeSoFistSkill(s.room,s.b,s.p,1),null);
 assert.ok(s.b.detachedFist.velocity.z<0);
 // In this flat arena a level shot will eventually hit the ground.
 step(s,3,{},1);
 assert.ok(['resting','falling','abyss'].includes(s.b.detachedFist?.state));
 s.b.detachedFist.state='resting';
 s.b.detachedFist.position={x:0,y:.62,z:-4};
 assert.match(primeSoFistSkill(s.room,s.b,s.p,4.2),/drive.*beside/i);
 s.b.detachedFist.position={x:0,y:.62,z:-1};
 assert.equal(primeSoFistSkill(s.room,s.b,s.p,4.3),null);
 assert.equal(s.b.detachedFist,null);
 assert.equal(s.b.fistMounted,true);
 assert.equal(s.b.skill.readyAt,4.3+SO_FIST_LIFT.recoveryCooldown);
 assert.match(primeSoFistSkill(s.room,s.b,s.p,4.4),/recover/i);
});
test('Abyss recovery requires original spawn, dismount, machine lockout, full cooldown, same damaged HP',()=>{
 const s=setup('longArmToTheJaw');
 s.b.components.Fist.health=197;
 assert.equal(primeSoFistSkill(s.room,s.b,s.p,1),null);
 const f=s.b.detachedFist;
 f.state='abyss';f.position={x:0,y:-40,z:-60};f.velocity={x:0,y:0,z:0};
 s.b.z=-12;
 stepSoFistication(s.room,s.b,1/30,2);
 assert.equal(f.state,'abyss','cannot recover remotely while away from original spawn');
 s.b.z=0;stepSoFistication(s.room,s.b,1/30,3);
 assert.equal(f.state,'abyss','the rider MUST dismount at spawn');
 assert.equal(dismountSoFistication(s.room,s.b,s.p,{at:3.1}),true);
 stepSoFistication(s.room,s.b,1/30,3.2);
 assert.equal(f.state,'recovering');
 assert.equal(s.b.operatorId,null);
 s.p.position=soFistEntry(s.b,s.room.world);
 assert.equal(mountSoFistication(s.room,s.b,s.p,3.3),false,
  'nobody may operate the machine during recovery');
 stepSoFistication(s.room,s.b,1/30,3.2+SO_FIST_LIFT.recoveryCooldown-.1);
 assert.equal(s.b.fistMounted,false);
 stepSoFistication(s.room,s.b,1/30,3.2+SO_FIST_LIFT.recoveryCooldown+.1);
 assert.equal(s.b.detachedFist,null);
 assert.equal(s.b.fistMounted,true);
 assert.equal(s.b.components.Fist.health,197,'the lost fist was not repaired');
 assert.equal(mountSoFistication(s.room,s.b,s.p,28),true);
});

test('A raised physical piston can strike an airborne machine component instead of an invisible ground hitbox',()=>{
 const s=setup();
 const angle=50*Math.PI/180;
 s.b.ramLiftY=SO_FIST_LIFT.maxRise;s.b.ramElevPitch=angle;
 s.p.input={forward:0,right:0,yaw:0,pitch:angle};
 s.b.strikeAt=0;s.b.strikeOperatorId=s.p.id;
 const terminal=soFistStriker(s.b,.80);
 const aircraft=s.room.fightFlight=createFightFlight({
   id:'low-flyer',x:terminal.center[0],y:terminal.center[1]-.5,
   z:terminal.center[2],heading:0
 });
 const health=aircraft.health,rotor=aircraft.rotorHP;
 for(let i=1;i<=17;i++)stepSoFistication(s.room,s.b,1/30,.55+i/30,s.room.world);
 assert.ok(aircraft.health<health||aircraft.rotorHP<rotor||
   aircraft.braceLHP<80||aircraft.braceRHP<80,
   'the rotated physical piston overlaps and damages a real flight component');
 assert.ok(s.b.strokeMachines.includes(aircraft.id));
});

test('launched physical fist begins at the attached gauntlet center without muzzle teleportation',()=>{
 const s=setup('longArmToTheJaw');
 s.b.ramLiftY=.9;s.b.ramElevPitch=.55;
 const expected=soFistUpperPoint(soFistFrame(s.b),s.b,
   [0,.380*SO_FIST_SCALE,.735*SO_FIST_SCALE]);
 assert.equal(primeSoFistSkill(s.room,s.b,s.p,1),null);
 for(let i=0;i<3;i++)
  assert.ok(Math.abs(s.b.detachedFist.position[['x','y','z'][i]]-expected[i])<1e-6,
    'fist is launched from the actual delivered COM locator on the pitched muzzle');
 assert.ok(s.b.detachedFist.velocity.y>0,
   'raised muzzle launches along real elevated piston axis');
});
test('high-speed fist collision sweeps across a thin wall, never tunneling even on a long tick',()=>{
 const s=setup('longArmToTheJaw');
 s.room.world.solids=[{id:'thin-vertical-stone',center:[0,2,-4.6],
   size:[7,4,.04],material:'stone'}];
 assert.equal(primeSoFistSkill(s.room,s.b,s.p,1),null);
 stepSoFistication(s.room,s.b,.2,1.2,s.room.world);
 const hit=s.room.events.find(e=>e.type==='soFistDetachedFist'&&
   e.action==='impact'&&e.kind==='wall');
 assert.ok(hit,'swept fist collided with very thin architecture');
 assert.ok(s.b.detachedFist.position.z>-4.6);
 assert.equal(s.b.detachedFist.impactCount,1);
});
test('ascending fist never snaps upward through a bridge platform above its center',()=>{
 const s=setup('longArmToTheJaw');
 assert.equal(primeSoFistSkill(s.room,s.b,s.p,1),null);
 s.room.world.floors=[{id:'raised-platform',center:[0,1.1,0],size:[15,.2,15],y:1.2}];
 const f=s.b.detachedFist;
 f.position={x:0,y:.85,z:0};f.velocity={x:0,y:8,z:0};
 stepSoFistication(s.room,s.b,.08,1.08,s.room.world);
 assert.equal(f.state,'flying');
 assert.ok(f.position.y>.85);
 assert.equal(s.room.events.some(e=>e.type==='soFistDetachedFist'&&e.action==='landed'),false);
});
test('ballista impacts use real articulated components with valid component attribution',()=>{
 const s=setup('longArmToTheJaw');
 s.room.biByeLlista=createBiByeLlista({x:0,y:0,z:-7,baseYaw:0});
 assert.equal(primeSoFistSkill(s.room,s.b,s.p,1),null);
 for(let n=1;n<=40&&s.b.detachedFist.state==='flying';n++)
  stepSoFistication(s.room,s.b,1/60,1+n/60,s.room.world);
 const impact=s.room.events.find(e=>e.type==='soFistDetachedFist'&&
   e.action==='impact'&&e.kind==='ballista');
 assert.ok(impact,'physical projectile intersects the real ballista, not a static approximation');
 const dealt=s.room.events.find(e=>e.type==='bibyeDamaged'&&
   e.source==='long-arm-to-the-jaw');
 assert.ok(dealt,'ballista damage entrypoint records component damage');
 assert.ok(dealt.componentId==='hull'||s.room.biByeLlista.components[dealt.componentId],
   'the impacted part must be an actual authoritative component');
 assert.equal(dealt.componentId,impact.componentId);
});
test('projectile follows the same ballistic path at 30Hz, 120Hz and a coarsened server tick',()=>{
 const run=dt=>{
  const s=setup('longArmToTheJaw');
  s.room.world.floors=[];s.room.world.abyssY=-100;
  primeSoFistSkill(s.room,s.b,s.p,1);
  const count=Math.round(.6/dt);
  for(let i=1;i<=count;i++)
   stepSoFistication(s.room,s.b,dt,1+i*dt,s.room.world);
  return s.b.detachedFist;
 };
 const slow=run(1/30),fine=run(1/120),coarse=run(.6);
 for(const axis of ['x','y','z'])
  assert.ok(Math.abs(slow.position[axis]-fine.position[axis])<.012);
 for(const axis of ['x','y','z'])
  assert.ok(Math.abs(slow.position[axis]-coarse.position[axis])<.02);
 assert.equal(slow.state,'flying');assert.equal(fine.state,'flying');
 assert.ok(slow.spin.x>0&&Number.isFinite(slow.spin.x));
});
test('a spent fist cannot ghost through a second wall or strike again for damage',()=>{
 const s=setup('longArmToTheJaw');primeSoFistSkill(s.room,s.b,s.p,1);
 const f=s.b.detachedFist;
 f.state='falling';f.position={x:0,y:2.5,z:-3};
 f.velocity={x:0,y:-1,z:-12};f.impactCount=1;
 s.room.world.solids=[{center:[0,2,-4],size:[6,4,.04]}];
 stepSoFistication(s.room,s.b,.15,1.15,s.room.world);
 assert.ok(f.position.z>-4.05,'spent fist cannot pass through the wall');
 assert.equal(f.impactCount,1,'no repeated offensive hits');
 assert.ok(f.velocity.z>=-12,'collision absorbs or rebounds momentum');
});
test('ordinary fist pickup is physically occluded by walls even within pickup radius',()=>{
 const s=setup('longArmToTheJaw');primeSoFistSkill(s.room,s.b,s.p,1);
 s.b.detachedFist.state='resting';
 s.b.detachedFist.position={x:0,y:RAM_FIST.radius,z:-2};
 s.room.world.solids=[{center:[0,1,-1],size:[3,2,.15]}];
 assert.match(requestLongArmToJaw(s.room,s.b,s.p,2),/obstructed/i);
 assert.equal(s.b.fistMounted,false);
});
test('after the fist departs, enemy attacks cannot damage its absent carriage hitbox',()=>{
 const s=setup('longArmToTheJaw');s.b.components.Fist.health=201;
 primeSoFistSkill(s.room,s.b,s.p,1);
 assert.equal(damageSoFistication(s.room,s.b,120,'enemy',
   'sword',1.2,{componentId:'Fist'}),false);
 assert.equal(s.b.components.Fist.health,201);
});
test('moving the ram out of the home recovery area cancels the timer, not an instant free recall',()=>{
 const s=setup('longArmToTheJaw');s.b.components.Fist.health=174;
 primeSoFistSkill(s.room,s.b,s.p,1);
 s.b.detachedFist.state='abyss';s.b.detachedFist.position={x:0,y:-42,z:-100};
 dismountSoFistication(s.room,s.b,s.p,{at:2});
 stepSoFistication(s.room,s.b,1/30,2.1,s.room.world);
 assert.equal(s.b.detachedFist.state,'recovering');
 const initial=s.b.detachedFist.recoverAt;
 s.b.x=SO_FIST_LIFT.recoveryRadius+3;
 stepSoFistication(s.room,s.b,1/30,3,s.room.world);
 assert.equal(s.b.detachedFist.state,'abyss');
 assert.equal(s.b.fistRecoveryUntil,0);
 s.b.x=0;stepSoFistication(s.room,s.b,1/30,4,s.room.world);
 assert.equal(s.b.detachedFist.state,'recovering');
 assert.ok(s.b.detachedFist.recoverAt>initial,'full delay restarts after disruption');
 assert.equal(s.b.components.Fist.health,174);
});

test('a second rider with Beat to the Punch can collect a fist thrown by Long Arm',()=>{
 const s=setup('longArmToTheJaw');s.b.components.Fist.health=236;
 assert.equal(primeSoFistSkill(s.room,s.b,s.p,1),null);
 s.b.detachedFist.state='resting';
 s.b.detachedFist.position={x:0,y:RAM_FIST.radius,z:-1.5};
 assert.equal(dismountSoFistication(s.room,s.b,s.p,{at:2}),true);
 s.p.position={x:20,y:0,z:20};
 const p=s.room.addPlayer({id:'second',token:'second',name:'Second'},0);
 p.siegeLoadout={...p.siegeLoadout,soFist:'beatToThePunch'};
 p.position=soFistEntry(s.b,s.room.world);
 assert.equal(mountSoFistication(s.room,s.b,p,2.1),true);
 assert.equal(s.b.skill.id,'beatToThePunch');
 assert.equal(primeSoFistSkill(s.room,s.b,p,2.2),null);
 assert.equal(s.b.detachedFist,null);
 assert.equal(s.b.fistMounted,true);
 assert.equal(s.b.components.Fist.health,236);
 assert.ok(s.b.skill.readyAt>=26.2);
});
test('recovery cannot be boarded at expiration before authoritative state completion',()=>{
 const s=setup('longArmToTheJaw');
 primeSoFistSkill(s.room,s.b,s.p,1);
 s.b.detachedFist.state='recovering';s.b.detachedFist.recoverAt=10;
 s.b.fistRecoveryUntil=10;
 dismountSoFistication(s.room,s.b,s.p,{at:2});
 s.p.position=soFistEntry(s.b,s.room.world);
 assert.equal(mountSoFistication(s.room,s.b,s.p,10),false);
 stepSoFistication(s.room,s.b,1/30,10.01,s.room.world);
 assert.equal(s.b.detachedFist,null);
 assert.equal(mountSoFistication(s.room,s.b,s.p,10.02),true);
});
test('Long Arm routes physical impacts into Fight-and-Flight components',()=>{
 const s=setup('longArmToTheJaw');
 s.room.fightFlight=createFightFlight({id:'projectile-target',
   x:0,y:0,z:-5,heading:0});
 assert.equal(primeSoFistSkill(s.room,s.b,s.p,1),null);
 for(let i=1;i<=45&&s.b.detachedFist.state==='flying';i++)
  stepSoFistication(s.room,s.b,1/60,1+i/60,s.room.world);
 const hit=s.room.events.find(e=>e.type==='soFistDetachedFist'&&
   e.action==='impact'&&e.kind==='flight');
 const component=s.room.events.find(e=>e.type==='fightFlightComponentHit'&&
   e.source==='long-arm-to-the-jaw');
 assert.ok(hit&&component,'physical apparatus component is struck');
 assert.equal(component.component,hit.componentId);
 assert.ok(component.damage>=0);
});

test('Argon GLB physics fit uses separate COM sphere and lower-surface clearance',()=>{
 assert.ok(RAM_FIST.radius>=.970,'swept projectile must cover measured GLB COM radial extent');
 assert.ok(RAM_FIST.groundRadius>=.673,'ground collision uses measured lower cuff instead of spherical envelope');
 assert.ok(RAM_FIST.groundRadius<RAM_FIST.radius,
  'larger swept collision sphere must not cause a level muzzle to touch the ground immediately');
});
test('Argon trunnion allows maximum pitch above 0.220 local lift, not only at maximum hydraulic extension',()=>{
 const b={ramLiftY:0};
 assert.ok(Math.abs(soFistAllowedPitch(b)-SO_FIST_LIFT.lowPitch)<1e-9);
 b.ramLiftY=SO_FIST_LIFT.pitchClearanceRise;
 assert.ok(Math.abs(soFistAllowedPitch(b)-SO_FIST_LIFT.maxPitch)<1e-9);
 b.ramLiftY=SO_FIST_LIFT.maxRise;
 assert.ok(Math.abs(soFistAllowedPitch(b)-SO_FIST_LIFT.maxPitch)<1e-9);
});
test('launched gauntlet retains the original machine heading and pitch independently of subsequent carriage steering',()=>{
 const s=setup('longArmToTheJaw');
 s.b.ramLiftY=SO_FIST_LIFT.maxRise;
 s.b.ramElevPitch=.7;s.b.heading=.4;
 assert.equal(primeSoFistSkill(s.room,s.b,s.p,1),null);
 const f=s.b.detachedFist;
 assert.ok(Math.abs(f.launchHeading-.4)<1e-8);
 assert.ok(Math.abs(f.launchPitch-.7)<1e-8);
 s.b.heading=-.9;s.b.ramElevPitch=0;
 assert.ok(Math.abs(f.launchHeading-.4)<1e-8);
 assert.ok(Math.abs(f.launchPitch-.7)<1e-8);
});

test('Argon pitch cylinder barrels and rods remain exactly coaxial from 0 to 50 degrees',()=>{
 const beta0=Math.atan2(.270,.380);
 for(let degrees=0;degrees<=50;degrees++){
  const angle=degrees*Math.PI/180;
  const p=soFistPitchCylinderPose(angle);
  // The upper rod lives under a rotating trunnion (-angle). Its own local
  // correction exactly reproduces the independently rotated lower barrel.
  assert.ok(Math.abs((p.rodX-angle)-p.barrelX)<1e-11);
  const normalized=[p.axisY/p.length,p.axisZ/p.length];
  const lowerAxis=[Math.sin(beta0-p.barrelX),Math.cos(beta0-p.barrelX)];
  assert.ok(Math.hypot(normalized[0]-lowerAxis[0],normalized[1]-lowerAxis[1])<1e-11,
    'lower barrel axis points to upper rod clevis at '+degrees+' degrees');
  assert.ok(.870-p.length>=.115-1e-6,
    'pitch cylinder overlap drops below safe minimum at '+degrees+' degrees');
 }
 const peak=soFistPitchCylinderPose(50*Math.PI/180);
 assert.ok(Math.abs(peak.barrelX+.9155)<.0001);
 assert.ok(Math.abs(peak.rodX+.0428)<.0001);
});

test('ram-only held pitch and hydraulic lift operate independently without dismount',()=>{
 const q=setup(),initial=soFistStriker(q.b,0);
 assert.equal(q.b.operatorId,q.p.id);
 step(q,.35,{ramPitchUp:true});
 const angle=q.b.ramElevPitch;
 assert.ok(angle>0,'hold Raise tilts the front of the ram');
 assert.equal(q.b.ramLiftY,0,'no swipe cannot lift entire assembly');
 step(q,.8,{ramRaise:true},.35);
 assert.ok(q.b.ramLiftY>0,'outward Raise swipe lifts the assembly');
 assert.ok(Math.abs(q.b.ramElevPitch-angle)<.001,'lift cannot also command pitch');
 const upperY=q.b.ramLiftY;
 step(q,.2,{ramLower:true},1.15);
 assert.ok(q.b.ramLiftY<upperY,'swipe Down lowers hydraulic assembly');
 assert.equal(q.b.operatorId,q.p.id,'none of these held inputs dismounts');
 assert.ok(soFistStriker(q.b,1.35).center[1]>initial.center[1]);
});
test('Beat to the Punch permits real backward charge with acceleration and drive pressure',()=>{
 const q=setup();q.room.siegeSkillRandom=()=>1-1e-12;
 assert.equal(soFistReverseChargeAvailable(q.b),false);
 assert.equal(primeSoFistSkill(q.room,q.b,q.p,0),null);
 assert.equal(soFistReverseChargeAvailable(q.b),true);
 step(q,1,{forward:-1,sprint:true});
 assert.ok(q.b.speed< -4,'Skill reverse drives rearward rather than animating UI');
 assert.ok(q.b.speed> -10,'mass prevents instant peak speed');
 assert.ok(q.b.pressure<100,'rearward charge consumes actual drive pressure');
 assert.equal(q.b.chargeDirection,-1);
 assert.ok(q.b.z>0,'reverse movement is physically simulated');
 assert.ok(q.b.skill.debt>0,'reverse charge incurs its Skill debt');
});
test('Beat reverse momentum cannot flip instantly and returns to ordinary reverse on Skill end',()=>{
 const q=setup();q.room.siegeSkillRandom=()=>1-1e-12;
 primeSoFistSkill(q.room,q.b,q.p,0);
 q.b.speed=9;
 step(q,.2,{forward:-1,sprint:true});
 assert.ok(q.b.speed>0,'rearward demand first brakes existing forward momentum');
 assert.equal(q.b.chargeDirection,1,'charge direction reports actual motion while braking');
 step(q,2,{forward:-1,sprint:true},.2);
 assert.ok(q.b.speed<0,'sustained demand eventually reverses momentum');
 endSiegeSkill(q.b,2.2);
 assert.equal(soFistReverseChargeAvailable(q.b),false);
 step(q,.2,{forward:-1,sprint:true},2.2);
 assert.equal(q.b.charging,false);
 assert.equal(q.b.chargeDirection,0);
 assert.ok(q.b.speed<0,'Skill end cannot teleport the machine back to zero speed');
});
test('ordinary reverse remains constrained; reverse Skill does not invent a rear-facing fist',()=>{
 const q=setup();step(q,2,{forward:-1,sprint:true});
 assert.ok(q.b.speed<=0&&q.b.speed>=-2.51);
 assert.equal(q.b.charging,false);
 assert.equal(soFistStriker(q.b,2).componentId,'Fist');
 assert.equal(q.b.chargeDirection,0);
});
test('detached fist HP is preserved; destroyed resting fist cannot be retrieved',()=>{
 const q=setup('longArmToTheJaw');
 q.b.components.Fist.health=187;
 assert.equal(primeSoFistSkill(q.room,q.b,q.p,1),null);
 assert.equal(q.b.detachedFist.healthAtLaunch,187);
 q.b.detachedFist.state='resting';
 q.b.detachedFist.position={x:q.b.x,y:.68,z:q.b.z-1};
 assert.equal(primeSoFistSkill(q.room,q.b,q.p,2),null);
 assert.equal(q.b.components.Fist.health,187,'retrieval has no repair');
 assert.equal(q.b.fistMounted,true);
 assert.equal(primeSoFistSkill(q.room,q.b,q.p,27),null);
 assert.equal(q.b.detachedFist.healthAtLaunch,187);
 q.b.components.Fist.health=0;
 q.b.detachedFist.state='resting';
 assert.match(primeSoFistSkill(q.room,q.b,q.p,28),/destroyed/i);
 assert.equal(q.b.detachedFist.state,'destroyed');
 assert.equal(q.b.fistMounted,false);
 assert.equal(q.b.components.Fist.health,0);
 assert.equal(soFistStriker(q.b,28).componentId,'Piston',
   'exposed piston remains usable while the fist cannot be recovered');
});
test('component destruction emits authoritative health and does not regenerate on subsequent ticks',()=>{
 const q=setup();
 q.b.components.Fist.health=8;
 assert.equal(damageSoFistication(q.room,q.b,90,'enemy','sword',.5,{componentId:'Fist'}),true);
 assert.equal(q.b.components.Fist.health,0);
 const destroyed=q.room.events.find(e=>e.type==='soFistComponentDestroyed');
 assert.equal(destroyed?.machineId,q.b.id);
 assert.equal(destroyed?.health,0);
 assert.equal(q.room.events.find(e=>e.type==='soFistDamaged'&&e.componentId==='Fist')?.health,0);
 assert.equal(soFistStriker(q.b,.5).componentId,'Piston');
 step(q,1,{});
 assert.equal(q.b.components.Fist.health,0,'no passive repair or recovery loophole');
});
test('snapshots expose unambiguous physical ram state and reverse-charge authorization',()=>{
 const q=setup();q.room.siegeSkillRandom=()=>1-1e-12;
 primeSoFistSkill(q.room,q.b,q.p,0);
 step(q,.3,{forward:-1,sprint:true});
 const m=serializeSnapshot(q.room,.3,q.p.id).soFistication;
 assert.equal(m.id,q.b.id);
 assert.equal(m.type,'so-fist-ication');
 assert.equal(m.fistHealth,q.b.components.Fist.health);
 assert.equal(m.fistMaxHealth,q.b.components.Fist.maxHealth);
 assert.equal(m.fistState,'attached');
 assert.equal(m.drivePressure,q.b.pressure);
 assert.equal(m.reverseChargeAvailable,true);
 assert.equal(m.chargeDirection,q.b.chargeDirection);
 assert.ok(Number.isFinite(m.ramLiftY)&&Number.isFinite(m.ramElevPitch));
 endSiegeSkill(q.b,.3);
 assert.equal(serializeSnapshot(q.room,.3,q.p.id).soFistication.reverseChargeAvailable,false);
});
test('server-normalized mounted input never turns hydraulics into Jump/Crouch',()=>{
 const q=setup();
 const result=applyRoomCommand(q.room,q.p,{type:'input',forward:0,ramRaise:true,ramLower:true,ramPitchUp:true,ramPitchDown:false,jump:true,crouch:true,seq:1},1);
 assert.ok(!result?.rejected);
 assert.equal(q.p.input.ramRaise,true);
 assert.equal(q.p.input.ramLower,true);
 assert.equal(q.p.input.ramPitchUp,true);
 assert.equal(q.p.input.jump,false);
 assert.equal(q.p.input.crouch,false);
 assert.equal(q.b.operatorId,q.p.id);
});

test('rearward charge sweeps terrain instead of teleporting through a solid wall',()=>{
 const q=setup();q.room.siegeSkillRandom=()=>1-1e-12;
 q.room.world.solids=[{id:'reverse-wall',center:[0,2,9],size:[14,4,.5]}];
 primeSoFistSkill(q.room,q.b,q.p,0);
 step(q,3,{forward:-1,sprint:true});
 assert.ok(q.b.z<9.1,'reverse carriage must stay on collision side of obstruction');
 assert.ok(Number.isFinite(q.b.speed)&&Math.abs(q.b.speed)<13,'collision and rebound remain bounded');
 assert.ok(q.b.health>0,'wall contact is not a free magical fist blast');
});
test('reverse-charge server simulation is deterministic for identical inputs and seeded failures',()=>{
 const simulate=()=>{
  const q=setup();q.room.siegeSkillRandom=()=>1-1e-12;
  primeSoFistSkill(q.room,q.b,q.p,0);
  step(q,.5,{forward:1,sprint:true});
  step(q,.6,{forward:-1,sprint:true},.5);
  step(q,.5,{forward:-1,right:.35,sprint:true},1.1);
  return {x:q.b.x,z:q.b.z,heading:q.b.heading,speed:q.b.speed,
    pressure:q.b.pressure,direction:q.b.chargeDirection,debt:q.b.skill.debt,
    lift:q.b.ramLiftY,pitch:q.b.ramElevPitch};
 };
 assert.deepEqual(simulate(),simulate(),
   'two independent authoritative rooms with same inputs must yield equal states');
});

test('bare piston contact follows the recovered authored striker tip through lift, pitch and stroke',()=>{
 const {b}=setup();
 b.fistMounted=false;
 b.strikeAt=1;
 for(const [rise,pitch,age] of [[0,0,0],[SO_FIST_LIFT.maxRise,.4,.4],
   [SO_FIST_LIFT.maxRise,SO_FIST_LIFT.maxPitch,.88]]){
  Object.assign(b,{ramLiftY:rise,ramElevPitch:pitch});
  const stroke=age===0?0:age===.4?-.088:.445;
  const expected=soFistUpperPoint(soFistFrame(b),b,[0,.365,.520+.092+stroke].map(n=>n*SO_FIST_SCALE));
  const cap=soFistStriker(b,1+age);
  const face=cap.center.map((v,i)=>v+cap.axes[2][i]*cap.size[2]/2);
  assert.ok(Math.hypot(...face.map((v,i)=>v-expected[i]))<.001,
    'the foremost point of the impact OBB meets the authored tip');
  const shaft=soFistVolumes(b,1+age).find(v=>v.componentId==='Piston');
  const shaftFront=shaft.center.map((v,i)=>v+shaft.axes[2][i]*shaft.size[2]/2);
  const frontOverhang=shaftFront.reduce((v,n,i)=>v+(n-face[i])*cap.axes[2][i],0);
  assert.ok(Math.abs(frontOverhang-.012*SO_FIST_SCALE)<.001,'shaft covers the cap mesh');
 }
});
