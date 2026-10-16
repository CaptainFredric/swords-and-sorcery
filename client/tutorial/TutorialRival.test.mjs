import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalHost} from '../network/LocalHost.mjs';
import {TutorialSession} from './TutorialSession.mjs';
import {GREENER_ROUTE} from '../../shared/worlds/greenerPastures.mjs';

function fixture() {
 let now=10;
 const host=new LocalHost({now:()=>now,every:()=>1,cancel:()=>{},later:()=>{}});host.startTutorial('You');
 const session=new TutorialSession(host,{random:()=>.25});session.start();
 const tick=(n=1)=>{for(let i=0;i<n;i++){now+=1/30;host.tick();}};
 return {host,session,tick,now:()=>now,actor:()=>host.room.players.get(session.rivalId)};
}

test('the first duel uses readable footwork and holds its ground: low on health, he does not run off to heal',()=>{
 const {host,session,tick,actor}=fixture();session.director.resumeAt('real-duel');
 host.player.position={x:0,y:0,z:-12};actor().position={x:0,y:0,z:-15};tick();
 assert.equal(session.rival.mode,'duel');assert.ok(Math.abs(actor().input.right)>0);
 actor().health=15;host.player.position.z=-10;tick(90);
 assert.equal(actor().botSkill.retreat,0);assert.ok(!(actor().ai.retreatUntil>host.now()),'no retreat to heal');
 assert.ok(Math.hypot(actor().position.x-host.player.position.x,actor().position.z-host.player.position.z)<6,'still at it, within reach');
 assert.equal(actor().speedScale,1);assert.equal(actor().botSkill.parry,0);host.close();
});

test('pursuit reacts to visible Sprint after a delay and respects ordinary stamina',()=>{
 const {host,session,tick,actor}=fixture();session.stage('rival-escape');session.director.resumeAt('hardly-wellbeing');
 actor().position={x:0,y:0,z:-60};host.player.position={x:0,y:0,z:-42};
 session.rival.enteredAt=host.now()-2;session.rival.sprintWanted=false;
 host.player.input={forward:1,right:0,yaw:0,pitch:0,sprint:true};tick();
 assert.equal(actor().input.sprint,false);tick(20);assert.equal(actor().input.sprint,true);
 actor().guardStamina=0;tick();assert.equal(actor().sprinting,false);assert.equal(actor().input.sprint,false);host.close();
});

test('a closing player Dash can provoke a delayed legal escape Dash without copying the input frame',()=>{
 const {host,session,tick,actor}=fixture();session.stage('rival-escape');session.director.resumeAt('overstayed-welcome');
 actor().position={x:0,y:0,z:-60};host.player.position={x:0,y:0,z:-42};
 session.director.resumeAt('counterfire-hit');session.rival.waypoint=2;
 const events=[];host.on('events',batch=>events.push(...batch.events));
 host.dash({x:0,z:-1});tick();assert.ok(events.some(e=>e.type==='dash'&&e.playerId===host.player.id));
 assert.equal(events.some(e=>e.type==='dash'&&e.playerId===actor().id),false);
 tick(30);const mine=events.find(e=>e.type==='dash'&&e.playerId===host.player.id),theirs=events.find(e=>e.type==='dash'&&e.playerId===actor().id);
 assert.ok(theirs);assert.ok(theirs.at-mine.at>=.6);assert.ok(actor().dashReadyAt>=theirs.at+4.99);host.close();
});

test('the pride challenge slows and turns a moving Rival near the entrance before real final combat',()=>{
 const {host,session,tick,actor}=fixture();session.stage('pride-stop');session.director.resumeAt('pride-turn');
 actor().position={x:GREENER_ROUTE.finalStand.x,y:0,z:GREENER_ROUTE.finalStand.z+7};actor().yaw=0;
 host.player.position={x:actor().position.x,y:0,z:actor().position.z+12};
 const origin={...actor().position};tick(5);assert.equal(session.rival.mode,'pride');assert.ok(actor().position.z<origin.z);
 tick(140);assert.ok(session.director.facts.has('rival-turned'));assert.equal(session.rival.mode,'ready');
 assert.ok(Math.abs(actor().position.z-GREENER_ROUTE.finalStand.z)<10);assert.equal(actor().alive,true);host.close();
});

test('Rival waits for real Sprint stamina and Dash cooldown before committing to the broken span',()=>{
 const {host,session,tick,actor,now}=fixture();session.stage('bridge-dash');session.director.resumeAt('bridge-arrival');
 actor().position={...GREENER_ROUTE.bridge.dashStart};actor().guardStamina=0;actor().sprinting=false;actor().sprintBlend=0;
 actor().lastGuardDrainAt=now();actor().dashReadyAt=now()+5;
 session.rival.waypoint=GREENER_ROUTE.chaseWaypoints.findIndex(p=>p.id==='bridge-takeoff');
 tick(30);assert.equal(actor().alive,true);assert.ok(actor().position.z>GREENER_ROUTE.bridge.gapBounds.maxZ,'wait on the supported bank');
 tick(330);assert.equal(actor().alive,true);assert.ok(actor().position.z<GREENER_ROUTE.bridge.ravineBounds.minZ,'cross once ordinary resources recover');
 host.close();
});

