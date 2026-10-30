import test from 'node:test';
import assert from 'node:assert/strict';
import {createSiegeSkill} from '../../shared/sim/siegeSkills.mjs';
import {siegeSkillLabel,siegeSkillControlLabel} from './siegeSkillView.mjs';

test('ballista Skill labels follow prime, release catch and cooldown rather than an automatic shot',()=>{
 const b={skill:createSiegeSkill('boltToTheOccasion'),upperReleasedAt:null,coupling:'INDEPENDENT'};
 assert.equal(siegeSkillControlLabel(b,1),'PRIME II');
 b.skill.phase='primed';b.skill.primedAt=1;
 assert.equal(siegeSkillControlLabel(b,1.01),'FIRE II');
 b.upperReleasedAt=2;b.skill.boltIReleasedAt=2;
 assert.equal(siegeSkillControlLabel(b,2.1),'II PREPARING');
 assert.equal(siegeSkillControlLabel(b,2.2),'FIRE II');
 b.skill.phase='releasing';assert.equal(siegeSkillControlLabel(b,2.2),'II RELEASING');
 b.skill.phase='idle';b.skill.readyAt=26;
 assert.equal(siegeSkillControlLabel(b,2.3),'24s');
});

test('ram prime has elapsed-time feedback, not a fixed six-second countdown',()=>{
 const b={skill:createSiegeSkill('beatToThePunch')};
 b.skill.phase='primed';b.skill.primedAt=1;
 assert.equal(siegeSkillControlLabel(b,10),'PRIMED');
 assert.match(siegeSkillLabel(b,10),/PRIMED 9.0s · instability rising/);
 b.skill.phase='idle';b.skill.readyAt=35;
 assert.equal(siegeSkillControlLabel(b,11),'24s');
});
