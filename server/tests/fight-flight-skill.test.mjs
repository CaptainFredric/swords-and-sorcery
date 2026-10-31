import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomManager} from '../../shared/sim/RoomManager.mjs';
import {applyRoomCommand} from '../../shared/sim/wire.mjs';
import {createFightFlight,mountFightFlight,dismountFightFlight,stepFightFlight} from '../../shared/sim/fightFlight.mjs';
import {FLIGHT_REPEATER,stepFightFlightWeapons,requestFightFlightFire,advanceFlightAmmo} from '../../shared/sim/fightFlightWeapons.mjs';
import {requestFightFlightSkill,stepFightFlightSkill,fightFlightSkillActive,FIRE_AWAY} from '../../shared/sim/fightFlightSkill.mjs';

function setup(){
 const room=new RoomManager().createSoloRoom('PRACTICE',0,'castleward');
 room.state='PLAYING';room.world={floors:[{id:'floor',center:[0,-.1,0],size:[100,.2,100],y:0}],solids:[],ramps:[],spawnPoints:[{x:0,y:0,z:0,yaw:0}]};
 const p=room.addPlayer({id:'pilot',token:'pilot',name:'Pilot'},0);
 const m=createFightFlight({id:'flier-1'});room.fightFlight=m;room.fightFlightProjectiles=new Map();
 p.position={x:0,y:0,z:1};assert.equal(mountFightFlight(room,m,p,0),true);
 return {room,m,p};
}
test('Fire Away activation with no fired bolts makes no debt or hypothetical ammunition',()=>{
 const {room,m,p}=setup();
 const original=m.ammo;
 assert.equal(requestFightFlightSkill(room,m,p,1),null);
 assert.equal(m.skill.phase,'active');assert.equal(m.ammoDebt,0);assert.equal(m.skill.borrowed,0);
 assert.equal(m.ammo,original);
 for(let i=0;i<60;i++){stepFightFlightSkill(room,m,1+i/30);stepFightFlightWeapons(room,m,1/30,1+i/30);}
 assert.equal(m.ammoDebt,0);assert.equal(m.skill.borrowed,0);
 assert.equal(requestFightFlightSkill(room,m,p,2),'Fire Away is already active.');
 stepFightFlightSkill(room,m,1+FIRE_AWAY.duration+.1);
 assert.equal(m.skill.phase,'idle');
 assert.ok(requestFightFlightSkill(room,m,p,5));
 assert.ok(m.skill.readyAt>5);
});
test('Available reserve is spent first; only additional actually released rounds are borrowed',()=>{
 const {room,m,p}=setup();m.ammo=2;m.ammoProduction=0;
 assert.equal(requestFightFlightSkill(room,m,p,1),null);
 // 1st and 2nd real stored rounds create zero debt.
 assert.equal(requestFightFlightFire(room,m,p,true,1),true);
 assert.equal(m.ammo,1);assert.equal(m.ammoDebt,0);
 stepFightFlightWeapons(room,m,1/30,1+.16);
 assert.equal(m.ammo,0);assert.equal(m.ammoDebt,0);
 // Next release requires a Skill-delivered real extra bolt.
 stepFightFlightWeapons(room,m,1/30,1+.32);
 assert.equal(m.ammoDebt,1);assert.equal(m.skill.borrowed,1);
 assert.equal(m.shotSeq,3);
 assert.equal(room.fightFlightProjectiles.size,3);
 // Stop firing: no additional debt despite unused Skill capacity.
 requestFightFlightFire(room,m,p,false,1+.33);
 for(let i=0;i<10;i++)stepFightFlightWeapons(room,m,1/30,1.34+i/30);
 assert.equal(m.skill.borrowed,1);
});
test('Replenishment repays real Skill debt before offering even a single fresh bolt',()=>{
 const m=createFightFlight();m.ammo=0;m.ammoDebt=5;m.ammoProduction=0;
 for(let i=0;i<75;i++)advanceFlightAmmo(m,1/30);
 assert.equal(m.ammoDebt,0);assert.equal(m.ammo,0);
 for(let i=0;i<15;i++)advanceFlightAmmo(m,1/30);
 assert.equal(m.ammo,1);
});
test('Held empty repeater with Skill produces actual capped 7Hz fire, then incurs finite debt',()=>{
 const {room,m,p}=setup();m.ammo=0;
 assert.equal(requestFightFlightSkill(room,m,p,1),null);
 assert.equal(requestFightFlightFire(room,m,p,true,1),true);
 for(let i=1;i<=60;i++)stepFightFlightWeapons(room,m,1/30,1+i/30);
 assert.ok(m.shotSeq>=12&&m.shotSeq<=15,'true max rate over two seconds');
 assert.ok(m.ammoDebt>0&&m.ammoDebt<=m.shotSeq);
 assert.ok(m.ammo>=0);
 assert.equal(m.skill.borrowed>=m.ammoDebt,true,'production can repay during suppression');
 requestFightFlightFire(room,m,p,false,3.1);
 stepFightFlightSkill(room,m,5);
 const debt=m.ammoDebt;assert.equal(m.skill.phase,'idle');
 const fired=m.shotSeq;stepFightFlightWeapons(room,m,1/30,5);
 assert.equal(m.shotSeq,fired);
 assert.ok(m.ammoDebt<=debt,'debt is not erased or increased after Skill expiration');
});
test('Hover compensation does not supply unlimited climbing charge',()=>{
 const {room,m,p}=setup();
 m.grounded=false;m.mode='AIRBORNE';m.y=6;m.position.y=6;p.position.y=6;m.velocity={x:0,y:0,z:0};m.rotorAngularVelocity=Math.PI*15;
 m.flightCharge=50;p.input.jump=false;p.input.crouch=false;
 assert.equal(requestFightFlightSkill(room,m,p,1),null);
 stepFightFlight(room,m,1/30,1.1);
 assert.equal(m.flightCharge,50,'steady active hover is power-compensated');
 p.input.jump=true;
 stepFightFlight(room,m,1/30,1.14);
 assert.ok(m.flightCharge<50,'holding powered climb still spends charge');
});
test('Skill cooldown and ammunition debt stay on machine through dismount and operator changes',()=>{
 const {room,m,p}=setup();m.ammo=0;
 assert.equal(requestFightFlightSkill(room,m,p,1),null);
 requestFightFlightFire(room,m,p,true,1);
 assert.ok(m.ammoDebt>0);
 const debt=m.ammoDebt,readyAt=m.skill.readyAt;
 assert.equal(dismountFightFlight(room,m,p,{at:1.1}),true);
 assert.equal(m.ammoDebt,debt);
 assert.equal(m.skill.readyAt,readyAt);
 assert.equal(m.skill.phase,'idle');
 const other=room.addPlayer({id:'replacement',token:'replacement',name:'Replacement'},0);
 other.position={x:m.x,y:m.y,z:m.z+1};
 assert.equal(mountFightFlight(room,m,other,1.2),true);
 assert.equal(requestFightFlightSkill(room,m,other,1.3),'Fire Away is recovering.');
 assert.equal(m.ammoDebt,debt);
 const newer=createFightFlight({id:'new-lifecycle'});
 assert.equal(newer.ammoDebt,0);
});
test('Only authoritative current operator can activate; existing ram/ballista Skills remain untouched',()=>{
 const {room,m,p}=setup();
 const stranger=room.addPlayer({id:'stranger',token:'stranger',name:'Not the Pilot'},0);
 assert.equal(requestFightFlightSkill(room,m,stranger,1),'Operate Fight-and-Flight to use Fire Away.');
 assert.ok(applyRoomCommand(room,stranger,{type:'siegeSkill'},1).rejected);
 assert.deepEqual(applyRoomCommand(room,p,{type:'siegeSkill'},1),{});
 assert.equal(m.skill.id,FIRE_AWAY.id);
 assert.deepEqual(applyRoomCommand(room,p,{type:'siegeSkill'},1.1),{rejected:'Fire Away is already active.'});
});
