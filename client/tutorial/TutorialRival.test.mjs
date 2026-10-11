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

test('the first duel uses readable footwork and gives ground under pressure through ordinary bot decisions',()=>{
 const {host,session,tick,actor}=fixture();session.director.resumeAt('real-duel');
 host.player.position={x:0,y:0,z:-12};actor().position={x:0,y:0,z:-15};tick();
 assert.equal(session.rival.mode,'duel');assert.ok(Math.abs(actor().input.right)>0);
 actor().health=15;host.player.position.z=-10;tick(20);
 assert.ok(actor().ai.retreatUntil>host.now());assert.ok(actor().input.forward>0);
 assert.equal(actor().speedScale,1);assert.equal(actor().botSkill.parry,0);host.close();
});

test('pursuit reacts to visible Sprint after a delay and respects ordinary stamina',()=>{
 const {host,session,tick,actor}=fixture();session.stage('rival-escape');session.director.resumeAt('overstayed-welcome');
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
 tick(140);assert.ok(session.director.facts.has('rival-turned'));assert.equal(session.rival.mode,'final-fight');
 assert.ok(Math.abs(actor().position.z-GREENER_ROUTE.finalStand.z)<10);assert.equal(actor().alive,true);host.close();
});