test('the first knockdown is temporary: he is held down, gets up on the cue, and can be fought (and knocked down) again',()=>{
  const {host,session,tick,actor,now}=fixture();
  session.stage('real-duel');session.director.resumeAt('real-duel');
  session.rival.beginRecovery(now());
  assert.equal(session.rival.knockdowns,1);assert.equal(session.rival.mode,'recover');
  tick(30);assert.ok(session.director.facts.has('rival-first-downed'));assert.equal(session.director.facts.has('rival-downed'),false);
  tick(100);assert.equal(session.rival.mode,'recover');
  session.rival.enter('rival-rise',now());tick(50);
  assert.equal(actor().presentationRecovery,null);
  assert.ok(session.director.facts.has('rival-first-recovered'));assert.equal(session.director.facts.has('rival-recovered'),false);
  session.rival.enter('rival-real-duel',now());assert.equal(session.rival.mode,'duel','back in the fight');
  session.rival.beginRecovery(now());assert.equal(session.rival.knockdowns,2);assert.equal(session.rival.mode,'recover');
  host.close();
});

test('a living knockdown preserves learner movement, uses no corpse, holds him down for his line, then he walks off',()=>{
  const {host,session,tick,actor,now}=fixture();
  session.stage('real-duel');session.director.resumeAt('real-duel');
  const start={...host.player.position},rivalStart={...actor().position};
  // (the second knockdown: the one he goes off after)
  session.rival.knockdowns=1;
  session.rival.beginRecovery(now());
  assert.equal(actor().alive,true);assert.ok(actor().presentationRecovery);
  assert.equal(session.director.facts.has('rival-recovery-started'),true);
  assert.equal(session.allows('move',false),true);
  host.input({forward:0,right:1,yaw:0,pitch:0,sprint:false});tick(20);
  assert.ok(host.player.position.x>start.x+1);assert.equal(session.rival.mode,'recover');
  assert.equal(actor().alive,true);assert.equal(actor().deathAt,undefined);
  // down, and kept down while his line plays (well past the old fixed reaction)
  tick(100);assert.equal(session.rival.mode,'recover');assert.ok(actor().presentationRecovery.hold>0);
  // the line over, he gets up: the rise plays out, then he is on his feet and the scene moves on
  session.rival.enter('rival-rise',now());
  const rise=actor().presentationRecovery;assert.ok(Math.abs(rise.duration-(now()-rise.at)-1.4)<1e-6);
  tick(50);assert.equal(actor().presentationRecovery,null);
  assert.ok(session.director.facts.has('rival-recovered'));
  session.rival.enter('rival-depart',now());tick(60);
  assert.equal(session.director.facts.has('rival-departing'),true);
  assert.equal(actor().sprinting,false,'he walks off; the narration is of a departure, not a sprint');
  assert.ok(Math.hypot(actor().position.x-rivalStart.x,actor().position.z-rivalStart.z)>1);
  host.close();
});

test('Rival performs real Jump at the reused sheepfold wall and stays alive',()=>{
  const {host,session,tick,actor}=fixture();session.stage('tattle-reveal');session.director.resumeAt('matter-settled');session.rival.enter('rival-escape',host.now());
  actor().position={...GREENER_ROUTE.jumpReuse.takeoff};
  host.player.position={x:15,y:0,z:-493};
  session.rival.waypoint=GREENER_ROUTE.chaseWaypoints.findIndex(p=>p.id==='dead-end-takeoff');
  let airborne=false;
  for(let i=0;i<80;i++){tick();airborne ||= !actor().grounded;}
  assert.equal(airborne,true);assert.equal(actor().alive,true);assert.ok(actor().position.z<-523);
  host.close();
});

test('a displaced Rival navigates around the real cart instead of snagging on a direct authored segment',()=>{
  const {host,session,tick,actor}=fixture();session.stage('rival-escape');session.director.resumeAt('hardly-wellbeing');
  actor().position={x:17,y:0,z:-55};host.player.position={x:12,y:0,z:-38};
  session.rival.waypoint=GREENER_ROUTE.chaseWaypoints.findIndex(p=>p.id==='cart-gap');
  tick(500);assert.equal(actor().alive,true);assert.ok(actor().position.z<-80,JSON.stringify(actor().position));
  host.close();
});


test('Rival runs again as soon as his first Fireball complaint is over',()=>{
  const {host,session,actor,now}=fixture();
  session.stage('fireball');
  session.firstFireballHit=true;
  session.rival.enter('rival-escape',now());
  actor().position={x:20,y:0,z:-390};
  host.player.position={x:20,y:0,z:-375};
  session.rival.waypoint=GREENER_ROUTE.chaseWaypoints.findIndex(p=>p.id==='sheepfold');

  session.director.resumeAt('rival-cold');
  session.rival.chase(now(),15);
  assert.equal(actor().input.forward,0,'he holds still for "That was cold of you, ow!"');

  session.director.resumeAt('warm-feelings');
  session.rival.chase(now(),15);
  assert.ok(Math.hypot(actor().input.forward,actor().input.right)>.1,'he is already fleeing under the following reactions');
  host.close();
});

test('counterfire leads a moving player while Rival keeps fleeing',()=>{
  const {host,session,actor,now}=fixture();
  session.stage('counterfire');
  session.firstFireballHit=true;
  session.rival.enter('rival-counterfire',now());
  actor().position={x:32,y:0,z:-720};
  actor().spell='fireball';
  actor().spellReadyAt=0;
  actor().pendingSpell=null;
  host.player.position={x:32,y:0,z:-700};
  host.player.velocity={x:6,y:0,z:0};
  session.rival.waypoint=GREENER_ROUTE.chaseWaypoints.findIndex(p=>p.id==='counterfire');

  session.rival.chase(now(),20);
  assert.ok(actor().pendingSpell,'Rival begins a real Fireball cast while escaping');
  assert.ok(actor().pendingSpell.direction.x>.12,'the shot leads the player laterally instead of aiming at the old position');
  assert.ok(Math.hypot(actor().input.forward,actor().input.right)>.1,'casting does not make him stop running away');
  host.close();
});
