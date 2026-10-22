import test from 'node:test';
import assert from 'node:assert/strict';
import { CHALLENGES, challengeView, publicChallengeState } from './challenges.mjs';

test('eleven mastery feats use extensible rewards and four populated curriculum families',()=>{
  assert.equal(Object.keys(CHALLENGES).length,11);
  assert.equal(Object.values(CHALLENGES).reduce((sum,c)=>sum+c.reward.renown,0),220);
  // (one reward is heraldry as well as Renown)
  assert.deepEqual(Object.values(CHALLENGES).filter(c=>c.reward.emblem).map(c=>[c.id,c.reward.emblem]),[['seize_thy_slayer','seize_thy_slayer']]);
  assert.deepEqual(new Set(Object.values(CHALLENGES).map(c=>c.family)),new Set(['swordsmanship','sorcery','chivalry','oddities']));
});
test('hinted feats hide title, condition, numeric progress and reward until settled completion',()=>{
  const state={progress:{wind_correction:1},completed:{}};
  const hidden=challengeView(state).find(c=>c.id==='wind_correction');
  assert.equal(hidden.title,'HIDDEN CHALLENGE');assert.equal(hidden.condition,undefined);
  assert.equal(hidden.progress,undefined);assert.equal(hidden.reward,undefined);
  assert.match(hidden.hint,/straight lines/);
  assert.deepEqual(publicChallengeState(state),{progress:{},completed:{}});
  state.completed.wind_correction=1700000000000;
  const revealed=challengeView(state).find(c=>c.id==='wind_correction');
  assert.equal(revealed.title,'WIND CORRECTION');assert.match(revealed.condition,/same owned projectile/);
  assert.equal(revealed.reward.renown,20);assert.equal(revealed.complete,true);
});
test('visible progress is safe and unknown IDs never become player-facing entries',()=>{
  const state={progress:{three_part_argument:2,obsolete:99},completed:{future:1}};
  assert.deepEqual(publicChallengeState(state),{progress:{three_part_argument:2},completed:{}});
  assert.equal(challengeView(state).find(c=>c.id==='three_part_argument').progress,2);
});

test('Mutual Mortality is a visible preview whose future completion cannot be claimed',()=>{
  const state={progress:{mutual_mortality:1},completed:{mutual_mortality:123}};
  const preview=challengeView(state).find(c=>c.id==='mutual_mortality');
  assert.equal(preview.available,false);
  assert.equal(preview.complete,false);
  assert.equal(preview.condition,'Defeat an enemy who began at full health using melee damage alone, while suffering a damage-over-time effect that defeats you within one second of your killing blow.');
  assert.equal(preview.flavor,"One of us won't recover.");
  assert.equal(preview.reward.renown,undefined);
  assert.deepEqual(publicChallengeState(state),{progress:{},completed:{}});
});
