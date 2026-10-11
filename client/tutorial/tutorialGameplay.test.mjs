import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalHost } from '../network/LocalHost.mjs';
import { TutorialSession } from './TutorialSession.mjs';
import { tryCastSpell, tryDash, applyDamage, killPlayer } from '../../shared/sim/combat.mjs';
import { GREENER_ROUTE } from '../../shared/worlds/greenerPastures.mjs';
import { serializeSnapshot } from '../../shared/sim/wire.mjs';

function fixture() {
 let now=10;
 const host=new LocalHost({now:()=>now,every:()=>1,cancel:()=>{},later:()=>{}});
 host.loadout('frostfire'); host.startTutorial('You');
 const session=new TutorialSession(host);session.start();
 const tick=(n=1)=>{for(let i=0;i<n;i++){now+=1/30;host.tick();}};
 const goto=(id)=>session.director.resumeAt(id);
 const rival=()=>host.room.players.get(session.rivalId);
 const face=()=>{host.player.position={x:0,y:0,z:-13};host.player.yaw=0;host.player.input={forward:0,right:0,yaw:0,pitch:0};rival().position={x:0,y:0,z:-15};rival().yaw=Math.PI;rival().input={forward:0,right:0,yaw:Math.PI,pitch:0};};
 return {host,session,tick,goto,rival,face,now:()=>now};
}
test('Tutorial uses real cooldowns and session Fireball while ordinary Practice and saved loadout keep their contracts',()=>{
 const {host,session,goto,tick,now}=fixture();goto('fireball-prompt');tick(40);
 assert.equal(host.spell,'frostfire');assert.equal(host.player.spell,'fireball');
 assert.equal(tryCastSpell(host.room,host.player.id,{x:0,y:0,z:-1},now()),true);tick(15);
 assert.equal(tryCastSpell(host.room,host.player.id,{x:0,y:0,z:-1},now()),false);
 assert.equal(tryDash(host.room,host.player.id,{x:0,z:-1},now()),true);tick(15);
 assert.equal(tryDash(host.room,host.player.id,{x:0,z:-1},now()),false);
 assert.equal(serializeSnapshot(host.room,now()).tutorial,true);
 session.stop();host.startSolo('PRACTICE','You','castleward');tick(40);
 assert.equal(host.player.spell,'frostfire');assert.equal(host.room.localTutorial,false);
 assert.equal(tryDash(host.room,host.player.id,{x:0,z:-1},now()),true);tick(15);
 assert.equal(tryDash(host.room,host.player.id,{x:0,z:-1},now()),true);host.close();
});
test('real Guard stops the lesson swing, waits for voluntary release, and postscript uses ordinary sword damage',()=>{
 const {host,session,goto,tick,face,rival}=fixture();face();tick(40);goto('guard-attack-start');host.guard(true);tick(50);
 assert.equal(session.combat.guarded,true);assert.equal(session.rival.mode,'idle');
 while(session.director.current.kind==='dialogue') session.director.completeDialogue(session.director.cue);
 tick(10);assert.equal(session.director.current.id,'lower-guard');
 host.guard(false);tick();assert.equal(session.director.current.id,'postscript-hit');
 tick(100);assert.ok(host.player.health<100);assert.ok(session.director.facts.has('player-damaged'));
 assert.equal(host.player.ultimateState,null);assert.equal(rival().ultimateState,null);host.close();
});
test('a real swing is required for contact, and scripted setup keeps ordinary player health',()=>{
 const {host,session,goto,tick,face}=fixture();face();tick(40);goto('attack-prompt');
 assert.equal(session.director.accept('attack'),false);host.attack(true);tick(35);host.attack(false);
 assert.ok(session.director.facts.has('sword-contact'));assert.equal(host.player.health,100);host.close();
});
test('tutorial Rival survival is local and ends when the final fight commits, independent of Guard dialogue',()=>{
 const {host,session,goto,tick,face,rival,now}=fixture();face();tick(40);
 applyDamage(host.room,host.player.id,rival().id,150,'sword',now(),{x:2,y:0,z:0});
 assert.equal(rival().alive,true);assert.equal(rival().health,1);
 assert.equal(host.room.events.find(e=>e.type==='damage').amount,150);
 host.room.events.length=0;goto('final-hello');
 assert.equal(host.room.tutorialRival.protected,false);
 applyDamage(host.room,host.player.id,rival().id,150,'sword',now());assert.equal(rival().alive,false);
 const killedAt=now(); tick(130);assert.equal(rival().alive,false);assert.equal(rival().respawnAt,Infinity);
 assert.equal(serializeSnapshot(host.room,now()).players.find(p=>p.id===rival().id).deathAt,killedAt);
 host.close();
});
test('death restores the recent checkpoint, invalidates stale audio and leaves no duplicate actors/projectiles',()=>{
 const {host,session,tick,goto,now}=fixture();session.stage('bridge-dash');goto('bridge-arrival');const old=session.director.runId;
 killPlayer(host.room,host.player.id,null,'abyss',now());tick();
 assert.equal(host.player.alive,true);assert.equal(host.player.health,100);assert.equal(host.player.position.z,GREENER_ROUTE.checkpointPositions.bridge.z);
 assert.ok(session.director.runId>old);assert.equal(host.room.players.size,2);assert.equal(host.room.projectiles.size,0);host.close();
});
test('responsive duel starts at the line onset and continues through nonblocking captions',()=>{
 const {host,session,goto,tick,face,rival}=fixture();face();tick(40);goto('well');assert.equal(session.rival.mode,'idle');
 session.director.completeDialogue(session.director.cue);tick();assert.equal(session.director.current.id,'plans-change');assert.equal(rival().attackActive,true);
 tick(40);assert.equal(session.rival.mode,'duel');assert.ok(rival().botProfile.sword!==false);host.close();
});

test('postscript stops after its ordinary hit while the player reads the ensuing conversation',()=>{
 const {host,session,goto,tick,face}=fixture();face();tick(40);goto('guard-attack-start');host.guard(true);tick(50);
 while(session.director.current.kind==='dialogue')session.director.completeDialogue(session.director.cue);
 host.guard(false);tick(35);
 assert.ok(host.player.health<100);assert.equal(session.rival.mode,'idle');
 const contactAt=host.player.lastDamageAt;tick(240);
 assert.equal(host.player.alive,true);assert.equal(host.player.lastDamageAt,contactAt);
 assert.equal(session.director.current.id,'extra');host.close();
});

test('Rival follows the authored route forward and gathers backward without reversing travel',()=>{
 const {host,session,tick,goto,rival}=fixture();session.stage('bridge-dash');goto('bridge-arrival');tick(300);
 assert.equal(session.rival.mode,'escape');assert.ok(rival().position.z<GREENER_ROUTE.bridge.ravineBounds.minZ);
 session.rival.enter('rival-counterfire',host.now());
 session.rival.waypoint=GREENER_ROUTE.chaseWaypoints.findIndex(p=>p.id==='counterfire');
 rival().position={x:32,y:0,z:-280};host.player.position={x:32,y:0,z:-260};
 const initial={...rival().position};tick(15);
 assert.ok(rival().position.z<initial.z);assert.ok(session.rival.counterShots>0);host.close();
});
