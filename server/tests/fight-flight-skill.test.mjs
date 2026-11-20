import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomManager} from '../../shared/sim/RoomManager.mjs';
import {applyRoomCommand} from '../../shared/sim/wire.mjs';
import {createFightFlight,mountFightFlight,dismountFightFlight,stepFightFlight} from '../../shared/sim/fightFlight.mjs';
import {FLIGHT_REPEATER,stepFightFlightWeapons,stepFightFlightProjectiles,requestFightFlightFire,advanceFlightAmmo} from '../../shared/sim/fightFlightWeapons.mjs';
import {requestFightFlightSkill,stepFightFlightSkill,fightFlightSkillActive,FIRE_AWAY,endFightFlightSkill} from '../../shared/sim/fightFlightSkill.mjs';

const DT=1/30;
function setup(){
 const room=new RoomManager().createSoloRoom('PRACTICE',0,'castleward');
 room.state='PLAYING';room.world={floors:[{id:'floor',center:[0,-.1,0],size:[100,.2,100],y:0}],solids:[],ramps:[],spawnPoints:[{x:0,y:0,z:0,yaw:0}]};
 const p=room.addPlayer({id:'pilot',token:'pilot',name:'Pilot'},0);
 const m=createFightFlight({id:'flier-1'});room.fightFlight=m;room.fightFlightProjectiles=new Map();
 p.position={x:0,y:0,z:1};assert.equal(mountFightFlight(room,m,p,0),true);
 m.rotorPowered=true;m.rotorAngularVelocity=Math.PI*15;m.rotorRPM=450;
 return {room,m,p};
}
function airborne(m,p,charge=100){
 m.grounded=false;m.mode='AIRBORNE';m.y=15;m.position.y=15;p.position.y=15;
 m.velocity={x:0,y:0,z:0};m.flightCharge=charge;
 m.rotorPowered=true;m.rotorAngularVelocity=Math.PI*15;m.rotorRPM=450;
 m.neutralHoverAt=1;m.neutralHoverHeight=15;m.neutralHoverFromRise=false;
 p.input={...p.input,jump:false,flightRise:false,flightLower:false,crouch:false};
}
function tick(room,m,at,dt=DT){
 stepFightFlight(room,m,dt,at);
 stepFightFlightSkill(room,m,at);
 stepFightFlightWeapons(room,m,dt,at);
}
test('Fire Away requires a 450 RPM intact rotor and charge, and its 24s timer starts on activation',()=>{
 const {room,m,p}=setup();
 m.rotorRPM=440;assert.match(requestFightFlightSkill(room,m,p,1),/450 RPM/);
 m.rotorRPM=449.6;m.rotorHP=0;assert.match(requestFightFlightSkill(room,m,p,1),/intact rotor/);
 m.rotorHP=100;m.flightCharge=0;
 assert.match(requestFightFlightSkill(room,m,p,1),/requires flight charge/);
 m.flightCharge=100;assert.equal(requestFightFlightSkill(room,m,p,1),null);
 assert.equal(m.skill.phase,'active');assert.equal(m.skill.activeUntil,null);
 assert.equal(m.skill.readyAt,25);assert.equal(m.ammo,18);
 assert.equal(m.ammoDebt,0);
 assert.equal(requestFightFlightSkill(room,m,p,2),'Fire Away is already active.');
 stepFightFlightSkill(room,m,6);
 assert.equal(m.skill.phase,'active','there is no 3.5s auto-expiry');
});
test('Only actual bolts debit 1.5 charge, never ammo, debt, or fractional reload',()=>{
 const {room,m,p}=setup();m.ammo=2;m.ammoProduction=.5;
 assert.equal(requestFightFlightSkill(room,m,p,1),null);
 advanceFlightAmmo(m,2);
 assert.equal(m.ammo,2);assert.equal(m.ammoProduction,.5);
 assert.equal(requestFightFlightFire(room,m,p,true,1),true);
 assert.equal(m.flightCharge,98.5);assert.equal(m.ammo,2);assert.equal(m.ammoDebt,0);
 stepFightFlightWeapons(room,m,DT,1.16);
 stepFightFlightWeapons(room,m,DT,1.32);
 assert.equal(m.shotSeq,3);assert.equal(room.fightFlightProjectiles.size,3);
 assert.equal(m.flightCharge,95.5);assert.equal(m.ammo,2);
 assert.equal(m.ammoDebt,0);assert.equal(m.skill.borrowed,0);
 assert.equal(m.ammoProduction,.5);
 assert.deepEqual(room.events.filter(e=>e.type==='fightFlightBoltReleased').map(e=>e.chargeCost),[1.5,1.5,1.5]);
 requestFightFlightFire(room,m,p,false,1.33);
 for(let i=1;i<=30;i++)stepFightFlightWeapons(room,m,DT,1.33+i*DT);
 assert.equal(m.shotSeq,3);assert.equal(m.ammo,2);assert.equal(m.ammoDebt,0);
});
test('Rapid held-input repeats and Fire toggles cannot duplicate projectiles or charge spending',()=>{
 const {room,m,p}=setup();requestFightFlightSkill(room,m,p,1);
 requestFightFlightFire(room,m,p,true,1);
 requestFightFlightFire(room,m,p,true,1);
 requestFightFlightFire(room,m,p,false,1.01);
 requestFightFlightFire(room,m,p,true,1.02);
 assert.equal(m.shotSeq,1);assert.equal(m.flightCharge,98.5);
 assert.equal(room.fightFlightProjectiles.size,1);
 stepFightFlightWeapons(room,m,DT,1.143);
 assert.equal(m.shotSeq,2);assert.equal(m.flightCharge,97);
 assert.equal(m.ammo,18);assert.equal(m.ammoDebt,0);
});
test('Stopping fire offsets hover cost without generating charge, while Rise still costs 15/s',()=>{
 const {room,m,p}=setup();airborne(m,p,50);
 requestFightFlightSkill(room,m,p,1);
 for(let i=1;i<=90;i++)tick(room,m,1+i*DT);
 assert.ok(Math.abs(m.flightCharge-50)<.02,'level hovering is sustainable for three seconds');
 assert.equal(m.skill.phase,'active');
 const before=m.flightCharge;
 p.input.flightRise=true;
 for(let i=1;i<=30;i++)tick(room,m,4+i*DT);
 assert.ok(m.flightCharge<before-14.8,'one second of climbing pays its normal 15 charge');
 assert.equal(m.ammo,18);
});
test('Held Fire drains normal flight power as well as 1.5 charge per bolt, and outlasts 3.5 seconds',()=>{
 const {room,m,p}=setup();airborne(m,p);
 requestFightFlightSkill(room,m,p,1);
 requestFightFlightFire(room,m,p,true,1);
 let elapsed=null;
 for(let i=1;i<=240;i++){
  const at=1+i*DT;tick(room,m,at);
  if(m.skill.phase==='idle'){elapsed=at-1;break;}
 }
 assert.ok(elapsed>5&&elapsed<5.9,'full-charge airborne barrage should last roughly 5.4s: '+elapsed);
 assert.equal(m.flightCharge,0);assert.equal(m.skill.phase,'idle');
 assert.equal(m.ammo,0);assert.equal(m.ammoDebt,0);
 assert.ok(m.shotSeq>=34&&m.shotSeq<=40);
 assert.equal(room.fightFlightProjectiles.size,m.shotSeq,'every charged shot is a real projectile');
 assert.equal(m.skill.readyAt,25,'cooldown still starts at activation');
 assert.ok(room.events.some(e=>e.type==='siegeSkill'&&e.action==='exhausted'));
});
test('Ground operation has no charge income during Fire Away, even with Fire released',()=>{
 const {room,m,p}=setup();m.flightCharge=45;
 requestFightFlightSkill(room,m,p,1);
 for(let i=1;i<=30;i++)stepFightFlight(room,m,DT,1+i*DT);
 assert.ok(m.flightCharge<=45+1e-8,'ground recovery cannot fund stationary shooting');
 // Force the hypothetical full-speed grounded case without letting physics spin the rotor down.
 m.rotorRPM=450;
 requestFightFlightFire(room,m,p,true,2.1);
 assert.equal(m.flightCharge,43.5);
 assert.equal(m.ammo,18);
});
test('Brief Fire release after a bolt does not earn a free hover-charge tick',()=>{
 const {room,m,p}=setup();airborne(m,p,60);
 requestFightFlightSkill(room,m,p,1);
 requestFightFlightFire(room,m,p,true,1);
 requestFightFlightFire(room,m,p,false,1.001);
 const charge=m.flightCharge;
 tick(room,m,1+DT);
 assert.ok(m.flightCharge<=charge-8*DT+.01,'recent shot suppresses the hover offset');
 assert.equal(m.ammo,18);
});
test('Rotor falls below operating RPM: immediate interruption empties magazine, preserves charge',()=>{
 const {room,m,p}=setup();
 requestFightFlightSkill(room,m,p,1);
 requestFightFlightFire(room,m,p,true,1);
 const charge=m.flightCharge;
 m.rotorRPM=449.4;
 stepFightFlightSkill(room,m,1.1);
 assert.equal(m.skill.phase,'idle');
 assert.equal(m.ammo,0);assert.equal(m.ammoProduction,0);
 assert.equal(m.flightCharge,charge);
 assert.equal(m.skill.readyAt,25);
 assert.ok(room.events.some(e=>e.type==='siegeSkill'&&e.action==='rotorLost'));
});
test('Insufficient charge creates no unpaid projectile and residual charge is exhausted',()=>{
 const {room,m,p}=setup();m.flightCharge=2;
 requestFightFlightSkill(room,m,p,1);
 requestFightFlightFire(room,m,p,true,1);
 assert.equal(m.shotSeq,1);assert.equal(m.flightCharge,0);
 assert.equal(m.skill.phase,'idle');assert.equal(m.ammo,0);
 const fired=m.shotSeq;
 requestFightFlightFire(room,m,p,true,1.01);
 assert.equal(m.shotSeq,fired);
 assert.equal(room.fightFlightProjectiles.size,1);
});
test('Movement depletion is resolved before another bolt in the same authoritative tick',()=>{
 const {room,m,p}=setup();airborne(m,p,1.6);
 requestFightFlightSkill(room,m,p,1);
 m.nextShotAt=1+DT;
 m.firingOperatorId=p.id;
 tick(room,m,1+DT);
 assert.equal(m.skill.phase,'idle');assert.equal(m.flightCharge,0);
 assert.equal(m.shotSeq,0);assert.equal(m.ammo,0);
 assert.equal(room.fightFlightProjectiles.size,0);
});
test('Skill end empties reserve and reload resumes at two bolts per second',()=>{
 const {room,m,p}=setup();requestFightFlightSkill(room,m,p,1);
 requestFightFlightFire(room,m,p,true,1);
 requestFightFlightFire(room,m,p,false,1.01);
 endFightFlightSkill(room,m,2,'interrupted');
 assert.equal(m.ammo,0);assert.equal(m.ammoProduction,0);assert.equal(m.ammoDebt,0);
 assert.equal(m.skill.readyAt,25);
 for(let i=1;i<=15;i++)stepFightFlightWeapons(room,m,DT,2+i*DT);
 assert.equal(m.ammo,1);
 requestFightFlightFire(room,m,p,true,2.6);
 assert.equal(m.shotSeq,2,'ordinary physical repeater fires after charge mode');
 assert.equal(m.ammo,0);assert.equal(m.ammoDebt,0);
});
test('Dismount and operator changes cannot refill resources or restart 24s cooldown',()=>{
 const {room,m,p}=setup();requestFightFlightSkill(room,m,p,1);
 requestFightFlightFire(room,m,p,true,1);
 const charge=m.flightCharge,readyAt=m.skill.readyAt;
 assert.equal(dismountFightFlight(room,m,p,{at:1.1}),true);
 assert.equal(m.skill.phase,'idle');assert.equal(m.ammo,0);
 assert.equal(m.flightCharge,charge);assert.equal(m.skill.readyAt,readyAt);
 const other=room.addPlayer({id:'replacement',token:'replacement',name:'Replacement'},0);
 other.position={x:m.x,y:m.y,z:m.z+1};
 assert.equal(mountFightFlight(room,m,other,1.2),true);
 assert.equal(requestFightFlightSkill(room,m,other,1.3),'Fire Away is recovering.');
 assert.equal(m.flightCharge,charge);assert.equal(m.ammo,0);
 assert.equal(m.skill.readyAt,readyAt);
});
test('Authoritative pilot validation and alternative Skills remain unchanged',()=>{
 const {room,m,p}=setup();
 const stranger=room.addPlayer({id:'stranger',token:'stranger',name:'Not the Pilot'},0);
 assert.equal(requestFightFlightSkill(room,m,stranger,1),'Operate Fight-and-Flight to use Fire Away.');
 assert.ok(applyRoomCommand(room,stranger,{type:'siegeSkill'},1).rejected);
 assert.deepEqual(applyRoomCommand(room,p,{type:'siegeSkill'},1),{});
 assert.equal(m.skill.id,FIRE_AWAY.id);
 assert.deepEqual(applyRoomCommand(room,p,{type:'siegeSkill'},1.1),{rejected:'Fire Away is already active.'});
});
test('Legacy ordinary debt repayment stays compatible without inventing new Fire Away debt',()=>{
 const m=createFightFlight();m.ammo=0;m.ammoDebt=5;m.ammoProduction=0;
 for(let i=0;i<75;i++)advanceFlightAmmo(m,DT);
 assert.equal(m.ammoDebt,0);assert.equal(m.ammo,0);
 for(let i=0;i<15;i++)advanceFlightAmmo(m,DT);
 assert.equal(m.ammo,1);assert.equal(FLIGHT_REPEATER.production,2);
});

