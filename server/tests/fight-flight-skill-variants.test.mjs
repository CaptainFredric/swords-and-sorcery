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
test('Precision-tracked crossbow joints follow the target even when Fire is not held',()=>{
 const {room,m,pilot,enemy}=setup('narrowToOne');
 enemy.position={x:-5,y:0,z:-18};
 pilot.input.yaw=Math.atan2(5,18);
 assert.equal(requestFightFlightSkill(room,m,pilot,1),null);
 assert.equal(m.shotSeq,0);
 stepFightFlight(room,m,1/30,1.1);
 assert.ok(Math.abs(m.crossbowYaw-m.heading)>.1,'the actual muzzle is physically tracking');
 assert.equal(m.shotSeq,0,'tracking does not auto-shoot');
});
test('Airborne lock remains exclusive, real landing permits intentional reselect after settling',()=>{
 const {room,m,pilot,enemy}=setup('narrowToOne');
 assert.equal(requestFightFlightSkill(room,m,pilot,1),null);
 m.grounded=false;stepFightFlightSkill(room,m,1.1);
 const other=foe(room,'closer',0,-8);
 enemy.position={x:0,y:0,z:25};
 stepFightFlightSkill(room,m,1.2);
 assert.equal(m.skill.targetId,enemy.id);
 assert.equal(m.skill.trackingState,'sightLost','rearward target leaves the camera field of view');
 m.grounded=true;stepFightFlightSkill(room,m,1.3);
 assert.equal(m.skill.targetId,enemy.id,'landing does not silently choose another enemy');
 assert.ok(requestFightFlightSkill(room,m,pilot,1.4),'ground-skim attempt cannot retarget instantly');
 assert.equal(m.skill.targetId,enemy.id);
 assert.equal(requestFightFlightSkill(room,m,pilot,1.8),null);
 assert.equal(m.skill.targetId,other.id,'manual press selects the reticle enemy after stable landing');
});
test('Firing at a locked target that has moved completely out of sight terminates the Skill',()=>{
 const {room,m,pilot,enemy}=setup('narrowToOne');
 assert.equal(requestFightFlightSkill(room,m,pilot,1),null);
 room.world.solids.push({id:'occluder',center:[0,2,-10],size:[12,6,1]});
 stepFightFlightSkill(room,m,1.1);
 assert.equal(m.skill.trackingState,'sightLost');
 assert.equal(requestFightFlightFire(room,m,pilot,true,1.2),true);
 assert.equal(m.shotSeq,1,'an out-of-view press fires a real manually aimed bolt');
 assert.equal(m.skill.phase,'idle');
 assert.equal(m.skill.readyAt,25.2,'cooldown starts from actual termination');
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
 assert.equal(t.m.shotSeq,1,'without a lock, ordinary fire is still available');
 assert.equal(t.m.skill.phase,'idle','the first actual unassigned shot ends Narrow to One');
 for(let i=0;i<20;i++)stepFightFlightProjectiles(t.room,1/30,1.1+(i+1)/30);
 assert.equal(t.room.events.filter(e=>e.type==='fightFlightBoltImpact'&&e.victimId===t.enemy.id).length,0,
   'a manually fired bolt still hits the wall rather than the concealed enemy');
});
test('Visor can see over a parapet even when the lower crossbow muzzle has NO CLEAR SHOT',()=>{
 const {room,m,pilot,enemy}=setup('narrowToOne');
 room.world.solids.push({id:'parapet',center:[0,.8,-10],size:[12,1.6,1]});
 // The torso is hidden: point the actual acquisition reticle at the
 // exposed top of the head, as the Skill requires.
 pilot.input.pitch=.01;
 assert.equal(requestFightFlightSkill(room,m,pilot,1),null);
 assert.equal(m.skill.targetId,enemy.id,'the enemy head is visible over cover');
 assert.equal(m.skill.trackingState,'noClearShot','the weapon does not fire through the wall');
 requestFightFlightFire(room,m,pilot,true,1.1);
 assert.equal(m.shotSeq,1,'no feasible opening falls back to a real forward shot');
 assert.equal(m.skill.phase,'active','being visible behind cover does not cancel the lock');
});
test('Narrow never tracks behind the camera; normal firing exits the skill',()=>{
 const {room,m,pilot,enemy}=setup('narrowToOne');
 requestFightFlightSkill(room,m,pilot,1);
 enemy.position={x:40,y:0,z:-2};
 stepFightFlightSkill(room,m,1.1);
 assert.equal(m.skill.targetId,enemy.id);
 assert.equal(m.skill.trackingState,'sightLost');
 requestFightFlightFire(room,m,pilot,true,1.2);
 assert.equal(m.shotSeq,1);
 assert.equal(m.skill.phase,'idle');
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

test('Reticle selection takes precedence over a nearer off-axis opponent',()=>{
 const {room,m,pilot,enemy}=setup('narrowToOne');
 const offAxis=foe(room,'off-axis',5,-8);
 assert.equal(requestFightFlightSkill(room,m,pilot,1),null);
 assert.equal(m.skill.targetId,enemy.id,'skill uses visor aim rather than nearest foe');
 assert.notEqual(m.skill.targetId,offAxis.id);
});
test('No reticle target neither invents a lock nor consumes ammo until fire is held',()=>{
 const {room,m,pilot}=setup('narrowToOne');
 pilot.input.yaw=Math.PI/2;
 assert.equal(requestFightFlightSkill(room,m,pilot,1),null);
 assert.equal(m.skill.targetId,null);
 assert.equal(m.skill.phase,'active');
 assert.equal(m.shotSeq,0);
 requestFightFlightFire(room,m,pilot,true,1.2);
 assert.equal(m.shotSeq,1);
 assert.equal(m.skill.phase,'idle');
 assert.equal(m.skill.readyAt,1.2+NARROW_TO_ONE.cooldown);
});
test('Changing camera look within its viewport retains the same physically selected target',()=>{
 const {room,m,pilot,enemy}=setup('narrowToOne');
 requestFightFlightSkill(room,m,pilot,1);
 pilot.input.yaw=.35;pilot.input.pitch=.04;
 const t=updateNarrowTracking(room,m,pilot,1.1);
 assert.equal(t.targetId,enemy.id);
 assert.equal(t.visible,true);
 assert.equal(m.skill.trackingState,'locked');
 requestFightFlightFire(room,m,pilot,true,1.2);
 const projectile=[...room.fightFlightProjectiles.values()][0];
 assert.ok(Math.abs(projectile.velocity.x)<10,'the bolt stays on the locked enemy, not the moved reticle');
});
test('A held sword swing does not interrupt precision bolts; ordinary Guard still does',()=>{
 const {room,m,pilot}=setup('narrowToOne');
 requestFightFlightSkill(room,m,pilot,1);
 pilot.attackActive=true;
 requestFightFlightFire(room,m,pilot,true,1.2);
 assert.equal(m.shotSeq,1,'precision system fires while sword is attacking');
 pilot.guarding=true;
 stepFightFlightWeapons(room,m,1/30,1.4);
 assert.equal(m.shotSeq,1,'guard remains exclusive outside Chivalry');
});
test('A target defeated while locked ends the effect and begins cooldown on death',()=>{
 const {room,m,pilot,enemy}=setup('narrowToOne');
 requestFightFlightSkill(room,m,pilot,1);
 enemy.alive=false;stepFightFlightSkill(room,m,6);
 assert.equal(m.skill.phase,'idle');
 assert.equal(m.skill.readyAt,30);
});
test('Visible target with predictive lateral movement leads physical, non-homing bolts',()=>{
 const {room,m,pilot,enemy}=setup('narrowToOne');
 requestFightFlightSkill(room,m,pilot,1);
 enemy.velocity={x:5,y:0,z:0};
 requestFightFlightFire(room,m,pilot,true,1.2);
 const bullet=[...room.fightFlightProjectiles.values()][0];
 assert.ok(bullet.velocity.x>0,'physical launch leads the moving Spellblade');
 assert.ok(bullet.velocity.z<0);
 assert.equal(bullet.position.x!==undefined,true);
});
