import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomManager} from '../../shared/sim/RoomManager.mjs';
import {createFightFlight,stepFightFlight} from '../../shared/sim/fightFlight.mjs';
import {requestFlightDash,stepFlightRun} from '../../shared/sim/fightFlightRun.mjs';
import {setFlightUltimateHold,stepTerminalPreparation,advanceTerminalFlight,
  resolveTerminalFlight,stepFlightBurnZones,TERMINAL,terminalBlastProfile,terminalRadialDamage,terminalFireInterval,requestTerminalRitual} from '../../shared/sim/fightFlightTerminal.mjs';
import {applyRoomCommand} from '../../shared/sim/wire.mjs';
import {killPlayer} from '../../shared/sim/combat.mjs';
import {damageFightFlight} from '../../shared/sim/fightFlightComponents.mjs';

function setup(){
 const room=new RoomManager().createSoloRoom('PRACTICE',0,'castleward');
 room.world={solids:[],ramps:[],floors:[{id:'level',y:0,center:[0,-.1,0],size:[200,.2,200]}],
   spawnPoints:[{x:0,y:0,z:0,yaw:0}],abyssY:-50};
 room.state='PLAYING';
 const p=room.addPlayer({id:'pilot',token:'pilot',name:'Pilot'},0);
 p.alive=true;p.prowess=100;p.ultimate='chivalry';p.ultimateState=null;p.spawnProtectionUntil=0;
 const m=createFightFlight({x:0,y:8,z:0,heading:0,id:'valkyrie-original'});
 m.operatorId=p.id;m.grounded=false;m.mode='AIRBORNE';m.velocity={x:0,y:0,z:-4};
 m.skill={id:'doNotStopMyAscension',phase:'active',activeUntil:null,readyAt:25};
 p.operatingFightFlightId=m.id;p.position={x:0,y:8,z:0};p.input={yaw:0,pitch:0,jump:false,crouch:false,forward:0,right:0};
 room.fightFlight=m;
 const cmd=(type,down,t)=>applyRoomCommand(room,p,{type,down},t);
 return {room,p,m,cmd};
}
function commit(s){
 assert.deepEqual(s.cmd('flightDash',true,1),{});
 assert.deepEqual(s.cmd('flightUltimateHold',true,1.04),{});
 stepTerminalPreparation(s.room,s.m,1.04);
 assert.ok(s.m.terminalPrep);
 stepTerminalPreparation(s.room,s.m,2.08);
 assert.ok(s.m.terminalDive);
}
test('Dash and Ultimate chord takes a real one-second unspent-Chivalry commitment',()=>{
 const s=setup();
 s.cmd('flightDash',true,1);s.cmd('flightUltimateHold',true,1.04);
 stepTerminalPreparation(s.room,s.m,1.04);
 assert.equal(s.p.prowess,100);
 assert.equal(s.m.terminalDiveSpent,false);
 assert.equal(s.m.terminalPrep.phase,'holding');
 stepTerminalPreparation(s.room,s.m,2.02);
 assert.equal(s.m.terminalDive,null,'cannot consume the full meter before the hold reaches one second');
 stepTerminalPreparation(s.room,s.m,2.06);
 assert.equal(s.m.terminalDiveSpent,true);
 assert.equal(s.p.prowess,0);
 assert.equal(s.p.ultimateState,null,'terminal sacrifice is not ordinary active Chivalry');
 assert.equal(s.m.terminalDive.operatorId,s.p.id);
 assert.equal(s.room.events.filter(e=>e.type==='fightFlightTerminalCommitted').length,1);
 stepTerminalPreparation(s.room,s.m,2.9);
 assert.equal(s.room.events.filter(e=>e.type==='fightFlightTerminalCommitted').length,1);
});
test('Practice permanently full Prowess never blocks server-authoritative Valkyrie on an in-tick drain',()=>{
 const s=setup();
 s.p.prowess=0; // rotor Dash consumed energy AFTER the previous refill
 assert.equal(requestTerminalRitual(s.room,s.m,s.p,1.2),true,
   'the server derives infinite Practice readiness from room mode');
 assert.equal(s.m.terminalDiveSpent,true);
 assert.equal(s.room.events.filter(e=>e.type==='fightFlightTerminalCommitted').length,1);
 assert.equal(requestTerminalRitual(s.room,s.m,s.p,1.3),false,'still once per machine');
 const pvp=setup();pvp.room.mode='BOT_DUEL';pvp.p.prowess=0;
 assert.equal(requestTerminalRitual(pvp.room,pvp.m,pvp.p,1.2),false,
   'the Practice exception cannot activate in normal matches');
 const active=setup();active.p.prowess=0;
 active.p.ultimateState={id:'chivalry',phase:'active',until:10};
 assert.equal(requestTerminalRitual(active.room,active.m,active.p,1.2),false,
   'an active Chivalry Ultimate still blocks Valkyrie in Practice');
});
test('Early release cancels preparation without spending any Ultimate or terminal opportunity',()=>{
 const s=setup();
 s.cmd('flightUltimateHold',true,1);s.cmd('flightDash',true,1.01);
 stepTerminalPreparation(s.room,s.m,1.04);
 assert.ok(s.m.terminalPrep);
 s.cmd('flightUltimateHold',false,1.4);
 stepTerminalPreparation(s.room,s.m,2.2);
 assert.equal(s.m.terminalPrep,null);
 assert.equal(s.m.terminalDive,null);
 assert.equal(s.m.terminalDiveSpent,false);
 assert.equal(s.p.prowess,100);
 assert.ok(s.room.events.some(e=>e.type==='fightFlightTerminalPrep'&&e.action==='cancelled'));
});
test('Practice Dash spends training reserve but never triggers irreversible terminal dive',()=>{
 const s=setup();s.m.skill.phase='idle';s.cmd('flightDash',true,1);
 stepTerminalPreparation(s.room,s.m,1.34);stepFlightRun(s.room,s.m,1/30,1.34);
 assert.equal(s.p.prowess,100);
 assert.ok(s.m.practiceDashEnergy<100);
 assert.equal(s.m.terminalPrep,null);assert.equal(s.m.terminalDive,null);
 s.cmd('flightDash',false,1.38);
 assert.equal(s.m.flightDashHeld,false);
 assert.equal(s.m.offensiveRun,true,'short press must finish its minimum powered launch');
 assert.equal(s.m.terminalDive,null,'release never commits a terminal sacrifice');
});
test('Already active Chivalry cannot spend another Ultimate on a terminal chord',()=>{
 const s=setup();s.p.ultimateState={id:'chivalry',phase:'active',until:8};
 s.cmd('flightDash',true,1);s.cmd('flightUltimateHold',true,1.02);
 stepTerminalPreparation(s.room,s.m,1.02);stepTerminalPreparation(s.room,s.m,3);
 assert.equal(s.m.terminalDiveSpent,false);assert.equal(s.m.terminalDive,null);
});
test('Rider death mid-dive preserves a moving machine, finite bounded respawn, and delayed respawn start',()=>{
 const s=setup();commit(s);
 const deathTime=2.12;
 assert.equal(killPlayer(s.room,s.p.id,null,'sword',deathTime),true);
 assert.equal(s.p.alive,false);
 assert.ok(Number.isFinite(s.p.respawnAt),'deferred respawn has a finite failsafe deadline');
 assert.ok(s.p.respawnAt>=s.m.terminalDive.expiresAt);
 assert.equal(s.m.operatorId,null);
 const z=s.m.z;
 advanceTerminalFlight(s.room,s.m,1/30,2.18);
 stepFightFlight(s.room,s.m,1/30,2.18,s.room.world);
 assert.ok(s.m.z<z,'physical dive continues after pilot death');
 assert.equal(s.m.terminalDive.resolved,false);
 s.m.terminalDive.impactAt=2.25;
 assert.equal(resolveTerminalFlight(s.room,s.m,2.25),true);
 assert.equal(s.m.mode,'DESTROYED');
 assert.ok(s.p.respawnAt>2.25&&s.p.respawnAt<s.m.terminalDive.expiresAt+10);
 assert.equal(s.p.terminalRespawnDeferredFor,null);
 assert.equal(resolveTerminalFlight(s.room,s.m,2.26),false);
 assert.equal(s.room.events.filter(e=>e.type==='fightFlightTerminalExplosion').length,1);
});
test('Terminal epicenter outweighs edge damage, creates finite burning ground and never credits pilot suicide to prior knockback',()=>{
 const s=setup();commit(s);
 const close=s.room.addPlayer({id:'close',token:'close',name:'Close'},0);
 const edge=s.room.addPlayer({id:'edge',token:'edge',name:'Edge'},0);
 for(const p of [close,edge]){p.alive=true;p.spawnProtectionUntil=0;p.health=500;}
 // The new full-condition blast can kill ordinary 100-HP targets outright.
 // Preserve survivors here to assert that the lingering ground fire hurts.
 close.position={x:1,y:0,z:0};edge.position={x:7,y:0,z:0};
 s.m.x=0;s.m.y=0;s.m.z=0;s.m.grounded=true;
 s.m.terminalDive.impactAt=2.15;
 s.p.lastAttackerId=edge.id;s.p.lastKnockbackAt=2.14;
 assert.equal(resolveTerminalFlight(s.room,s.m,2.15),true);
 assert.ok(close.health<edge.health,'damage must fall off outward, not a flat blast');
 assert.equal(edge.kills,0,'intentional terminal self-defeat is not a prior enemy knockback kill');
 assert.equal(s.m.health,0);assert.equal(s.m.terminalDiveSpent,true);
 assert.equal(s.room.flightBurnZones.length,1);
 const zones=s.room.flightBurnZones;
 assert.ok(zones[0].expiresAt-zones[0].startedAt>=TERMINAL.minFireDuration);
 assert.ok(zones[0].expiresAt-zones[0].startedAt<=TERMINAL.maxFireDuration);
 const before=close.health;
 stepFlightBurnZones(s.room,2.75);
 assert.ok(close.health<before,'burning ground applies actual ongoing damage');
 stepFlightBurnZones(s.room,20);
 assert.equal(s.room.flightBurnZones.length,0);
});
test('Chord is owned by the actual pilot, and a spent lifecycle cannot be armed again',()=>{
 const s=setup(),foreign=s.room.addPlayer({id:'visitor',token:'visitor',name:'Visitor'},0);
 foreign.prowess=100;foreign.ultimate='chivalry';foreign.alive=true;
 assert.ok(applyRoomCommand(s.room,foreign,{type:'flightUltimateHold',down:true},1).rejected);
 commit(s);
 s.m.terminalDive=null;s.m.mode='AIRBORNE';s.m.grounded=false;s.p.prowess=100;
 s.cmd('flightDash',true,4);s.cmd('flightUltimateHold',true,4);
 stepTerminalPreparation(s.room,s.m,4.05);
 assert.equal(s.m.terminalPrep,null,'the same machine has already spent its one dive');
});