test('Continuous charged barrage during ascent pays 15/s climb and ends in about 3.9s',()=>{
 const {room,m,p}=setup();airborne(m,p);
 p.input.flightRise=true;
 requestFightFlightSkill(room,m,p,1);
 requestFightFlightFire(room,m,p,true,1);
 let elapsed=null;
 for(let i=1;i<=180;i++){
  tick(room,m,1+i*DT);
  if(m.skill.phase==='idle'){elapsed=i*DT;break;}
 }
 assert.ok(elapsed>3.6&&elapsed<4.3,'climbing barrage endurance: '+elapsed);
 assert.equal(m.flightCharge,0);assert.equal(m.ammo,0);
 assert.ok(m.shotSeq>22&&m.shotSeq<31);
});
test('At maintained full RPM on the ground, charge alone limits a barrage to about 9.5s',()=>{
 const {room,m,p}=setup();m.flightCharge=100;
 requestFightFlightSkill(room,m,p,1);
 requestFightFlightFire(room,m,p,true,1);
 let elapsed=null;
 for(let i=1;i<=360;i++){
  stepFightFlightSkill(room,m,1+i*DT);
  stepFightFlightWeapons(room,m,DT,1+i*DT);
  if(m.skill.phase==='idle'){elapsed=i*DT;break;}
 }
 assert.ok(elapsed>9&&elapsed<9.8,'theoretical grounded full-speed ceiling: '+elapsed);
 assert.equal(m.flightCharge,0);assert.equal(m.ammo,0);
 assert.equal(m.ammoDebt,0);assert.equal(m.shotSeq,66);
});
test('Descending charge recovery is blocked during firing and immediate Fire-button feathering',()=>{
 const {room,m,p}=setup();airborne(m,p,45);
 p.input.flightLower=true;
 requestFightFlightSkill(room,m,p,1);
 requestFightFlightFire(room,m,p,true,1);
 const afterShot=m.flightCharge;
 tick(room,m,1+DT);
 assert.ok(m.flightCharge<afterShot,'held fire cannot net-recharge while lowering');
 requestFightFlightFire(room,m,p,false,1+DT);
 const before=m.flightCharge;
 tick(room,m,1+2*DT);
 assert.ok(m.flightCharge<=before,'a shot just fired still blocks descent replenishment');
});

