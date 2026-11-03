import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomManager} from '../../shared/sim/RoomManager.mjs';
import {createFightFlight,mountFightFlight,dismountFightFlight,stepFightFlight,FIGHT_FLIGHT} from '../../shared/sim/fightFlight.mjs';
import {requestFightFlightSkill,stepFightFlightSkill,NARROW_TO_ONE,ASCENSION} from '../../shared/sim/fightFlightSkill.mjs';
import {requestFightFlightFire,stepFightFlightWeapons,stepFightFlightProjectiles} from '../../shared/sim/fightFlightWeapons.mjs';
import {requestFlightDash,stepFlightRun} from '../../shared/sim/fightFlightRun.mjs';
import {updateNarrowTracking} from '../../shared/sim/fightFlightTracking.mjs';
import {siegeArmoryView} from '../../client/menu/siegeArmoryView.mjs';
import {ICONS} from '../../client/ui/icons.mjs';

function setup(equipped){
 const room=new RoomManager().createSoloRoom('PRACTICE',0,'castleward');
 room.state='PLAYING';
 room.world={floors:[{id:'floor',center:[0,-.1,0],size:[200,.2,200],y:0}],
   solids:[],ramps:[],spawnPoints:[{x:0,y:0,z:0,yaw:0}]};
 const pilot=room.addPlayer({id:'pilot',token:'pilot',name:'Pilot',siegeLoadout:{fightFlight:equipped}},0);
 const m=createFightFlight({id:'one',heading:0});room.fightFlight=m;room.fightFlightProjectiles=new Map();
 pilot.position={x:0,y:0,z:1};
 assert.equal(mountFightFlight(room,m,pilot,0),true);
 const enemy=room.addPlayer({id:'enemy',token:'enemy',name:'Enemy'},0);
 enemy.position={x:0,y:0,z:-20};enemy.spawnProtectionUntil=0;
 return {room,m,pilot,enemy};
}
function foe(room,id,x,z){
 const p=room.addPlayer({id,token:id,name:id},0);
 p.position={x,y:0,z};p.spawnProtectionUntil=0;
 return p;
}
test('Armory renders both new skills as equippable icon-bearing alternatives, retaining Fire Away',()=>{
 const flight=siegeArmoryView({fightFlight:'narrowToOne'})[2];
 assert.deepEqual(flight.skills.map(s=>s.id),['fireAwayRightHere','narrowToOne','doNotStopMyAscension']);
 assert.deepEqual(flight.skills.map(s=>s.equipped),[false,true,false]);
 for(const s of flight.skills){
   assert.ok(s.name&&s.line&&s.icon&&ICONS[s.icon]);
 }
});
test('Narrow to One acquires one actual enemy but never fires without a held trigger',()=>{
 const {room,m,pilot,enemy}=setup('narrowToOne');
 assert.equal(m.skill.id,NARROW_TO_ONE.id);
 assert.equal(requestFightFlightSkill(room,m,pilot,1),null);
 assert.equal(m.skill.targetId,enemy.id);
 assert.equal(m.skill.trackingState,'locked');
 for(let i=0;i<5;i++)stepFightFlightWeapons(room,m,1/30,1+i/30);
 assert.equal(m.shotSeq,0);
 assert.equal(requestFightFlightFire(room,m,pilot,true,1.3),true);
 assert.equal(m.shotSeq,1);
 assert.equal(room.fightFlightProjectiles.size,1);
});
test('An airborne lock cannot switch targets; landing permits immediate fresh acquisition',()=>{
 const {room,m,pilot,enemy}=setup('narrowToOne');
 assert.equal(requestFightFlightSkill(room,m,pilot,1),null);
 m.grounded=false;stepFightFlightSkill(room,m,1.1);
 const other=foe(room,'closer',0,-8);
 enemy.position={x:0,y:0,z:25};
 stepFightFlightSkill(room,m,1.2);
 assert.equal(m.skill.targetId,enemy.id);
 assert.equal(m.skill.trackingState,'locked','target is still visible behind us, not automatically replaceable');
 m.grounded=true;stepFightFlightSkill(room,m,1.3);
 assert.equal(m.skill.targetId,other.id);
});
test('Firing at a locked target that has moved completely out of sight terminates the Skill',()=>{
 const {room,m,pilot,enemy}=setup('narrowToOne');
 assert.equal(requestFightFlightSkill(room,m,pilot,1),null);
 room.world.solids.push({id:'occluder',center:[0,2,-10],size:[12,6,1]});
 stepFightFlightSkill(room,m,1.1);
 assert.equal(m.skill.trackingState,'sightLost');
 assert.equal(requestFightFlightFire(room,m,pilot,true,1.2),true);
 assert.equal(m.shotSeq,0);
 assert.equal(m.skill.phase,'idle');
 assert.equal(room.events.at(-1).action,'sightLost');
});
test('Guard and cover never become fictional damage: only real exposed regions qualify',()=>{
 const {room,m,pilot,enemy}=setup('narrowToOne');
 enemy.guarding=true;enemy.guardStamina=100;enemy.yaw=Math.PI;enemy.guardStartedAt=-100;
 assert.equal(requestFightFlightSkill(room,m,pilot,1),null);
 const result=updateNarrowTracking(room,m,pilot,1.1);
 assert.equal(result.visible,true);
 assert.ok(result.aim,'feet or uncovered head must be physically reachable');
 requestFightFlightFire(room,m,pilot,true,1.1);
 for(let i=0;i<20;i++)stepFightFlightProjectiles(room,1/30,1.1+(i+1)/30);
 const impacts=room.events.filter(e=>e.type==='fightFlightBoltImpact');
 assert.equal(impacts.length,1);
 assert.equal(impacts[0].victimId,enemy.id);
 assert.equal(impacts[0].hitKind,'player','the selected shot is not simply blocked by Guard');
 requestFightFlightFire(room,m,pilot,false,1.5);
 // New instance: complete masonry cover prevents initial acquisition and shooting.
 const t=setup('narrowToOne');
 t.room.world.solids.push({id:'wall',center:[0,2,-10],size:[12,6,1]});
 requestFightFlightSkill(t.room,t.m,t.pilot,1);
 assert.equal(t.m.skill.targetId,null);
 requestFightFlightFire(t.room,t.m,t.pilot,true,1.1);
 assert.equal(t.m.shotSeq,0);
});
test('Narrow preserves a visible lock but refuses an out-of-traverse shot',()=>{
 const {room,m,pilot,enemy}=setup('narrowToOne');
 requestFightFlightSkill(room,m,pilot,1);
 enemy.position={x:40,y:0,z:-2};
 stepFightFlightSkill(room,m,1.1);
 assert.equal(m.skill.targetId,enemy.id);
 assert.equal(m.skill.noClearShot,true);
 requestFightFlightFire(room,m,pilot,true,1.2);
 assert.equal(m.shotSeq,0);
 assert.equal(m.skill.phase,'active');
});
test('Ascension consumes only ordinary Rise charge for Dash while keeping prowess intact',()=>{
 const {room,m,pilot}=setup('doNotStopMyAscension');
 assert.equal(m.skill.id,ASCENSION.id);
 pilot.prowess=74;m.flightCharge=70;m.grounded=false;m.mode='AIRBORNE';m.y=8;pilot.position.y=8;
 assert.equal(requestFightFlightSkill(room,m,pilot,1),null);
 assert.equal(requestFlightDash(room,m,pilot,true,1),true);
 const dt=1/30;
 stepFlightRun(room,m,dt,1+dt);
 assert.equal(m.offensiveRun,true);
 assert.ok(Math.abs(m.flightCharge-(70-FIGHT_FLIGHT.climbCost*dt))<1e-8);
 assert.equal(pilot.prowess,74);
 const charged=m.flightCharge;
 stepFightFlight(room,m,dt,1+dt);
 assert.ok(Math.abs(m.flightCharge-charged)<1e-8,'no double-billing normal flight cost');
});
test('An empty click cannot end Ascension, but the first actual spawned bolt does',()=>{
 const {room,m,pilot}=setup('doNotStopMyAscension');
 requestFightFlightSkill(room,m,pilot,1);
 m.ammo=0;m.ammoProduction=0;
 requestFightFlightFire(room,m,pilot,true,1.1);
 assert.equal(m.shotSeq,0);
 assert.equal(m.skill.phase,'active');
 m.ammo=1;
 stepFightFlightWeapons(room,m,0,1.2);
 assert.equal(m.shotSeq,1);
 assert.equal(m.skill.phase,'idle');
 assert.equal(room.events.filter(e=>e.type==='siegeSkill').at(-1).action,'boltFired');
});
test('Ascension Dash ends on empty charge without draining personal prowess or changing its trajectory rules',()=>{
 const {room,m,pilot}=setup('doNotStopMyAscension');
 m.grounded=false;m.mode='AIRBORNE';m.y=6;pilot.position.y=6;m.flightCharge=.2;pilot.prowess=53;
 requestFightFlightSkill(room,m,pilot,1);
 requestFlightDash(room,m,pilot,true,1);
 stepFlightRun(room,m,1/30,1+1/30);
 assert.equal(m.flightCharge,0);
 assert.equal(m.offensiveRun,false);
 assert.equal(m.flightDashHeld,false);
 assert.equal(pilot.prowess,53);
 assert.equal(m.skill.phase,'active','only a real bolt, death or dismount ends the effect');
 assert.equal(dismountFightFlight(room,m,pilot,{force:true,at:2}),true);
 assert.equal(m.skill.phase,'idle');
});