test('Dash released first still cancels the chord; Ultimate release cannot accidentally activate Chivalry',()=>{
 const s=setup();s.cmd('flightDash',true,1);s.cmd('flightUltimateHold',true,1.04);
 stepTerminalPreparation(s.room,s.m,1.04);
 assert.ok(s.m.terminalPrep);
 s.cmd('flightDash',false,1.2);
 stepTerminalPreparation(s.room,s.m,1.23);
 assert.equal(s.m.terminalPrep,null);
 s.cmd('flightUltimateHold',false,1.26);
 assert.equal(s.p.prowess,100);
 assert.equal(s.p.ultimateState,null);
 assert.equal(s.m.terminalDiveSpent,false);
});
test('Holding Ultimate alone and releasing without Dash still performs regular Chivalry, not sacrifice',()=>{
 const s=setup();
 s.cmd('flightUltimateHold',true,1);
 stepTerminalPreparation(s.room,s.m,2.2);
 assert.equal(s.m.terminalPrep,null);
 s.cmd('flightUltimateHold',false,2.25);
 assert.equal(s.m.terminalDiveSpent,false);
 assert.ok(s.p.ultimateState,'an ordinary deliberate Ultimate should not be lost');
});

test('An externally shattered main chassis during commitment resolves exactly one terminal explosion',()=>{
 const s=setup();commit(s);
 s.m.health=4;
 const damage=damageFightFlight(s.room,s.m,12,null,'test-siege-impact',2.11,{componentId:'main',point:{x:s.m.x,y:s.m.y,z:s.m.z}});
 assert.equal(damage.destroyed,true);
 assert.ok(s.m.terminalDive.impactAt!=null);
 assert.notEqual(s.m.mode,'DESTROYED','the terminal outcome still owns detonation and rider resolution');
 advanceTerminalFlight(s.room,s.m,1/30,2.14);
 assert.equal(s.m.health,0,'fatal chassis damage may not be healed to one point');
 assert.equal(resolveTerminalFlight(s.room,s.m,2.14),true);
 assert.equal(s.m.mode,'DESTROYED');
 assert.equal(s.room.events.filter(e=>e.type==='fightFlightTerminalExplosion').length,1);
 assert.equal(resolveTerminalFlight(s.room,s.m,2.15),false);
});
test('Chivalry chord can begin after a human-scale Dash-then-Ultimate stagger without partial meter theft',()=>{
 const s=setup();
 s.cmd('flightDash',true,1);stepFlightRun(s.room,s.m,1/30,1.22);
 assert.equal(s.p.prowess,100);
 s.cmd('flightUltimateHold',true,1.24);
 stepTerminalPreparation(s.room,s.m,1.26);
 assert.ok(s.m.terminalPrep);
 stepFlightRun(s.room,s.m,1/30,1.28);
 assert.equal(s.p.prowess,100);
 stepTerminalPreparation(s.room,s.m,2.27);
 assert.equal(s.m.terminalDiveSpent,true);
});


