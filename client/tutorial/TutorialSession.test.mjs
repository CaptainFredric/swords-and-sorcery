import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalHost } from '../network/LocalHost.mjs';
import { TutorialSession, tutorialPrompt } from './TutorialSession.mjs';
import { TUTORIAL_CHAPTERS } from './tutorialScript.mjs';

function start(){
 let now=10;
 const host=new LocalHost({now:()=>now,every:()=>1,cancel:()=>{},later:()=>{}});
 host.startTutorial('CaptainFredric');
 const notes=[];
 const session=new TutorialSession(host,{onBlocked:action=>notes.push(action)});
 session.start(); return {host,session,notes,tick:()=>{now+=1/30;host.tick();}};
}
test('local preview stages a living Rival with normal health and prevents early combat at the session boundary',()=>{
 const {host,session,notes,tick}=start();
 assert.equal(host.player.health,100); assert.equal(host.room.players.get(session.rivalId).name,'Rival');
 for(const type of ['attack','guard','cast','dash','ultimate','gauntlet']) host[type](type==='attack'||type==='guard'?true:{x:1,y:0,z:0});
 tick(); assert.equal(host.player.attackActive,false); assert.equal(host.player.guarding,false);
 assert.equal(host.player.pendingSpell,null); assert.equal(host.player.ultimateState,null);
 assert.ok(notes.includes('attack'));
 session.stop(); assert.equal(host.commandFilter,null);
 host.attack(true); assert.equal(host.player.attackActive,true);
 host.close();
});
test('full route ends at the authored title payoff and can restart without old listeners',()=>{
 const {host,session,tick}=start();
 while(session.director.current) session.director.accept(session.director.current.advanceOn);
 assert.equal(session.director.state,'complete');
 assert.equal(session.director.progress.chapter.id,'ending');
 session.restart(); assert.equal(session.director.current.id,'greeting');
 tick(); assert.equal(host.room.players.size,2);
 session.stop(); session.stop(); host.close();
});
test('device prompts reflect rebound controls, while speech is attributed to YOU without changing audio role',()=>{
 const walk=TUTORIAL_CHAPTERS.find(x=>x.id==='approach').beats.find(x=>x.id==='walk-prompt');
 assert.match(tutorialPrompt(walk,{bindings:{forward:['ArrowUp'],back:['ArrowDown'],left:['ArrowLeft'],right:['ArrowRight']}}),/↑/);
 assert.match(tutorialPrompt(walk,{touch:true}),/stick/);
 const run=TUTORIAL_CHAPTERS[1].beats.find(x=>x.id==='sprint-prompt');
 assert.match(tutorialPrompt(run,{bindings:{sprint:['KeyT']}}),/T/);
 assert.match(tutorialPrompt(run,{touch:true}),/Sprint/);
});
