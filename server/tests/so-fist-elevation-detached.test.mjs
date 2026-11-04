import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../../shared/sim/Room.mjs';
import {createSoFistication,soFistEntry,mountSoFistication,dismountSoFistication,
  stepSoFistication,fireSoFistication,primeSoFistSkill,
  damageSoFistication} from '../../shared/sim/soFistication.mjs';
import {soFistVolumes,soFistStriker,soFistFrame,SO_FIST_SCALE} from '../../shared/sim/soFistGeometry.mjs';
import {SO_FIST_LIFT} from '../../shared/sim/soFistElevation.mjs';
import {requestLongArmToJaw,RAM_FIST} from '../../shared/sim/soFistDetachedFist.mjs';
import {createBiByeLlista} from '../../shared/sim/biByeLlista.mjs';
import {createFightFlight} from '../../shared/sim/fightFlight.mjs';

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
 step(s,2,{ramRaise:true,pitch:42*Math.PI/180});
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
 const s=setup();step(s,2,{ramRaise:true,pitch:.5});
 assert.equal(s.b.charging,false);
 assert.equal(fireSoFistication(s.room,s.b,2.2),true);
 assert.ok(soFistStriker(s.b,2.85).axes[2][1]>0);
 s.b.components.Fist.health=0;
 assert.equal(fireSoFistication(s.room,s.b,6.3),true);
 assert.equal(soFistStriker(s.b,6.9).componentId,'Piston',
   'destroying the glove does not destroy the striker');
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
 const expected=soFistStriker(s.b,1);
 assert.equal(primeSoFistSkill(s.room,s.b,s.p,1),null);
 for(let i=0;i<3;i++)
  assert.ok(Math.abs(s.b.detachedFist.position[['x','y','z'][i]]-expected.center[i])<1e-6);
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
