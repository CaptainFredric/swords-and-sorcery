import test from 'node:test';
import assert from 'node:assert/strict';
import {createSoFistication} from '../../shared/sim/soFistication.mjs';
import {hellpingPalm} from '../../shared/sim/soFistHellpingHand.mjs';
import {hellpingContextPrompt} from './hellpingContextPrompt.mjs';

function scene(){
 const b=createSoFistication({x:0,y:0,z:0,heading:0});
 b.operatorId='driver';b.skill={id:'hellpingHand',phase:'active',readyAt:0};
 const at=hellpingPalm(b);
 const driver={id:'driver',alive:true,team:'ATTACKERS',operatingRamId:b.id,
   position:{x:b.x,y:b.y,z:b.z}};
 const enemy={id:'enemy',alive:true,team:'DEFENDERS',
   position:{x:at[0],y:at[1]-.9,z:at[2]}};
 const ally={id:'ally',alive:true,team:'ATTACKERS',
   position:{x:at[0]+.25,y:at[1]-.9,z:at[2]}};
 return {b,driver,enemy,ally,snapshot:{soFistication:b,players:[driver,enemy,ally]}};
}
test('operator gets a rebind-aware SEIZE cue for real nearby enemies only after opening hand',()=>{
 const s=scene();
 const bindings={siegeSkill:['KeyJ'],interact:['KeyP']};
 let hint=hellpingContextPrompt(s.driver,s.snapshot,bindings);
 assert.equal(hint.label,'J · OPEN HAND');
 s.b.hellping={phase:'open',at:0};
 hint=hellpingContextPrompt(s.driver,s.snapshot,bindings);
 assert.equal(hint.label,'J · SEIZE');
 assert.equal(hint.kind,'enemy');
 s.enemy.position.y+=7;
 hint=hellpingContextPrompt(s.driver,s.snapshot,bindings);
 assert.equal(hint.label,'ALLY MAY BOARD');
});
test('an ally sees their own BOARD prompt, but the operator cannot commandeer them',()=>{
 const s=scene();s.b.hellping={phase:'open',at:0};
 assert.equal(hellpingContextPrompt(s.ally,s.snapshot).label,'T · BOARD HAND');
 const operator=hellpingContextPrompt(s.driver,{...s.snapshot,players:[s.driver,s.ally]});
 assert.equal(operator.label,'ALLY MAY BOARD');
 s.ally.team='DEFENDERS';
 assert.equal(hellpingContextPrompt(s.ally,s.snapshot),null);
});
test('the palm has a three-dimensional range; no remote or ineligible prompts',()=>{
 const s=scene();s.b.hellping={phase:'open',at:0};
 s.enemy.position.y+=5;s.ally.position.y+=5;
 assert.equal(hellpingContextPrompt(s.driver,s.snapshot),null);
 assert.equal(hellpingContextPrompt(s.ally,s.snapshot),null);
 s.enemy.position.y-=5;s.enemy.operatingBallistaId='bow';
 assert.equal(hellpingContextPrompt(s.driver,s.snapshot),null,'mounted knights cannot be seized');
 s.b.components.Fist.health=0;
 assert.equal(hellpingContextPrompt(s.driver,s.snapshot),null);
});
test('captured / carried / ledge states take precedence over nearby player prompts',()=>{
 const s=scene();s.b.hellping={phase:'grasp',targetId:s.enemy.id};
 assert.equal(hellpingContextPrompt(s.driver,s.snapshot).label,'ENEMY SECURED');
 s.b.hellping={phase:'transport',targetId:s.ally.id};
 assert.equal(hellpingContextPrompt(s.driver,s.snapshot).label,'ALLY ABOARD');
 s.b.hellping={phase:'open'};s.b.hellpingLedge={anchor:{x:1,y:1,z:1}};
 assert.match(hellpingContextPrompt(s.driver,s.snapshot).label,/GRAB LEDGE/);
});