test('A new match clears the previous Valkyrie burning-ground aftermath',()=>{
 const {room}=setup();
 room.flightBurnZones=[{id:'old-life-burn',point:{x:0,y:0,z:0},radius:4,expiresAt:99,nextTickAt:1}];
 room.startMatch(12);
 assert.deepEqual(room.flightBurnZones,[],'a fresh match cannot inherit hazardous terminal fire');
 assert.equal(room.fightFlight,null);
});


test('Committed dive blocked by substantial world masonry explodes at contact rather than hanging until timeout',()=>{
 const s=setup();commit(s);
 s.m.y=1.6;s.p.position.y=1.6;
 s.m.velocity={x:0,y:0,z:-.5};s.m.heading=0;s.m.terminalDive.heading=0;
 s.room.world.solids=[{id:'heavy-stone-obstruction',center:[0,1.3,-1.5],size:[8,2.6,.7]}];
 for(let i=0;i<80&&!s.m.terminalDive.resolved;i++){
  const t=2.11+i/30;
  advanceTerminalFlight(s.room,s.m,1/30,t);
  stepFightFlight(s.room,s.m,1/30,t,s.room.world);
  resolveTerminalFlight(s.room,s.m,t);
 }
 assert.equal(s.m.terminalDive.resolved,true);
 assert.ok(s.m.terminalDive.impactAt!=null,'real obstruction triggers collision rather than the timeout');
 assert.ok(s.m.terminalDive.resolvedAt-s.m.terminalDive.startedAt<2.5,'physical contact resolves promptly');
 assert.equal(s.room.flightBurnZones.length,1);
 assert.equal(s.room.flightBurnZones[0].point.y,0,'ground aftermath cannot hover at wall impact altitude');
});