test('Disconnect terminates the active barrage on its authoritative tick',()=>{
 const {room,m,p}=setup();requestFightFlightSkill(room,m,p,1);
 p.connected=false;stepFightFlightSkill(room,m,1.1);
 assert.equal(m.skill.phase,'idle');assert.equal(m.ammo,0);
 assert.equal(m.skill.readyAt,25);
});

test('Against a defending opponent, charge-paid real bolts obey Guard geometry and exposed leg contact',()=>{
 const {room,m,p}=setup();
 const foe=room.addPlayer({id:'defender',token:'defender',name:'Defender'},0);
 foe.position={x:-.65,y:0,z:-4};foe.spawnProtectionUntil=0;
 foe.guarding=true;foe.guardStamina=100;foe.yaw=Math.PI;
 assert.equal(requestFightFlightSkill(room,m,p,1),null);
 requestFightFlightFire(room,m,p,true,1);requestFightFlightFire(room,m,p,false,1.01);
 for(let i=1;i<12;i++)stepFightFlightProjectiles(room,DT,1+i*DT);
 assert.equal(foe.health,100,'defended torso takes no direct damage');
 assert.ok(foe.guardStamina<100,'genuine Guard intercept spends stamina');
 assert.equal(m.flightCharge,98.5);
 assert.equal(m.ammo,18);assert.equal(m.ammoDebt,0);
 const impact=room.events.find(e=>e.type==='fightFlightBoltImpact');
 assert.equal(impact?.hitKind,'guard');
 p.input.pitch=-.19;
 requestFightFlightFire(room,m,p,true,1.6);requestFightFlightFire(room,m,p,false,1.61);
 for(let i=1;i<12;i++)stepFightFlightProjectiles(room,DT,1.6+i*DT);
 assert.ok(foe.health<100,'low physical bolt bypasses the elevated Guard');
 assert.equal(m.flightCharge,97,'two defended real bolts still cost the same power');
 assert.equal(m.ammo,18);assert.equal(m.ammoDebt,0);
});

