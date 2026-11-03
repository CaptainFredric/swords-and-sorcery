import test from 'node:test';
import assert from 'node:assert/strict';
import { ICONS, iconSvg } from './icons.mjs';
import { createSiegeSkill } from '../../shared/sim/siegeSkills.mjs';
import { biByeModeButton, biByeSkillIcon, biByeCombinedReady, biByeCombatView } from './biByeControlView.mjs';

test('Bolt I, Bolt II, BOTH, wheel and Skill motifs stay distinguishable and related',()=>{
 assert.match(ICONS.boltI,/#83ddff/);assert.match(ICONS.boltII,/#e1d8c4/);
 assert.ok(ICONS.boltBoth.includes(ICONS.boltI));
 assert.ok(ICONS.boltBoth.includes(ICONS.boltII));
 assert.ok(ICONS.boltToTheOccasion.includes(ICONS.ballistaWheel));
 assert.ok(ICONS.boltToTheOccasion.includes(ICONS.boltII));
 assert.match(iconSvg('boltBoth'),/viewBox="0 0 24 24"/);
});

test('destination mode icon follows the authoritative mode, not an input press',()=>{
 const b={mode:'MOBILE'};
 assert.deepEqual(biByeModeButton(b),{label:'HEAVY',icon:'boltII',disabled:false});
 b.mode='DEPLOYING';assert.equal(biByeModeButton(b).disabled,true);
 b.mode='DEPLOYED';assert.deepEqual(biByeModeButton(b),{label:'MOBILE',icon:'ballistaWheel',disabled:false});
 b.mode='RETRACTING';assert.equal(biByeModeButton(b).label,'PACKING');
 b.mode='MOBILE';assert.equal(biByeModeButton(b).label,'HEAVY');
});

test('two-stage Skill switches only presentation and retains the Bolt I catch',()=>{
 const b={skill:createSiegeSkill('boltToTheOccasion'),coupling:'INDEPENDENT',state:'LOADED',mainBoltLoaded:true,smallBoltReadyAt:0};
 assert.equal(biByeSkillIcon(b,1),'boltToTheOccasion');
 b.skill.phase='primed';assert.equal(biByeSkillIcon(b,1),'boltII');
 assert.equal(biByeCombinedReady(b,1),true);
 b.skill.boltIReleasedAt=1;
 assert.equal(biByeSkillIcon(b,1.1),'boltToTheOccasion');
 assert.equal(biByeCombinedReady(b,1.1),false);
 assert.equal(biByeCombinedReady(b,1.2),true);
 assert.equal(biByeSkillIcon(b,1.2),'boltII');
 b.skill.phase='releasing';assert.equal(biByeSkillIcon(b,1.2),'boltII');
 assert.equal(biByeCombinedReady(b,1.2),false);
 b.skill.phase='idle';b.skill.readyAt=25;
 assert.equal(biByeSkillIcon(b,2),'boltToTheOccasion');
 b.skill.id='coldHowTouching';assert.equal(biByeSkillIcon(b,2),'frostBolt');
});

test('BOTH availability rejects incompatible hardware and release states',()=>{
 const b={skill:{id:'boltToTheOccasion',phase:'primed'},coupling:'INDEPENDENT',state:'LOADED',mainBoltLoaded:true,smallBoltReadyAt:0};
 for(const [key,value] of [['upperPending',true],['upperQueued',true],['pendingIndependent',{}],['mobileShotPendingAt',1],['combinedUpperPendingAt',1],['heavySkill',{}],['coupling','RELEASING'],['mainBoltLoaded',false],['state','SPENT']]){
  const original=b[key];b[key]=value;assert.equal(biByeCombinedReady(b,2),false,key);
  if(original===undefined)delete b[key];else b[key]=original;
 }
 assert.equal(biByeCombinedReady(b,2),true);
});

test('carousel displays the existing primary action in every deployment, focus and Skill state',()=>{
 const b={mode:'MOBILE',weaponFocus:'UPPER',health:650,deploymentSupported:true,
  skill:{id:'boltToTheOccasion',phase:'idle',readyAt:0},
  state:'LOADED',mainBoltLoaded:true,smallBoltReadyAt:0,coupling:'INDEPENDENT'};
 const view=()=>biByeCombatView(b,2);
 assert.deepEqual(view().primary,{label:'BOLT I',icon:'boltI',description:'Fire Bolt I'});
 assert.equal(view().secondary,null,'mobile unprimed has no combined command');
 b.skill.phase='primed';
 assert.equal(view().primary.label,'BOLT I');assert.equal(view().secondary,'skill','mobile primed shows heavy-first BOTH');
 b.skill.phase='idle';b.mode='DEPLOYED';b.weaponFocus='MAIN';
 assert.equal(view().primary.label,'BOTH','deployed MAIN primary is ordinary coupled fire');
 assert.equal(view().secondary,null,'no redundant second BOTH');
 b.weaponFocus='UPPER';
 assert.equal(view().primary.label,'BOLT I');assert.equal(view().secondary,'coupled','UPPER has an independent coupled option');
 b.pendingCoupledFromUpper=true;assert.equal(view().secondary,null,'hide while main turret aligns');
 b.pendingCoupledFromUpper=false;
 b.skill.phase='primed';
 assert.equal(view().primary.label,'BOLT I');assert.equal(view().secondary,'skill','priming supersedes ordinary coupling');
 b.skill.phase='releasing';assert.equal(view().secondary,null,'shot commitment closes extra actions');
 b.skill.phase='idle';b.mainBoltLoaded=false;assert.equal(view().secondary,null,'unready heavy cannot show BOTH');
 b.mainBoltLoaded=true;b.upperPending=true;assert.equal(view().secondary,null,'unready upper cannot show BOTH');
});
