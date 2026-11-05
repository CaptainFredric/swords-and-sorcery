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
 assert.equal(m.skill.trackingState,'preview');
 assert.equal(m.skill.lockedOnce,false,'Skill alone should only mark a candidate');
 assert.equal(room.events.filter(e=>e.type==='fightFlightTargetLock').length,0);
 for(let i=0;i<5;i++)stepFightFlightWeapons(room,m,1/30,1+i/30);
 assert.equal(m.shotSeq,0);
 assert.equal(requestFightFlightFire(room,m,pilot,true,1.3),true);
 assert.equal(m.shotSeq,1);
 assert.equal(m.skill.lockedOnce,true,'first real bolt commits the target');
 assert.equal(m.skill.trackingState,'preview','tracking refreshes on the next simulation tick');
 assert.equal(room.events.filter(e=>e.type==='fightFlightTargetLock').length,1);
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
 requestFightFlightFire(room,m,pilot,true,1.01);
 requestFightFlightFire(room,m,pilot,false,1.02);
 assert.equal(m.skill.lockedOnce,true);
 m.grounded=false;stepFightFlightSkill(room,m,1.1);
 const other=foe(room,'closer',0,-8);
 enemy.position={x:0,y:0,z:25};
 stepFightFlightSkill(room,m,1.2);
 assert.equal(m.skill.targetId,enemy.id);
 assert.equal(m.skill.trackingState,'outOfTraverse','rearward target exceeds the physical crossbow arc');
 m.grounded=true;stepFightFlightSkill(room,m,1.3);
 assert.equal(m.skill.targetId,enemy.id,'landing does not silently choose another enemy');
 assert.ok(requestFightFlightSkill(room,m,pilot,1.4),'ground-skim attempt cannot retarget instantly');
 assert.equal(m.skill.targetId,enemy.id);
 assert.equal(requestFightFlightSkill(room,m,pilot,1.8),null);
 assert.equal(m.skill.targetId,other.id,'manual press returns to soft scanning after stable landing');
 assert.equal(m.skill.lockedOnce,false,'grounded reselect is still a preview until next shot');
});
test('A fully occluded locked target pauses held Fire and resumes automatically when cover clears',()=>{
 const {room,m,pilot,enemy}=setup('narrowToOne');
 assert.equal(requestFightFlightSkill(room,m,pilot,1),null);
 requestFightFlightFire(room,m,pilot,true,1.01);
 requestFightFlightFire(room,m,pilot,false,1.02);
 room.world.solids.push({id:'occluder',center:[0,2,-10],size:[12,6,1]});
 stepFightFlightSkill(room,m,1.1);
 assert.equal(m.skill.trackingState,'sightLost');
 const ammo=m.ammo;
 assert.equal(requestFightFlightFire(room,m,pilot,true,1.2),true);
 assert.equal(m.shotSeq,1,'no additional waste shot at cover');
 assert.equal(m.ammo,ammo);
 assert.equal(m.skill.phase,'active');
 assert.equal(m.skill.targetId,enemy.id);
 room.world.solids.length=0;
 stepFightFlightWeapons(room,m,1/30,1.4);
 assert.equal(m.shotSeq,2,'held trigger resumes once a real path opens');
 assert.equal(m.skill.trackingState,'locked');
 assert.equal(m.skill.targetId,enemy.id);
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
 assert.equal(t.m.shotSeq,0,'unmarked Fire does not fire an ordinary bolt or invent a lock');
 assert.equal(t.m.skill.phase,'active','the Skill remains available to scan for an exposed enemy');
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
 assert.equal(m.shotSeq,0,'covered target never produces a false forward shot or consumes ammo');
 assert.equal(m.skill.phase,'active','being visible behind cover does not cancel the lock');
});
test('A target outside crossbow traverse holds lock but does not fire until it returns inside the arc',()=>{
 const {room,m,pilot,enemy}=setup('narrowToOne');
 requestFightFlightSkill(room,m,pilot,1);
 enemy.position={x:40,y:0,z:-2};
 stepFightFlightSkill(room,m,1.1);
 assert.equal(m.skill.targetId,enemy.id);
 assert.equal(m.skill.trackingState,'outOfTraverse');
 assert.equal(m.skill.targetInTraverse,false);
 const ammo=m.ammo;
 requestFightFlightFire(room,m,pilot,true,1.2);
 assert.equal(m.shotSeq,0);
 assert.equal(m.ammo,ammo);
 assert.equal(m.skill.phase,'active');
 enemy.position={x:0,y:0,z:-20};
 stepFightFlightWeapons(room,m,1/30,1.4);
 assert.equal(m.skill.trackingState,'locked');
 assert.equal(m.shotSeq,1,'held Fire produces its first physical bolt when arc becomes valid');
 assert.equal(m.skill.lockedOnce,true,'that successful first bolt commits the hard lock');
 assert.equal(m.skill.targetId,enemy.id,'the original exclusive target survives');
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
 assert.equal(m.shotSeq,0,'missing target must not waste a bolt');
 assert.equal(m.skill.phase,'active','missing target must not end the scan');
 assert.equal(m.skill.lockedOnce,false);
});
test('Changing camera look within its viewport retains the same physically selected target',()=>{
 const {room,m,pilot,enemy}=setup('narrowToOne');
 requestFightFlightSkill(room,m,pilot,1);
 pilot.input.yaw=.35;pilot.input.pitch=.04;
 const t=updateNarrowTracking(room,m,pilot,1.1);
 assert.equal(t.targetId,enemy.id);
 assert.equal(t.visible,true);
 assert.equal(m.skill.trackingState,'preview');
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
 requestFightFlightFire(room,m,pilot,true,1.1);
 assert.equal(m.skill.lockedOnce,true);
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

test('Narrow target remains physically locked and fires repeatedly when third-person camera turns away',()=>{
 const {room,m,pilot,enemy}=setup('narrowToOne');
 assert.equal(requestFightFlightSkill(room,m,pilot,1),null);
 const original=m.skill.targetId;
 assert.equal(room.events.filter(e=>e.type==='fightFlightTargetLock').length,0,
   'initial acquisition emits only soft preview');
 requestFightFlightFire(room,m,pilot,true,1.01);
 const locks=room.events.filter(e=>e.type==='fightFlightTargetLock');
 assert.equal(locks.length,1,'first real bolt emits the hard lock event');
 assert.equal(locks[0].targetId,enemy.id);
 assert.equal(locks[0].operatorId,pilot.id);
 // Simulates orbiting the third-person camera away from the enemy while
 // the machine and gimbal still physically face the target.
 pilot.input.yaw=2.2;
 pilot.input.pitch=.4;
 const tracking=updateNarrowTracking(room,m,pilot,1.1);
 assert.equal(tracking.targetId,original);
 assert.equal(m.skill.trackingState,'locked','the camera FOV cannot drop a hard gimbal lock');
 requestFightFlightFire(room,m,pilot,true,1.2);
 for(let i=1;i<=12;i++)stepFightFlightWeapons(room,m,1/30,1.2+i/30);
 assert.ok(m.shotSeq>=3,'held Fire produces successive tracked bolts despite off-target reticle');
 assert.equal(m.skill.phase,'active');
 assert.equal(m.skill.targetId,original);
 assert.equal(room.events.filter(e=>e.type==='fightFlightTargetLock').length,1,'no ghost target switches');
 for(const projectile of room.fightFlightProjectiles.values())
   assert.ok(Math.abs(projectile.velocity.x)<9&&projectile.velocity.z<0,
     'real bolts aim toward selected Spellblade, not the displaced camera reticle');
});

test('Ordinary camera movement during repeated fire never retargets a nearer opponent',()=>{
 const {room,m,pilot,enemy}=setup('narrowToOne');
 requestFightFlightSkill(room,m,pilot,1);
 requestFightFlightFire(room,m,pilot,true,1.01);
 const offAxis=foe(room,'off-axis',4,-8);
 pilot.input.yaw=.45;
 requestFightFlightFire(room,m,pilot,true,1.2);
 for(let i=1;i<=8;i++)stepFightFlightWeapons(room,m,1/30,1.2+i/30);
 assert.equal(m.skill.targetId,enemy.id);
 assert.notEqual(m.skill.targetId,offAxis.id);
 assert.ok(m.shotSeq>=2);
});

test('Real chassis turning toward an off-target third-person camera does not interrupt in-arc lock fire',()=>{
 const {room,m,pilot,enemy}=setup('narrowToOne');
 requestFightFlightSkill(room,m,pilot,1);
 pilot.input.yaw=.58; // 33 degrees: machine will physically turn, target remains within 50-degree turret stop.
 pilot.input.pitch=0;
 requestFightFlightFire(room,m,pilot,true,1.01);
 const dt=1/30;
 for(let i=1;i<=14;i++){
   const now=1.01+i*dt;
   stepFightFlight(room,m,dt,now);
   stepFightFlightWeapons(room,m,dt,now);
 }
 assert.ok(m.heading>.4,'the actual machine turned to face the displaced camera');
 assert.equal(m.skill.targetId,enemy.id,'same target stays selected while machine rotates');
 assert.equal(m.skill.trackingState,'locked','mechanical arc still includes the target');
 assert.ok(m.shotSeq>=3,'held Fire keeps spawning physical bolts through chassis rotation');
 assert.ok(m.crossbowYaw<m.heading-.2,'gimbal genuinely counter-traverses toward enemy');
});

test('Visible selected target keeps the crossbow joints tracking even while shots are paused',()=>{
 const {room,m,pilot,enemy}=setup('narrowToOne');
 requestFightFlightSkill(room,m,pilot,1);
 enemy.position={x:40,y:0,z:-2}; // visible, but outside the ±50-degree hard stop
 pilot.input.yaw=-2.1; // look well away; the independent turret must still follow its selected body
 const tracking=updateNarrowTracking(room,m,pilot,1.1);
 assert.equal(tracking.aim,null);
 assert.ok(tracking.followAim,'the crossbow receives a real, clamped tracking pose');
 stepFightFlight(room,m,1/30,1.12);
 assert.equal(m.skill.targetId,enemy.id);
 assert.equal(m.skill.trackingState,'outOfTraverse');
 assert.ok(Math.abs(m.crossbowYaw-m.heading)>.3,'physical gimbal reaches toward enemy, not camera look');
 assert.equal(m.shotSeq,0);
});

test('Soft targeting is sticky through small camera motion, but switches after sustained deliberate look at another enemy',()=>{
 const {room,m,pilot,enemy}=setup('narrowToOne');
 const other=foe(room,'second',-4,-14);
 requestFightFlightSkill(room,m,pilot,1);
 assert.equal(m.skill.targetId,enemy.id);
 assert.equal(m.skill.lockedOnce,false);
 pilot.input.yaw=.035;updateNarrowTracking(room,m,pilot,1.03);
 assert.equal(m.skill.targetId,enemy.id,'small camera drift cannot lose the highlighted foe');
 pilot.input.yaw=Math.atan2(4,14);
 updateNarrowTracking(room,m,pilot,1.04);
 assert.equal(m.skill.targetId,enemy.id,'another enemy is only a pending target at first glance');
 updateNarrowTracking(room,m,pilot,1.10);
 assert.equal(m.skill.targetId,enemy.id,'do not flip targets during a brief flick');
 updateNarrowTracking(room,m,pilot,1.18);
 assert.equal(m.skill.targetId,other.id,'holding a more centered second target deliberately switches preview');
 assert.equal(m.skill.lockedOnce,false);
 assert.deepEqual(room.events.filter(e=>e.type==='fightFlightTargetPreview').map(e=>e.targetId),
   [enemy.id,other.id]);
 assert.equal(room.events.some(e=>e.type==='fightFlightTargetLock'),false,
   'reticle movement is never hard lock');
 assert.equal(m.shotSeq,0);
 requestFightFlightFire(room,m,pilot,true,1.2);
 assert.equal(m.shotSeq,1);
 assert.equal(m.skill.lockedOnce,true);
 assert.equal(room.events.filter(e=>e.type==='fightFlightTargetLock').at(-1).targetId,other.id);
 pilot.input.yaw=0;updateNarrowTracking(room,m,pilot,1.3);
 assert.equal(m.skill.targetId,other.id,'after firing, gaze cannot redirect the bolt system');
 assert.equal(m.skill.trackingState,'locked');
});

test('Narrow scanning can begin with an empty reticle and later find an eligible enemy without another Skill press',()=>{
 const {room,m,pilot,enemy}=setup('narrowToOne');
 pilot.input.yaw=2;
 requestFightFlightSkill(room,m,pilot,1);
 assert.equal(m.skill.targetId,null);
 requestFightFlightFire(room,m,pilot,true,1.01);
 assert.equal(m.shotSeq,0,'Fire before a valid preview must not discharge or end the skill');
 pilot.input.yaw=0;
 stepFightFlightSkill(room,m,1.12);
 assert.equal(m.skill.targetId,enemy.id,'server updates preview as the pilot looks at a foe');
 assert.equal(m.skill.trackingState,'preview');
 stepFightFlightWeapons(room,m,1/30,1.2);
 assert.equal(m.shotSeq,1,'already-held Fire commits the first attainable physical shot');
 assert.equal(m.skill.lockedOnce,true);
});

test('Soft preview never targets a teammate or enemy hidden behind opaque structure',()=>{
 const {room,m,pilot,enemy}=setup('narrowToOne');
 const teammate=foe(room,'teammate',0,-10);
 // Teams are assigned explicitly so this remains correct outside FFA.
 pilot.team='red';teammate.team='red';enemy.team='blue';
 requestFightFlightSkill(room,m,pilot,1);
 assert.equal(m.skill.targetId,enemy.id,'teammate in front does not steal soft selection');
 const first=m.skill.targetId;
 room.world.solids.push({id:'wall',center:[0,2,-14],size:[12,6,2]});
 m.skill.targetId=null; m.skill.lastPreviewId=null;
 stepFightFlightSkill(room,m,1.1);
 assert.equal(m.skill.targetId,null,'opaque wall cannot create a fresh preview through masonry');
 assert.ok(first);
});

test('Training dummies remain valid soft and hard targets despite intentionally disconnected server actors',()=>{
 const {room,m,pilot,enemy}=setup('narrowToOne');
 enemy.position={x:40,y:0,z:0};
 const dummy=room.addServerActor({id:'training-target',name:'Training Target',actorKind:'dummy'},0);
 dummy.position={x:0,y:0,z:-17};dummy.alive=true;
 assert.equal(dummy.connected,false,'server actors never have a client connection');
 requestFightFlightSkill(room,m,pilot,1);
 assert.equal(m.skill.targetId,dummy.id,'soft acquisition sees server-controlled dummies');
 assert.equal(m.skill.lockedOnce,false);
 requestFightFlightFire(room,m,pilot,true,1.12);
 assert.equal(m.skill.lockedOnce,true);
 assert.equal(m.skill.targetId,dummy.id);
 stepFightFlightSkill(room,m,1.3);
 assert.equal(m.skill.phase,'active','a bot having no socket cannot invalidate its lock');
 assert.equal(m.skill.targetId,dummy.id);
});