test('Migrated legacy borrowing debt is cleared by Fire Away and never delays post-skill reload',()=>{
 const {room,m,p}=setup();m.ammoDebt=7;m.ammo=5;
 requestFightFlightSkill(room,m,p,1);
 assert.equal(m.ammoDebt,0);
 requestFightFlightFire(room,m,p,true,1);
 requestFightFlightFire(room,m,p,false,1.01);
 endFightFlightSkill(room,m,2,'interrupted');
 assert.equal(m.ammoDebt,0);assert.equal(m.ammo,0);
 for(let i=1;i<=15;i++)stepFightFlightWeapons(room,m,DT,2+i*DT);
 assert.equal(m.ammo,1);
});

test('Throttled authoritative callbacks bill all elapsed flight power during held Fire',()=>{
 const {room,m,p}=setup();airborne(m,p,100);
 requestFightFlightSkill(room,m,p,1);
 requestFightFlightFire(room,m,p,true,1);
 assert.equal(m.flightCharge,98.5);
 // Only one 30Hz callback arrived in half a second, yet real 7Hz bolts
 // are clock-gated. Flight charge cannot be under-billed by that lag.
 stepFightFlight(room,m,DT,1.5);
 assert.ok(Math.abs(m.flightCharge-94.5)<.02,
   'half a second of held airborne fire incurs 8/s hover cost regardless of callback count');
 stepFightFlightWeapons(room,m,DT,1.5);
 assert.equal(m.shotSeq,2);assert.equal(m.flightCharge,93);
 stepFightFlight(room,m,DT,2);
 assert.ok(Math.abs(m.flightCharge-89)<.02);
 stepFightFlightWeapons(room,m,DT,2);
 assert.equal(m.shotSeq,3);assert.equal(m.flightCharge,87.5);
 assert.equal(m.ammo,18);assert.equal(m.ammoDebt,0);
});
test('True firing pause does not retroactively debit its elapsed clock when fire resumes',()=>{
 const {room,m,p}=setup();airborne(m,p,50);
 requestFightFlightSkill(room,m,p,1);
 requestFightFlightFire(room,m,p,true,1);
 requestFightFlightFire(room,m,p,false,1.01);
 stepFightFlight(room,m,DT,1.3);
 const held=m.flightCharge;
 requestFightFlightFire(room,m,p,true,3);
 stepFightFlight(room,m,DT,3+DT);
 assert.ok(held-m.flightCharge<3.1,
   'a two-second non-firing pause is not charged as a retroactive barrage');
});