test('Fire Away and Narrow cannot trigger terminal, including when Chivalry is full',()=>{
 for(const id of ['fireAwayImRightHere','narrowToOne']){
  const s=setup();s.m.skill={id,phase:'active',activeUntil:15,readyAt:25};
  assert.deepEqual(s.cmd('flightDash',true,1),{});
  assert.deepEqual(s.cmd('flightUltimateHold',true,1.01),{});
  stepTerminalPreparation(s.room,s.m,1.02);stepTerminalPreparation(s.room,s.m,2.2);
  assert.equal(s.m.terminalPrep,null,id+' must not prime the Dive');
  assert.equal(s.m.terminalDive,null);
  assert.equal(s.p.prowess,100);
  assert.equal(s.m.terminalDiveSpent,false);
 }
});
test('Unactivated or expired Ascension refuses the terminal chord without spending Chivalry',()=>{
 for(const state of [{phase:'idle',activeUntil:null},{phase:'active',activeUntil:.9}]){
  const s=setup();Object.assign(s.m.skill,state);
  s.cmd('flightDash',true,1);s.cmd('flightUltimateHold',true,1.01);
  stepTerminalPreparation(s.room,s.m,1.02);stepTerminalPreparation(s.room,s.m,2.2);
  assert.equal(s.m.terminalDive,null);assert.equal(s.m.terminalDiveSpent,false);assert.equal(s.p.prowess,100);
 }
});
test('Rotor destruction, Skill ending, or early chord release cancels one-second Ascension preparation',()=>{
 for(const invalid of ['rotor','skill','release']){
  const s=setup();s.cmd('flightDash',true,1);s.cmd('flightUltimateHold',true,1.04);
  stepTerminalPreparation(s.room,s.m,1.04);assert.ok(s.m.terminalPrep);
  if(invalid==='rotor')s.m.rotorHP=0;
  else if(invalid==='skill')s.m.skill.phase='idle';
  else s.cmd('flightDash',false,1.15);
  stepTerminalPreparation(s.room,s.m,1.15);stepTerminalPreparation(s.room,s.m,2.3);
  assert.equal(s.m.terminalDive,null);assert.equal(s.m.terminalPrep,null);
  assert.equal(s.p.prowess,100);assert.equal(s.m.terminalDiveSpent,false);
 }
});
test('One full Ascension chord does not duplicate commitment or reset rotor velocity',()=>{
 const s=setup();s.m.velocity.y=-7;
 commit(s);
 assert.equal(s.m.velocity.y,-7);
 stepTerminalPreparation(s.room,s.m,2.12);
 assert.equal(s.room.events.filter(e=>e.type==='fightFlightTerminalCommitted').length,1);
 assert.equal(s.m.skill.id,'doNotStopMyAscension');
});

