import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../../shared/sim/Room.mjs';
import {createSoFistication,soFistEntry,mountSoFistication,dismountSoFistication,
  stepSoFistication,fireSoFistication,primeSoFistSkill} from '../../shared/sim/soFistication.mjs';
import {soFistVolumes,soFistStriker,soFistFrame,SO_FIST_SCALE} from '../../shared/sim/soFistGeometry.mjs';
import {SO_FIST_LIFT} from '../../shared/sim/soFistElevation.mjs';
import {requestLongArmToJaw} from '../../shared/sim/soFistDetachedFist.mjs';
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
