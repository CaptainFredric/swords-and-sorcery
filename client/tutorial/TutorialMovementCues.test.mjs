import test from 'node:test';
import assert from 'node:assert/strict';
import { TutorialDirector } from './TutorialDirector.mjs';
import { TutorialMovementCues } from './TutorialMovementCues.mjs';
import { SPRINT } from '../../shared/src/movement.mjs';

function setup(){
 const beats=['player-looked','approach-progress','sprint-started','stamina-decreased','player-winded','stamina-recovered','rival-reached'].map(cue=>({id:cue,chapter:'approach',kind:'prompt',line:cue,advanceOn:cue}));
 const director=new TutorialDirector({beats}); director.start();
 const cues=new TutorialMovementCues(director,{local:true,playerId:'you',rivalId:'rival'});
 const send=(x=0,extra={})=>cues.snapshot({players:[{id:'you',alive:true,position:{x,y:0,z:0},yaw:0,pitch:0,guardStamina:100,sprinting:false,...extra},{id:'rival',alive:true,position:{x:20,y:0,z:0}}]});
 return {director,cues,send};
}
test('movement lessons follow real aim, forward distance, sprint and shared stamina snapshots',()=>{
 const {director,send}=setup(); send(); send(0,{yaw:.4}); send(0,{yaw:.8}); send(0,{yaw:1.3}); assert.equal(director.current.id,'approach-progress');
 for(const x of [-1,-2,-3,-4]) send(x); assert.equal(director.current.id,'approach-progress');
 for(let x=-3;x<=4;x++) send(x); assert.equal(director.current.id,'sprint-started');
 send(5,{sprinting:true,guardStamina:98}); assert.equal(director.current.id,'stamina-decreased');
 send(7,{sprinting:true,guardStamina:94}); assert.equal(director.current.id,'player-winded');
 send(8,{guardStamina:20}); assert.equal(director.current.id,'player-winded');
 send(8,{guardStamina:0}); assert.equal(director.current.id,'stamina-recovered');
 send(8,{guardStamina:SPRINT.restartStamina-1}); assert.equal(director.current.id,'stamina-recovered');
 send(8,{guardStamina:SPRINT.restartStamina}); assert.equal(director.current.id,'rival-reached');
 for(let x=9;x<=18;x++) send(x); assert.equal(director.state,'complete');
});
test('early genuine actions are remembered across narration; death or respawn cannot count as walking',()=>{
 const {director,cues,send}=setup(); send(); send(0,{yaw:.4}); send(0,{yaw:.8}); send(0,{yaw:1.3});
 send(15,{alive:false}); assert.equal(director.current.id,'approach-progress');
 send(15); assert.equal(director.current.id,'approach-progress');
 director.start(); send(15); send(15,{yaw:.5});
 assert.equal(cues.facts.has('sprint-started'),false);
 assert.throws(()=>new TutorialMovementCues(director,{playerId:'you',rivalId:'rival'}),/local/);
});

test('passing Rival during earlier dialogue cannot start a later distant conversation',()=>{
 const director=new TutorialDirector({beats:[
  {id:'talk',kind:'dialogue',line:'Talk',advanceOn:'continue'},
  {id:'meet',kind:'prompt',line:'Approach',advanceOn:'rival-reached'},
 ]});director.start();
 const cues=new TutorialMovementCues(director,{local:true,playerId:'you',rivalId:'rival'});
 const send=x=>cues.snapshot({players:[
  {id:'you',alive:true,position:{x,y:0,z:0},yaw:0,pitch:0,guardStamina:100,sprinting:false},
  {id:'rival',alive:true,position:{x:20,y:0,z:0}},
 ]});
 for(let x=0;x<=18;x++)send(x);
 for(let x=17;x>=10;x--)send(x);
 director.completeDialogue(director.cue);send(10);assert.equal(director.current.id,'meet');
 for(let x=11;x<=18;x++)send(x);assert.equal(director.state,'complete');
});