test('complete mobile ritual spends Chivalry immediately but only with valid airborne Ascension',()=>{
 const s=setup();
 const before=s.m.rotorAngularVelocity;
 assert.deepEqual(s.cmd('flightTerminalRitual',undefined,1),{});
 assert.ok(s.m.terminalDive,'server commits the actual terminal dive');
 assert.equal(s.p.prowess,0,'real one-use Ultimate meter consumed');
 assert.equal(s.m.terminalDiveSpent,true);
 assert.equal(s.m.rotorAngularVelocity,before,'no invented rotor spin');
 assert.ok(s.m.terminalDive.blastProfile.damage>TERMINAL.explosionDamage);
 assert.ok(s.cmd('flightTerminalRitual',undefined,1.01).rejected);
 assert.equal(s.room.events.filter(e=>e.type==='fightFlightTerminalCommitted').length,1);
 const foe=s.room.addPlayer({id:'outsider',token:'o',name:'Outsider'},0);
 foe.alive=true;foe.prowess=100;foe.ultimate='chivalry';
 assert.ok(applyRoomCommand(s.room,foe,{type:'flightTerminalRitual',radius:999,damage:999},2).rejected,
   'unmounted sender cannot spoof damage or activate another pilot machine');
});
test('craft condition at collision changes the final blast and burn profile',()=>{
 const pristine=setup(),damaged=setup();
 const a=terminalBlastProfile(pristine.m);
 damaged.m.health=65;damaged.m.rotorHP=10;damaged.m.braceLHP=0;
 damaged.m.braceRHP=5;damaged.m.flightCharge=8;
 const b=terminalBlastProfile(damaged.m);
 assert.ok(a.condition>b.condition&&a.radius>b.radius&&a.damage>b.damage);
 assert.ok(a.fireRadius>b.fireRadius&&a.fireDuration>b.fireDuration&&a.fireTickDamage>b.fireTickDamage);
 assert.equal(a.radius,TERMINAL.maxBlastRadius);
 assert.equal(a.damage,TERMINAL.maxBlastDamage);
 assert.ok(terminalRadialDamage(a.damage,0,a.radius)>terminalRadialDamage(a.damage,a.radius*.7,a.radius));
 assert.equal(terminalRadialDamage(a.damage,a.radius,a.radius),0,'zero edge damage');
 assert.ok(terminalRadialDamage(a.damage,a.radius*.5,a.radius)<a.damage*.5,
  'superlinear falloff makes epicenter disproportionately devastating');
 assert.deepEqual(pristine.cmd('flightTerminalRitual',undefined,2),{});
 const committed=pristine.m.terminalDive.blastProfile;
 pristine.m.health=1;pristine.m.rotorHP=0;pristine.m.braceLHP=0;
 pristine.m.braceRHP=0;pristine.m.flightCharge=0;
 pristine.m.grounded=true;pristine.m.y=0;pristine.m.terminalDive.impactAt=2.1;
 assert.equal(resolveTerminalFlight(pristine.room,pristine.m,2.1),true);
 const blast=pristine.room.events.find(e=>e.type==='fightFlightTerminalExplosion');
 assert.ok(blast.radius<committed.radius,'fire damage lowers impact blast radius');
 assert.ok(blast.damage<committed.damage,'impact power reflects the surviving craft');
 assert.ok(pristine.room.flightBurnZones[0].radius<committed.fireRadius);
});
test('stencil command cannot bypass skill, airborne, full meter, destroyed rotor or spent chassis',()=>{
 for(const kind of ['ground','skill','rotor','meter','spent','inactive']){
  const s=setup();
  if(kind==='ground')s.m.grounded=true;
  if(kind==='skill')s.m.skill.id='narrowToOne';
  if(kind==='rotor')s.m.rotorHP=0;
  if(kind==='meter')s.p.prowess=99;
  if(kind==='spent')s.m.terminalDiveSpent=true;
  if(kind==='inactive')s.m.skill.phase='idle';
  const response=s.cmd('flightTerminalRitual',undefined,1);
  assert.ok(response.rejected,kind+' cannot pass server authorization');
  assert.equal(s.p.prowess,kind==='meter'?99:100);
  assert.equal(s.m.terminalDive,null);
 }
});

