import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomManager} from '../../shared/sim/RoomManager.mjs';
import {createFightFlight,mountFightFlight,stepFightFlight,FIGHT_FLIGHT} from '../../shared/sim/fightFlight.mjs';
import {fightFlightFirstHit,fightFlightHitVolumes,damageFightFlight} from '../../shared/sim/fightFlightComponents.mjs';
import {requestFlightDash,stepFlightRun,VALKYRIE_RUN} from '../../shared/sim/fightFlightRun.mjs';
import {createSoFistication,damageSoFistication,stepSoFistication} from '../../shared/sim/soFistication.mjs';
import {soFistSolids} from '../../shared/sim/soFistGeometry.mjs';
import {stepSiegeWreck,SIEGE_WRECK} from '../../shared/sim/siegeWreck.mjs';
import {serializeSnapshot} from '../../shared/sim/wire.mjs';

const DT=1/30;
const world={floors:[{id:'ground',center:[0,-.1,0],size:[300,.2,300],y:0}],
 ramps:[],solids:[],spawnPoints:[{x:0,y:0,z:1,yaw:0}],abyssY:-30};
function setup(){
 const room=new RoomManager().createSoloRoom('PRACTICE',0,'castleward');
 room.state='PLAYING';room.world=world;
 const p=room.addPlayer({id:'pilot',token:'pilot',name:'Pilot'},0);
 p.position={x:0,y:0,z:1};p.spawnProtectionUntil=0;
 const m=createFightFlight({id:'flight-repair'});room.fightFlight=m;
 assert.equal(mountFightFlight(room,m,p,0),true);
 return {room,p,m};
}
function frames(room,m,start,count){
 for(let i=1;i<=count;i++)stepFightFlight(room,m,DT,start+i*DT);
}
test('ground locomotion is 5.5 ordinary, 9.3 sprint and accelerates between targets',()=>{
 const {room,p,m}=setup();
 assert.equal(FIGHT_FLIGHT.groundSpeed,5.5);
 assert.equal(FIGHT_FLIGHT.sprintSpeed,9.3);
 p.input.forward=1;frames(room,m,0,36);
 const walking=Math.hypot(m.velocity.x,m.velocity.z);
 assert.ok(walking>5.45&&walking<5.55);
 p.input.sprint=true;frames(room,m,1.2,1);
 assert.ok(Math.hypot(m.velocity.x,m.velocity.z)>walking);
 assert.ok(Math.hypot(m.velocity.x,m.velocity.z)<9.3,'sprint accelerates instead of instantly snapping');
 frames(room,m,1.2+DT,35);
 assert.ok(Math.abs(Math.hypot(m.velocity.x,m.velocity.z)-9.3)<.05);
 p.input.sprint=false;frames(room,m,2.4,32);
 assert.ok(Math.abs(Math.hypot(m.velocity.x,m.velocity.z)-5.5)<.05);
});
test('rotor spools up once; held Rise, stabilization and gentle neutral descent coexist',()=>{
 const {room,p,m}=setup();p.input.flightRise=true;
 frames(room,m,0,60);
 assert.ok(m.y>1.5&&m.rotorPowered&&m.rotorRPM>0);
 p.input.flightRise=false;
 frames(room,m,2,8);
 assert.equal(m.verticalIntent,'HOVER');
 assert.ok(m.velocity.y>-.25,'neutral entry first arrests ascent');
 frames(room,m,2+8*DT,42);
 assert.ok(m.velocity.y<-.25&&m.velocity.y>-.75,'settled neutral is gentle descent');
 assert.ok(m.rotorLiftAuthority>.8&&m.flightCharge>0,'flight combat persists beyond the first second');
});
test('climb and hover power budgets are measurable; Lower recharges on a controlled descent',()=>{
 const {room,p,m}=setup();
 assert.equal(FIGHT_FLIGHT.hoverCost,8);assert.equal(FIGHT_FLIGHT.climbCost,15);
 p.input.flightRise=true;
 frames(room,m,0,54);
 const charged=m.flightCharge,now=54*DT;
 frames(room,m,now,30);
 const spentClimb=charged-m.flightCharge;
 assert.ok(spentClimb>13&&spentClimb<17,'spooled ascent spends about 15 charge per second');
 p.input.flightRise=false;
 frames(room,m,now+1,42);
 const hoverStart=m.flightCharge;
 frames(room,m,now+2.4,30);
 const hoverSpent=hoverStart-m.flightCharge;
 assert.ok(hoverSpent>7&&hoverSpent<9,'neutral hover spends about 8 charge per second');
 const beforeLower=m.flightCharge;
 m.y=35;m.position.y=35;p.position.y=35;
 p.input.flightLower=true;
 frames(room,m,now+3.4,30);
 assert.ok(m.flightCharge>beforeLower,'controlled descent uses net recharge');
});
test('active Skill eliminates steady-hover expense but not powered climb expense',()=>{
 const {room,p,m}=setup();p.input.flightRise=true;frames(room,m,0,50);
 m.skill={phase:'active',activeUntil:30,readyAt:30};m.firingOperatorId=null;
 p.input.flightRise=false;frames(room,m,50*DT,25);
 const idleCharge=m.flightCharge;
 frames(room,m,75*DT,15);
 assert.ok(Math.abs(m.flightCharge-idleCharge)<.04);
 p.input.flightRise=true;frames(room,m,90*DT,20);
 assert.ok(m.flightCharge<idleCharge-7,'Skill does not make climbing free');
});
test('Practice held offensive Dash cycles empty-refill-full at 42/s and 70/s without repressing',()=>{
 const {room,p,m}=setup();p.prowess=100;p.ultimate='sunder';
 m.grounded=false;m.y=20;m.mode='AIRBORNE';m.rotorHP=100;
 assert.equal(requestFlightDash(room,m,p,true,1),true);
 for(let i=1;i<=320;i++)stepFlightRun(room,m,DT,1+i*DT);
 const starts=room.events.filter(e=>e.type==='fightFlightOffensiveRun'&&e.action==='started');
 const refills=room.events.filter(e=>e.type==='fightFlightPracticeDash'&&e.action==='refilled');
 assert.ok(starts.length>=2&&refills.length>=1,'auto-repeat has actual observable rests');
 assert.equal(VALKYRIE_RUN.drainPerSec,42);
 assert.equal(VALKYRIE_RUN.practiceRefillPerSec,70);
 requestFlightDash(room,m,p,false,12);
 const after=p.prowess;
 for(let i=1;i<=40;i++)stepFlightRun(room,m,DT,12+i*DT);
 assert.equal(p.prowess,after,'release ends both expenditure and training refill');
 assert.equal(m.offensiveRun,false);
});
test('competitive Dash exhausts once, never refills, and Chivalry is protected',()=>{
 const {room,p,m}=setup();room.mode='FREE_FOR_ALL';p.prowess=100;p.ultimate='sunder';
 m.grounded=false;m.y=20;
 requestFlightDash(room,m,p,true,1);
 for(let i=1;i<=170;i++)stepFlightRun(room,m,DT,1+i*DT);
 assert.equal(p.prowess,0);assert.equal(m.offensiveRun,false);
 assert.equal(room.events.filter(e=>e.type==='fightFlightPracticeDash').length,0);
 p.prowess=65;p.ultimate='chivalry';p.ultimateState={id:'chivalry',phase:'active',until:99};
 requestFlightDash(room,m,p,false,7);
 requestFlightDash(room,m,p,true,7.1);
 stepFlightRun(room,m,DT,7.2);
 assert.equal(p.prowess,65,'active Chivalry does not drain an extra 42/s');
});
test('front and side openings are real; rear plating and upper rotor intercept first',()=>{
 const m=createFightFlight({heading:0});
 const hit=(from,to)=>fightFlightFirstHit(m,from,to);
 const front=hit([0,1.4,-2],[0,1.4,2]);
 assert.ok(!front||front.t>.5,'front opening leaves pilot first at the chest');
 const rear=hit([0,1.4,2],[0,1.4,-2]);
 assert.equal(rear?.componentId,'main');
 assert.ok(rear.t<.5,'rear plating protects pilot at first contact');
 const side=hit([2,1.4,0],[-2,1.4,0]);
 assert.ok(!side||side.t>.5,'lateral opening leaves pilot reachable');
 const upper=hit([0,3.3,0],[0,1.1,0]);
 assert.equal(upper?.componentId,'rotor');
 assert.ok(upper.t<.7);
 m.rotorHP=0;
 assert.ok(!fightFlightHitVolumes(m).some(v=>v.componentId==='rotor'),'broken rotor does not block a sword');
 m.braceLHP=0;m.braceRHP=0;
 assert.ok(!fightFlightHitVolumes(m).some(v=>v.componentId.startsWith('brace')),'broken braces no longer cover');
});
test('flight destruction emits singular timed wreck lifecycle, and removes physical cover',()=>{
 const {room,m}=setup();room.events.length=0;
 const damage=damageFightFlight(room,m,500,null,'sword',10,{componentId:'main'});
 assert.equal(damage.destroyed,true);
 assert.equal(m.destroyedAt,10);assert.equal(m.wreckSettleAt,10+SIEGE_WRECK.settleSec);
 assert.equal(m.wreckCleanupAt,10+SIEGE_WRECK.visualSec);
 assert.equal(fightFlightHitVolumes(m).length,0);
 assert.equal(room.events.filter(e=>e.type==='fightFlightDestroyed').length,1);
 assert.equal(room.events.filter(e=>e.type==='siegeWreckStarted').length,1);
 stepFightFlight(room,m,DT,11.5);
 assert.equal(m.wreckPhase,'settled');
 stepFightFlight(room,m,DT,16.2);
 assert.equal(m.wreckPhase,'expired');
 assert.equal(room.events.filter(e=>e.type==='siegeWreckVisualExpired').length,1);
 stepSiegeWreck(room,m,20);
 assert.equal(room.events.filter(e=>e.type==='siegeWreckVisualExpired').length,1);
});
test('ram destruction attributes collapse, forcibly dismounts pilot and ages visible wreck',()=>{
 const {room,p}=setup();room.fightFlight=null;
 const ram=createSoFistication({id:'ram-wreck'});room.soFistication=ram;
 ram.operatorId=p.id;p.operatingFightFlightId=null;p.operatingRamId=ram.id;p.health=100;
 room.events.length=0;
 assert.equal(damageSoFistication(room,ram,1500,null,'sword',10,{componentId:'hull'}),true);
 assert.equal(ram.health,0);assert.equal(ram.mode,'DESTROYED');
 assert.equal(ram.destroyedAt,10);assert.equal(ram.operatorId,null);
 assert.equal(p.operatingRamId,null);assert.ok(p.health<100,'collapse damage uses normal combat rules');
 assert.equal(soFistSolids(ram).length,0,'wreck has no invisible collision cage');
 assert.equal(room.events.filter(e=>e.type==='siegeWreckStarted').length,1);
 stepSoFistication(room,ram,DT,11.5);assert.equal(ram.wreckPhase,'settled');
 stepSoFistication(room,ram,DT,16.2);assert.equal(ram.wreckPhase,'expired');
});

test('two independent recipients see identical authoritative wreck dates, owner and phase',()=>{
 const {room,m}=setup();
 const other=room.addPlayer({id:'observer',token:'obs',name:'Observer'},0);
 other.spawnProtectionUntil=0;
 damageFightFlight(room,m,500,other.id,'sword',11,{componentId:'main'});
 const a=serializeSnapshot(room,11,'pilot');
 const b=serializeSnapshot(room,11,'observer');
 for(const key of ['id','destroyedAt','wreckPhase','wreckSettleAt','wreckCleanupAt']){
   assert.equal(a.fightFlight[key],b.fightFlight[key],key);
 }
 assert.equal(a.fightFlight.destroyedAt,11);
});