test('Terminal Dive keeps its moving rotor and allows early steering before heat destroys control',()=>{
 const s=setup();commit(s);
 s.m.y=100;s.p.position.y=100;s.p.input.yaw=1.15;
 const initial=s.m.heading,initialHp=s.m.health;
 for(let i=0;i<45;i++){
   const time=2.11+i/30;
   advanceTerminalFlight(s.room,s.m,1/30,time);
   stepFightFlight(s.room,s.m,1/30,time,s.room.world);
 }
 assert.ok(s.m.heading>initial+.06,'real player yaw can steer the burning run');
 assert.ok(s.m.health<initialHp,'machine loses hull integrity during flight');
 assert.ok(s.m.rotorAngularVelocity>0,'powered rotor keeps spinning');
 assert.equal(resolveTerminalFlight(s.room,s.m,4),false,'no fixed fuse in empty air');
 const earlyHp=s.m.health;
 for(let i=0;i<180;i++){
   const time=4+i/30;
   s.p.input.yaw=s.m.heading+.4;
   advanceTerminalFlight(s.room,s.m,1/30,time);
   stepFightFlight(s.room,s.m,1/30,time,s.room.world);
 }
 assert.ok(s.m.health<earlyHp);
 assert.equal(resolveTerminalFlight(s.room,s.m,11),false,'loss of control does not spontaneously explode');
 assert.ok(s.m.terminalDive.simulatedSec>5,'extended run is not the old 5s dive');
});
test('terminal ground flames pulse frequently early and grow progressively quieter',()=>{
 assert.ok(terminalFireInterval(0)<terminalFireInterval(.5));
 assert.ok(terminalFireInterval(.5)<terminalFireInterval(.95));
 const s=setup();commit(s);
 s.m.y=0;s.m.grounded=true;s.m.terminalDive.impactAt=3;
 assert.equal(resolveTerminalFlight(s.room,s.m,3),true);
 const z=s.room.flightBurnZones[0];
 assert.ok(z);
 const before=z.nextTickAt;
 stepFlightBurnZones(s.room,before+.01);
 const early=z.nextTickAt-before;
 const middle=z.startedAt+(z.expiresAt-z.startedAt)*.6;
 stepFlightBurnZones(s.room,middle);
 const later=z.nextTickAt-middle;
 assert.ok(later>early,'actual authoritative zone ticks less often with age');
 stepFlightBurnZones(s.room,z.expiresAt+.01);
 assert.equal(s.room.flightBurnZones.length,0);
});
test('the craft detonates once after crossing the authored arena edge',()=>{
 const s=setup();commit(s);
 s.m.x=165;s.m.y=20;s.m.z=0;s.m.grounded=false;
 assert.equal(resolveTerminalFlight(s.room,s.m,2.2),true);
 const event=s.room.events.find(e=>e.type==='fightFlightTerminalExplosion');
 assert.equal(event.reason,'out-of-bounds');
 assert.equal(s.room.flightBurnZones.length,0);
 assert.equal(resolveTerminalFlight(s.room,s.m,2.3),false);
});
